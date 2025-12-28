# Make Analysis Process Asynchronous

## Problem
The Vercel API handlers (`confirm-payment.ts` and `trigger-analysis.ts`) run the entire analysis synchronously, causing timeouts when the process takes longer than 60 seconds. This leaves analyses stuck in "extracting" status.

## Solution
Create a new Supabase Edge Function that runs the analysis asynchronously. The API handlers will trigger it and return immediately, allowing the analysis to complete in the background without timing out.

## Architecture

```
┌─────────────────┐
│  API Handler    │  Sets status to "extracting"
│ (Vercel)        │  Triggers edge function (fire-and-forget)
│                 │  Returns immediately ✅
└────────┬────────┘
         │
         │ HTTP POST (async)
         ▼
┌─────────────────┐
│ run-analysis    │  Step 1: Extract reviews
│ Edge Function   │  Step 2: Analyze with AI
│ (Supabase)      │  Step 3: Save results
│                 │  Updates status as it progresses
└─────────────────┘
```

## Implementation Steps

### 1. Create New Edge Function `run-analysis`

**File:** `supabase/functions/run-analysis/index.ts`

This function will:
- Accept `analysisId` and `businessUrl` as parameters
- Use Supabase service role key to update database (bypasses RLS)
- Orchestrate the full analysis flow:
  1. Update status to "extracting"
  2. Call `extract-reviews` edge function
  3. Update status to "analyzing"
  4. Call `analyze-reviews` edge function
  5. Update status to "saving"
  6. Save all results to database
  7. Update status to "completed" or "failed"

**Key features:**
- Uses service role key for database updates (no RLS issues)
- Handles all error cases and updates status accordingly
- Logs progress for debugging
- Can run for up to 5 minutes (Supabase edge function limit)

### 2. Modify `confirm-payment.ts`

**Changes:**
- Remove all analysis execution logic (extract, analyze, save)
- Set status to "extracting" 
- Call `run-analysis` edge function asynchronously (don't await)
- Return success immediately
- Keep payment confirmation logic (updating payment status, etc.)

**New flow:**
```typescript
// After confirming payment
await supabaseService
  .from('analyses')
  .update({ status: 'extracting' })
  .eq('id', analysisId);

// Trigger analysis asynchronously (fire-and-forget)
fetch(`${supabaseUrl}/functions/v1/run-analysis`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseServiceRoleKey}`,
  },
  body: JSON.stringify({ analysisId, businessUrl: analysis.business_url }),
}).catch(err => {
  console.error('[confirm-payment] Failed to trigger async analysis:', err);
  // Don't throw - analysis can be retried manually
});

// Return immediately
return res.status(200).json({ success: true, analysisId });
```

### 3. Modify `trigger-analysis.ts`

**Changes:**
- Remove all analysis execution logic
- Set status to "extracting"
- Call `run-analysis` edge function asynchronously
- Return success immediately

**New flow:**
```typescript
// Update status
await supabaseService
  .from('analyses')
  .update({ status: 'extracting' })
  .eq('id', analysisId);

// Trigger analysis asynchronously
fetch(`${supabaseUrl}/functions/v1/run-analysis`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${supabaseServiceRoleKey}`,
  },
  body: JSON.stringify({ analysisId, businessUrl: analysis.business_url }),
}).catch(err => {
  console.error('[trigger-analysis] Failed to trigger async analysis:', err);
});

// Return immediately
return res.status(200).json({ success: true, analysisId });
```

### 4. Edge Function Implementation Details

The `run-analysis` function will:
- Use `Deno.env.get()` to get environment variables:
  - `SUPABASE_URL` (auto-injected)
  - `SUPABASE_SERVICE_ROLE_KEY` (from secrets)
  - `APIFY_TOKEN` (from secrets)
  - `ANTHROPIC_API_KEY` (from secrets)
- Create Supabase client with service role key
- Call `extract-reviews` and `analyze-reviews` functions internally
- Handle all error cases and update status to "failed" with error message
- Update status at each step: extracting → analyzing → saving → completed

### 5. Error Handling

- If extraction fails: Set status to "failed" with error message
- If analysis fails: Set status to "failed" with error message
- If save fails: Set status to "failed" with error message
- All errors are logged for debugging
- Frontend polling will detect failed status and show error

## Benefits

1. **No Timeouts**: Edge functions can run up to 5 minutes, avoiding Vercel's 60-second limit
2. **Better UX**: API handlers return immediately, user sees "extracting" status right away
3. **Resilient**: If edge function fails, analysis can be retried manually
4. **Scalable**: Multiple analyses can run concurrently without blocking API handlers
5. **Maintainable**: All analysis logic in one place (edge function)

## Testing

1. Test payment flow: Payment → Analysis starts → Status updates correctly
2. Test manual trigger: "Run Analysis Now" → Analysis starts → Status updates
3. Test error cases: Invalid URL → Status updates to "failed"
4. Test timeout: Long-running analysis → Completes without timing out
5. Test concurrent analyses: Multiple analyses → All run independently

## Files to Create/Modify

**Create:**
- `supabase/functions/run-analysis/index.ts` - New edge function

**Modify:**
- `api/confirm-payment.ts` - Remove analysis logic, add async trigger
- `api/trigger-analysis.ts` - Remove analysis logic, add async trigger

**No changes needed:**
- `src/pages/Dashboard.tsx` - Polling already works
- `supabase/functions/extract-reviews/index.ts` - Already exists
- `supabase/functions/analyze-reviews/index.ts` - Already exists


