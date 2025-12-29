# Business Name Update Implementation - Manual Step Required

## Overview
Add logic to save the real business name from extraction to the database after successful extraction.

## Manual Code Insertion Required

**File:** `supabase/functions/run-analysis/index.ts`

**Location:** After line 408 (after the "Extraction successful" log), before line 410 ("Step 2: Analyze reviews")

**Current code (lines 405-410):**
```typescript
      console.log("[run-analysis] Extraction successful:", {
        reviewCount: extractData.reviewCount,
        extractionMethod: extractData.extractionMethod,
      });

      // Step 2: Analyze reviews
      console.log("[run-analysis] Step 2/3: Analyzing reviews with AI");
```

**Insert this code between lines 408 and 410:**
```typescript
      // Update business name from extraction if needed (best-effort, non-blocking)
      try {
        if (extractData.businessName && 
            extractData.businessName !== 'Your Business' &&
            extractData.businessName !== 'Unknown Business') {
          const shouldUpdateAnalysis = !analysis.business_name || 
            analysis.business_name.trim() === '' || 
            analysis.business_name === 'Your Business';
          
          if (shouldUpdateAnalysis) {
            console.log("[run-analysis] Updating analysis business_name from extraction:", {
              analysisId,
              oldName: analysis.business_name,
              newName: extractData.businessName
            });
            
            await supabase
              .from("analyses")
              .update({ business_name: extractData.businessName })
              .eq("id", analysisId);
            
            // Also update analysis object for later use
            analysis.business_name = extractData.businessName;
          }

          // Update businesses table if business_id exists
          if (analysis.business_id) {
            const { data: business, error: businessFetchError } = await supabase
              .from("businesses")
              .select("business_name")
              .eq("id", analysis.business_id)
              .single();

            if (!businessFetchError && business) {
              const shouldUpdateBusiness = !business.business_name || 
                business.business_name.trim() === '' || 
                business.business_name === 'Your Business';
              
              if (shouldUpdateBusiness) {
                console.log("[run-analysis] Updating business business_name from extraction:", {
                  businessId: analysis.business_id,
                  oldName: business.business_name,
                  newName: extractData.businessName
                });
                
                await supabase
                  .from("businesses")
                  .update({ business_name: extractData.businessName })
                  .eq("id", analysis.business_id);
              }
            }
          }
        }
      } catch (nameUpdateError) {
        console.error("[run-analysis] Failed to update business name (non-critical):", nameUpdateError);
        // Non-blocking - continue with analysis
      }
```

**Result should look like:**
```typescript
      console.log("[run-analysis] Extraction successful:", {
        reviewCount: extractData.reviewCount,
        extractionMethod: extractData.extractionMethod,
      });

      // Update business name from extraction if needed (best-effort, non-blocking)
      try {
        // ... (insert code above here)
      } catch (nameUpdateError) {
        console.error("[run-analysis] Failed to update business name (non-critical):", nameUpdateError);
        // Non-blocking - continue with analysis
      }

      // Step 2: Analyze reviews
      console.log("[run-analysis] Step 2/3: Analyzing reviews with AI");
```

## Logic Flow

1. **After extraction succeeds:**
   - Check if `extractData.businessName` exists and is valid (not "Your Business" or "Unknown Business")

2. **Update analyses table:**
   - If `analysis.business_name` is null, empty, or "Your Business"
   - Update `analyses.business_name` = `extractData.businessName`
   - Update local `analysis` object for later use

3. **Update businesses table:**
   - If `analysis.business_id` exists
   - Fetch business record
   - If `business.business_name` is null, empty, or "Your Business"
   - Update `businesses.business_name` = `extractData.businessName`

4. **Error handling:**
   - Wrapped in try/catch
   - Errors are logged but don't block analysis
   - Analysis continues even if name update fails

## Testing

1. Create analysis with business_name = "Your Business" or null
2. Run analysis
3. After extraction completes:
   - Check `analyses` table: `business_name` should be updated to extracted name
   - Check `businesses` table: `business_name` should be updated if business_id exists
4. Verify analysis continues normally even if name update fails

## Files Changed

- **Modified:** `supabase/functions/run-analysis/index.ts` (manual edit required)
- **Reference:** `BUSINESS_NAME_UPDATE_CODE.ts` (contains code snippet)

---

**Status:** Code snippet ready - Manual insertion required in `run-analysis/index.ts`

