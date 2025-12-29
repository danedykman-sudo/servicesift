# Dashboard + PDF Auto-Generation Fixes - Implementation Complete

## Summary

Fixed three critical issues:
1. **PDF Auto-Generation** - Changed auth from user JWT to service role key + added retry logic
2. **Business Name Corruption** - Fixed URL parsing to avoid grabbing query parameters as business names
3. **Duplicate Businesses** - Added unique constraint + upsert logic to prevent duplicates

## Files Changed

### 1. `supabase/functions/run-analysis/index.ts`
**Changes:**
- Replaced user JWT auth with service role key for PDF generation call
- Added `callGeneratePdfWithRetry()` helper function with 2 retries and 3s backoff
- Enhanced logging to show auth type and attempt numbers

**Key Code:**
```typescript
const generatePdfHeaders: Record<string, string> = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${supabaseServiceRoleKey}`, // Changed from user JWT
  "apikey": supabaseServiceRoleKey || "",
};
```

### 2. `api/free-run-analysis.ts`
**Changes:**
- Fixed business name extraction to validate path segments
- Changed from `insert()` to `upsert()` to handle duplicates gracefully
- Added logging for extracted business names

**Key Code:**
```typescript
// Validate path segments before using as business name
const pathSegments = urlObj.pathname.split('/').filter(s => s && s.length > 0);
for (const segment of pathSegments) {
  if (segment.startsWith('data=') || 
      segment.startsWith('@') || 
      segment.match(/^[0-9,.z]+$/) ||
      segment.length < 3) {
    continue;
  }
  businessName = segment.replace(/-/g, ' ').replace(/\+/g, ' ');
  break;
}
```

### 3. `supabase/migrations/20251229090613_unique_business_per_user.sql` (NEW)
**Purpose:** Prevent duplicate business records per user

```sql
CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_url_unique 
ON businesses(user_id, google_maps_url);
```

**Status:** Migration file created but needs manual application via Supabase Dashboard SQL Editor

### 4. `src/lib/database.ts`
**Changes:**
- Added `fixCorruptedBusinessNames()` function to clean up existing bad data

**Key Code:**
```typescript
export async function fixCorruptedBusinessNames(): Promise<number> {
  // Find businesses with corrupted names (containing URL fragments)
  const { data: businesses } = await supabase
    .from('businesses')
    .select('id, business_name, google_maps_url')
    .eq('user_id', user.id)
    .or('business_name.ilike.%data=%,business_name.ilike.%!3m%,business_name.ilike.%!4b%');

  // Update to clean fallback names
  for (const business of businesses) {
    await supabase
      .from('businesses')
      .update({ business_name: 'Business (Update Name)' })
      .eq('id', business.id);
  }

  return businesses.length;
}
```

### 5. `src/pages/Dashboard.tsx`
**Changes:**
- Added `handleFixNames()` function
- Added "Fix Names" button next to "Clean Duplicates"

## Deployment Status

### ✅ Completed
1. **Supabase Edge Function:** `run-analysis` deployed successfully
2. **Git Push:** Changes pushed to GitHub (commit: 9e98168)
3. **Vercel:** Auto-deployment triggered via git push

### ⚠️ Manual Step Required
**Database Migration:** The unique constraint migration needs to be applied manually.

**To apply the migration:**
1. Go to Supabase Dashboard: https://supabase.com/dashboard/project/kbjxtjylecievqbpdrdj/sql/new
2. Run this SQL:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_url_unique 
   ON businesses(user_id, google_maps_url);
   ```
3. Click "Run"

**Why manual?** The `supabase db push` command encountered conflicts with existing migrations. The SQL is safe to run directly.

## Verification Checklist

### 2-Minute Incognito Test

**Prerequisites:**
- Ensure `VITE_PAYMENTS_DISABLED=true` is set in Vercel environment variables
- Apply the database migration (see Manual Step above)

**Test Steps:**

1. **Open Dashboard**
   ```
   Navigate to: https://service-sift.com
   Log in with test account
   ```
   - ✅ **PASS:** No duplicate businesses appear
   - ✅ **PASS:** Business names are clean (no "data=", "!3m", "!4b" strings)
   - ❌ **FAIL:** Duplicates or corrupted names visible

2. **Fix Corrupted Names (if any exist)**
   ```
   Click "Fix Names" button on Dashboard
   ```
   - ✅ **PASS:** Button shows "Fixing..." then success message
   - ✅ **PASS:** Corrupted names changed to "Business (Update Name)"
   - ❌ **FAIL:** Button errors or names unchanged

3. **Run Free Analysis**
   ```
   Paste Google Maps URL → Click "Run Analysis (Free)"
   ```
   - ✅ **PASS:** Redirects to `/report-status/:reportId`
   - ✅ **PASS:** Status stepper shows: PAID → SCRAPING → ANALYZING → STORING → READY
   - ❌ **FAIL:** No redirect or stepper stuck

4. **Verify PDF Generation**
   ```
   Wait for status to reach READY (2-5 minutes)
   Click "Download PDF" button
   ```
   - ✅ **PASS:** PDF downloads successfully
   - ✅ **PASS:** PDF contains business name, root causes, backlog
   - ❌ **FAIL:** PDF missing or download fails

5. **Check Supabase Storage**
   ```
   Navigate to: Supabase Dashboard → Storage → report-artifacts
   Browse to: {userId}/{analysisId}/v1/
   ```
   - ✅ **PASS:** `report.pdf` file exists
   - ✅ **PASS:** `analysis.json` file exists
   - ❌ **FAIL:** PDF file missing

