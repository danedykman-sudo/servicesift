/*
  # Add error_message Column to Analyses Table

  This migration adds an error_message column to store error details
  when analysis execution fails. This helps with debugging and user feedback.
*/

-- Add error_message column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'error_message'
  ) THEN
    ALTER TABLE analyses ADD COLUMN error_message text;
  END IF;
END $$;

-- Add comment to column
COMMENT ON COLUMN analyses.error_message IS 'Error message when analysis execution fails. Used for debugging and user feedback.';






