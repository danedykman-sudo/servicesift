/*
  # Create Analysis Deltas Table

  ## Overview
  This migration creates the analysis_deltas table to store comparison data between
  baseline analyses and follow-up analyses for the same business.

  ## New Tables
  
  ### `analysis_deltas`
  - `id` (uuid, primary key) - Unique identifier for each delta analysis
  - `analysis_id` (uuid, foreign key to analyses) - The new analysis being compared
  - `baseline_id` (uuid, foreign key to analyses) - The baseline analysis to compare against
  - `delta_data` (jsonb) - Complete comparison data including:
    - overallTrend: 'improving' | 'declining' | 'mixed'
    - biggestImprovement: string | null
    - biggestConcern: string | null
    - improved: Array of issues that got better
    - worsened: Array of issues that got worse
    - newIssues: Array of new problems
    - stable: Array of unchanged issues
  - `created_at` (timestamptz) - When the comparison was created

  ## Security
  
  ### RLS Policies
  - Users can only view their own delta analyses (via analyses.user_id)
  - Users can only insert delta analyses for their own analyses
  - Policies cascade through the analyses table for proper access control

  ## Important Notes
  - Each new analysis can only have one delta comparison
  - The baseline_id must point to an earlier analysis of the same business
  - Delta data is stored as JSON for flexibility in the comparison structure
*/

-- Create analysis_deltas table
CREATE TABLE IF NOT EXISTS analysis_deltas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  baseline_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  delta_data jsonb NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(analysis_id)
);

-- Enable Row Level Security
ALTER TABLE analysis_deltas ENABLE ROW LEVEL SECURITY;

-- Create user-specific RLS policies for analysis_deltas
-- Users can view deltas for their own analyses
DROP POLICY IF EXISTS "Users can view own analysis deltas" ON analysis_deltas;
CREATE POLICY "Users can view own analysis deltas"
  ON analysis_deltas FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = analysis_deltas.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

-- Users can insert deltas for their own analyses
DROP POLICY IF EXISTS "Users can insert own analysis deltas" ON analysis_deltas;
CREATE POLICY "Users can insert own analysis deltas"
  ON analysis_deltas FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = analysis_deltas.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_analysis_deltas_analysis_id ON analysis_deltas(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analysis_deltas_baseline_id ON analysis_deltas(baseline_id);
CREATE INDEX IF NOT EXISTS idx_analysis_deltas_created_at ON analysis_deltas(created_at DESC);
