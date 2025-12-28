/*
  # Prevent Clients from Updating Payment Fields

  This migration adds a policy to prevent authenticated users (clients) from
  updating payment-related fields. Only the webhook (using service role key) can update these.

  Payment fields that clients cannot update:
  - payment_status
  - paid_at
  - stripe_checkout_session_id
  - stripe_payment_intent_id

  Note: The webhook uses SUPABASE_SERVICE_ROLE_KEY which bypasses RLS entirely,
  so it can still update these fields. This policy is defense-in-depth.
*/

-- Drop the existing update policy that allows all field updates
DROP POLICY IF EXISTS "Users can update own analyses" ON analyses;

-- Create a new update policy that prevents payment field updates
-- Users can update their own analyses, but NOT payment fields
CREATE POLICY "Users can update own analyses (except payment fields)"
  ON analyses FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (
    auth.uid() = user_id
    -- Prevent updates to payment fields
    AND (
      -- If updating payment_status, it must remain unchanged
      (OLD.payment_status IS NOT DISTINCT FROM NEW.payment_status)
      -- If updating paid_at, it must remain unchanged
      AND (OLD.paid_at IS NOT DISTINCT FROM NEW.paid_at)
      -- If updating stripe_checkout_session_id, it must remain unchanged
      AND (OLD.stripe_checkout_session_id IS NOT DISTINCT FROM NEW.stripe_checkout_session_id)
      -- If updating stripe_payment_intent_id, it must remain unchanged
      AND (OLD.stripe_payment_intent_id IS NOT DISTINCT FROM NEW.stripe_payment_intent_id)
    )
  );




