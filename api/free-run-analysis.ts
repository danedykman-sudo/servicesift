import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://service-sift.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

export default async function handler(req: any, res: any) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Check if free mode is enabled
    if (process.env.PAYMENTS_DISABLED !== 'true') {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(403).json({ error: 'Free mode disabled' });
    }

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

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceRoleKey) {
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

    // Get request body
    const { businessUrl, coverageLevel = 200 } = req.body;
    if (!businessUrl) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'businessUrl is required' });
    }

    console.log('[free-run-analysis] Creating free analysis:', {
      userId: user.id,
      businessUrl,
      coverageLevel,
    });

    // Normalize URL
    function normalizeUrl(url: string): string {
      try {
        const urlObj = new URL(url);
        return `${urlObj.protocol}//${urlObj.host}${urlObj.pathname}${urlObj.search}`;
      } catch {
        return url.trim();
      }
    }

    const normalizedUrl = normalizeUrl(businessUrl);

    // Get or create business
    let businessId: string;
    const { data: existingBusiness } = await supabaseService
      .from('businesses')
      .select('id, business_name')
      .eq('user_id', user.id)
      .eq('google_maps_url', normalizedUrl)
      .maybeSingle();

    if (existingBusiness) {
      businessId = existingBusiness.id;
      console.log('[free-run-analysis] Using existing business:', businessId);
    } else {
      // Extract business name from URL with validation
      const urlObj = new URL(businessUrl);
      let businessName = 'Unnamed Business'; // Safe fallback

      // Try to extract from URL path, but validate it
      const pathSegments = urlObj.pathname.split('/').filter(s => s && s.length > 0);
      for (const segment of pathSegments) {
        // Skip common non-name patterns
        if (segment.startsWith('data=') || 
            segment.startsWith('@') || 
            segment.match(/^[0-9,.z]+$/) ||
            segment.length < 3) {
          continue;
        }
        // Found a valid-looking segment
        businessName = segment.replace(/-/g, ' ').replace(/\+/g, ' ');
        break;
      }

      console.log('[free-run-analysis] Extracted business name:', { businessName, url: businessUrl });

      // Use upsert to handle duplicates gracefully (in case of race conditions)
      const { data: newBusiness, error: businessError } = await supabaseService
        .from('businesses')
        .upsert({
          user_id: user.id,
          business_name: businessName,
          google_maps_url: normalizedUrl,
        }, {
          onConflict: 'user_id,google_maps_url',
          ignoreDuplicates: false
        })
        .select('id, business_name')
        .single();

      if (businessError || !newBusiness) {
        console.error('[free-run-analysis] Failed to create/update business:', businessError);
        res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
        return res.status(500).json({ error: 'Failed to create business' });
      }

      businessId = newBusiness.id;
      console.log('[free-run-analysis] Created/updated business:', businessId);
    }

    // Check if baseline exists
    const { data: baselineAnalysis } = await supabaseService
      .from('analyses')
      .select('id')
      .eq('business_id', businessId)
      .eq('is_baseline', true)
      .maybeSingle();

    const isBaseline = !baselineAnalysis;

    // Create analysis with payment_status='paid' but no Stripe session
    const businessName = existingBusiness?.business_name || 'Business';
    const { data: newAnalysis, error: analysisError } = await supabaseService
      .from('analyses')
      .insert({
        business_id: businessId,
        user_id: user.id,
        business_url: normalizedUrl,
        business_name: businessName,
        review_count: 0,
        average_rating: 0,
        is_baseline: isBaseline,
        payment_status: 'paid',
        stripe_checkout_session_id: null,
        payment_id: null,
        status: 'pending', // Will be updated to 'extracting' when triggered
      })
      .select('id')
      .single();

    if (analysisError || !newAnalysis) {
      console.error('[free-run-analysis] Failed to create analysis:', analysisError);
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Failed to create analysis' });
    }

    const analysisId = newAnalysis.id;
    console.log('[free-run-analysis] Created analysis:', analysisId);

    // Create report
    const { data: newReport, error: reportError } = await supabaseService
      .from('reports')
      .insert({
        analysis_id: analysisId,
        business_id: businessId,
        stripe_checkout_session_id: null,
        status: 'PAID',
        coverage_level: coverageLevel,
        run_type: 'SNAPSHOT',
        latest_artifact_version: 1,
      })
      .select('id')
      .single();

    if (reportError || !newReport) {
      console.error('[free-run-analysis] Failed to create report:', reportError);
      // Non-critical - continue without report
    }

    const reportId = newReport?.id;
    console.log('[free-run-analysis] Created report:', reportId);

    // Trigger analysis using the same logic as trigger-analysis
    // Update status to extracting
    await supabaseService
      .from('analyses')
      .update({ status: 'extracting' })
      .eq('id', analysisId);

    // Generate traceId
    const traceId = `trace-${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;

    // Call run-analysis edge function
    const edgeFunctionUrl = `${supabaseUrl}/functions/v1/run-analysis`;
    const requestBody = {
      analysisId,
      businessUrl: normalizedUrl,
      businessName: businessName,
      traceId,
    };
    const requestHeaders = {
      'Content-Type': 'application/json',
      'Authorization': authHeader,
      'apikey': supabaseAnonKey,
    };

    // Fire and forget - don't await
    fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(requestBody),
    }).catch((err) => {
      console.error('[free-run-analysis] Failed to trigger analysis (non-critical):', err);
    });

    console.log('[free-run-analysis] Analysis triggered successfully');

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      success: true,
      analysisId,
      reportId: reportId || undefined,
      status: 'extracting',
    });
  } catch (error) {
    console.error('[free-run-analysis] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}

