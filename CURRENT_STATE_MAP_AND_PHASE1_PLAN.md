# ServiceSift: Current State Map & Phase 1 Implementation Plan

**Date:** 2025-01-XX  
**Status:** Investigation Complete - Ready for Phase 1 Step 1 Implementation  
**Goal:** Add Premium Delivery Flow (reports system) without breaking existing paid pipeline

---

## 1. CURRENT DATABASE SCHEMA

### Core Tables

#### `analyses` (Primary Analysis Table)
**Columns:**
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users)
- `business_id` (uuid, FK → businesses)
- `business_url` (text) - Google Maps/Yelp URL
- `business_name` (text)
- `review_count` (integer)
- `average_rating` (decimal)
- `is_baseline` (boolean)
- `status` (text) - Values: `'pending'`, `'extracting'`, `'analyzing'`, `'saving'`, `'completed'`, `'failed'`
- `error_message` (text) - Error details when status='failed'
- `created_at` (timestamptz)
- `completed_at` (timestamptz)
- **Payment Columns:**
  - `payment_status` (text) - Values: `'pending'`, `'paid'`, `'failed'`
  - `paid_at` (timestamptz)
  - `stripe_checkout_session_id` (text) - Hard link to Stripe session
  - `stripe_payment_intent_id` (text)
  - `payment_id` (text) - Legacy/backward compatibility
  - `amount_paid` (integer) - Amount in cents

**Usage in Code:**
- Created in: `api/create-checkout.ts` (before Stripe session), `src/lib/database.ts::createAnalysis()`
- Updated in: `api/confirm-payment.ts`, `api/stripe-webhook.ts`, `supabase/functions/run-analysis/index.ts`
- Queried in: `src/pages/Dashboard.tsx`, `src/lib/database.ts`, `src/pages/ViewReport.tsx`

#### `businesses`
**Columns:**
- `id` (uuid, PK)
- `user_id` (uuid, FK → auth.users)
- `business_name` (text)
- `google_maps_url` (text) - Unique per user
- `created_at` (timestamptz)

**Usage:** Business management, links analyses to businesses

#### `root_causes`
**Columns:**
- `id` (uuid, PK)
- `analysis_id` (uuid, FK → analyses)
- `rank` (integer)
- `title` (text)
- `severity` (text)
- `frequency` (integer)
- `bullets` (jsonb)
- `quotes` (jsonb)
- `created_at` (timestamptz)

**Usage:** Saved by `run-analysis` edge function, displayed in `ViewReport.tsx`

#### `coaching_scripts`
**Columns:**
- `id` (uuid, PK)
- `analysis_id` (uuid, FK → analyses)
- `role` (text)
- `focus` (text)
- `script` (text)
- `created_at` (timestamptz)

#### `process_changes`
**Columns:**
- `id` (uuid, PK)
- `analysis_id` (uuid, FK → analyses)
- `change` (text)
- `why` (text)
- `steps` (jsonb)
- `time_estimate` (text)
- `created_at` (timestamptz)

#### `backlog_tasks`
**Columns:**
- `id` (uuid, PK)
- `analysis_id` (uuid, FK → analyses)
- `week` (integer)
- `task` (text)
- `effort` (text)
- `impact` (text)
- `owner` (text)
- `created_at` (timestamptz)

#### `reviews`
**Columns:**
- `id` (uuid, PK)
- `analysis_id` (uuid, FK → analyses)
- `review_text` (text)
- `rating` (integer)
- `review_date` (timestamptz)
- `author` (text)

**Usage:** Saved by `run-analysis` after extraction

#### `analysis_deltas`
**Columns:** (Not fully examined, but exists for delta reports)
- Links analyses for comparison

---

## 2. END-TO-END PAID FLOW TRACE

