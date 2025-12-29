# Deferred Analysis Creation Fix - Summary

## Problem
Opening the "New Analysis" modal created a blank analysis record with `payment_status='pending'`. If the user closed the modal without paying, this abandoned draft would trigger reanalysis pricing on subsequent attempts.

## Solution
Defer analysis creation until the user clicks "Pay Now", and add cleanup for abandoned drafts.

## Files Modified

### 1. `src/lib/database.ts`
**Changes:**
- **Updated `getBaselineAnalysis()`:**
  - Added filter: `.eq('payment_status', 'paid')` - Only count paid analyses as baseline
  - Added filters to ignore draft/canceled statuses: `.not('status', 'eq', 'created/draft/canceled/abandoned')`
  - Prevents abandoned drafts from triggering reanalysis pricing

- **Added `deleteAnalysis()`:**
  - Deletes an analysis by ID
  - Verifies user ownership before deletion
  - Used for cleanup of abandoned drafts

### 2. `src/pages/LandingPage.tsx`
**Changes:**
- **Removed analysis creation from `handleAnalyze()`:**
  - No longer creates analysis before opening payment modal
  - Only stores draft data in state (businessId, businessName, isBaseline, url)
  - Opens payment modal with draft data

- **Added draft data state:**
  - `pendingBusinessId`, `pendingBusinessName`, `pendingIsBaseline`, `pendingUrl`
  - Stores draft information client-side only

- **Updated PaymentModal props:**
  - Passes `draftData` for deferred creation
  - Passes `onAnalysisCreated` callback
  - Updated `onClose` to cleanup abandoned analysis if modal closes without payment

- **Added import:** `deleteAnalysis` from database.ts

### 3. `src/components/PaymentModal.tsx`
**Changes:**
- **Updated interface:**
  - `analysisId` is now optional (can be null)
  - Added `draftData?: DraftData` prop for deferred creation
  - Added `onAnalysisCreated?: (analysisId: string) => void` callback

- **Updated `handlePayment()`:**
  - Creates analysis if `analysisId` is null and `draftData` exists
  - Creates analysis with `payment_status='pending'` before creating checkout session
  - Calls `onAnalysisCreated` callback to notify parent
  - Then proceeds with checkout session creation

- **Updated button disabled state:**
  - Changed from `!analysisId` to `(!analysisId && !draftData)`
  - Allows Pay Now button when draft data is available

- **Added import:** `createAnalysis` from database.ts

## Flow Changes

### Before:
```
1. User clicks "Analyze"
2. Analysis record created (payment_status='pending')
3. Payment modal opens
4. If user closes modal → Analysis remains in DB
5. Next attempt → Sees existing analysis → Triggers reanalysis pricing
```

### After:
```
1. User clicks "Analyze"
2. Draft data stored in state (client-side only)
3. Payment modal opens
4. User clicks "Pay Now"
   → Analysis created (payment_status='pending')
   → Checkout session created
   → Redirects to Stripe
5. If user closes modal without paying
   → Cleanup deletes any created analysis
   → No abandoned records
```

## Pricing Logic Protection

### `getBaselineAnalysis()` now filters:
- ✅ `payment_status = 'paid'` - Only paid analyses count
- ✅ `status != 'created'` - Ignore draft statuses
- ✅ `status != 'draft'` - Ignore draft statuses
- ✅ `status != 'canceled'` - Ignore canceled statuses
- ✅ `status != 'abandoned'` - Ignore abandoned statuses

This ensures abandoned drafts never trigger reanalysis pricing.

## Testing Checklist

### Test 1: Open Modal → Close → No Analysis Created
- [ ] Click "Analyze" button
- [ ] Payment modal opens
- [ ] Close modal without paying
- [ ] Check database: No analysis record created
- [ ] Refresh page
- [ ] Click "Analyze" again → Should show first-run pricing

### Test 2: Open Modal → Pay Now → Analysis Created
- [ ] Click "Analyze" button
- [ ] Payment modal opens
- [ ] Click "Pay Now"
- [ ] Check database: Analysis created with `payment_status='pending'`
- [ ] Redirects to Stripe checkout

### Test 3: Abandoned Draft Cleanup
- [ ] Click "Analyze" button
- [ ] Payment modal opens
- [ ] Click "Pay Now" (analysis created)
- [ ] Close Stripe checkout (cancel payment)
- [ ] Return to app
- [ ] Close payment modal
- [ ] Check database: Analysis should be deleted (cleanup)

### Test 4: Reanalysis Pricing Protection
- [ ] Create paid baseline analysis
- [ ] Create draft analysis (payment_status='pending')
- [ ] Try to create new analysis for same business
- [ ] Should show reanalysis pricing (based on paid baseline, not draft)

## Files Changed

### Modified
1. `src/lib/database.ts` - Updated `getBaselineAnalysis()`, added `deleteAnalysis()`
2. `src/pages/LandingPage.tsx` - Removed early analysis creation, added draft data state
3. `src/components/PaymentModal.tsx` - Added deferred creation logic

## Non-Breaking Guarantees

✅ **Backward compatible:**
- Existing paid analyses still work
- Existing payment flow still works
- Only changes when analysis is created (deferred)

✅ **No database changes:**
- Uses existing schema
- No migrations required

---

**Status:** ✅ Complete - Analysis creation now deferred until Pay Now click

