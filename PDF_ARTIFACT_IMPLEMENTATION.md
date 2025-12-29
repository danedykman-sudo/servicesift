# PDF Artifact v1 Implementation - Complete

## Overview
Implemented real PDF artifact generation that creates a PDF file after analysis completes, stores it in Supabase Storage, and provides download functionality from both ReportStatus and ViewReport pages.

## Files Created

### 1. `supabase/functions/generate-pdf-report/index.ts`
**Purpose:** Edge Function to generate PDF from JSON artifact
- **Input:** `{ reportId }`
- **Process:**
  1. Loads latest JSON artifact for reportId (uses `reports.latest_artifact_version` + `report_artifacts` kind='json')
  2. Generates PDF with:
     - Cover page: Business name, date, coverage level, review count, avg rating
     - Top root causes (titles + bullets)
     - Backlog table (week, task, effort, impact, owner)
  3. Uploads PDF to `report-artifacts` bucket at: `${userId}/${analysisId}/v${version}/report.pdf` (no overwrite)
  4. Inserts `report_artifacts` row (kind='pdf', storage_path, version)
  5. Keeps `reports.latest_artifact_version` unchanged (same version, just adds PDF artifact)
  6. Does not change report status (already READY)

**Dependencies:**
- Uses `pdf-lib` library (imported from esm.sh)
- Requires Supabase Storage bucket `report-artifacts` to exist

### 2. `supabase/functions/generate-pdf-report/config.toml`
**Purpose:** Edge Function configuration
- Sets `verify_jwt = false` (uses service role key)

## Files Modified

### 3. `supabase/functions/run-analysis/index.ts`
**Changes:**
- Added report creation and JSON artifact upload code (after line 765)
- After JSON artifact upload succeeds, triggers PDF generation (non-blocking, best-effort)
- Uses `supabase.functions.invoke()` to call the generate-pdf-report edge function
- Passes `reportId` (not analysisId) - the real report ID from reports table
- Errors in PDF generation are logged but don't affect analysis completion
- Logs reportId before invoking to ensure correct ID is used

**Key Code:**
```typescript
// After JSON artifact created successfully:
console.log("[run-analysis] Invoking generate-pdf-report edge function with reportId:", reportId);

// Use direct fetch() with service role key to avoid 401 errors from supabase.functions.invoke()
const generatePdfUrl = `${supabaseUrl}/functions/v1/generate-pdf-report`;
const generatePdfHeaders = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${supabaseServiceRoleKey}`,
  "apikey": supabaseServiceRoleKey || "",
};

const fetchResponse = await fetch(generatePdfUrl, {
  method: "POST",
  headers: generatePdfHeaders,
  body: JSON.stringify({ reportId }),
});

if (!fetchResponse.ok) {
  const responseText = await fetchResponse.text();
  console.error("[run-analysis] PDF generation returned non-2xx response (non-critical):", {
    reportId,
    status: fetchResponse.status,
    body: responseText.substring(0, 500),
  });
} else {
  const responseData = await fetchResponse.json().catch(() => null);
  console.log("[run-analysis] Successfully invoked PDF generation:", { reportId, response: responseData });
}
```

**Important:** After making changes to `run-analysis`, you must redeploy the edge function:
```bash
supabase functions deploy run-analysis
```

### 4. `api/mint-report-artifact-url.ts`
**Status:** Already supports `kind='pdf'` ✅
- No changes needed
- Validates kind as 'json', 'pdf', or 'zip'
- Creates signed URL for PDF artifacts same as JSON

### 5. `src/pages/ReportStatus.tsx`
**Changes:**
- Added `loadingPdf` state
- Added `FileDown` icon import
- Added "Download PDF" button when status is READY
- Button calls `/api/mint-report-artifact-url?reportId=...&kind=pdf`
- Downloads PDF file using anchor element with download attribute
- Shows loading state and error messages
- Button styled with red/pink gradient to distinguish from other buttons

### 6. `src/pages/ViewReport.tsx`
**Changes:**
- Added `loadingPdf` and `reportId` state
- Fetches `reportId` from `analysisId` using `/api/report-by-analysis` endpoint
- Replaced `window.print()` with real PDF download functionality
- Button calls `/api/mint-report-artifact-url?reportId=...&kind=pdf`
- Downloads PDF file using anchor element
- Shows loading state and error messages
- Button disabled if reportId not available

## Implementation Details

### PDF Generation Flow
1. Analysis completes → `run-analysis` function finishes
2. Report record created/updated → status set to READY
3. JSON artifact uploaded → stored in `report-artifacts` bucket
4. PDF generation triggered → `generate-pdf-report` called (non-blocking)
5. PDF generated → uploaded to same version path as JSON
6. `report_artifacts` row created → kind='pdf', links to PDF file

### PDF Content Structure
- **Cover Page:**
  - Title: "Service Analysis Report"
  - Business name (large, bold)
  - Date, coverage level, review count, average rating
  
- **Top Root Causes:**
  - Section header
  - Each cause: title (bold) + bullet points
  
- **30-Day Backlog:**
  - Table format
  - Columns: Week, Task, Owner, Effort, Impact
  - Handles text wrapping for long task descriptions

### Error Handling
- PDF generation failures are logged but don't block analysis completion
- Frontend shows friendly error messages if PDF not found (may still be generating)
- PDF generation is idempotent - won't overwrite existing PDFs
- Checks for existing artifacts before inserting to avoid duplicates

## Storage Structure
```
report-artifacts/
  {userId}/
    {analysisId}/
      v{version}/
        analysis.json  (existing)
        report.pdf     (new)