### Flow Diagram
```
User clicks "Pay" in Dashboard
  ↓
PaymentModal.tsx → createCheckoutSession()
  ↓
/api/create-checkout.ts
  ├─ Validates auth (JWT)
  ├─ Creates analysis record (status='pending', payment_status='pending')
  ├─ Creates Stripe checkout session
  │  └─ metadata: { analysisId, userId, businessName, ... }
  │  └─ client_reference_id: analysisId
  └─ Returns checkout URL
  ↓
User redirected to Stripe Checkout
  ↓
User completes payment
  ↓
Stripe redirects to: /dashboard?session_id={CHECKOUT_SESSION_ID}
  ↓
Dashboard.tsx detects session_id in URL
  ↓
handlePaymentConfirmation(sessionId)
  ├─ Calls /api/confirm-payment with session_id
  ↓
/api/confirm-payment.ts
  ├─ Validates auth (JWT)
  ├─ Retrieves Stripe session (verifies payment_status='paid')
  ├─ Finds analysis by session.metadata.analysisId
  ├─ Verifies user owns analysis
  ├─ HARD LINKING: Updates analyses table
  │  └─ payment_status = 'paid'
  │  └─ paid_at = now()
  │  └─ stripe_checkout_session_id = session.id
  │  └─ payment_id = session.id (backward compat)
  ├─ Idempotency check: Skip if root_causes exist
  ├─ Race condition check: Skip if status in ['extracting','analyzing','saving'] AND < 10 min old
  ├─ Updates status to 'extracting'
  └─ Triggers async analysis (fire-and-forget)
     └─ POST to ${SUPABASE_URL}/functions/v1/run-analysis
        └─ Body: { analysisId, businessUrl, businessName }
        └─ Headers: Authorization (user JWT), apikey
  ↓
Returns immediately: { success: true, analysisId, status: 'extracting' }
  ↓
Dashboard.tsx starts polling for completion
  └─ pollForAnalysisCompletion(analysisId)
     └─ Polls analyses.status every 2 seconds
     └─ When status='completed', navigates to /report/:analysisId
  ↓
[ASYNC] Supabase Edge Function: run-analysis
  ├─ Step 1: Extract reviews
  │  └─ POST to /functions/v1/extract-reviews
  │  └─ Updates status to 'extracting'
  │  └─ Saves reviews to reviews table
  ├─ Step 2: Analyze with AI
  │  └─ POST to /functions/v1/analyze-reviews
  │  └─ Updates status to 'analyzing'
  ├─ Step 3: Save results
  │  └─ Updates status to 'saving'
  │  └─ Inserts: root_causes, coaching_scripts, process_changes, backlog_tasks
  │  └─ Updates status to 'completed'
  │  └─ Sets completed_at, review_count, average_rating
  └─ On error: Updates status to 'failed', sets error_message
  ↓
[PARALLEL] Stripe Webhook: /api/stripe-webhook.ts
  └─ Handles checkout.session.completed event
  └─ Updates payment_status='paid', paid_at, stripe_checkout_session_id
  └─ NOTE: Does NOT trigger analysis (confirm-payment does that)
```

### Key Files in Paid Flow

#### Frontend
1. **`src/components/PaymentModal.tsx`**
   - Initiates payment flow
   - Calls `createCheckoutSession()` from `src/lib/stripe.ts`

2. **`src/lib/stripe.ts`**
   - `createCheckoutSession()` → Calls `/api/create-checkout`
   - Returns `{ sessionId, url }`

3. **`src/pages/Dashboard.tsx`**
   - Detects `session_id` in URL params
   - Calls `handlePaymentConfirmation(sessionId)`
   - Polls for analysis completion
   - Manual trigger button: `handleManualTriggerAnalysis()`

#### Backend API Routes (Vercel)
4. **`api/create-checkout.ts`**
   - Creates analysis record BEFORE Stripe session
   - Creates Stripe checkout session with `analysisId` in metadata
   - Returns checkout URL

5. **`api/confirm-payment.ts`** ⚠️ **CRITICAL PATH**
   - Validates payment completion
   - Hard links payment to analysis
   - Triggers async `run-analysis` edge function
   - Returns immediately (fire-and-forget)

6. **`api/trigger-analysis.ts`**
   - Fallback manual trigger endpoint
   - Same logic as confirm-payment (for retries)

7. **`api/stripe-webhook.ts`**
   - Updates payment status ONLY
   - Does NOT trigger analysis

#### Supabase Edge Functions
8. **`supabase/functions/run-analysis/index.ts`** ⚠️ **CORE PROCESSOR**
   - Orchestrates full analysis pipeline
   - Calls `extract-reviews` → `analyze-reviews`
   - Saves all results to database
   - Updates status throughout

