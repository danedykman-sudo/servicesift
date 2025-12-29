import { createClient } from '@supabase/supabase-js';

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://service-sift.com',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  // Only allow GET
  if (req.method !== 'GET') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get auth token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(401).json({ error: 'No authorization header' });
    }

    // Extract token
    const token = authHeader.replace('Bearer ', '');

    // Initialize Supabase client
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    // Verify user with the token
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(401).json({ error: 'Authentication failed' });
    }

    // Get analysisId from query params
    const analysisId = req.query.analysisId;

    if (!analysisId) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'analysisId is required' });
    }

    // Initialize Supabase with service role to fetch report
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseServiceRoleKey) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Supabase service role key missing' });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get report by analysis_id (latest report for this analysis)
    const { data: report, error: reportError } = await supabaseService
      .from('reports')
      .select(`
        id,
        analysis_id,
        analyses!inner (
          id,
          user_id
        )
      `)
      .eq('analysis_id', analysisId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (reportError) {
      console.error('[report-by-analysis] Error fetching report:', reportError);
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Failed to fetch report' });
    }

    if (!report) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(404).json({ error: 'Report not found for this analysis' });
    }

    // Verify user owns this report (via analysis.user_id)
    if (report.analyses.user_id !== user.id) {
      console.error('[report-by-analysis] Unauthorized access attempt:', {
        analysisId,
        reportId: report.id,
        userId: user.id,
        reportUserId: report.analyses.user_id,
      });
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      reportId: report.id,
      analysisId: report.analysis_id,
    });
  } catch (error) {
    console.error('[report-by-analysis] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(500).json({ error: errorMessage });
  }
}

