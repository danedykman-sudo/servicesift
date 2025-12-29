# Pricing Bug Fix - Verification & Summary

## Problem
Closing the "New Analysis" modal before paying created a blank analysis record, causing the next attempt to charge reanalysis price instead of first-run price.

## Solution Status: ✅ FIXED

The fix has been implemented with three layers of protection:

### 1. Deferred Analysis Creation ✅
**Location:** `src/pages/LandingPage.tsx` - `handleAnalyze()`
- **Before:** Created analysis record before opening payment modal
- **After:** Only stores draft data in state (client-side), no DB insert
- **Code:** Lines 250-258

### 2. Analysis Created on Pay Now ✅
**Location:** `src/components/PaymentModal.tsx` - `handlePayment()`
- Analysis is created ONLY when user clicks "Pay Now"
- Created with `payment_status='pending'`
- **Code:** Lines 62-82

### 3. Cleanup on Modal Close ✅
**Location:** `src/pages/LandingPage.tsx` - PaymentModal `onClose`
- Deletes any abandoned analysis when modal closes without payment
- **Code:** Lines 1822-1830

### 4. Pricing Logic Protection ✅
**Location:** `src/lib/database.ts` - `getBaselineAnalysis()`
- Only returns analyses with `payment_status='paid'`
- Ignores all pending/draft/canceled analyses
- **Code:** Lines 497-509

## Pricing Logic Flow

### Where Pricing is Determined:
**File:** `src/pages/LandingPage.tsx` - `handleAnalyze()` (lines 208-263)

```typescript
// Step 1: Check if business exists
let business = await getBusinessByUrl(url);
let isBaseline = !business;

// Step 2: Check for baseline analysis (PROTECTED)
if (business && !isReanalysis) {
  const baselineAnalysis = await getBaselineAnalysis(business.id);
  if (baselineAnalysis) {
    // Only triggers if payment_status='paid'
    setIsReanalysis(true);
    isBaseline = false;
  }
}

// Step 3: Set price based on isBaseline
const amount = isBaseline ? FIRST_ANALYSIS_PRICE : REANALYSIS_PRICE;
```

### Protection Mechanism:
`getBaselineAnalysis()` filters:
```typescript
.eq('payment_status', 'paid') // Only paid analyses count
```

This means:
- ✅ Draft analyses (`payment_status='pending'`) are ignored
- ✅ Canceled analyses are ignored
- ✅ Failed analyses are ignored
- ✅ Only completed paid analyses trigger reanalysis pricing

## Files Changed

### Modified Files:
1. **`src/lib/database.ts`**
   - Updated `getBaselineAnalysis()`: Added `.eq('payment_status', 'paid')` filter
   - Added `deleteAnalysis()`: For cleanup of abandoned drafts

2. **`src/pages/LandingPage.tsx`**
   - Removed analysis creation from `handleAnalyze()`
   - Added draft data state (pendingBusinessId, pendingBusinessName, etc.)
   - Added cleanup in PaymentModal `onClose`
   - Added `deleteAnalysis` import

3. **`src/components/PaymentModal.tsx`**
   - Made `analysisId` optional (can be null)
   - Added `draftData` prop for deferred creation
   - Creates analysis in `handlePayment()` when Pay Now clicked
   - Added `onAnalysisCreated` callback

## Test Cases

### Test 1: Open Modal → Close → No Analysis Created ✅
**Steps:**
1. Click "Analyze" button
2. Paste URL
3. Payment modal opens
4. Close modal without paying

**Expected:**
- ✅ No analysis record in database
- ✅ No `pendingAnalysisId` set
- ✅ Refresh page → Click "Analyze" again → Shows first-run price

**Verification:**
```sql
-- Check database
SELECT * FROM analyses 
WHERE business_id = '<business_id>' 
AND payment_status = 'pending';
-- Should return 0 rows
```

### Test 2: Open Modal → Pay Now → Analysis Created ✅
**Steps:**
1. Click "Analyze" button
2. Paste URL
3. Payment modal opens
4. Click "Pay Now"

**Expected:**
- ✅ Analysis created with `payment_status='pending'`
- ✅ Redirects to Stripe checkout
- ✅ After payment, webhook updates to `payment_status='paid'`

**Verification:**
```sql
-- After clicking Pay Now (before payment)
SELECT * FROM analyses 
WHERE id = '<analysis_id>';
-- Should show payment_status='pending'

-- After payment completes
SELECT * FROM analyses 
WHERE id = '<analysis_id>';
-- Should show payment_status='paid'
```

### Test 3: Abandoned Draft Cleanup ✅
**Steps:**
1. Click "Analyze" button
2. Paste URL
3. Click "Pay Now" (analysis created)
4. Cancel Stripe checkout
5. Return to app
6. Close payment modal

**Expected:**
- ✅ Analysis deleted on modal close
- ✅ Next attempt shows first-run price

**Verification:**
```sql
-- After closing modal
SELECT * FROM analyses 
WHERE id = '<analysis_id>';
-- Should return 0 rows (deleted)
```

### Test 4: Reanalysis Pricing Protection ✅
**Steps:**
1. Create paid baseline analysis (payment_status='paid')
2. Create draft analysis (payment_status='pending') - simulate abandoned
3. Try to create new analysis for same business

**Expected:**
- ✅ Shows reanalysis price (based on paid baseline)
- ✅ Draft analysis does NOT affect pricing

**Verification:**
```typescript
// In handleAnalyze()
const baselineAnalysis = await getBaselineAnalysis(business.id);
// Should return paid baseline, ignore draft
```

## Edge Cases Handled

### Case 1: User Clicks Pay Now Then Cancels Stripe
- Analysis created with `payment_status='pending'`
- User cancels Stripe → Redirected to dashboard
- Modal closes → Cleanup deletes analysis
- ✅ Protected: Even if cleanup fails, `getBaselineAnalysis()` ignores pending analyses

### Case 2: Multiple Abandoned Drafts
- Each draft has `payment_status='pending'`
- `getBaselineAnalysis()` filters them out
- ✅ Protected: Only paid analyses count

### Case 3: Network Error During Cleanup
- Cleanup might fail silently
- ✅ Protected: `getBaselineAnalysis()` still filters by payment_status

## Pricing Logic Locations

### Primary Check:
- **File:** `src/pages/LandingPage.tsx`
- **Function:** `handleAnalyze()` (line 225)
- **Call:** `getBaselineAnalysis(business.id)`

### Secondary Check:
- **File:** `src/pages/LandingPage.tsx`
- **Function:** `handleAnalyzeAfterPayment()` (line 549)
- **Call:** `getBaselineAnalysis(business.id)` (for delta comparison)

### Database Query:
- **File:** `src/lib/database.ts`
- **Function:** `getBaselineAnalysis()` (line 497)
- **Filter:** `.eq('payment_status', 'paid')`

## Summary

✅ **Fix Complete:** Analysis creation deferred until Pay Now click
✅ **Cleanup:** Abandoned drafts deleted on modal close
✅ **Protection:** Pricing logic filters by `payment_status='paid'`
✅ **Non-Breaking:** Existing paid analyses still work correctly

The pricing bug is fixed with multiple layers of protection ensuring abandoned drafts never affect pricing.

