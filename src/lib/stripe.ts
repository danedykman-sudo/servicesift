import { supabase } from './supabase';

export const FIRST_ANALYSIS_PRICE = 4900;
export const REANALYSIS_PRICE = 1000;

export async function createCheckoutSession(
  amount: number,
  businessName: string,
  isReanalysis: boolean,
  url: string,
  businessId?: string
): Promise<{ sessionId: string; url: string }> {
  console.log('[Stripe] Creating checkout session:', {
    amount,
    businessName,
    isReanalysis,
    url,
    businessId,
  });

  console.log('[Stripe] Refreshing session to ensure valid token...');
  const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();

  if (refreshError || !refreshedSession) {
    console.error('[Stripe] Failed to refresh session:', refreshError);
    throw new Error('Your session has expired. Please log out and log back in.');
  }

  console.log('[Stripe] Session refreshed successfully');

  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('[Stripe] User verification failed:', userError);
    throw new Error('Authentication failed. Please log out and log back in.');
  }

  console.log('[Stripe] User authenticated:', { userId: user.id });

  const apiUrl = '/api/create-checkout';
  console.log('[Stripe] API route URL:', apiUrl);
  console.log('[Stripe] Environment check:', {
    hasSupabaseUrl: !!import.meta.env.VITE_SUPABASE_URL,
    hasAnonKey: !!import.meta.env.VITE_SUPABASE_ANON_KEY,
  });

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${refreshedSession.access_token}`,
      },
      
      body: JSON.stringify({
        amount,
        businessName,
        isReanalysis,
        url,
        businessId,
      }),
    });

    console.log('[Stripe] Response status:', response.status);
    console.log('[Stripe] Response headers:', Object.fromEntries(response.headers.entries()));

    const responseText = await response.text();
    console.log('[Stripe] Response body:', responseText);

    if (!response.ok) {
      let errorMessage = 'Failed to create checkout session';
      try {
        const error = JSON.parse(responseText);
        errorMessage = error.error || errorMessage;
      } catch {
        errorMessage = responseText || errorMessage;
      }
      console.error('[Stripe] Checkout failed:', errorMessage);
      throw new Error(errorMessage);
    }

    const result = JSON.parse(responseText);
    console.log('[Stripe] Checkout session created:', result);

    if (!result.url) {
      console.error('[Stripe] No checkout URL received:', result);
      throw new Error('Stripe did not return a checkout URL. Please verify your Stripe configuration.');
    }

    if (typeof result.url !== 'string' || !result.url.startsWith('https://')) {
      console.error('[Stripe] Invalid checkout URL format:', result.url);
      throw new Error(`Invalid checkout URL received: ${result.url}`);
    }

    return result;
  } catch (error) {
    console.error('[Stripe] Error creating checkout session:', error);
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('Failed to create checkout session');
  }
}
