import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import Stripe from "npm:stripe@17.5.0";
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CheckoutRequest {
  amount: number;
  businessName: string;
  isReanalysis: boolean;
  url: string;
  businessId?: string;
}

Deno.serve(async (req: Request) => {
  console.log('[create-checkout] Request received:', req.method);

  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    console.log('[create-checkout] Auth header present:', !!authHeader);

    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

    console.log('[create-checkout] Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasAnonKey: !!supabaseAnonKey,
      hasStripeKey: !!Deno.env.get("STRIPE_SECRET_KEY"),
    });

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Supabase environment not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: { Authorization: authHeader },
      },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();

    console.log('[create-checkout] Auth check:', {
      authenticated: !!user,
      userId: user?.id,
      error: authError?.message,
    });

    if (authError || !user) {
      throw new Error("Unauthorized");
    }

    const stripeSecretKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeSecretKey) {
      throw new Error("Stripe secret key not configured");
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: "2024-12-18.acacia",
    });

    const { amount, businessName, isReanalysis, url, businessId }: CheckoutRequest = await req.json();

    console.log('[create-checkout] Request data:', {
      amount,
      businessName,
      isReanalysis,
      url,
      businessId,
    });

    const origin = req.headers.get("origin") || "http://localhost:5173";
    console.log('[create-checkout] Origin:', origin);

    const successParams = new URLSearchParams({
      session_id: "{CHECKOUT_SESSION_ID}",
      url: encodeURIComponent(url),
    });

    if (businessId) {
      successParams.set("businessId", businessId);
    }

    console.log('[create-checkout] Creating Stripe session...');

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: isReanalysis ? `ServiceSift Re-Analysis: ${businessName}` : `ServiceSift Analysis: ${businessName}`,
              description: isReanalysis ? "Updated review analysis" : "Complete review analysis",
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${origin}/?${successParams.toString()}`,
      cancel_url: `${origin}/`,
    });

    console.log('[create-checkout] Session created:', {
      sessionId: session.id,
      url: session.url,
    });

    if (!session.url) {
      console.error('[create-checkout] Stripe session created but URL is null/undefined');
      throw new Error('Stripe did not generate a checkout URL. This usually means the Stripe API key is invalid or the request parameters are incorrect.');
    }

    return new Response(
      JSON.stringify({ sessionId: session.id, url: session.url }),
      {
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  } catch (error) {
    console.error('[create-checkout] Error:', error);

    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    const statusCode = errorMessage.includes("Unauthorized") || errorMessage.includes("authorization") ? 401 : 400;

    return new Response(
      JSON.stringify({ error: errorMessage }),
      {
        status: statusCode,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      }
    );
  }
});
