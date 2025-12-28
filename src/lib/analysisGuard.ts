/**
 * HARD GUARD: Prevents analysis inserts after payment
 * 
 * This guard function ensures that no new analysis rows are created
 * if a payment session exists or is in progress.
 */

/**
 * Check if we're in a payment flow and should block analysis creation
 * @param paymentSessionId - Stripe session ID if exists
 * @param urlSearchParams - URL search params to check for session_id
 * @returns true if we should BLOCK analysis creation
 */
export function shouldBlockAnalysisCreation(
  paymentSessionId: string | null | undefined,
  urlSearchParams?: URLSearchParams | null
): boolean {
  // Check if paymentSessionId exists
  if (paymentSessionId) {
    console.warn('[analysisGuard] BLOCKED: paymentSessionId exists:', paymentSessionId);
    return true;
  }

  // Check if session_id is in URL
  if (urlSearchParams) {
    const sessionId = urlSearchParams.get('session_id');
    if (sessionId) {
      console.warn('[analysisGuard] BLOCKED: session_id in URL:', sessionId);
      return true;
    }
  }

  // Check window.location if available (browser context)
  if (typeof window !== 'undefined') {
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('session_id');
    if (sessionId) {
      console.warn('[analysisGuard] BLOCKED: session_id in window.location:', sessionId);
      return true;
    }
  }

  return false;
}

/**
 * Throw an error if analysis creation should be blocked
 * @param paymentSessionId - Stripe session ID if exists
 * @param urlSearchParams - URL search params to check
 * @param context - Additional context for error message
 */
export function guardAgainstPostPaymentInsert(
  paymentSessionId: string | null | undefined,
  urlSearchParams?: URLSearchParams | null,
  context?: string
): void {
  if (shouldBlockAnalysisCreation(paymentSessionId, urlSearchParams)) {
    const errorMsg = `CRITICAL: Cannot create analysis after payment. ${context || ''}`;
    console.error('[analysisGuard]', errorMsg, {
      paymentSessionId,
      sessionId: urlSearchParams?.get('session_id') || (typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('session_id') : null)
    });
    throw new Error(errorMsg);
  }
}




