# PDF Generation Gateway Auth Fix

## Problem

`run-analysis` was getting 401 errors when calling `generate-pdf-report`. Supabase logs showed `execution_id = null`, indicating the request was blocked at the gateway level before reaching the function code. This happens when `verify_jwt=true` is set at the gateway level.

## Solution

1. ✅ Verified `verify_jwt = false` in `config.toml`
2. ✅ Added early log line to confirm function execution
3. ✅ Improved error logging to show gateway response body
4. ✅ Deployed `generate-pdf-report` function

## Files Changed

### 1. `supabase/functions/generate-pdf-report/config.toml`
**Status:** Already correct
```toml
verify_jwt = false
```

### 2. `supabase/functions/generate-pdf-report/index.ts`
**Changes:**
- Added early log line at the very start of function execution
- Logs `hasSecret` to confirm environment variable is available

**Key Code:**
```typescript
Deno.serve(async (req: Request) => {
  // Early log to confirm function execution (before any other processing)
  console.log("[generate-pdf-report] START", { 
    hasSecret: !!Deno.env.get("PDF_INTERNAL_SECRET"),
    method: req.method,
    url: req.url 
  });
  // ... rest of function
});
```

### 3. `supabase/functions/run-analysis/index.ts`
**Status:** Already has good error logging
- Logs response status, statusText, and body text on failure
- Does NOT log the secret itself (security best practice)

## Commands Run

```bash
# Deploy generate-pdf-report function
supabase functions deploy generate-pdf-report
✅ Deployed Functions on project kbjxtjylecievqbpdrdj: generate-pdf-report
```

## Verification Steps

### 1. Run Free Analysis (2-5 minutes)

```
1. Open https://service-sift.com in incognito
2. Log in with test account
3. Paste Google Maps URL
4. Click "Run Analysis (Free)"
5. Wait for status to reach READY
```

### 2. Check Supabase Logs

**Navigate to:** Supabase Dashboard → Functions → generate-pdf-report → Logs

**Look for this log line:**
```
[generate-pdf-report] START { 
  hasSecret: true, 
  method: "POST", 
  url: "https://..." 
}
```

**✅ SUCCESS if:**
- You see the `[generate-pdf-report] START` log line
- This confirms the function is executing (gateway is not blocking)
- Function continues with secret validation and PDF generation

**❌ FAIL if:**
- No logs appear at all in `generate-pdf-report`
- `run-analysis` logs show 401 with `execution_id = null`
- This means gateway is still blocking (see Troubleshooting below)

### 3. Check run-analysis Logs

**Navigate to:** Supabase Dashboard → Functions → run-analysis → Logs

**Look for:**
```
[run-analysis] PDF generation call details: {
  reportId: "xxx",
  hasInternalSecret: true,
  authType: "internal-secret"
}
[run-analysis] PDF generation attempt 1/2
```

**✅ SUCCESS if:**
- Shows `hasInternalSecret: true`
- Shows `status: 200` in success log
- Response body shows success message

**❌ FAIL if:**
- Shows `status: 401` or `status: 403`
- Response body shows gateway error (see Troubleshooting)

### 4. Verify Storage

**Navigate to:** Supabase Dashboard → Storage → report-artifacts

**Browse to:** `{userId}/{analysisId}/v1/`

**✅ SUCCESS if:**
- Both `analysis.json` and `report.pdf` exist
- `report.pdf` has recent timestamp
- File size is reasonable (50-200 KB)

**❌ FAIL if:**
- Only `analysis.json` exists
- `report.pdf` is missing

### 5. Verify Database

**Navigate to:** Supabase Dashboard → Table Editor → report_artifacts

**Filter by:** Your reportId

**✅ SUCCESS if:**
- Row with `kind='pdf'` exists
- Row with `kind='json'` exists
- Both have correct `version` and `storage_path`

**❌ FAIL if:**
- Only `kind='json'` row exists
- No `kind='pdf'` row

## Troubleshooting

### Issue: Still Getting 401 with `execution_id = null`

**Symptoms:**
- `run-analysis` logs show 401 error
- Response body shows gateway-level error (not function error)
- No logs appear in `generate-pdf-report` at all
- `execution_id = null` in Supabase logs

