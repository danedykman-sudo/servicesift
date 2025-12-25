/*
  # Add User Authentication to Analyses System

  ## Overview
  This migration adds user authentication to the existing analyses system by:
  - Creating a businesses table to track user's businesses
  - Adding user_id to analyses table
  - Adding fields to track analysis metadata (rating, baseline status)
  - Updating RLS policies to be user-specific instead of public

  ## Changes to Existing Tables
  
  ### `analyses` table modifications
  - Add `user_id` (uuid, foreign key to auth.users) - Owner of the analysis
  - Add `business_id` (uuid, foreign key to businesses) - Link to business record
  - Add `is_baseline` (boolean) - Whether this is the first analysis
  - Add `average_rating` (decimal) - Average star rating from reviews
  
  ## New Tables
  
  ### `businesses`
  - `id` (uuid, primary key) - Unique identifier
  - `user_id` (uuid, foreign key to auth.users) - Owner of the business
  - `business_name` (text) - Name of the business  
  - `google_maps_url` (text) - Original URL (unique per user)
  - `created_at` (timestamptz) - When first added

  ## Security Updates
  
  ### RLS Policy Changes
  - Remove public access policies
  - Add user-specific policies (users can only see their own data)
  - Cascade to all related tables (root_causes, coaching_scripts, etc.)
*/

-- Create businesses table
CREATE TABLE IF NOT EXISTS businesses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name text NOT NULL,
  google_maps_url text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add unique constraint for user + URL combination
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'businesses_user_id_url_unique'
  ) THEN
    ALTER TABLE businesses 
    ADD CONSTRAINT businesses_user_id_url_unique 
    UNIQUE(user_id, google_maps_url);
  END IF;
END $$;

-- Add columns to analyses table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE analyses ADD COLUMN user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'business_id'
  ) THEN
    ALTER TABLE analyses ADD COLUMN business_id uuid REFERENCES businesses(id) ON DELETE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'is_baseline'
  ) THEN
    ALTER TABLE analyses ADD COLUMN is_baseline boolean DEFAULT true;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'analyses' AND column_name = 'average_rating'
  ) THEN
    ALTER TABLE analyses ADD COLUMN average_rating decimal(3,2);
  END IF;
END $$;

-- Enable RLS on businesses table
ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;

-- Drop old public access policies on analyses
DROP POLICY IF EXISTS "Allow public read access to analyses" ON analyses;
DROP POLICY IF EXISTS "Allow public insert to analyses" ON analyses;

-- Drop old public access policies on related tables  
DROP POLICY IF EXISTS "Allow public read access to root_causes" ON root_causes;
DROP POLICY IF EXISTS "Allow public read access to coaching_scripts" ON coaching_scripts;
DROP POLICY IF EXISTS "Allow public read access to process_changes" ON process_changes;
DROP POLICY IF EXISTS "Allow public read access to backlog_tasks" ON backlog_tasks;

-- Create user-specific RLS policies for businesses
DROP POLICY IF EXISTS "Users can view own businesses" ON businesses;
CREATE POLICY "Users can view own businesses"
  ON businesses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own businesses" ON businesses;
CREATE POLICY "Users can insert own businesses"
  ON businesses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own businesses" ON businesses;
CREATE POLICY "Users can update own businesses"
  ON businesses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own businesses" ON businesses;
CREATE POLICY "Users can delete own businesses"
  ON businesses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create user-specific RLS policies for analyses
DROP POLICY IF EXISTS "Users can view own analyses" ON analyses;
CREATE POLICY "Users can view own analyses"
  ON analyses FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert own analyses" ON analyses;
CREATE POLICY "Users can insert own analyses"
  ON analyses FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update own analyses" ON analyses;
CREATE POLICY "Users can update own analyses"
  ON analyses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can delete own analyses" ON analyses;
CREATE POLICY "Users can delete own analyses"
  ON analyses FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Create user-specific RLS policies for related tables (via analyses.user_id)
DROP POLICY IF EXISTS "Users can view own root causes" ON root_causes;
CREATE POLICY "Users can view own root causes"
  ON root_causes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = root_causes.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own root causes" ON root_causes;
CREATE POLICY "Users can insert own root causes"
  ON root_causes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = root_causes.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own coaching scripts" ON coaching_scripts;
CREATE POLICY "Users can view own coaching scripts"
  ON coaching_scripts FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = coaching_scripts.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own coaching scripts" ON coaching_scripts;
CREATE POLICY "Users can insert own coaching scripts"
  ON coaching_scripts FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = coaching_scripts.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own process changes" ON process_changes;
CREATE POLICY "Users can view own process changes"
  ON process_changes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = process_changes.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own process changes" ON process_changes;
CREATE POLICY "Users can insert own process changes"
  ON process_changes FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = process_changes.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can view own backlog tasks" ON backlog_tasks;
CREATE POLICY "Users can view own backlog tasks"
  ON backlog_tasks FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = backlog_tasks.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Users can insert own backlog tasks" ON backlog_tasks;
CREATE POLICY "Users can insert own backlog tasks"
  ON backlog_tasks FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses 
      WHERE analyses.id = backlog_tasks.analysis_id 
      AND analyses.user_id = auth.uid()
    )
  );

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_businesses_user_id ON businesses(user_id);
CREATE INDEX IF NOT EXISTS idx_businesses_url ON businesses(google_maps_url);
CREATE INDEX IF NOT EXISTS idx_analyses_user_id ON analyses(user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_business_id ON analyses(business_id);