9. **`supabase/functions/extract-reviews/index.ts`**
   - Extracts reviews from Google Maps/Yelp
   - Returns reviews array

10. **`supabase/functions/analyze-reviews/index.ts`**
    - AI analysis of reviews
    - Returns root causes, coaching scripts, etc.

#### Database Layer
11. **`src/lib/database.ts`**
    - `createAnalysis()` - Creates analysis record
    - `getFullAnalysisReport()` - Fetches complete report
    - `getUserBusinesses()` - Dashboard data

#### View/Display
12. **`src/pages/ViewReport.tsx`**
    - Displays completed analysis
    - Uses `getFullAnalysisReport()`
    - PDF download via `window.print()`

---

## 3. CURRENT PDF DELIVERY STATUS

### Current Implementation
- **NO server-side PDF generation**
- **NO Supabase Storage usage**
- **NO signed URLs**
- **NO email delivery**

### PDF "Download" Current Behavior
- `ViewReport.tsx`: `window.print()` → Browser print dialog
- `LandingPage.tsx`: `window.print()` → Browser print dialog
- User manually saves as PDF from browser

### Storage Buckets
- **NONE configured** (no PDF storage)

### Email/Notifications
- **NONE** (no Resend integration, no email delivery)

---

## 4. WHAT TO REUSE vs ADD FOR REPORTS SYSTEM

### ✅ REUSE (Do Not Change)

#### Database Tables
- **`analyses`** - Keep as-is (add `report_id` FK later if needed)
- **`root_causes`, `coaching_scripts`, `process_changes`, `backlog_tasks`** - Keep as-is
- **`reviews`** - Keep as-is

#### API Routes
- **`api/create-checkout.ts`** - Keep as-is
- **`api/confirm-payment.ts`** - Keep as-is (may add report creation trigger later)
- **`api/trigger-analysis.ts`** - Keep as-is
- **`api/stripe-webhook.ts`** - Keep as-is

#### Edge Functions
- **`supabase/functions/run-analysis/index.ts`** - Keep as-is (may add report creation call at end)
- **`supabase/functions/extract-reviews/index.ts`** - Keep as-is
- **`supabase/functions/analyze-reviews/index.ts`** - Keep as-is

#### Frontend Pages
- **`src/pages/Dashboard.tsx`** - Keep as-is (may add report status indicators later)
- **`src/pages/ViewReport.tsx`** - Keep as-is (may add report download link later)

### ➕ ADD (New Components)

#### Database Tables (NEW)
1. **`reports`**
   - `id` (uuid, PK)
   - `analysis_id` (uuid, FK → analyses, UNIQUE) - One report per analysis
   - `user_id` (uuid, FK → auth.users)
   - `status` (text) - Enum: `'pending'`, `'generating'`, `'completed'`, `'failed'`
   - `pdf_storage_path` (text) - Supabase Storage path
   - `pdf_version` (integer) - Version number (for reruns)
   - `error_message` (text)
   - `created_at` (timestamptz)
   - `completed_at` (timestamptz)

2. **`report_artifacts`** (Optional - for future expansion)
   - `id` (uuid, PK)
   - `report_id` (uuid, FK → reports)
   - `artifact_type` (text) - 'pdf', 'json', 'csv', etc.
   - `storage_path` (text)
   - `version` (integer)
   - `created_at` (timestamptz)

3. **`report_events`** (Optional - for audit trail)
   - `id` (uuid, PK)
   - `report_id` (uuid, FK → reports)
   - `event_type` (text) - 'created', 'generation_started', 'generation_completed', 'failed', 'downloaded', 'emailed'
   - `metadata` (jsonb)
   - `created_at` (timestamptz)

#### API Routes (NEW)
4. **`api/mint-signed-url.ts`** (Vercel API route)
   - Generates Supabase Storage signed URL for PDF download
   - Validates user owns report
   - Returns signed URL (expires in 1 hour)

#### Edge Functions (NEW)
5. **`supabase/functions/generate-pdf-report/index.ts`**
   - Generates PDF from analysis data
   - Uploads to Supabase Storage with versioned path
   - Updates report status
   - Called by `run-analysis` after completion (or separately)

