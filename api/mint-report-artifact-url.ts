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
    // Get reportId and kind from query params
    const reportId = req.query.reportId;
    const kind = req.query.kind || 'json';

    if (!reportId) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'reportId is required' });
    }

    // Validate kind
    if (!['json', 'pdf', 'zip'].includes(kind)) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'Invalid kind. Must be json, pdf, or zip' });
    }

    // Initialize Supabase with service role
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Supabase configuration missing' });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get report to find latest_artifact_version
    const { data: report, error: reportError } = await supabaseService
      .from('reports')
      .select('latest_artifact_version')
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(404).json({ error: 'Report not found' });
    }

    const version = report.latest_artifact_version || 1;

    // Find the artifact matching report_id + kind + version
    const { data: artifact, error: artifactError } = await supabaseService
      .from('report_artifacts')
      .select('storage_path')
      .eq('report_id', reportId)
      .eq('kind', kind)
      .eq('version', version)
      .single();

    if (artifactError || !artifact) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(404).json({ error: 'Artifact not found' });
    }

    // Create signed URL (5-10 minutes expiry, using 7 minutes as middle ground)
    const expiresIn = 7 * 60; // 7 minutes in seconds
    const { data: signedUrlData, error: urlError } = await supabaseService.storage
      .from('report-artifacts')
      .createSignedUrl(artifact.storage_path, expiresIn);

    if (urlError || !signedUrlData) {
      console.error('[mint-report-artifact-url] Failed to create signed URL:', urlError);
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Failed to generate signed URL' });
    }

    // Return signed URL
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      url: signedUrlData.signedUrl,
    });
  } catch (error) {
    console.error('[mint-report-artifact-url] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(500).json({ error: errorMessage });
  }
}

