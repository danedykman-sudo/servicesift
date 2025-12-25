/*
  # Fix RLS policies for reviews table

  1. Changes
    - Drop existing restrictive SELECT policy
    - Add new INSERT policy for users to save reviews for their own analyses
    - Add new SELECT policy for users to read reviews from their own analyses

  2. Security
    - Users can only insert reviews for analyses they own
    - Users can only read reviews from analyses they own
*/

DROP POLICY IF EXISTS "Users can read own reviews" ON reviews;

CREATE POLICY "Users can insert reviews for their analyses"
  ON reviews
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_id
      AND analyses.user_id = auth.uid()
    )
  );

CREATE POLICY "Users can read their own reviews"
  ON reviews
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM analyses
      WHERE analyses.id = analysis_id
      AND analyses.user_id = auth.uid()
    )
  );
