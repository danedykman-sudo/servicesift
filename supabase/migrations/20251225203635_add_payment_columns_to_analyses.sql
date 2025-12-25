/*
  # Add Payment Columns to Analyses Table

  1. Changes
    - Add `payment_id` column (text) to store Stripe payment/checkout session ID
    - Add `amount_paid` column (integer) to store payment amount in cents
  
  2. Notes
    - Uses IF NOT EXISTS to safely add columns
    - Allows NULL values as existing records won't have payment info
    - Future analyses will require payment info
*/

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'payment_id'
  ) THEN
    ALTER TABLE analyses ADD COLUMN payment_id text;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'amount_paid'
  ) THEN
    ALTER TABLE analyses ADD COLUMN amount_paid integer;
  END IF;
END $$;