/*
  # Add Stripe Payment Tracking Columns to Analyses Table

  This migration adds columns needed for Stripe webhook payment tracking:
  - payment_status: Track payment state ('pending', 'paid', 'failed')
  - paid_at: Timestamp when payment was completed
  - stripe_checkout_session_id: Stripe checkout session ID
  - stripe_payment_intent_id: Stripe payment intent ID (if available)

  These columns are only updated by the webhook handler (server-side) for security.
*/

-- Add payment_status column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'payment_status'
  ) THEN
    ALTER TABLE analyses ADD COLUMN payment_status text DEFAULT 'pending';
  END IF;
END $$;

-- Add paid_at column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'paid_at'
  ) THEN
    ALTER TABLE analyses ADD COLUMN paid_at timestamptz;
  END IF;
END $$;

-- Add stripe_checkout_session_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'stripe_checkout_session_id'
  ) THEN
    ALTER TABLE analyses ADD COLUMN stripe_checkout_session_id text;
  END IF;
END $$;

-- Add stripe_payment_intent_id column
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'analyses' AND column_name = 'stripe_payment_intent_id'
  ) THEN
    ALTER TABLE analyses ADD COLUMN stripe_payment_intent_id text;
  END IF;
END $$;

-- Create index on payment_status for querying
CREATE INDEX IF NOT EXISTS idx_analyses_payment_status ON analyses(payment_status);

-- Create index on stripe_checkout_session_id for webhook lookups
CREATE INDEX IF NOT EXISTS idx_analyses_stripe_checkout_session_id ON analyses(stripe_checkout_session_id);








