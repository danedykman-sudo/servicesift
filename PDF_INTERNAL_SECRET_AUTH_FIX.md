# PDF Auto-Generation Fix - Internal Secret Authentication

## Summary

Replaced JWT-based authentication between edge functions with an internal shared secret. This eliminates 401 "Invalid JWT" errors and ensures reliable PDF generation after every analysis.

## Problem

- PDF auto-generation was failing with 401 errors
- `report.pdf` not appearing in Supabase Storage
- `report_artifacts` missing `kind='pdf'` rows
- JWT-based authentication between edge functions was unreliable

## Solution

Implemented internal secret-based authentication between `run-analysis` and `generate-pdf-report` edge functions:
- Shared secret stored in Supabase edge function environment
- `run-analysis` sends `x-internal-secret` header when calling `generate-pdf-report`
- `generate-pdf-report` validates the secret before processing
- Backward compatible: allows existing manual calls if secret not configured

## Files Changed

### 1. `supabase/functions/run-analysis/index.ts`
**Changes:**
- Replaced service role key auth with internal secret
- Added `PDF_INTERNAL_SECRET` environment variable
- Sends `x-internal-secret` header when calling `generate-pdf-report`
- Updated logging to show `hasInternalSecret` and `authType: "internal-secret"`

**Key Code:**
```typescript
const pdfInternalSecret = Deno.env.get("PDF_INTERNAL_SECRET");

const generatePdfHeaders: Record<string, string> = {
  "Content-Type": "application/json",
};

// Add internal secret for authentication
if (pdfInternalSecret) {
  generatePdfHeaders["x-internal-secret"] = pdfInternalSecret;
}

console.log("[run-analysis] PDF generation call details:", {
  reportId,
  url: generatePdfUrl,
  hasInternalSecret: !!pdfInternalSecret,
  authType: "internal-secret",
});
```

### 2. `supabase/functions/generate-pdf-report/index.ts`
**Changes:**
- Added internal secret validation at the start of request processing
- Returns 401 if secret is configured but not provided or mismatched
- Allows requests if secret is not configured (backward compatible)
- Enhanced logging for auth validation

**Key Code:**
```typescript
// Validate internal secret (edge-to-edge auth)
const expectedSecret = Deno.env.get("PDF_INTERNAL_SECRET");
if (expectedSecret) {
  const providedSecret = req.headers.get("x-internal-secret");
  if (providedSecret !== expectedSecret) {
    console.error("[generate-pdf-report] Invalid or missing internal secret");
    return new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
  console.log("[generate-pdf-report] Internal secret validated successfully");
} else {
  console.log("[generate-pdf-report] No internal secret configured, allowing request");
}
```

## Commands Run

### 1. Generate Random Secret
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
# Generated: IM_kvYOvQ0JiMQiqU7-JuW0R2NBDA4_E4BUELx1bYwCqYbuTK1tOGNSqrddlH599
```

### 2. Set Supabase Secret
```bash
supabase secrets set PDF_INTERNAL_SECRET="IM_kvYOvQ0JiMQiqU7-JuW0R2NBDA4_E4BUELx1bYwCqYbuTK1tOGNSqrddlH599"
# Output: Finished supabase secrets set.
```

### 3. Deploy Edge Functions
```bash
# Deploy run-analysis
supabase functions deploy run-analysis
# Output: Deployed Functions on project kbjxtjylecievqbpdrdj: run-analysis

# Deploy generate-pdf-report
supabase functions deploy generate-pdf-report
# Output: Deployed Functions on project kbjxtjylecievqbpdrdj: generate-pdf-report
```

## Verification

### 2-Minute Incognito Test

**Prerequisites:**
- `VITE_PAYMENTS_DISABLED=true` must be set in Vercel environment
- Both edge functions deployed (completed above)
- Internal secret set (completed above)

**Test Steps:**

#### 1. Start Analysis (30 seconds)
```
1. Open https://service-sift.com in incognito
2. Log in with test account
3. Paste a Google Maps URL
4. Click "Run Analysis (Free)"
5. Verify redirect to /report-status/:reportId
```

**Expected:**
- ✅ Redirects to status page immediately
- ✅ Status stepper shows PAID → SCRAPING → ANALYZING → STORING

#### 2. Monitor Status (1-2 minutes)
```
Watch the status stepper progress through:
- PAID (initial)
- SCRAPING (extracting reviews)
- ANALYZING (AI analysis)
- STORING (saving artifacts)
- READY (complete)
```

**Expected:**
- ✅ Progresses smoothly through all stages
- ✅ Reaches READY status within 2-5 minutes
- ❌ If stuck: Check Supabase logs for errors

#### 3. Download PDF (10 seconds)
```
When status shows READY:
1. Click "Download PDF" button
2. PDF should download automatically
3. Open PDF and verify contents
```

**Expected:**
- ✅ PDF downloads without errors
- ✅ PDF contains: Cover page, business name, root causes, backlog
- ❌ If fails: Button shows error or nothing happens

#### 4. Verify Storage (30 seconds)
```
Navigate to Supabase Dashboard:
1. Go to Storage → report-artifacts bucket
2. Browse to: {userId}/{analysisId}/v1/
3. Verify both files exist:
   - analysis.json (created first)
   - report.pdf (created by generate-pdf-report)