6. **Check Database**
   ```
   Navigate to: Supabase Dashboard → Table Editor → report_artifacts
   Filter by latest report
   ```
   - ✅ **PASS:** Row with `kind='pdf'` exists
   - ✅ **PASS:** Row with `kind='json'` exists
   - ❌ **FAIL:** No PDF artifact row

7. **Check Logs**
   ```
   Navigate to: Supabase Dashboard → Functions → run-analysis → Logs
   Search for: "PDF generation"
   ```
   - ✅ **PASS:** Logs show `Successfully invoked PDF generation: { status: 200 }`
   - ✅ **PASS:** Logs show `hasAuthorization: true, hasApikey: true, authType: "service-role-key"`
   - ❌ **FAIL:** Logs show 401, 403, or "Invalid JWT" errors

8. **Test Duplicate Prevention**
   ```
   Run another analysis for the same Google Maps URL
   ```
   - ✅ **PASS:** No duplicate business created
   - ✅ **PASS:** Existing business reused
   - ❌ **FAIL:** New duplicate business appears

9. **Refresh Dashboard**
   ```
   Hard refresh (Ctrl+Shift+R or Cmd+Shift+R)
   ```
   - ✅ **PASS:** No new duplicates appear
   - ✅ **PASS:** Business names remain stable
   - ❌ **FAIL:** Duplicates or name corruption after refresh

## Expected Log Patterns

### Success - PDF Generation
```
[run-analysis] Invoking generate-pdf-report edge function with reportId: xxx
[run-analysis] PDF generation call details: { 
  reportId: "xxx",
  hasAuthorization: true,
  hasApikey: true,
  authType: "service-role-key"
}
[run-analysis] PDF generation attempt 1/2
[run-analysis] Successfully invoked PDF generation: {
  reportId: "xxx",
  attempt: 1,
  status: 200,
  response: { success: true, ... }
}
```

### Failure - PDF Generation (should retry)
```
[run-analysis] PDF generation attempt 1/2
[run-analysis] PDF generation attempt 1 failed: { status: 401, body: "..." }
[run-analysis] Waiting 3s before retry...
[run-analysis] PDF generation attempt 2/2
[run-analysis] Successfully invoked PDF generation: { status: 200, ... }
```

### Success - Business Name Extraction
```
[free-run-analysis] Extracted business name: { 
  businessName: "Pizza Place Downtown",
  url: "https://maps.google.com/..."
}
[free-run-analysis] Created/updated business: xxx
```

### Failure - Business Name Extraction (old behavior)
```
[free-run-analysis] Extracted business name: { 
  businessName: "data=!3m1!4b1",  // BAD - should not happen anymore
  url: "https://maps.google.com/..."
}
```

## Pass/Fail Criteria

### ✅ PASS if ALL of these are true:
- [ ] PDF appears in Storage within 30s of analysis completion
- [ ] `report_artifacts` table has `kind='pdf'` row
- [ ] `run-analysis` logs show `status: 200` for PDF call
- [ ] Dashboard shows no duplicates after refresh
- [ ] Business names don't contain "data=", "!3m", or URL fragments
- [ ] Download PDF button works without manual intervention
- [ ] "Fix Names" button successfully cleans corrupted names
- [ ] Running analysis for same URL doesn't create duplicate business

### ❌ FAIL if ANY of these are true:
- [ ] PDF missing from Storage after 2 minutes
- [ ] Logs show 401/403 errors for PDF generation
- [ ] Duplicates appear after refresh
- [ ] Business names still contain URL fragments
- [ ] Download PDF button fails or shows error
- [ ] "Fix Names" button errors or doesn't update names
- [ ] Duplicate businesses created for same URL

## Troubleshooting

### Issue: PDF still not generating
**Check:**
1. Supabase logs for `run-analysis` - look for exact error message
2. Verify `SUPABASE_SERVICE_ROLE_KEY` is set in Supabase edge function environment
3. Check if `generate-pdf-report` function is deployed and accessible

**Fix:**
- Redeploy `run-analysis`: `supabase functions deploy run-analysis`
- Verify service role key in Supabase Dashboard → Settings → API

### Issue: Duplicates still appearing
**Check:**
1. Verify unique constraint was applied: Run `\d businesses` in SQL editor
2. Check if migration was successful

**Fix:**
- Apply migration manually via SQL editor (see Manual Step above)
- Run "Clean Duplicates" button on Dashboard

### Issue: Business names still corrupted
**Check:**
1. Verify new analysis uses fixed extraction logic
2. Check if old corrupted records exist

**Fix:**
- Click "Fix Names" button on Dashboard
- Manually edit business names via Dashboard edit feature

## Next Steps

1. **Apply Database Migration** (Manual Step - see above)
2. **Run Verification Tests** (Follow checklist above)
3. **Monitor Logs** for first few analyses after deployment
4. **Clean Up Old Data** using "Fix Names" button if needed

## Notes

- Free mode must be enabled (`VITE_PAYMENTS_DISABLED=true`) for testing
- Paid flow is unchanged and should still work normally
- PDF generation is best-effort and non-blocking (won't fail analysis if PDF fails)
- Retry logic gives 2 attempts with 3s delay between attempts
- Business name extraction now validates segments before using them
- Unique constraint prevents duplicates at database level
- Upsert logic handles race conditions gracefully

