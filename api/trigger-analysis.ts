import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://service-sift.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

/**
 * Fallback endpoint to manually trigger analysis for a paid analysis
 * This can be called directly with an analysisId if the automatic trigger fails
 */
export default async function handler(req: any, res: any) {
  console.log('[trigger-analysis] ===== HANDLER CALLED =====');
  console.log('[trigger-analysis] Request:', {
    method: req.method,
    url: req.url,
    timestamp: new Date().toISOString()
  });

  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    return res.status(200).end();
  }

  // Handle GET requests with helpful message
  if (req.method === 'GET') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      error: 'Method not allowed',
      message: 'This endpoint only accepts POST requests',
      usage: {
        method: 'POST',
        url: '/api/trigger-analysis',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer <your-jwt-token>'
        },
        body: {
          analysisId: '<analysis-id-to-trigger>'
        }
      },
      note: 'Use the "Run Analysis Now" button in the dashboard to trigger analysis for paid analyses that haven\'t completed.'
    });
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(405).json({ error: 'Method not allowed', allowedMethods: ['POST', 'GET', 'OPTIONS'] });
  }

  try {
    // Get auth token
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(401).json({ error: 'No authorization header' });
    }

    const token = authHeader.replace('Bearer ', '');

    // Initialize Supabase
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    console.log('[trigger-analysis] Environment variables check:', {
      hasSupabaseUrl: !!supabaseUrl,
      supabaseUrl: supabaseUrl ? `${supabaseUrl.substring(0, 30)}...` : 'missing',
      hasSupabaseAnonKey: !!supabaseAnonKey,
      anonKeyLength: supabaseAnonKey?.length || 0,
      hasSupabaseServiceRoleKey: !!supabaseServiceRoleKey,
      serviceRoleKeyLength: supabaseServiceRoleKey?.length || 0
    });

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
      console.error('[trigger-analysis] Missing Supabase configuration:', {
        supabaseUrl: !!supabaseUrl,
        supabaseAnonKey: !!supabaseAnonKey,
        supabaseServiceRoleKey: !!supabaseServiceRoleKey
      });
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Verify user
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(401).json({ error: 'Authentication failed' });
    }

    // Get analysisId from request body
    const { analysisId } = req.body;
    if (!analysisId) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'analysisId is required' });
    }

    console.log('[trigger-analysis] Triggering analysis for:', analysisId);

    // Get the analysis
    const { data: analysis, error: fetchError } = await supabaseService
      .from('analyses')
      .select('*')
      .eq('id', analysisId)
      .single();

    if (fetchError || !analysis) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(404).json({ error: 'Analysis not found' });
    }

    // Verify user owns this analysis
    if (analysis.user_id !== user.id) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Verify payment is completed
    if (analysis.payment_status !== 'paid') {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ 
        error: 'Analysis not paid',
        payment_status: analysis.payment_status
      });
    }

    // Check if already completed or in progress (prevent duplicate execution)
    const { data: existingRootCauses } = await supabaseService
      .from('root_causes')
      .select('id')
      .eq('analysis_id', analysisId)
      .limit(1);

    if (existingRootCauses && existingRootCauses.length > 0) {
      console.log('[trigger-analysis] Analysis already has results, skipping');
      
      // Get or create report for this analysis
      let reportId: string | null = null;
      try {
        const { data: existingReport } = await supabaseService
          .from('reports')
          .select('id')
          .eq('analysis_id', analysisId)
          .maybeSingle();
        
        if (existingReport) {
          reportId = existingReport.id;
        } else {
          // Create report if it doesn't exist
          const { data: newReport, error: reportError } = await supabaseService
            .from('reports')
            .insert({
              analysis_id: analysisId,
              business_id: analysis.business_id,
              stripe_checkout_session_id: analysis.stripe_checkout_session_id,
              status: 'READY',
              coverage_level: 200,
              run_type: 'SNAPSHOT',
              latest_artifact_version: 1
            })
            .select('id')
            .single();
          
          if (!reportError && newReport) {
            reportId = newReport.id;
          }
        }
      } catch (reportErr) {
        console.error('[trigger-analysis] Error getting/creating report:', reportErr);
        // Non-critical - continue without reportId
      }
      
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(200).json({ 
        success: true, 
        message: 'Analysis already completed',
        analysisId,
        reportId: reportId || undefined,
        status: 'completed'
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
        console.log('[trigger-analysis] Analysis already in progress, skipping duplicate trigger', {
          analysisId,
          currentStatus: analysis.status,
          stuckDuration: `${Math.round(stuckDuration / 1000)}s`,
          threshold: `${stuckThreshold / 1000}s`
        });
        // Get or create report for this analysis
        let reportId: string | null = null;
        try {
          const { data: existingReport } = await supabaseService
            .from('reports')
            .select('id')
            .eq('analysis_id', analysisId)
            .maybeSingle();
          
          if (existingReport) {
            reportId = existingReport.id;
          } else {
            // Create report if it doesn't exist
            const { data: newReport, error: reportError } = await supabaseService
              .from('reports')
              .insert({
                analysis_id: analysisId,
                business_id: analysis.business_id,
                stripe_checkout_session_id: analysis.stripe_checkout_session_id,
                status: 'QUEUED',
                coverage_level: 200,
                run_type: 'SNAPSHOT',
                latest_artifact_version: 1
              })
              .select('id')
              .single();
            
            if (!reportError && newReport) {
              reportId = newReport.id;
            }
          }
        } catch (reportErr) {
          console.error('[trigger-analysis] Error getting/creating report:', reportErr);
          // Non-critical - continue without reportId
        }
        
        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return res.status(200).json({ 
          success: true, 
          message: 'Analysis already in progress',
          analysisId,
          reportId: reportId || undefined,
          status: analysis.status
        });
      } else {
        // Stuck for > 10 minutes - allow retry
        console.warn('[trigger-analysis] Analysis stuck for too long, allowing retry', {
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
      console.log('[trigger-analysis] Analysis already in progress (no timestamp), skipping', {
        analysisId,
        currentStatus: analysis.status
      });
      
      // Get or create report for this analysis
      let reportId: string | null = null;
      try {
        const { data: existingReport } = await supabaseService
          .from('reports')
          .select('id')
          .eq('analysis_id', analysisId)
          .maybeSingle();
        
        if (existingReport) {
          reportId = existingReport.id;
        } else {
          // Create report if it doesn't exist
          const { data: newReport, error: reportError } = await supabaseService
            .from('reports')
            .insert({
              analysis_id: analysisId,
              business_id: analysis.business_id,
              stripe_checkout_session_id: analysis.stripe_checkout_session_id,
              status: 'QUEUED',
              coverage_level: 200,
              run_type: 'SNAPSHOT',
              latest_artifact_version: 1
            })
            .select('id')
            .single();
          
          if (!reportError && newReport) {
            reportId = newReport.id;
          }
        }
      } catch (reportErr) {
        console.error('[trigger-analysis] Error getting/creating report:', reportErr);
        // Non-critical - continue without reportId
      }
      
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(200).json({ 
        success: true, 
        message: 'Analysis already in progress',
        analysisId,
        reportId: reportId || undefined,
        status: analysis.status
      });
    }

    // Trigger analysis asynchronously
    console.log('[trigger-analysis] Triggering analysis asynchronously:', {
      analysisId,
      businessUrl: analysis.business_url,
      timestamp: new Date().toISOString()
    });

    // Get or create report for this analysis
    let reportId: string | null = null;
    try {
      const { data: existingReport } = await supabaseService
        .from('reports')
        .select('id')
        .eq('analysis_id', analysisId)
        .maybeSingle();
      
      if (existingReport) {
        reportId = existingReport.id;
        // Update report status to QUEUED if it exists
        await supabaseService
          .from('reports')
          .update({ status: 'QUEUED', updated_at: new Date().toISOString() })
          .eq('id', reportId);
      } else {
        // Create report if it doesn't exist
        const { data: newReport, error: reportError } = await supabaseService
          .from('reports')
          .insert({
            analysis_id: analysisId,
            business_id: analysis.business_id,
            stripe_checkout_session_id: analysis.stripe_checkout_session_id,
            status: 'QUEUED',
            coverage_level: 200,
            run_type: 'SNAPSHOT',
            latest_artifact_version: 1
          })
          .select('id')
          .single();
        
        if (!reportError && newReport) {
          reportId = newReport.id;
        }
      }
    } catch (reportErr) {
      console.error('[trigger-analysis] Error getting/creating report:', reportErr);
      // Non-critical - continue without reportId
    }

    // Update status to extracting
    console.log('[trigger-analysis] DEBUG: About to update status to extracting', {
      analysisId,
      currentStatus: analysis.status,
      reportId,
      timestamp: new Date().toISOString()
    });

    const { error: updateError } = await supabaseService
      .from('analyses')
      .update({ status: 'extracting' })
      .eq('id', analysisId);

    if (updateError) {
      console.error('[trigger-analysis] DEBUG: Status update failed', {
        analysisId,
        error: updateError,
        timestamp: new Date().toISOString()
      });
    } else {
      console.log('[trigger-analysis] DEBUG: Status update succeeded', {
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

    console.log('[trigger-analysis] DEBUG: Status update verified', {
      analysisId,
      requestedStatus: 'extracting',
      actualStatus: verifyAnalysis?.status,
      match: verifyAnalysis?.status === 'extracting',
      verifyError: verifyError,
      timestamp: new Date().toISOString()
    });

    // Check for debug mode: await run-analysis response
    const debugSyncMode = process.env.DEBUG_SYNC_RUN_ANALYSIS === 'true';
    
    // Generate traceId for request tracking
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
    console.log('[trigger-analysis] Generated traceId:', { traceId, analysisId });
    
    if (supabaseUrl && supabaseAnonKey) {
      const edgeFunctionUrl = `${supabaseUrl}/functions/v1/run-analysis`;
      const requestBody = {
        analysisId,
        businessUrl: analysis.business_url,
        businessName: analysis.business_name,
        traceId,
      };
      const requestHeaders = {
        'Content-Type': 'application/json',
        'Authorization': authHeader, // Forward user JWT
        'apikey': supabaseAnonKey,
      };
      
      console.log('[trigger-analysis] Calling run-analysis edge function:', {
        url: edgeFunctionUrl,
        analysisId,
        businessUrl: analysis.business_url,
        requestBody,
        headers: {
          'Content-Type': requestHeaders['Content-Type'],
          'Authorization': 'Bearer ***',
          'apikey': '***',
        },
        debugSyncMode,
        timestamp: new Date().toISOString()
      });
      
      if (debugSyncMode) {
        // DEBUG MODE: Await the response and include it in the JSON response
        try {
          const response = await fetch(edgeFunctionUrl, {
            method: 'POST',
            headers: requestHeaders,
            body: JSON.stringify(requestBody),
          });
          
          const bodyText = await response.text();
          const bodyPreview = bodyText.substring(0, 500);
          
          console.log('[trigger-analysis] DEBUG SYNC MODE: Response received:', {
            status: response.status,
            ok: response.ok,
            bodyLength: bodyText.length,
            bodyPreview,
            analysisId,
            timestamp: new Date().toISOString()
          });
          
          // Get or create report for this analysis
          let reportId: string | null = null;
          try {
            const { data: existingReport } = await supabaseService
              .from('reports')
              .select('id')
              .eq('analysis_id', analysisId)
              .maybeSingle();
            
            if (existingReport) {
              reportId = existingReport.id;
            } else {
              const { data: newReport, error: reportError } = await supabaseService
                .from('reports')
                .insert({
                  analysis_id: analysisId,
                  business_id: analysis.business_id,
                  stripe_checkout_session_id: analysis.stripe_checkout_session_id,
                  status: 'QUEUED',
                  coverage_level: 200,
                  run_type: 'SNAPSHOT',
                  latest_artifact_version: 1
                })
                .select('id')
                .single();
              
              if (!reportError && newReport) {
                reportId = newReport.id;
              }
            }
          } catch (reportErr) {
            console.error('[trigger-analysis] Error getting/creating report:', reportErr);
          }
          
          res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
          return res.status(200).json({ 
            success: true, 
            message: 'Analysis started (sync debug mode)',
            analysisId,
            reportId: reportId || undefined,
            status: 'extracting',
            runAnalysisResponse: {
              status: response.status,
              ok: response.ok,
              bodyPreview
            }
          });
        } catch (fetchError) {
          console.error('[trigger-analysis] DEBUG SYNC MODE: Fetch failed:', {
            error: fetchError,
            message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
            analysisId,
            timestamp: new Date().toISOString()
          });
          
          res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
          return res.status(500).json({ 
            success: false,
            error: 'Failed to trigger analysis',
            message: fetchError instanceof Error ? fetchError.message : 'Unknown error',
            analysisId
          });
        }
      } else {
        // PRODUCTION MODE: Fire-and-forget (async)
        // Add timeout detection
        const fetchTimeout = setTimeout(() => {
          console.warn('[trigger-analysis] DEBUG: Fetch timeout - no response after 30 seconds', {
            analysisId,
            url: edgeFunctionUrl,
            elapsed: '30s',
            timestamp: new Date().toISOString()
          });
        }, 30000);
        
        console.log('[trigger-analysis] DEBUG: Fetch promise created, waiting for response...', {
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
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/afac3098-4abd-40fa-b54c-34b113740e52',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/trigger-analysis.ts:301',message:'Fetch .then() handler reached',data:{analysisId,status:response.status,ok:response.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.log('[trigger-analysis] DEBUG: .then() handler reached', {
            analysisId,
            timestamp: new Date().toISOString()
          });
          
          // Log response status (sanitized)
          console.log('[trigger-analysis] Edge function response received:', {
            status: response.status,
            statusText: response.statusText,
            ok: response.ok,
            analysisId,
            timestamp: new Date().toISOString()
          });
          
          // Always log response body, even for success
          response.clone().text().then(bodyText => {
            console.log('[trigger-analysis] DEBUG: Response body:', {
              status: response.status,
              bodyLength: bodyText.length,
              bodyPreview: bodyText.substring(0, 200),
              analysisId,
              timestamp: new Date().toISOString()
            });
          }).catch(bodyErr => {
            console.error('[trigger-analysis] DEBUG: Failed to read response body:', {
              error: bodyErr,
              analysisId
            });
          });
          
          if (!response.ok) {
            // Log error but don't fail - analysis can be retried
            response.text().then(errorText => {
              console.error('[trigger-analysis] Edge function returned error:', {
                status: response.status,
                errorText: errorText.substring(0, 500),
                fullErrorText: errorText,
                analysisId,
                timestamp: new Date().toISOString()
              });
            }).catch(textErr => {
              console.error('[trigger-analysis] DEBUG: Failed to read error response text:', {
                error: textErr,
                analysisId
              });
            });
          }
        })
        .catch(err => {
          clearTimeout(fetchTimeout);
          // #region agent log
          fetch('http://127.0.0.1:7242/ingest/afac3098-4abd-40fa-b54c-34b113740e52',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'api/trigger-analysis.ts:353',message:'Fetch .catch() handler reached',data:{analysisId,errorName:err.name,errorMessage:err.message,errorCode:(err as any).code},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'B'})}).catch(()=>{});
          // #endregion
          console.error('[trigger-analysis] DEBUG: .catch() handler reached', {
            analysisId,
            timestamp: new Date().toISOString()
          });
          console.error('[trigger-analysis] Failed to trigger async analysis:', {
            error: err,
            message: err.message,
            stack: err.stack,
            errorName: err.name,
            errorCode: (err as any).code,
            analysisId,
            url: edgeFunctionUrl,
            timestamp: new Date().toISOString()
          });
          // Don't throw - analysis can be retried manually
          // Update status to failed so user knows something went wrong
          (async () => {
            try {
              await supabaseService
                .from('analyses')
                .update({ 
                  status: 'failed',
                  error_message: 'Failed to start analysis. Please try again.'
                })
                .eq('id', analysisId);
            } catch (updateErr) {
              console.error('[trigger-analysis] Failed to update status after trigger error:', updateErr);
            }
          })();
        });
        
        // Return immediately - analysis runs in background
        console.log('[trigger-analysis] Analysis triggered asynchronously, returning success', {
          analysisId,
          reportId,
          status: 'extracting'
        });
        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return res.status(200).json({ 
          success: true, 
          message: 'Analysis started',
          analysisId,
          reportId: reportId || undefined,
          status: 'extracting'
        });
      }
    } else {
      console.error('[trigger-analysis] Missing Supabase configuration for async trigger');
      await supabaseService
        .from('analyses')
        .update({ 
          status: 'failed',
          error_message: 'Server configuration error. Please contact support.'
        })
        .eq('id', analysisId);
      
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ 
        success: false,
        error: 'Server configuration error',
        analysisId
      });
    }

  } catch (error) {
    console.error('[trigger-analysis] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(500).json({ 
      success: false,
      error: errorMessage 
    });
  }
}

