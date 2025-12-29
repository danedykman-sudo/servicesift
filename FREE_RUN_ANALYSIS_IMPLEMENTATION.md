# Free Run Analysis Implementation - Complete

## Overview
Added a "Run Analysis (Free)" button that bypasses Stripe payment for testing purposes. When enabled, users can run the full analysis pipeline without payment.

## Files Created

### 1. `api/free-run-analysis.ts`
**Purpose:** API endpoint to create and trigger analysis without Stripe payment
- **Route:** `POST /api/free-run-analysis`
- **Body:** `{ businessUrl: string, coverageLevel?: number }`
- **Returns:** `{ success: true, analysisId: string, reportId: string, status: string }`

**Behavior:**
- Checks `PAYMENTS_DISABLED` env var - returns 403 if not "true"
- Creates business if it doesn't exist
- Creates analysis with `payment_status='paid'` but `stripe_checkout_session_id=null`
- Creates report with `status='PAID'`
- Triggers `run-analysis` edge function (same pipeline as paid flow)
- Returns `{ analysisId, reportId }` for navigation

## Files Modified

### 2. `src/components/PaymentModal.tsx`
**Changes:**
- Added check for `VITE_PAYMENTS_DISABLED` env var
- When free mode enabled:
  - Shows "Free Analysis Mode" banner instead of payment amount
  - Replaces "Pay Now" button with "Run Analysis (Free)" button
  - Calls `/api/free-run-analysis` endpoint
  - Navigates to `/report-status/:reportId` on success
- When free mode disabled:
  - Shows normal Stripe payment UI (unchanged)
- Updated copy to remove payment references when in free mode

## Environment Variables

### Backend (Vercel)
- `PAYMENTS_DISABLED=true|false` - Controls whether free mode is enabled

### Frontend (Vite)
- `VITE_PAYMENTS_DISABLED=true|false` - Controls UI display of free button

## Implementation Details

### Free Analysis Flow
1. User clicks "Run Analysis (Free)" button
2. Frontend calls `POST /api/free-run-analysis` with `{ businessUrl, coverageLevel }`
3. Backend:
   - Verifies `PAYMENTS_DISABLED === "true"`
   - Gets/creates business
   - Creates analysis with `payment_status='paid'`, `stripe_checkout_session_id=null`
   - Creates report with `status='PAID'`
   - Triggers `run-analysis` edge function (same as paid flow)
   - Returns `{ analysisId, reportId }`
4. Frontend navigates to `/report-status/:reportId`
5. Pipeline runs normally (extract → analyze → save → artifacts)

### Key Differences from Paid Flow
- No Stripe checkout session
- Analysis created directly with `payment_status='paid'`
- Report created with `stripe_checkout_session_id=null`
- Same pipeline execution (no code duplication)

## Testing Steps

### 1. Enable Free Mode
**Backend (Vercel):**
- Set `PAYMENTS_DISABLED=true` in environment variables

**Frontend (Vercel + Local):**
- Set `VITE_PAYMENTS_DISABLED=true` in environment variables
- For local dev: Add to `.env` file:
  ```
  VITE_PAYMENTS_DISABLED=true
  ```

### 2. Test Free Analysis Flow
1. Navigate to landing page
2. Paste Google Maps URL
3. Click "Analyze" (or equivalent CTA)
4. **Expected:** Payment modal shows "Run Analysis (Free)" button instead of "Pay Now"
5. Click "Run Analysis (Free)"
6. **Expected:** Navigates to `/report-status/:reportId`
7. **Expected:** Status stepper shows progress
8. **Expected:** Analysis completes normally
9. **Expected:** Report appears with JSON and PDF artifacts

### 3. Verify Paid Flow Still Works
1. Set `PAYMENTS_DISABLED=false` (or remove env var)
2. Set `VITE_PAYMENTS_DISABLED=false` (or remove env var)
3. Navigate to landing page
4. Paste Google Maps URL
5. Click "Analyze"
6. **Expected:** Payment modal shows normal Stripe payment UI
7. **Expected:** Payment flow works as before

### 4. Verify Database Records
After free run:
- Check `analyses` table:
  - `payment_status = 'paid'`
  - `stripe_checkout_session_id = null`
  - `status` progresses: `pending` → `extracting` → `analyzing` → `saving` → `completed`
- Check `reports` table:
  - `status` progresses: `PAID` → `SCRAPING` → `ANALYZING` → `STORING` → `READY`
  - `stripe_checkout_session_id = null`
- Check `report_artifacts` table:
  - JSON artifact created
  - PDF artifact created (after generation completes)

## Acceptance Criteria ✅

- ✅ Free button appears when `VITE_PAYMENTS_DISABLED=true`
- ✅ Free button calls `/api/free-run-analysis` endpoint
- ✅ Endpoint returns 403 when `PAYMENTS_DISABLED !== "true"`
- ✅ Analysis created with `payment_status='paid'`, no Stripe session
- ✅ Report created and linked to analysis
- ✅ Pipeline triggered using same logic as paid flow
- ✅ Navigation to `/report-status/:reportId` works
- ✅ Full pipeline runs (extract → analyze → save → artifacts)
- ✅ PDF generation works
- ✅ Paid flow unchanged when free mode disabled

## Notes

- Free mode is intended for testing only
- Uses same pipeline as paid flow (no code duplication)
- Analysis records are marked as paid but have no Stripe session
- Reports are created with `stripe_checkout_session_id=null`
- All existing functionality (PDF generation, artifacts, etc.) works the same