#### Frontend Pages (NEW)
6. **`src/pages/Report/[id].tsx`** (or `/report-processing/:reportId`)
   - Polling page for report generation status
   - Shows progress: pending → generating → completed
   - Auto-redirects to download when complete
   - Fallback manual download button

#### Supabase Storage (NEW)
7. **Storage Bucket: `reports`**
   - Public: false
   - File path pattern: `{user_id}/{analysis_id}/v{version}/report.pdf`
   - RLS policies: Users can only access their own reports

---

## 5. MINIMAL CHANGE PLAN: Phase 1 Step 1

### Goal
Add reports table + basic PDF generation flow WITHOUT breaking existing paid pipeline.

### Step 1.1: Database Migration
**File:** `supabase/migrations/YYYYMMDDHHMMSS_create_reports_system.sql`

```sql
-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL UNIQUE REFERENCES analyses(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'generating', 'completed', 'failed')),
  pdf_storage_path text,
  pdf_version integer DEFAULT 1,
  error_message text,
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_reports_analysis_id ON reports(analysis_id);
CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);

-- RLS
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own reports"
  ON reports FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access"
  ON reports FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
```

**Optional (for future):**
```sql
-- report_artifacts table (optional)
CREATE TABLE IF NOT EXISTS report_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  artifact_type text NOT NULL,
  storage_path text NOT NULL,
  version integer DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- report_events table (optional)
CREATE TABLE IF NOT EXISTS report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);
```

### Step 1.2: Create Storage Bucket
**Manual Step:** In Supabase Dashboard → Storage → Create Bucket
- Name: `reports`
- Public: **false**
- File size limit: 50MB
- Allowed MIME types: `application/pdf`

**RLS Policy (via SQL or Dashboard):**
```sql
-- Allow users to read their own reports
CREATE POLICY "Users can read own reports"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'reports' AND
    (storage.foldername(name))[1] = auth.uid()::text
  );

-- Service role can do everything
CREATE POLICY "Service role full access"
  ON storage.objects FOR ALL
  TO service_role
  USING (bucket_id = 'reports')
  WITH CHECK (bucket_id = 'reports');
```

### Step 1.3: Create PDF Generation Edge Function
**File:** `supabase/functions/generate-pdf-report/index.ts`

**Responsibilities:**
- Accepts `analysisId` or `reportId`
- Fetches analysis data (root_causes, coaching_scripts, etc.)
- Generates PDF (using library like `puppeteer` or `pdfkit`)
- Uploads to Storage: `{user_id}/{analysis_id}/v{version}/report.pdf`
- Updates report status
- Handles versioning (increment version on rerun)

**Key Logic:**
```typescript
// Check for existing report
const existingReport = await supabase
  .from('reports')
  .select('*')
  .eq('analysis_id', analysisId)
  .single();

const version = existingReport?.pdf_version ? existingReport.pdf_version + 1 : 1;
const storagePath = `${userId}/${analysisId}/v${version}/report.pdf`;

// Generate PDF (pseudo-code)
const pdfBuffer = await generatePDF(analysisData);

// Upload to Storage
await supabase.storage
  .from('reports')
  .upload(storagePath, pdfBuffer, {
    contentType: 'application/pdf',
    upsert: false // Prevent overwrite - use versioning
  });

// Update report record
await supabase
  .from('reports')
  .upsert({
    analysis_id: analysisId,
    user_id: userId,
    status: 'completed',
    pdf_storage_path: storagePath,
    pdf_version: version,
    completed_at: new Date().toISOString()
  });
```

### Step 1.4: Create Signed URL Endpoint
**File:** `api/mint-signed-url.ts`

**Responsibilities:**
- Validates user auth
- Validates user owns report
- Generates Supabase Storage signed URL (1 hour expiry)
- Returns URL

**Key Logic:**
```typescript
// Get report
const { data: report } = await supabase
  .from('reports')
  .select('*, analyses!inner(user_id)')
  .eq('id', reportId)
  .single();

// Verify ownership
if (report.analyses.user_id !== user.id) {
  return res.status(403).json({ error: 'Unauthorized' });
}

// Generate signed URL
const { data: signedUrl } = await supabase.storage
  .from('reports')
  .createSignedUrl(report.pdf_storage_path, 3600); // 1 hour

return res.json({ url: signedUrl.signedUrl });
```