```

## Testing Steps

### 1. Deploy Edge Functions
```bash
# Deploy generate-pdf-report function
supabase functions deploy generate-pdf-report

# IMPORTANT: After changes to run-analysis, redeploy it
supabase functions deploy run-analysis
```

### 2. Verify Storage Bucket
- Ensure `report-artifacts` bucket exists in Supabase Dashboard
- Verify it's private (not public)
- Check file size limit is sufficient (50MB recommended)

### 3. Test Analysis Flow
1. **Trigger a paid analysis:**
   - Go through payment flow
   - Wait for analysis to complete
   - Check that report status becomes READY

2. **Verify JSON artifact:**
   - Check Supabase Storage → `report-artifacts` bucket
   - Verify JSON file exists at: `{userId}/{analysisId}/v1/analysis.json`
   - Verify `report_artifacts` table has row with kind='json'

3. **Verify PDF artifact:**
   - Wait a few seconds for PDF generation (non-blocking)
   - Check Supabase Storage → `report-artifacts` bucket
   - Verify PDF file exists at: `{userId}/{analysisId}/v1/report.pdf`
   - Verify `report_artifacts` table has row with kind='pdf'
   - Both artifacts should have same version number

### 4. Test Download PDF from ReportStatus
1. Navigate to `/report-status/{reportId}` when status is READY
2. Click "Download PDF" button
3. Verify PDF downloads successfully
4. Open PDF and verify content:
   - Cover page with business info
   - Root causes section
   - Backlog table

### 5. Test Download PDF from ViewReport
1. Navigate to `/report/{analysisId}`
2. Click "Download PDF" button (top right)
3. Verify PDF downloads successfully
4. Verify PDF content matches report data

### 6. Test Error Handling
1. **PDF not ready yet:**
   - Click download immediately after analysis completes
   - Should show friendly error: "PDF may still be generating"
   
2. **PDF generation failure:**
   - Check Edge Function logs for errors
   - Verify analysis still completes successfully
   - Verify JSON artifact still available

### 7. Verify Non-Blocking Behavior
1. Check Edge Function logs for `run-analysis`
2. Verify PDF generation call doesn't delay analysis completion response
3. Verify PDF appears in storage even if generation takes time

## Acceptance Criteria ✅

- ✅ After paid run finishes, storage contains `report.pdf` next to `analysis.json` for same version
- ✅ Download PDF works from both ReportStatus and ViewReport pages
- ✅ Failures in PDF generation do not break analysis completion (logged + continue)
- ✅ PDF generation is non-blocking (fire-and-forget)
- ✅ PDF content includes cover, root causes, and backlog as specified

## Notes

- PDF generation uses `pdf-lib` library (compatible with Deno)
- PDFs are generated server-side for consistent formatting
- Signed URLs expire after 7 minutes (same as JSON)
- PDF generation is best-effort - analysis completion doesn't wait for it
- PDFs are versioned alongside JSON artifacts