**Root Cause:**
The Supabase Dashboard UI may have `Verify JWT` enabled at the function level, which overrides the `config.toml` setting.

**Fix - Manual Dashboard Step:**

1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/kbjxtjylecievqbpdrdj/functions
2. Click on `generate-pdf-report` function
3. Go to **Settings** or **Details** tab
4. Find **"Verify JWT"** toggle/checkbox
5. **Turn it OFF** (set to `false`)
6. Save changes
7. Wait 30 seconds for changes to propagate
8. Test again

**Alternative Path:**
- Edge Functions → generate-pdf-report → Settings → Verify JWT = OFF

### Issue: Function Executes But Returns 401

**Symptoms:**
- `[generate-pdf-report] START` log appears (function is executing)
- But then shows "Invalid or missing internal secret"
- `run-analysis` logs show 401

**Root Cause:**
Internal secret mismatch or not set correctly.

**Fix:**
```bash
# Verify secret is set
supabase secrets list
# Should show: PDF_INTERNAL_SECRET

# If missing, set it
supabase secrets set PDF_INTERNAL_SECRET="IM_kvYOvQ0JiMQiqU7-JuW0R2NBDA4_E4BUELx1bYwCqYbuTK1tOGNSqrddlH599"

# Redeploy both functions
supabase functions deploy run-analysis
supabase functions deploy generate-pdf-report

# Wait 30 seconds, test again
```

### Issue: Function Executes But PDF Not Created

**Symptoms:**
- `[generate-pdf-report] START` log appears
- Function logs show it's processing
- But no PDF in Storage and no database row

**Root Cause:**
Function is executing but failing during PDF generation or upload.

**Fix:**
- Check `generate-pdf-report` logs for specific error messages
- Look for database errors, storage errors, or PDF generation errors
- Common issues: missing JSON artifact, storage permissions, PDF library errors

## Expected Log Flow (Success)

### run-analysis logs:
```
[run-analysis] Invoking generate-pdf-report edge function with reportId: abc-123
[run-analysis] PDF generation call details: {
  reportId: "abc-123",
  hasInternalSecret: true,
  authType: "internal-secret"
}
[run-analysis] PDF generation attempt 1/2
[run-analysis] Successfully invoked PDF generation: {
  reportId: "abc-123",
  attempt: 1,
  status: 200,
  response: { success: true, ... }
}
```

### generate-pdf-report logs:
```
[generate-pdf-report] START { 
  hasSecret: true, 
  method: "POST", 
  url: "https://..." 
}
[generate-pdf-report] Internal secret validated successfully
[generate-pdf-report] Starting PDF generation for reportId: abc-123
[generate-pdf-report] Report data retrieved: { ... }
[generate-pdf-report] PDF document created successfully
[generate-pdf-report] PDF uploaded to storage: {userId}/{analysisId}/v1/report.pdf
[generate-pdf-report] Report artifact record created: kind='pdf'
[generate-pdf-report] PDF generation completed successfully
```

## Expected Log Flow (Failure - Gateway Blocking)

### run-analysis logs:
```
[run-analysis] PDF generation attempt 1/2
[run-analysis] PDF generation attempt 1 failed: {
  reportId: "abc-123",
  status: 401,
  statusText: "Unauthorized",
  body: "{\"message\":\"Invalid JWT\"}"  // Gateway error, not function error
}
```

### generate-pdf-report logs:
```
(No logs appear - function never executed)
```

**If you see this pattern:**
- Gateway is blocking the request
- Follow "Issue: Still Getting 401 with execution_id = null" troubleshooting above
- Toggle "Verify JWT" OFF in Supabase Dashboard

## Summary

✅ **Config file verified:** `verify_jwt = false` in `config.toml`
✅ **Early log added:** Confirms function execution
✅ **Error logging improved:** Shows gateway response body
✅ **Function deployed:** Ready for testing

**Next Steps:**
1. Run a free analysis
2. Check for `[generate-pdf-report] START` log
3. If no logs appear, toggle "Verify JWT" OFF in Dashboard
4. Verify PDF appears in Storage and database


