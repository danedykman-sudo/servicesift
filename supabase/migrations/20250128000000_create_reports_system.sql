/*
  # Create Reports System Tables
  
  Phase 1 Step 1: Reports backbone for tracking paid analysis runs.
  This migration creates the reports infrastructure without breaking existing flows.
  
  Tables:
  - reports: Main report tracking table
  - report_artifacts: Stores generated artifacts (JSON, PDF, ZIP)
  - report_events: Optional audit trail for report lifecycle
*/

-- Create reports table
CREATE TABLE IF NOT EXISTS reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  business_id uuid REFERENCES businesses(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES analyses(id) ON DELETE SET NULL,
  stripe_checkout_session_id text,
  coverage_level integer DEFAULT 200,
  run_type text DEFAULT 'SNAPSHOT',
  status text NOT NULL DEFAULT 'CREATED' CHECK (status IN ('CREATED', 'PAID', 'QUEUED', 'SCRAPING', 'ANALYZING', 'RENDERING', 'STORING', 'READY', 'FAILED')),
  error_stage text,
  error_code text,
  error_message text,
  latest_artifact_version integer DEFAULT 1
);

-- Create report_artifacts table
CREATE TABLE IF NOT EXISTS report_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('json', 'pdf', 'zip')),
  storage_path text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  created_at timestamptz DEFAULT now()
);

-- Create report_events table (optional audit trail)
CREATE TABLE IF NOT EXISTS report_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  stage text NOT NULL,
  message text,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_reports_analysis_id ON reports(analysis_id);
CREATE INDEX IF NOT EXISTS idx_reports_business_id ON reports(business_id);
CREATE INDEX IF NOT EXISTS idx_reports_stripe_session ON reports(stripe_checkout_session_id);

CREATE INDEX IF NOT EXISTS idx_report_artifacts_report_id ON report_artifacts(report_id);
CREATE INDEX IF NOT EXISTS idx_report_artifacts_kind_version ON report_artifacts(report_id, kind, version);

CREATE INDEX IF NOT EXISTS idx_report_events_report_id ON report_events(report_id);
CREATE INDEX IF NOT EXISTS idx_report_events_created_at ON report_events(created_at DESC);

-- Enable Row Level Security
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_artifacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for reports
CREATE POLICY "Users can view own reports"
  ON reports FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = reports.analysis_id
      AND analyses.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM businesses
      WHERE businesses.id = reports.business_id
      AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert own reports"
  ON reports FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = reports.analysis_id
      AND analyses.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM businesses
      WHERE businesses.id = reports.business_id
      AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update own reports"
  ON reports FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = reports.analysis_id
      AND analyses.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM businesses
      WHERE businesses.id = reports.business_id
      AND businesses.user_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = reports.analysis_id
      AND analyses.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM businesses
      WHERE businesses.id = reports.business_id
      AND businesses.user_id = auth.uid()
    )
  );

-- Service role can do everything (for edge functions)
CREATE POLICY "Service role full access to reports"
  ON reports FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for report_artifacts
CREATE POLICY "Users can view own report artifacts"
  ON report_artifacts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reports
      JOIN analyses ON analyses.id = reports.analysis_id
      WHERE reports.id = report_artifacts.report_id
      AND analyses.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM reports
      JOIN businesses ON businesses.id = reports.business_id
      WHERE reports.id = report_artifacts.report_id
      AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to report_artifacts"
  ON report_artifacts FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- RLS Policies for report_events
CREATE POLICY "Users can view own report events"
  ON report_events FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM reports
      JOIN analyses ON analyses.id = reports.analysis_id
      WHERE reports.id = report_events.report_id
      AND analyses.user_id = auth.uid()
    )
    OR
    EXISTS (
      SELECT 1 FROM reports
      JOIN businesses ON businesses.id = reports.business_id
      WHERE reports.id = report_events.report_id
      AND businesses.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role full access to report_events"
  ON report_events FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_reports_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for updated_at
CREATE TRIGGER update_reports_updated_at
  BEFORE UPDATE ON reports
  FOR EACH ROW
  EXECUTE FUNCTION update_reports_updated_at();

