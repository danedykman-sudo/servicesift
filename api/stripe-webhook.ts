import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

/**
 * Stripe Webhook Handler - Payment Status Updates ONLY
 * 
 * CRITICAL: This webhook ONLY updates payment status.
 * It does NOT execute analysis, extract reviews, or insert any analysis data.
 * Analysis execution is handled by /api/confirm-payment.ts when user returns from Stripe.
 * 
 * Webhook responsibilities (ONLY):
 * 1. Verify Stripe signature
 * 2. Read session.metadata.analysisId
 * 3. Update analyses table:
 *    - payment_status = 'paid'
 *    - stripe_checkout_session_id = session.id
 *    - paid_at = now()
 * 
 * Required Environment Variables:
 * - STRIPE_SECRET_KEY: Stripe secret key
 * - STRIPE_WEBHOOK_SECRET: Webhook signing secret from Stripe Dashboard
 * - VITE_SUPABASE_URL or SUPABASE_URL: Supabase project URL
 * - SUPABASE_SERVICE_ROLE_KEY: Service role key for server-side database access
 */

// Get environment variables
const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Initialize Stripe client
const stripe = stripeSecretKey ? new Stripe(stripeSecretKey, {
  apiVersion: '2024-11-20.acacia',
}) : null;

// Initialize Supabase client with service role key (bypasses RLS)
const supabase = supabaseUrl && supabaseServiceRoleKey
  ? createClient(supabaseUrl, supabaseServiceRoleKey)
  : null;

export default async function handler(req: any, res: any) {
  // Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Validate environment variables
  if (!stripeSecretKey) {
    console.error('[stripe-webhook] STRIPE_SECRET_KEY is missing');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!webhookSecret) {
    console.error('[stripe-webhook] STRIPE_WEBHOOK_SECRET is missing');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    console.error('[stripe-webhook] Supabase configuration is missing');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!stripe || !supabase) {
    console.error('[stripe-webhook] Failed to initialize clients');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  try {
    // Read the raw request body from the Node request stream
    // This is required for Stripe signature verification
    const chunks: Buffer[] = [];
    for await (const chunk of req) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    const rawBody = Buffer.concat(chunks);

    // Get Stripe signature from headers
    const sig = req.headers['stripe-signature'];
    if (!sig) {
      console.error('[stripe-webhook] Missing stripe-signature header');
      return res.status(400).send('Missing stripe-signature');
    }

    // Verify the webhook signature using the raw body
    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
    } catch (err) {
      const error = err as Error;
      console.error('[stripe-webhook] Signature verification failed:', error.message);
      return res.status(400).send(`Webhook signature verification failed: ${error.message}`);
    }

    console.log('[stripe-webhook] Received event:', event.type, 'Event ID:', event.id);

    // Handle different event types
    switch (event.type) {
      case 'checkout.session.completed': {
        await handleCheckoutSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      }

      case 'checkout.session.async_payment_succeeded': {
        await handleCheckoutSessionAsyncPaymentSucceeded(event.data.object as Stripe.Checkout.Session);
        break;
      }

      case 'checkout.session.async_payment_failed': {
        await handleCheckoutSessionAsyncPaymentFailed(event.data.object as Stripe.Checkout.Session);
        break;
      }

      default:
        console.log('[stripe-webhook] Unhandled event type:', event.type);
        // Return 200 for unhandled events to acknowledge receipt
        return res.status(200).json({ received: true, eventType: event.type });
    }

    // Return success for handled events
    return res.status(200).json({ received: true, eventType: event.type });
  } catch (error) {
    console.error('[stripe-webhook] Error processing webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Still return 200 to prevent Stripe from retrying
    // Log the error for investigation
    return res.status(200).json({ received: true, error: errorMessage });
  }
}

/**
 * Handle checkout.session.completed event
 * ONLY updates payment status - NO analysis execution
 */
async function handleCheckoutSessionCompleted(session: Stripe.Checkout.Session) {
  console.log('[stripe-webhook] Processing checkout.session.completed - Session ID:', session.id);

  const analysisId = session.metadata?.analysisId || session.client_reference_id;

  if (!analysisId) {
    console.error('[stripe-webhook] No analysisId found in session metadata or client_reference_id');
    return;
  }

  // Update ONLY payment status fields
  const updateData: any = {
    payment_status: 'paid',
    paid_at: new Date().toISOString(),
    stripe_checkout_session_id: session.id,
  };

  // Add payment intent ID if available
  if (session.payment_intent && typeof session.payment_intent === 'string') {
    updateData.stripe_payment_intent_id = session.payment_intent;
  } else if (session.payment_intent && typeof session.payment_intent === 'object') {
    updateData.stripe_payment_intent_id = (session.payment_intent as Stripe.PaymentIntent).id;
  }

  const { error } = await supabase!
    .from('analyses')
    .update(updateData)
    .eq('id', analysisId);

  if (error) {
    console.error('[stripe-webhook] Failed to update analysis:', error);
    throw error;
  }

  console.log('[stripe-webhook] Payment confirmed only. No analysis executed. Analysis ID:', analysisId);
}

/**
 * Handle checkout.session.async_payment_succeeded event
 * ONLY updates payment status - NO analysis execution
 */
async function handleCheckoutSessionAsyncPaymentSucceeded(session: Stripe.Checkout.Session) {
  console.log('[stripe-webhook] Processing checkout.session.async_payment_succeeded - Session ID:', session.id);

  const analysisId = session.metadata?.analysisId || session.client_reference_id;

  if (!analysisId) {
    console.error('[stripe-webhook] No analysisId found in session metadata or client_reference_id');
    return;
  }

  // Update ONLY payment status fields
  const updateData: any = {
    payment_status: 'paid',
    paid_at: new Date().toISOString(),
    stripe_checkout_session_id: session.id,
  };

  // Add payment intent ID if available
  if (session.payment_intent && typeof session.payment_intent === 'string') {
    updateData.stripe_payment_intent_id = session.payment_intent;
  } else if (session.payment_intent && typeof session.payment_intent === 'object') {
    updateData.stripe_payment_intent_id = (session.payment_intent as Stripe.PaymentIntent).id;
  }

  const { error } = await supabase!
    .from('analyses')
    .update(updateData)
    .eq('id', analysisId);

  if (error) {
    console.error('[stripe-webhook] Failed to update analysis:', error);
    throw error;
  }

  console.log('[stripe-webhook] Payment confirmed only. No analysis executed. Analysis ID:', analysisId);
}

/**
 * Handle checkout.session.async_payment_failed event
 * ONLY updates payment status - NO analysis execution
 */
async function handleCheckoutSessionAsyncPaymentFailed(session: Stripe.Checkout.Session) {
  console.log('[stripe-webhook] Processing checkout.session.async_payment_failed - Session ID:', session.id);

  const analysisId = session.metadata?.analysisId || session.client_reference_id;

  if (!analysisId) {
    console.error('[stripe-webhook] No analysisId found in session metadata or client_reference_id');
    return;
  }

  // Update ONLY payment status to failed
  const { error } = await supabase!
    .from('analyses')
    .update({
      payment_status: 'failed',
      stripe_checkout_session_id: session.id,
    })
    .eq('id', analysisId);

  if (error) {
    console.error('[stripe-webhook] Failed to update analysis:', error);
    throw error;
  }

  console.log('[stripe-webhook] Payment marked as failed. Analysis ID:', analysisId);
}