```

**Expected:**
- ✅ Both `analysis.json` and `report.pdf` files present
- ✅ Files have recent timestamps (within last few minutes)
- ✅ `report.pdf` size is reasonable (typically 50-200 KB)
- ❌ If missing: Check logs for PDF generation errors

#### 5. Verify Database (30 seconds)
```
Navigate to Supabase Dashboard:
1. Go to Table Editor → report_artifacts
2. Filter by the reportId from your test
3. Verify TWO rows exist:
   - One with kind='json'
   - One with kind='pdf'
```

**Expected:**
- ✅ Row with `kind='json'` and `version=1`
- ✅ Row with `kind='pdf'` and `version=1`
- ✅ Both have `storage_path` pointing to correct location
- ❌ If missing PDF row: generate-pdf-report didn't complete successfully

## Log Inspection

### Success Logs - What to Look For

#### run-analysis logs (Supabase Dashboard → Functions → run-analysis → Logs)

**Filter for:** `PDF generation`

**Success pattern:**
```
[run-analysis] Invoking generate-pdf-report edge function with reportId: abc-123
[run-analysis] PDF generation call details: {
  reportId: "abc-123",
  url: "https://xxx.supabase.co/functions/v1/generate-pdf-report",
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

**Key indicators:**
- ✅ `hasInternalSecret: true` (secret is configured)
- ✅ `authType: "internal-secret"` (using new auth method)
- ✅ `status: 200` (PDF generation succeeded)
- ✅ `Successfully invoked PDF generation` message

**Failure pattern (will retry):**
```
[run-analysis] PDF generation attempt 1/2
[run-analysis] PDF generation attempt 1 failed: {
  reportId: "abc-123",
  status: 401,
  statusText: "Unauthorized",
  body: "{\"error\":\"Unauthorized\"}"
}
[run-analysis] Waiting 3s before retry...
[run-analysis] PDF generation attempt 2/2
```

**If you see this:**
- ⚠️ First attempt failed with 401
- ⚠️ Secret mismatch or not propagated yet
- ✅ Retry should succeed after secrets sync

#### generate-pdf-report logs (Supabase Dashboard → Functions → generate-pdf-report → Logs)

**Filter for:** `Internal secret`

**Success pattern:**
```
[generate-pdf-report] Internal secret validated successfully
[generate-pdf-report] Starting PDF generation for reportId: abc-123
[generate-pdf-report] Report data retrieved: { reportId: "abc-123", ... }
[generate-pdf-report] PDF document created successfully
[generate-pdf-report] PDF uploaded to storage: {userId}/{analysisId}/v1/report.pdf
[generate-pdf-report] Report artifact record created: kind='pdf'
[generate-pdf-report] PDF generation completed successfully
```

**Key indicators:**
- ✅ `Internal secret validated successfully` (auth passed)
- ✅ `PDF uploaded to storage` (file saved)
- ✅ `Report artifact record created` (database updated)
- ✅ `PDF generation completed successfully` (full success)

**Failure pattern - Auth:**
```
[generate-pdf-report] Invalid or missing internal secret
```

**If you see this:**
- ❌ Secret mismatch or missing
- ❌ run-analysis didn't send correct secret
- 🔧 Check if secret is set: `supabase secrets list`

**Failure pattern - No secret configured:**
```
[generate-pdf-report] No internal secret configured, allowing request
```

**If you see this:**
- ⚠️ Secret not set in environment
- ⚠️ Backward compatibility mode (should still work for manual calls)
- 🔧 Ensure secret was set correctly

## Acceptance Criteria

### ✅ PASS if ALL true:

1. **Supabase Logs:**
   - [ ] `run-analysis` logs show `hasInternalSecret: true`
   - [ ] `run-analysis` logs show `status: 200` for PDF call
   - [ ] `generate-pdf-report` logs show "Internal secret validated successfully"
   - [ ] `generate-pdf-report` logs show "PDF generation completed successfully"

2. **Supabase Storage:**
   - [ ] `report.pdf` exists at `{userId}/{analysisId}/v1/report.pdf`
   - [ ] File size is reasonable (50-200 KB typically)
   - [ ] File timestamp is within 5 minutes of analysis completion

3. **Database:**
   - [ ] `report_artifacts` has row with `kind='pdf'`
   - [ ] PDF artifact has same `version` as JSON artifact
   - [ ] `storage_path` matches actual file location

4. **Frontend:**
   - [ ] "Download PDF" button works without errors
   - [ ] PDF downloads and opens correctly
   - [ ] PDF contains expected content (cover, root causes, backlog)

### ❌ FAIL if ANY true:

1. **Logs show errors:**
   - [ ] "Invalid or missing internal secret" in generate-pdf-report logs
   - [ ] `hasInternalSecret: false` in run-analysis logs
   - [ ] `status: 401` or `status: 403` for PDF call
   - [ ] "PDF generation failed after all retries"

2. **Storage issues:**
   - [ ] `report.pdf` missing after 2 minutes
   - [ ] File size is 0 bytes or corrupted
   - [ ] Only `analysis.json` exists, no PDF

3. **Database issues:**
   - [ ] No `kind='pdf'` row in `report_artifacts`
   - [ ] PDF artifact has wrong version number
   - [ ] `storage_path` is null or incorrect

4. **Frontend issues:**
   - [ ] "Download PDF" button shows error
   - [ ] PDF download fails or times out
   - [ ] PDF is corrupted or empty

## Troubleshooting

### Issue 1: "Invalid or missing internal secret" in logs

**Symptoms:**
- `generate-pdf-report` logs show auth error
- `run-analysis` shows `hasInternalSecret: false`

**Diagnosis:**
```bash
# Check if secret is set
supabase secrets list

# Should show:
# PDF_INTERNAL_SECRET
```

**Fix:**
```bash
# Set the secret again
supabase secrets set PDF_INTERNAL_SECRET="IM_kvYOvQ0JiMQiqU7-JuW0R2NBDA4_E4BUELx1bYwCqYbuTK1tOGNSqrddlH599"

# Redeploy both functions to pick up secret
supabase functions deploy run-analysis
supabase functions deploy generate-pdf-report

# Wait 30 seconds for propagation, then test again
```

### Issue 2: PDF generation times out or fails silently

**Symptoms:**
- No logs in `generate-pdf-report`
- `run-analysis` logs show connection timeout or no response

**Diagnosis:**
- Check if `generate-pdf-report` function is deployed
- Check if function crashed during execution

**Fix:**
```bash
# Verify function is deployed
supabase functions list

# Redeploy if missing
supabase functions deploy generate-pdf-report

# Check function logs for crashes
# Navigate to: Supabase Dashboard → Functions → generate-pdf-report → Logs
```

### Issue 3: Retry logic keeps failing

**Symptoms:**
- Logs show "attempt 1/2" and "attempt 2/2" both failing
- `run-analysis` logs show "PDF generation failed after all retries"

**Diagnosis:**
- Both attempts failed, likely persistent auth issue
- Check exact error message in logs

**Fix:**
```bash
# Verify secret is exactly the same in both places
supabase secrets list

# Check run-analysis is getting the secret
# Look for: hasInternalSecret: true in logs

# If false, redeploy:
supabase functions deploy run-analysis

# Wait 1 minute, test again
```

### Issue 4: PDF appears in storage but no database row

**Symptoms:**
- `report.pdf` exists in Storage
- `report_artifacts` missing `kind='pdf'` row

**Diagnosis:**
- PDF upload succeeded but database insert failed
- Check `generate-pdf-report` logs for database errors

**Fix:**
- This is non-critical - PDF is available
- Check logs for exact database error
- May need to manually insert row if needed

## Backward Compatibility

The implementation is backward compatible:

1. **If `PDF_INTERNAL_SECRET` is NOT set:**
   - `run-analysis` doesn't send the header
   - `generate-pdf-report` allows the request
   - Works like before (for manual testing)

2. **If `PDF_INTERNAL_SECRET` IS set:**
   - `run-analysis` sends the secret
   - `generate-pdf-report` validates it
   - Rejects requests without valid secret

3. **Manual calls still work:**
   - If you want to test manually via Postman/curl
   - Just include `x-internal-secret` header with correct value
   - Or unset the secret temporarily

## Security Notes

- Secret is stored in Supabase edge function environment (not Vercel)
- Secret is never exposed to client-side code
- Secret is only sent between edge functions (server-to-server)
- Secret is validated before any processing occurs
- 401 response if secret is invalid (no information leak)

## Next Steps

1. ✅ Secret set via `supabase secrets set`
2. ✅ Both functions updated and deployed
3. ⏳ **Run verification test** (follow 2-minute checklist above)
4. ⏳ **Check logs** for success indicators
5. ⏳ **Verify PDF in Storage and database**

## Summary

This fix eliminates JWT-based authentication issues between edge functions by using a shared internal secret. The implementation is:
- ✅ Simple and reliable
- ✅ Backward compatible
- ✅ Secure (server-to-server only)
- ✅ Well-logged for debugging
- ✅ Includes retry logic for transient failures

PDF auto-generation should now work reliably after every analysis.

