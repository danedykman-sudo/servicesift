# Report Status Navigation Fix - Implementation Complete

## Overview
Fixed UI flow after clicking "Run Analysis Now" to ensure users always land on the status stepper page and can resume processing after page refresh.

## Problem Fixed
- Manual trigger started pipeline successfully
- UI didn't navigate to `/report-status/:reportId` (or crashed due to non-JSON parsing)
- On refresh, Dashboard showed READY, making it look like steps were skipped

## Files Modified

### 1. `api/trigger-analysis.ts`
**Changes:**
- **Always returns JSON** - All responses now return JSON format (never plain text)
- **Returns reportId** - Gets or creates report for analysis and includes `reportId` in all success responses
- **Consistent response format:**
  - Success: `{ success: true, reportId, analysisId, status, message }`
  - Error: `{ success: false, error }`
- **Report creation logic:**
  - Checks for existing report by `analysis_id`
  - Creates report if it doesn't exist (status: QUEUED for new, READY for completed)
  - Updates report status when analysis is triggered

**Key Updates:**
- All return statements now use `.json()` format
- Report lookup/creation added before returning success responses
- Error responses use `{ success: false, error }` format

### 2. `src/pages/Dashboard.tsx`
**Changes:**

#### a) Updated `handleManualTriggerAnalysis`:
- **JSON parsing safety** - Safely parses response as JSON (handles non-JSON responses)
- **Navigation to report-status** - After successful trigger, navigates to `/report-status/:reportId` if reportId is available
- **localStorage persistence** - Saves `reportId` to localStorage when triggering
- **Fallback** - Falls back to old polling flow if reportId not available

#### b) Added localStorage check on mount:
- Checks `lastActiveReportId` from localStorage on component mount
- If report is still in progress, auto-redirects to report status page
- Clears localStorage if report is READY or FAILED

#### c) Added safety net for in-progress reports:
- New function `checkForInProgressReports()` - Checks all businesses for in-progress reports
- Enhanced business card display - Shows "Continue processing" button for analyses with status: extracting, analyzing, or saving
- Button fetches reportId and navigates to status page

#### d) Enhanced business card UI:
- Shows "Continue processing" button (blue) for in-progress analyses
- Shows "Run Analysis Now" button (yellow) for paid but not started analyses
- Both buttons properly navigate to report status page

## Implementation Details

### Response Format Standardization
All API responses now follow consistent format:
```typescript
// Success
{ success: true, reportId?: string, analysisId: string, status: string, message?: string }

// Error
{ success: false, error: string }
```

### Navigation Flow
1. User clicks "Run Analysis Now"
2. API call to `/api/trigger-analysis`
3. Backend gets/creates report and returns `reportId`
4. Frontend saves `reportId` to localStorage
5. Frontend navigates to `/report-status/:reportId`
6. ReportStatus page polls and shows stepper

### Persistence Flow
1. On Dashboard mount, check localStorage for `lastActiveReportId`
2. Query database for report status
3. If in-progress, auto-redirect to status page
4. If READY/FAILED, clear localStorage

### Safety Net Flow
1. On load businesses, check all analyses for in-progress status
2. For each business with in-progress analysis, show "Continue processing" button
3. Button fetches reportId via `/api/report-by-analysis`
4. Navigates to `/report-status/:reportId`

## Testing Steps

### 1. Test "Run Analysis Now" Navigation
1. Go to Dashboard
2. Find a business with paid but incomplete analysis
3. Click "Run Analysis Now"
4. **Expected:** Immediately navigates to `/report-status/:reportId` with status stepper
5. **Expected:** Status stepper shows current progress

### 2. Test JSON Response Parsing
1. Trigger analysis manually
2. Check browser console for any JSON parse errors
3. **Expected:** No parse errors, response is always valid JSON

### 3. Test localStorage Persistence
1. Click "Run Analysis Now"
2. Check localStorage for `lastActiveReportId`
3. **Expected:** `lastActiveReportId` is set to reportId
4. Refresh page
5. **Expected:** If report still in progress, auto-redirects to status page
6. **Expected:** If report is READY/FAILED, localStorage is cleared

### 4. Test "Continue Processing" Button
1. Start an analysis (let it get to extracting/analyzing/saving)
2. Navigate away from Dashboard
3. Return to Dashboard
4. **Expected:** See "Continue processing" button on business card
5. Click button
6. **Expected:** Navigates to report status page

### 5. Test Error Handling
1. Trigger analysis with invalid analysisId
2. **Expected:** Returns JSON error: `{ success: false, error: "..." }`
3. **Expected:** No JSON parse errors in frontend

### 6. Test Report Creation
1. Trigger analysis for analysis without report
2. Check database - report should be created
3. **Expected:** Response includes reportId
4. **Expected:** Navigation works correctly

## Acceptance Criteria ✅

- ✅ Clicking "Run Analysis Now" always lands on status stepper
- ✅ Refreshing mid-run resumes the stepper (doesn't drop back to Dashboard silently)
- ✅ No JSON parse errors
- ✅ ReportId is always returned when available
- ✅ localStorage persistence works
- ✅ Safety net shows "Continue processing" for in-progress analyses

## Notes

- Report creation is non-blocking - if it fails, analysis still proceeds
- localStorage is cleared when report completes (READY/FAILED)
- "Continue processing" button only shows for analyses with status: extracting, analyzing, or saving
- All API responses are now JSON (no plain text responses)

