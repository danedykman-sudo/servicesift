# Signed URL Implementation - Summary

## Overview
Implemented signed URL generation for JSON artifacts and wired the "Open JSON" button in the ReportStatus page.

## Files Created

### 1. `api/mint-report-artifact-url.ts`
**Purpose:** GET endpoint to generate signed URLs for report artifacts
- **Route:** `/api/mint-report-artifact-url?reportId=...&kind=json`
- **Method:** GET
- **Query Params:**
  - `reportId` (required) - Report ID
  - `kind` (optional, default: 'json') - Artifact type (json, pdf, zip)
- **Returns:** `{ url: string }` - Signed URL valid for 7 minutes
- **Error Handling:**
  - 400: Missing reportId or invalid kind
  - 404: Report or artifact not found
  - 500: Server error or failed to generate URL

**Logic Flow:**
1. Validates reportId and kind parameters
2. Looks up report to get `latest_artifact_version`
3. Finds `report_artifacts` row matching `report_id + kind + version`
4. Creates signed URL for `storage_path` in `report-artifacts` bucket
5. Returns signed URL (expires in 7 minutes)

## Files Modified

### 2. `src/pages/ReportStatus.tsx`
**Changes:**
- Added `loadingJson` state to track JSON loading
- Updated "Open JSON" button onClick handler:
  - Calls `/api/mint-report-artifact-url?reportId=...&kind=json`
  - Opens returned URL in new tab
  - Shows friendly error message if artifact not found
  - Shows loading state while fetching
- Added error display section for JSON loading errors
- Button disabled while loading

## Integration Flow

### User Flow:
```
1. User on /report-status/:reportId page
2. Status shows READY
3. User clicks "Open JSON" button
4. Button shows loading state
5. Frontend calls /api/mint-report-artifact-url?reportId=...&kind=json
6. Backend:
   - Looks up report → gets latest_artifact_version
   - Finds report_artifacts row (report_id + kind + version)
   - Creates signed URL for storage_path
   - Returns { url: "https://..." }
7. Frontend opens URL in new tab
8. JSON file loads in browser
```

### Error Handling:
- **404 (Artifact not found):** Shows "JSON artifact not found. The report may still be processing."
- **Other errors:** Shows generic error message
- **Network errors:** Shows "Failed to load JSON. Please try again."
- Error can be dismissed by user

## Security

✅ **Short-lived URLs:** 7 minutes expiry (between 5-10 min requirement)
✅ **No stored URLs:** URLs generated on-demand, never stored
✅ **Service role access:** Uses service role for database/storage access
✅ **Non-breaking:** Existing flows unchanged

## Testing Checklist

### Backend Tests
- [ ] Call `/api/mint-report-artifact-url?reportId=valid-id&kind=json`
  - [ ] Returns 200 with `{ url: "https://..." }`
  - [ ] URL is valid and accessible
  - [ ] URL expires after ~7 minutes
- [ ] Call with invalid reportId
  - [ ] Returns 404 with error message
- [ ] Call with missing reportId
  - [ ] Returns 400 with error message
- [ ] Call with invalid kind
  - [ ] Returns 400 with error message
- [ ] Call with reportId that has no artifact
  - [ ] Returns 404 with "Artifact not found"

### Frontend Tests
- [ ] Navigate to `/report-status/:reportId` with READY status
- [ ] Click "Open JSON" button
  - [ ] Button shows loading state
  - [ ] JSON opens in new tab
  - [ ] JSON content is valid
- [ ] Test error cases:
  - [ ] Artifact not found → Shows friendly error message
  - [ ] Network error → Shows error message
  - [ ] Error can be dismissed

### Integration Tests
- [ ] Complete paid flow → Report becomes READY
- [ ] Navigate to report status page
- [ ] Click "Open JSON" → JSON opens successfully
- [ ] Verify JSON contains expected data structure

## Files Changed

### Created
1. `api/mint-report-artifact-url.ts` - Signed URL endpoint

### Modified
2. `src/pages/ReportStatus.tsx` - Wired "Open JSON" button

## Technical Details

### Signed URL Expiry
- **Duration:** 7 minutes (420 seconds)
- **Rationale:** Balance between security (short-lived) and UX (enough time to download)
- **Regeneration:** User can click button again to get new URL

### Storage Path Lookup
- Uses `reports.latest_artifact_version` to find correct artifact version
- Queries `report_artifacts` table with:
  - `report_id = reportId`
  - `kind = 'json'` (or specified kind)
  - `version = latest_artifact_version`
- Ensures user gets the latest version of the artifact

### Error Messages
- **404 (Report not found):** "Report not found"
- **404 (Artifact not found):** "Artifact not found"
- **400 (Missing params):** "reportId is required" or "Invalid kind"
- **500 (Server error):** "Failed to generate signed URL" or generic error

## Future Enhancements

1. **PDF Support:** Add `kind=pdf` support when PDF artifacts are available
2. **ZIP Support:** Add `kind=zip` support for bundled artifacts
3. **Download Option:** Add download attribute instead of opening in new tab
4. **Progress Indicator:** Show download progress for large files
5. **Caching:** Cache signed URLs briefly to reduce API calls (optional)

---

**Status:** ✅ Complete - Ready for testing