### Step 1.5: Create Report Processing Page
**File:** `src/pages/ReportProcessing.tsx` (or `/report/:reportId`)

**Responsibilities:**
- Polls report status every 2 seconds
- Shows progress: pending → generating → completed
- Auto-redirects to download when complete
- Manual download button (calls `/api/mint-signed-url`)

**Key Logic:**
```typescript
const pollReportStatus = async () => {
  const { data: report } = await supabase
    .from('reports')
    .select('*')
    .eq('id', reportId)
    .single();

  if (report.status === 'completed') {
    // Get signed URL and download
    const response = await fetch(`/api/mint-signed-url?reportId=${reportId}`);
    const { url } = await response.json();
    window.location.href = url;
  } else if (report.status === 'failed') {
    setError(report.error_message);
  }
};
```

### Step 1.6: Integrate Report Creation into Existing Flow

**Option A: Trigger from `run-analysis` (Recommended)**
- Modify `supabase/functions/run-analysis/index.ts`
- After status='completed', create report record (status='pending')
- Call `generate-pdf-report` edge function (fire-and-forget)
- **DO NOT await** - let PDF generate async

**Option B: Separate Trigger Endpoint**
- Create `/api/trigger-report-generation.ts`
- Call manually or from Dashboard after analysis completes

**Recommended: Option A** (seamless integration)

