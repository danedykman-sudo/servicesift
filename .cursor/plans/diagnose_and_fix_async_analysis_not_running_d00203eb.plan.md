# Diagnose and Fix Async Analysis Not Running

## Root Cause Found!
The logs show "Analysis already in progress, skipping" - this is the problem! The API handlers check if status is "extracting", "analyzing", or "saving" and skip the trigger. But if the edge function never runs (not deployed/fails), the status stays "extracting" forever, creating a catch-22.

## The Problem
1. Analysis gets stuck in "extracting" status (edge function not deployed or failing)
2. User clicks "Run Analysis Now" 
3. API sees status = "extracting" and skips: "Analysis already in progress"
4. Can't retry because it thinks it's already running
5. Analysis stays stuck forever

## Solution

### Fix 1: Allow Retry for Stuck Analyses
Modify `trigger-analysis.ts` to check if analysis has been stuck for too long:
- If status is "extracting" but created_at is > 10 minutes ago → Allow retry
- Reset status and trigger again
- This allows manual recovery from stuck analyses

### Fix 2: Add Better Logging
Add logging to see if edge function is actually being called:
- Log before fetch call
- Log response status
- Log any errors
- This will help diagnose if edge function is deployed

### Fix 3: Remove Blocking Check for Manual Triggers
For `/api/trigger-analysis` (manual trigger), be more lenient:
- Always allow retry if user explicitly clicks "Run Analysis Now"
- Only skip if analysis was started in last 2 minutes (prevent rapid clicks)
- Otherwise, reset status and retry

### Fix 4: Verify Edge Function Deployment
- Check if `run-analysis` function exists in Supabase Dashboard
- Deploy if missing: `supabase functions deploy run-analysis`
- Verify environment variables are set

## Implementation Changes

### File: `api/trigger-analysis.ts`
**Change the "already in progress" check:**
```typescript
// OLD: Always skip if extracting/analyzing/saving
if (analysis.status === 'extracting' || ...) {
  return "already in progress";
}

// NEW: Allow retry if stuck for > 10 minutes
const createdTime = new Date(analysis.created_at).getTime();
const now = Date.now();
const stuckDuration = now - createdTime;
const stuckThreshold = 10 * 60 * 1000; // 10 minutes

if ((analysis.status === 'extracting' || analysis.status === 'analyzing' || analysis.status === 'saving') 
    && stuckDuration < stuckThreshold) {
  // Only skip if recently started (< 10 min ago)
  return "already in progress";
}

// Otherwise, reset and retry
```

### File: `api/confirm-payment.ts`
**Similar change** - allow retry if stuck for too long

### File: Both API handlers
**Add better logging:**
```typescript
console.log('[trigger-analysis] Calling run-analysis edge function:', {
  url: `${supabaseUrl}/functions/v1/run-analysis`,
  analysisId,
  timestamp: new Date().toISOString()
});

fetch(...).then(response => {
  console.log('[trigger-analysis] Edge function response:', {
    status: response.status,
    ok: response.ok
  });
}).catch(err => {
  console.error('[trigger-analysis] Edge function call failed:', err);
});
```

## Testing
1. Try to retry a stuck analysis - should now work
2. Check logs to see if edge function is being called
3. Verify edge function exists in Supabase Dashboard
4. Deploy edge function if missing

