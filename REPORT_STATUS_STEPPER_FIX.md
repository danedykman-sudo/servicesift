# Report Status Stepper Fix - Summary

## Overview
Fixed the ReportStatus stepper to progress through steps smoothly instead of jumping, by deriving status from the analysis when the report status is PAID/QUEUED.

## Files Modified

### 1. `api/report-status.ts`
**Changes:**
- Added logic to fetch `analyses.status` when report has `analysis_id` and status is PAID/QUEUED
- Maps analysis status to report status:
  - `extracting` → `SCRAPING`
  - `analyzing` → `ANALYZING`
  - `saving` → `STORING`
  - `completed` → `READY`
  - `failed` → `FAILED`
  - (anything else) → keep `report.status`
- Returns new field `derivedStatus` in response

**Response format:**
```json
{
  "status": "PAID",
  "derivedStatus": "SCRAPING",  // NEW - derived from analysis.status
  "error_stage": null,
  "error_message": null,
  "analysis_id": "...",
  "latest_artifact_version": 1
}
```

### 2. `src/pages/ReportStatus.tsx`
**Changes:**
- Updated `ReportStatusResponse` interface to include `derivedStatus?: string`
- Simplified `STATUS_STEPS` array:
  - Removed: CREATED, QUEUED, RENDERING
  - Kept: PAID, SCRAPING, ANALYZING, STORING, READY, FAILED
- Added `getEffectiveStatus()` function:
  - Uses `derivedStatus` if present
  - Maps CREATED/QUEUED to PAID for display
  - Falls back to `status` otherwise
- Updated `getCurrentStepIndex()` to use effective status
- Updated status display to show effective status
- Updated polling stop condition to check effective status
- Updated color/bg functions to handle simplified steps

## Status Flow

### Before Fix:
- Report created with status PAID
- Stepper shows "Payment Confirmed" (PAID)
- Analysis starts (status: extracting)
- Stepper still shows "Payment Confirmed" (no update)
- Analysis completes → Report updated to READY
- Stepper jumps to "Ready" (skips intermediate steps)

### After Fix:
- Report created with status PAID
- Stepper shows "Payment Confirmed" (PAID)
- Analysis starts (status: extracting)
- Backend derives status: SCRAPING
- Stepper shows "Scraping" (progresses smoothly)
- Analysis continues (status: analyzing)
- Backend derives status: ANALYZING
- Stepper shows "Analyzing" (progresses smoothly)
- Analysis saves (status: saving)
- Backend derives status: STORING
- Stepper shows "Storing" (progresses smoothly)
- Analysis completes → Report updated to READY
- Stepper shows "Ready" (final step)

## Stepper Labels (Simplified)

1. **Payment Confirmed** (PAID) - Blue, checkmark icon
2. **Scraping** (SCRAPING) - Yellow, spinning loader
3. **Analyzing** (ANALYZING) - Yellow, spinning loader
4. **Storing** (STORING) - Yellow, spinning loader
5. **Ready** (READY) - Green, checkmark icon
6. **Failed** (FAILED) - Red, alert icon

## Testing Checklist

### Backend Tests
- [ ] Call `/api/report-status?reportId=...` when report.status=PAID and analysis.status=extracting
  - [ ] Returns `derivedStatus: "SCRAPING"`
- [ ] Call when report.status=PAID and analysis.status=analyzing
  - [ ] Returns `derivedStatus: "ANALYZING"`
- [ ] Call when report.status=PAID and analysis.status=saving
  - [ ] Returns `derivedStatus: "STORING"`
- [ ] Call when report.status=READY
  - [ ] Returns `derivedStatus: undefined` (uses status)
- [ ] Call when report.status=PAID but no analysis exists
  - [ ] Returns `derivedStatus: undefined` (uses status)

### Frontend Tests
- [ ] Navigate to `/report-status/:reportId` when report.status=PAID, analysis.status=extracting
  - [ ] Stepper shows "Scraping" (not "Payment Confirmed")
  - [ ] Status card shows "SCRAPING"
- [ ] As analysis progresses:
  - [ ] Stepper progresses: Scraping → Analyzing → Storing → Ready
  - [ ] No jumping or skipping steps
- [ ] When report.status=READY:
  - [ ] Stepper shows "Ready"
  - [ ] Status card shows "READY"
- [ ] When report.status=FAILED:
  - [ ] Stepper shows "Failed"
  - [ ] Error message displays

### Integration Tests
- [ ] Complete paid flow → Report created with status PAID
- [ ] Navigate to report status page
- [ ] Verify stepper progresses smoothly as analysis runs
- [ ] Verify no status jumps occur

## Non-Breaking Guarantees

✅ **Backward compatible:**
- `derivedStatus` is optional field
- Falls back to `status` if `derivedStatus` not present
- Existing reports without analysis_id still work

✅ **No database changes:**
- Uses existing `reports` and `analyses` tables
- No schema modifications required

---

**Status:** ✅ Complete - Stepper now progresses smoothly through all steps