**Change in `run-analysis/index.ts`:**
```typescript
// After analysis completion (line ~760)
// Create report record
await supabase
  .from('reports')
  .insert({
    analysis_id: analysisId,
    user_id: analysis.user_id,
    status: 'pending'
  })
  .onConflict('analysis_id')
  .ignore(); // Don't overwrite if exists

// Trigger PDF generation (fire-and-forget)
const pdfGenUrl = `${supabaseUrl}/functions/v1/generate-pdf-report`;
fetch(pdfGenUrl, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseServiceRoleKey}`,
    'apikey': supabaseServiceRoleKey
  },
  body: JSON.stringify({ analysisId })
}).catch(err => {
  console.error('[run-analysis] Failed to trigger PDF generation:', err);
  // Non-critical - report can be generated later
});
```

### Step 1.7: Update Frontend (Minimal)

**Dashboard.tsx:**
- Add "View Report" button for completed analyses (if report exists)
- Link to `/report/:reportId` or `/report-processing/:reportId`

**ViewReport.tsx:**
- Add "Download PDF Report" button (if report exists)
- Calls `/api/mint-signed-url`

---

## 6. TEST CHECKLIST

### Pre-Deployment Tests

#### Database Tests
- [ ] Migration runs successfully
- [ ] `reports` table created with correct schema
- [ ] RLS policies work (user can only see own reports)
- [ ] Storage bucket `reports` created
- [ ] Storage RLS policies work

#### API Tests
- [ ] `/api/mint-signed-url` returns signed URL for valid report
- [ ] `/api/mint-signed-url` rejects unauthorized access
- [ ] `/api/mint-signed-url` handles missing report gracefully

#### Edge Function Tests
- [ ] `generate-pdf-report` creates PDF successfully
- [ ] `generate-pdf-report` uploads to Storage with correct path
- [ ] `generate-pdf-report` handles versioning (reruns increment version)
- [ ] `generate-pdf-report` updates report status correctly
- [ ] `generate-pdf-report` handles errors gracefully

#### Integration Tests
- [ ] Paid flow still works end-to-end
  - [ ] Payment → Analysis completes → Report created
- [ ] Report generation triggers after analysis completion
- [ ] Report processing page polls correctly
- [ ] Signed URL download works

### Post-Deployment Tests

#### Happy Path
1. [ ] Create new analysis + payment
2. [ ] Analysis completes
3. [ ] Report record created (status='pending')
4. [ ] PDF generation starts (status='generating')
5. [ ] PDF uploaded to Storage
6. [ ] Report status='completed'
7. [ ] User can download PDF via signed URL

#### Edge Cases
1. [ ] Rerun analysis → New PDF version created (v2, v3, etc.)
2. [ ] PDF generation fails → Report status='failed', error_message set
3. [ ] User tries to access another user's report → 403
4. [ ] Signed URL expires → New URL generated on request
5. [ ] Analysis completes but PDF generation fails → User can manually trigger

#### Regression Tests
1. [ ] Existing paid analyses still work (no report required)
2. [ ] Dashboard shows analyses correctly
3. [ ] ViewReport.tsx still works (browser print fallback)
4. [ ] Manual trigger analysis still works
5. [ ] Stripe webhook still updates payment status

### Manual Test Scenarios

#### Scenario 1: New Paid Analysis
```
1. User creates analysis
2. User pays via Stripe
3. Analysis runs (extracting → analyzing → saving → completed)
4. Report created automatically
5. PDF generated
6. User downloads PDF
```

#### Scenario 2: Rerun Analysis
```
1. User reruns analysis for existing business
2. Analysis completes
3. New report version created (v2)
4. Old PDF (v1) still accessible
5. New PDF (v2) downloadable
```

#### Scenario 3: PDF Generation Failure
```
1. Analysis completes
2. Report created (status='pending')
3. PDF generation fails (simulate error)
4. Report status='failed', error_message set
5. User sees error in UI
6. User can manually retry PDF generation
```

---

## 7. RISK MITIGATION

### Breaking Changes Prevention
1. **DO NOT modify existing `analyses` table structure** (add FK later if needed)
2. **DO NOT change `run-analysis` logic** (only add report creation at end)
3. **DO NOT remove browser print functionality** (keep as fallback)
4. **DO NOT require reports for existing analyses** (reports are optional)

### Rollback Plan
1. **Database:** Migration can be reversed (DROP TABLE reports)
2. **Storage:** Bucket can be deleted (data preserved if needed)
3. **Code:** Revert edge function changes, remove report creation trigger
4. **Frontend:** Remove report download buttons (keep browser print)

### Monitoring Points
1. **Report creation rate** (should match completed analyses)
2. **PDF generation success rate** (should be >95%)
3. **Storage usage** (monitor bucket size)
4. **Signed URL generation errors** (should be minimal)

---

## 8. FILE CHANGES SUMMARY

### New Files
1. `supabase/migrations/YYYYMMDDHHMMSS_create_reports_system.sql`
2. `supabase/functions/generate-pdf-report/index.ts`
3. `api/mint-signed-url.ts`
4. `src/pages/ReportProcessing.tsx` (or similar)

### Modified Files
1. `supabase/functions/run-analysis/index.ts` (add report creation trigger)
2. `src/pages/Dashboard.tsx` (add report download link)
3. `src/pages/ViewReport.tsx` (add report download button)

### Unchanged Files (Critical)
- `api/create-checkout.ts` ✅
- `api/confirm-payment.ts` ✅
- `api/trigger-analysis.ts` ✅
- `api/stripe-webhook.ts` ✅
- `src/lib/database.ts` (may add report helpers, but no breaking changes)

---

## 9. NEXT STEPS AFTER PHASE 1 STEP 1

### Phase 1 Step 2 (Future)
- Email delivery via Resend
- Report event logging
- Report artifacts (JSON, CSV exports)
- Report sharing (public links)

### Phase 1 Step 3 (Future)
- Report templates
- Custom branding
- Batch report generation

---

## 10. NOTES

### Current PDF Generation Libraries (Research Needed)
- **Puppeteer** (headless Chrome) - Good for HTML→PDF
- **PDFKit** (Node.js) - Programmatic PDF creation
- **jsPDF** (browser) - Client-side (not suitable for server)
- **Recommendation:** Puppeteer (can reuse existing HTML templates)

### Storage Path Versioning Strategy
- Path: `{user_id}/{analysis_id}/v{version}/report.pdf`
- Benefits:
  - Reruns don't overwrite
  - Historical versions preserved
  - Easy cleanup (delete old versions)
- Example: `550e8400-e29b-41d4-a716-446655440000/123e4567-e89b-12d3-a456-426614174000/v1/report.pdf`

### Signed URL Expiry
- **1 hour** recommended (balance security vs UX)
- User can request new URL if expired
- No need to store URLs in database

---

**END OF DOCUMENT**

