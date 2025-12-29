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
    // Get reportId from query params
    const reportId = req.query.reportId;

    if (!reportId) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'reportId is required' });
    }

    // Initialize Supabase with service role
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get report from database
    const { data: report, error: reportError } = await supabaseService
      .from('reports')
      .select('status, error_stage, error_message, analysis_id, latest_artifact_version')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(404).json({ error: 'Report not found' });
    }

    // Derive status from analysis if report is PAID/QUEUED and analysis exists
    let derivedStatus: string | undefined;
    if (report.analysis_id && (report.status === 'PAID' || report.status === 'QUEUED')) {
      const { data: analysis, error: analysisError } = await supabaseService
        .from('analyses')
        .select('status')
        .eq('id', report.analysis_id)
        .single();

      if (!analysisError && analysis) {
        // Map analysis status to report status
        const statusMap: Record<string, string> = {
          'extracting': 'SCRAPING',
          'analyzing': 'ANALYZING',
          'saving': 'STORING',
          'completed': 'READY',
          'failed': 'FAILED',
        };
        derivedStatus = statusMap[analysis.status] || report.status;
      }
    }

    // Return report status with derived status if available
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      status: report.status,
      derivedStatus: derivedStatus, // Use this for UI when report.status is PAID/QUEUED
      error_stage: report.error_stage,
      error_message: report.error_message,
      analysis_id: report.analysis_id,
      latest_artifact_version: report.latest_artifact_version || 1,
    });
  } catch (error) {
    console.error('[report-status] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(500).json({ error: errorMessage });
  }
}

