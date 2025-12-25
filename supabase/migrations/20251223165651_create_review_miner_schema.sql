/*
  # Review Miner Database Schema

  1. New Tables
    - `analyses`
      - `id` (uuid, primary key) - Unique identifier for each analysis
      - `business_url` (text) - The Google Maps or Yelp URL analyzed
      - `business_name` (text) - Extracted business name
      - `review_count` (integer) - Number of reviews analyzed
      - `status` (text) - Status: 'pending', 'completed', 'failed'
      - `created_at` (timestamptz) - When the analysis was requested
      - `completed_at` (timestamptz) - When the analysis finished
    
    - `root_causes`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key) - Links to analyses table
      - `rank` (integer) - Priority rank (1-5)
      - `title` (text) - Root cause title
      - `severity` (text) - 'High', 'Medium', or 'Low'
      - `frequency` (integer) - Percentage of reviews mentioning this
      - `bullets` (jsonb) - Array of bullet point explanations
      - `quotes` (jsonb) - Array of customer quote examples
      - `created_at` (timestamptz)
    
    - `coaching_scripts`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key) - Links to analyses table
      - `role` (text) - Staff role (e.g., 'Front Desk', 'Trainers')
      - `focus` (text) - What to train on
      - `script` (text) - The actual coaching script
      - `created_at` (timestamptz)
    
    - `process_changes`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key) - Links to analyses table
      - `change` (text) - The change to make
      - `why` (text) - Why it matters
      - `steps` (jsonb) - Array of implementation steps
      - `time_estimate` (text) - Estimated time to implement
      - `created_at` (timestamptz)
    
    - `backlog_tasks`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key) - Links to analyses table
      - `week` (integer) - Week number (1-4)
      - `task` (text) - Task description
      - `effort` (text) - 'Low', 'Medium', or 'High'
      - `impact` (text) - 'Low', 'Medium', or 'High'
      - `owner` (text) - Role responsible for the task
      - `created_at` (timestamptz)
  
  2. Security
    - Enable RLS on all tables
    - For now, allow public read access (we'll add auth later)
    - Restrict write operations to service role only
*/

-- Create analyses table
CREATE TABLE IF NOT EXISTS analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_url text NOT NULL,
  business_name text,
  review_count integer DEFAULT 0,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  completed_at timestamptz
);

-- Create root_causes table
CREATE TABLE IF NOT EXISTS root_causes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  rank integer NOT NULL,
  title text NOT NULL,
  severity text NOT NULL,
  frequency integer NOT NULL,
  bullets jsonb NOT NULL DEFAULT '[]'::jsonb,
  quotes jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create coaching_scripts table
CREATE TABLE IF NOT EXISTS coaching_scripts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  role text NOT NULL,
  focus text NOT NULL,
  script text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create process_changes table
CREATE TABLE IF NOT EXISTS process_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  change text NOT NULL,
  why text NOT NULL,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  time_estimate text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create backlog_tasks table
CREATE TABLE IF NOT EXISTS backlog_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  week integer NOT NULL,
  task text NOT NULL,
  effort text NOT NULL,
  impact text NOT NULL,
  owner text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE root_causes ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_scripts ENABLE ROW LEVEL SECURITY;
ALTER TABLE process_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE backlog_tasks ENABLE ROW LEVEL SECURITY;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_root_causes_analysis_id ON root_causes(analysis_id);
CREATE INDEX IF NOT EXISTS idx_coaching_scripts_analysis_id ON coaching_scripts(analysis_id);
CREATE INDEX IF NOT EXISTS idx_process_changes_analysis_id ON process_changes(analysis_id);
CREATE INDEX IF NOT EXISTS idx_backlog_tasks_analysis_id ON backlog_tasks(analysis_id);
CREATE INDEX IF NOT EXISTS idx_analyses_created_at ON analyses(created_at DESC);

-- RLS Policies: Allow public read access for now (we'll add auth later)
-- This allows anyone to view analysis results

CREATE POLICY "Allow public read access to analyses"
  ON analyses FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to root_causes"
  ON root_causes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to coaching_scripts"
  ON coaching_scripts FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to process_changes"
  ON process_changes FOR SELECT
  TO anon, authenticated
  USING (true);

CREATE POLICY "Allow public read access to backlog_tasks"
  ON backlog_tasks FOR SELECT
  TO anon, authenticated
  USING (true);

-- Allow public insert to analyses (for creating new analysis requests)
CREATE POLICY "Allow public insert to analyses"
  ON analyses FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

-- Service role can do everything (for backend processing)
-- Note: These policies allow the service role to insert analysis results