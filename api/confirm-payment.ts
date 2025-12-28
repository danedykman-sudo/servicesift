import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://service-sift.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

export default async function handler(req: any, res: any) {
  // ===== CRITICAL: LOG AT THE VERY START =====
  console.log('[confirm-payment] ===== HANDLER CALLED =====');
  console.log('[confirm-payment] Request received:', {
    method: req.method,
    url: req.url,
    headers: {
      'content-type': req.headers['content-type'],
      'authorization': req.headers.authorization ? `${req.headers.authorization.substring(0, 20)}...` : 'missing',
      'origin': req.headers.origin,
      'user-agent': req.headers['user-agent']?.substring(0, 50)
    },
    timestamp: new Date().toISOString()
  });
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    console.log('[confirm-payment] OPTIONS request - returning CORS headers');
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
    console.error('[confirm-payment] Invalid method:', req.method);
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  console.log('[confirm-payment] POST request validated - starting processing');

  try {
    // Log request body (before parsing)
    let requestBody = null;
    try {
      // Read the request body if it exists
      if (req.body) {
        requestBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
        console.log('[confirm-payment] Request body:', {
          session_id: requestBody?.session_id,
          hasSessionId: !!requestBody?.session_id,
          bodyKeys: Object.keys(requestBody || {})
        });
      } else {
        console.warn('[confirm-payment] No request body found');
      }
    } catch (bodyError) {
      console.error('[confirm-payment] Error parsing request body:', bodyError);
    }
    console.log('[confirm-payment] Step 1: Checking authorization');
    // Get auth token from Authorization header
    const authHeader = req.headers.authorization;
    console.log('[confirm-payment] Authorization header:', {
      present: !!authHeader,
      startsWithBearer: authHeader?.startsWith('Bearer '),
      length: authHeader?.length
    });
    
    if (!authHeader) {
      console.error('[confirm-payment] No authorization header found');
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Extract token
    const token = authHeader.replace('Bearer ', '');
    console.log('[confirm-payment] Token extracted:', {
      length: token.length,
      firstChars: token.substring(0, 20)
    });

    // Initialize Supabase client
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify user with the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(401).json({ error: 'Authentication failed' });
    }

    console.log('[confirm-payment] Step 2: Extracting session_id from request body');
    // Get session_id from request body
    const { session_id } = requestBody || req.body || {};
    
    console.log('[confirm-payment] Session ID extracted:', {
      session_id,
      hasSessionId: !!session_id,
      sessionIdType: typeof session_id,
      requestBodyType: typeof requestBody
    });

    if (!session_id) {
      console.error('[confirm-payment] No session_id in request body');
      console.log('[confirm-payment] Full request body:', JSON.stringify(requestBody || req.body || {}, null, 2));
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'session_id is required' });
    }

    // Initialize Stripe
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeSecretKey) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Stripe configuration missing' });
    }

    const stripe = new Stripe(stripeSecretKey, {
      apiVersion: '2024-11-20.acacia',
    });

    // Retrieve Stripe Checkout Session
    console.log('[confirm-payment] Retrieving Stripe session:', session_id);
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // Verify payment is complete
    if (session.payment_status !== 'paid' && session.status !== 'complete') {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ 
        error: 'Payment not completed',
        payment_status: session.payment_status,
        status: session.status
      });
    }

    // Get analysisId from metadata
    let analysisId = session.metadata?.analysisId || session.client_reference_id;

    if (!analysisId) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'No analysisId found in session metadata' });
    }

    console.log('[confirm-payment] Processing payment confirmation for analysis:', analysisId);

    // SAFETY ASSERTION: Check for duplicate analyses with same session ID first
    const { data: duplicates, error: dupError } = await supabaseService
      .from('analyses')
      .select('id, created_at')
      .eq('stripe_checkout_session_id', session.id);
    
    if (!dupError && duplicates && duplicates.length > 1) {
      console.error('[confirm-payment] CRITICAL: Multiple analyses found for same payment session:', {
        sessionId: session.id,
        count: duplicates.length,
        ids: duplicates.map(d => d.id)
      });
      // Use the oldest one - this is the correct one
      const sortedDuplicates = [...duplicates].sort((a, b) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      );
      analysisId = sortedDuplicates[0].id;
      console.warn('[confirm-payment] Using oldest analysis:', analysisId);
    }

    // Get the analysis record
    const { data: analysis, error: fetchError } = await supabaseService
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .single();

    if (fetchError || !analysis) {
      console.error('[confirm-payment] CRITICAL: Analysis not found for payment:', {
        analysisId,
        sessionId: session.id,
        error: fetchError
      });
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(404).json({ 
        error: 'Analysis not found',
        message: 'The analysis for this payment does not exist. This should never happen.'
      });
    }

    // Verify user owns this analysis
    if (analysis.user_id !== user.id) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // HARD LINKING: Ensure business_id is set if missing
    const businessIdFromMetadata = session.metadata?.businessId;
    if (!analysis.business_id && businessIdFromMetadata) {
      console.log('[confirm-payment] Setting business_id from metadata:', businessIdFromMetadata);
      const { error: linkError } = await supabaseService
        .from('analyses')
        .update({ business_id: businessIdFromMetadata })
        .eq('id', analysisId);
      
      if (linkError) {
        console.warn('[confirm-payment] Failed to set business_id:', linkError);
      } else {
        analysis.business_id = businessIdFromMetadata;
      }
    }

    // Idempotency check: If analysis already has results, do nothing
    const { data: existingRootCauses } = await supabaseService
      .from('root_causes')
      .select('id')
      .eq('analysis_id', analysisId)
      .limit(1);

    if (existingRootCauses && existingRootCauses.length > 0) {
      console.log('[confirm-payment] Analysis already has results, skipping:', analysisId);
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(200).json({ 
        success: true, 
        message: 'Analysis already completed',
        analysisId,
        status: analysis.status
      });
    }

    // Check if analysis is already in progress (prevent race conditions)
    // BUT allow retry if stuck for > 10 minutes (edge function may have failed)
    const isInProgress = analysis.status === 'extracting' || analysis.status === 'analyzing' || analysis.status === 'saving';
    
    if (isInProgress && analysis.created_at) {
      const createdTime = new Date(analysis.created_at).getTime();
      const now = Date.now();
      const stuckDuration = now - createdTime;
      const stuckThreshold = 10 * 60 * 1000; // 10 minutes
      
      if (stuckDuration < stuckThreshold) {
        // Recently started (< 10 min ago) - skip to prevent duplicate triggers
        console.log('[confirm-payment] Analysis already in progress, skipping duplicate trigger', {
          analysisId,
          currentStatus: analysis.status,
          stuckDuration: `${Math.round(stuckDuration / 1000)}s`,
          threshold: `${stuckThreshold / 1000}s`
        });
        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return res.status(200).json({ 
          success: true, 
          message: 'Analysis already in progress',
          analysisId,
          status: analysis.status
        });
      } else {
        // Stuck for > 10 minutes - allow retry
        console.warn('[confirm-payment] Analysis stuck for too long, allowing retry', {
          analysisId,
          currentStatus: analysis.status,
          stuckDuration: `${Math.round(stuckDuration / 1000)}s`,
          created_at: analysis.created_at
        });
        // Reset status to allow retry
        await supabaseService
          .from('analyses')
          .update({ status: 'pending' })
          .eq('id', analysisId);
      }
    } else if (isInProgress) {
      // No created_at timestamp - be conservative and skip
      console.log('[confirm-payment] Analysis already in progress (no timestamp), skipping', {
        analysisId,
        currentStatus: analysis.status
      });
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(200).json({ 
        success: true, 
        message: 'Analysis already in progress',
        analysisId,
        status: analysis.status
      });
    }

    // HARD LINKING: Always set payment fields (idempotent)
    console.log('[confirm-payment] Hard linking payment to analysis:', {
      analysisId,
      sessionId: session.id,
      currentPaymentStatus: analysis.payment_status,
      currentSessionId: analysis.stripe_checkout_session_id
    });

    const { error: linkError } = await supabaseService
      .from('analyses')
      .update({
        payment_status: 'paid',
        paid_at: new Date().toISOString(),
        stripe_checkout_session_id: session.id, // Always set - this is the hard link
        // Also set payment_id for backward compatibility
        payment_id: session.id,
      })
      .eq('id', analysisId);

    if (linkError) {
      console.error('[confirm-payment] Failed to hard link payment:', linkError);
      // Continue anyway - webhook may have already updated it
    } else {
      console.log('[confirm-payment] Payment hard linked successfully');
      // Update local analysis object
      analysis.payment_status = 'paid';
      analysis.stripe_checkout_session_id = session.id;
    }

    // Trigger analysis asynchronously if not already completed
    if (analysis.status !== 'completed') {
      console.log('[confirm-payment] Triggering analysis asynchronously:', {
        analysisId,
        businessUrl: analysis.business_url,
        timestamp: new Date().toISOString()
      });

      // Update status to extracting
      console.log('[confirm-payment] DEBUG: About to update status to extracting', {
        analysisId,
        currentStatus: analysis.status,
        timestamp: new Date().toISOString()
      });

      const { error: updateError } = await supabaseService
        .from('analyses')
        .update({ status: 'extracting' })
        .eq('id', analysisId);

      if (updateError) {
        console.error('[confirm-payment] DEBUG: Status update failed', {
          analysisId,
          error: updateError,
          timestamp: new Date().toISOString()
        });
      } else {
        console.log('[confirm-payment] DEBUG: Status update succeeded', {
          analysisId,
          timestamp: new Date().toISOString()
        });
      }

      // Verify the update
      const { data: verifyAnalysis, error: verifyError } = await supabaseService
        .from('analyses')
        .select('status')
        .eq('id', analysisId)
        .single();

      console.log('[confirm-payment] DEBUG: Status update verified', {
        analysisId,
        requestedStatus: 'extracting',
        actualStatus: verifyAnalysis?.status,
        match: verifyAnalysis?.status === 'extracting',
        verifyError: verifyError,
        timestamp: new Date().toISOString()
      });

      // Trigger analysis asynchronously (fire-and-forget)
      // Don't await - let it run in the background
      if (supabaseUrl && supabaseAnonKey) {
        const edgeFunctionUrl = `${supabaseUrl}/functions/v1/run-analysis`;
        const requestBody = {
          analysisId,
          businessUrl: analysis.business_url,
          businessName: analysis.business_name,
        };
        const requestHeaders = {
          'Content-Type': 'application/json',
          'Authorization': authHeader, // Forward user JWT
          'apikey': supabaseAnonKey,
        };
        
        console.log('[confirm-payment] Calling run-analysis edge function:', {
          url: edgeFunctionUrl,
          analysisId,
          businessUrl: analysis.business_url,
          requestBody,
          headers: {
            'Content-Type': requestHeaders['Content-Type'],
            'apikey': '***',
          },
          timestamp: new Date().toISOString()
        });
        
        // Add timeout detection
        const fetchTimeout = setTimeout(() => {
          console.warn('[confirm-payment] DEBUG: Fetch timeout - no response after 30 seconds', {
            analysisId,
            url: edgeFunctionUrl,
            elapsed: '30s',
            timestamp: new Date().toISOString()
          });
        }, 30000);
        
        console.log('[confirm-payment] DEBUG: Fetch promise created, waiting for response...', {
          analysisId,
          timestamp: new Date().toISOString(),
          url: edgeFunctionUrl
        });
        
        fetch(edgeFunctionUrl, {
          method: 'POST',
          headers: requestHeaders,
          body: JSON.stringify(requestBody),
        })
        .then(response => {
          clearTimeout(fetchTimeout);
          console.log('[confirm-payment] DEBUG: .then() handler reached', {
            analysisId,
            timestamp: new Date().toISOString()
          });
          
          // Log response headers
          const responseHeaders = Object.fromEntries(response.headers.entries());
          console.log('[confirm-payment] Edge function response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            headers: responseHeaders,
            analysisId,
            timestamp: new Date().toISOString()
          });
          
          // Always log response body, even for success
          response.clone().text().then(bodyText => {
            console.log('[confirm-payment] DEBUG: Response body:', {
              status: response.status,
              bodyLength: bodyText.length,
              bodyPreview: bodyText.substring(0, 200),
              analysisId,
              timestamp: new Date().toISOString()
            });
          }).catch(bodyErr => {
            console.error('[confirm-payment] DEBUG: Failed to read response body:', {
              error: bodyErr,
              analysisId
            });
          });
          
          if (!response.ok) {
            // Log error but don't fail - analysis can be retried
            // Clone the response again since we already cloned it above
            response.clone().text().then(errorText => {
              console.error('[confirm-payment] Edge function returned error:', {
                status: response.status,
                errorText: errorText.substring(0, 500),
                fullErrorText: errorText,
                analysisId,
                timestamp: new Date().toISOString()
              });
            }).catch(textErr => {
              console.error('[confirm-payment] DEBUG: Failed to read error response text:', {
                error: textErr,
                analysisId
              });
            });
          }
        })
        .catch(err => {
          clearTimeout(fetchTimeout);
          console.error('[confirm-payment] DEBUG: .catch() handler reached', {
            analysisId,
            timestamp: new Date().toISOString()
          });
          console.error('[confirm-payment] Failed to trigger async analysis:', {
            error: err,
            message: err.message,
            stack: err.stack,
            errorName: err.name,
            errorCode: (err as any).code,
            analysisId,
            url: edgeFunctionUrl,
            timestamp: new Date().toISOString()
          });
          // Don't throw - analysis can be retried manually via trigger-analysis endpoint
          // Update status to failed so user knows something went wrong
          supabaseService
            .from('analyses')
            .update({ 
              status: 'failed',
              error_message: 'Failed to start analysis. Please try "Run Analysis Now" button.'
            })
            .eq('id', analysisId)
            .catch(updateErr => {
              console.error('[confirm-payment] Failed to update status after trigger error:', updateErr);
            });
        });
      } else {
        console.error('[confirm-payment] Missing Supabase configuration for async trigger');
        await supabaseService
          .from('analyses')
          .update({ 
            status: 'failed',
            error_message: 'Server configuration error. Please contact support.'
          })
          .eq('id', analysisId);
      }

      // Return immediately - analysis runs in background
      console.log('[confirm-payment] Analysis triggered asynchronously, returning success');
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(200).json({ 
        success: true, 
        message: 'Analysis started',
        analysisId,
        status: 'extracting'
      });
    }

    // Analysis already completed
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({ 
      success: true, 
      message: 'Analysis already completed',
      analysisId,
      status: 'completed'
    });
  } catch (error) {
    console.error('[confirm-payment] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    const errorStack = error instanceof Error ? error.stack : undefined;
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(500).json({ 
      error: errorMessage,
      details: errorStack ? errorStack.substring(0, 500) : undefined
    });
  }
}

