import { createClient } from '@supabase/supabase-js';

const FEATURES = {
  ENABLE_EMAIL_SHARING: false,
} as const;

const corsHeaders = {
  'Access-Control-Allow-Origin': 'https://service-sift.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
};

export default async function handler(req: any, res: any) {
  if (!FEATURES.ENABLE_EMAIL_SHARING) {
    return res.status(404).json({ error: 'Email sharing disabled in MVP' });
  }
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    res.setHeader('Access-Control-Allow-Methods', corsHeaders['Access-Control-Allow-Methods']);
    res.setHeader('Access-Control-Allow-Headers', corsHeaders['Access-Control-Allow-Headers']);
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== 'POST') {
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

    // Get reportId from request body
    const { reportId } = req.body;

    if (!reportId) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'reportId is required' });
    }

    // Initialize Supabase with service role to fetch report data
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseServiceRoleKey) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Supabase service role key missing' });
    }

    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get report and verify user owns it
    const { data: report, error: reportError } = await supabaseService
      .from('reports')
      .select(`
        id,
        status,
        analysis_id,
        analyses!inner (
          id,
          user_id,
          business_name
        )
      `)
      .eq('id', reportId)
      .single();

    if (reportError || !report) {
      console.error('[send-report-email] Report not found:', reportError);
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(404).json({ error: 'Report not found' });
    }

    // Verify user owns this report (via analysis.user_id)
    if (report.analyses.user_id !== user.id) {
      console.error('[send-report-email] Unauthorized access attempt:', {
        reportId,
        userId: user.id,
        reportUserId: report.analyses.user_id,
      });
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(403).json({ error: 'Unauthorized' });
    }

    // Get user email (use auth user email)
    const userEmail = user.email;
    if (!userEmail) {
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(400).json({ error: 'User email not found' });
    }

    // Get Resend API key and from email
    const resendApiKey = process.env.RESEND_API_KEY;
    const fromEmail = process.env.FROM_EMAIL || 'noreply@service-sift.com';

    if (!resendApiKey) {
      console.error('[send-report-email] RESEND_API_KEY not configured');
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Email service not configured' });
    }

    // Build report URL
    const domain = process.env.VERCEL_URL 
      ? `https://${process.env.VERCEL_URL}` 
      : 'https://service-sift.com';
    const reportUrl = `${domain}/report-status/${reportId}`;

    // Send email via Resend API
    const emailResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [userEmail],
        subject: `Your ServiceSift Report is Ready`,
        html: `
          <!DOCTYPE html>
          <html>
            <head>
              <meta charset="utf-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
            </head>
            <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; border-radius: 8px 8px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 28px;">Your Report is Ready!</h1>
              </div>
              <div style="background: #f9fafb; padding: 30px; border-radius: 0 0 8px 8px;">
                <p style="font-size: 16px; margin-bottom: 20px;">
                  Hi there,
                </p>
                <p style="font-size: 16px; margin-bottom: 20px;">
                  Your ServiceSift analysis report for <strong>${report.analyses.business_name || 'Your Business'}</strong> is ready to view.
                </p>
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${reportUrl}" style="display: inline-block; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; text-decoration: none; padding: 14px 28px; border-radius: 6px; font-weight: bold; font-size: 16px;">
                    View Your Report
                  </a>
                </div>
                <p style="font-size: 14px; color: #6b7280; margin-top: 30px;">
                  Or copy and paste this link into your browser:<br>
                  <a href="${reportUrl}" style="color: #667eea; word-break: break-all;">${reportUrl}</a>
                </p>
                <p style="font-size: 14px; color: #6b7280; margin-top: 20px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                  This link will remain active. You can bookmark it for future reference.
                </p>
              </div>
            </body>
          </html>
        `,
        text: `
Your ServiceSift Report is Ready

Hi there,

Your ServiceSift analysis report for ${report.analyses.business_name || 'Your Business'} is ready to view.

View your report: ${reportUrl}

This link will remain active. You can bookmark it for future reference.
        `.trim(),
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error('[send-report-email] Resend API error:', {
        status: emailResponse.status,
        statusText: emailResponse.statusText,
        error: errorText,
      });
      res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    const emailData = await emailResponse.json();
    console.log('[send-report-email] Email sent successfully:', {
      reportId,
      userEmail,
      emailId: emailData.id,
    });

    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(200).json({
      success: true,
      message: 'Email sent successfully',
    });
  } catch (error) {
    console.error('[send-report-email] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.setHeader('Access-Control-Allow-Origin', corsHeaders['Access-Control-Allow-Origin']);
    return res.status(500).json({ error: errorMessage });
  }
}

