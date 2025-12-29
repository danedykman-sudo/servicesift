# Stripe Webhook Setup Checklist

This guide walks you through setting up the Stripe webhook endpoint on Vercel to securely mark analyses as paid.

## Prerequisites
- ✅ Stripe account (Live mode)
- ✅ Vercel deployment with `/api/stripe-webhook.ts` deployed
- ✅ Database migration applied (`20251226000000_add_stripe_payment_columns.sql`)

## Step 1: Deploy to Vercel
1. Ensure your code is pushed to your repository
2. Deploy to Vercel (or let Vercel auto-deploy)
3. Verify the webhook endpoint is accessible at: `https://service-sift.com/api/stripe-webhook`

## Step 2: Create Webhook in Stripe Dashboard (LIVE MODE)

1. **Go to Stripe Dashboard**
   - Navigate to: https://dashboard.stripe.com/
   - **IMPORTANT**: Make sure you're in **LIVE mode** (toggle in top right)

2. **Navigate to Webhooks**
   - Click **Developers** → **Webhooks** in the left sidebar
   - Click **Add endpoint** button

3. **Configure Endpoint**
   - **Endpoint URL**: `https://service-sift.com/api/stripe-webhook`
   - **Description**: "ServiceSift Payment Webhook - Mark analyses as paid"
   - **Events to send**: Select these specific events:
     - `checkout.session.completed` (Primary - fires on successful payment)
     - `checkout.session.async_payment_succeeded` (Optional - for bank transfers)
     - `checkout.session.async_payment_failed` (Optional - for failed async payments)

4. **Create Endpoint**
   - Click **Add endpoint**
   - **Copy the Signing secret** (starts with `whsec_...`)
   - ⚠️ **SAVE THIS SECRET** - you'll need it for Step 3

## Step 3: Add Webhook Secret to Vercel

1. **Go to Vercel Dashboard**
   - Navigate to: https://vercel.com/dashboard
   - Select your **ServiceSift** project

2. **Add Environment Variable**
   - Go to **Settings** → **Environment Variables**
   - Click **Add New**
   - **Key**: `STRIPE_WEBHOOK_SECRET`
   - **Value**: Paste the signing secret from Step 2 (starts with `whsec_...`)
   - **Environment**: Select **Production** (and **Preview** if you want to test)
   - Click **Save**

3. **Verify Service Role Key**
   - Check that `SUPABASE_SERVICE_ROLE_KEY` is set in Vercel environment variables
   - If missing, add it:
     - **Key**: `SUPABASE_SERVICE_ROLE_KEY`
     - **Value**: Your Supabase service role key (from Supabase Dashboard → Settings → API)
     - **Environment**: Production (and Preview if needed)

4. **Redeploy**
   - After adding environment variables, trigger a new deployment
   - Go to **Deployments** tab → Click **Redeploy** on the latest deployment
   - Or push a new commit to trigger auto-deploy

## Step 4: Test the Webhook

1. **Test Payment Flow**
   - Go to your app: https://service-sift.com
   - Create a new analysis and complete checkout
   - Complete a test payment

2. **Verify Webhook Delivery**
   - Go to Stripe Dashboard → **Developers** → **Webhooks**
   - Click on your webhook endpoint
   - Check **Recent deliveries** tab
   - You should see a `checkout.session.completed` event with status **200**

3. **Verify Database Update**
   - Go to Supabase Dashboard → **Table Editor** → `analyses` table
   - Find the analysis you just paid for
   - Verify these fields are updated:
     - `payment_status` = `'paid'`
     - `paid_at` = current timestamp
     - `stripe_checkout_session_id` = session ID from Stripe
     - `stripe_payment_intent_id` = payment intent ID (if available)

## Step 5: Monitor Webhook Health

1. **Set up Monitoring**
   - In Stripe Dashboard → Webhooks → Your endpoint
   - Enable **Email notifications** for failed deliveries
   - Set up alerts for webhook failures

2. **Check Logs**
   - Vercel Dashboard → Your project → **Functions** tab
   - Click on `api/stripe-webhook.ts`
   - View logs for webhook invocations
   - Look for any errors or warnings

## Troubleshooting

### Webhook returns 400 "Signature verification failed"
- **Cause**: Webhook secret mismatch or raw body parsing issue
- **Fix**: 
  - Verify `STRIPE_WEBHOOK_SECRET` in Vercel matches the signing secret in Stripe
  - Check that `vercel.json` is configured correctly
  - Ensure webhook endpoint URL is correct

### Webhook returns 500 "Server configuration error"
- **Cause**: Missing environment variables
- **Fix**: Verify all required env vars are set in Vercel:
  - `STRIPE_SECRET_KEY`
  - `STRIPE_WEBHOOK_SECRET`
  - `SUPABASE_SERVICE_ROLE_KEY`
  - `VITE_SUPABASE_URL` or `SUPABASE_URL`

### Payment completed but analysis not marked as paid
- **Cause**: Webhook not firing or database update failing
- **Fix**:
  - Check Stripe Dashboard → Webhooks → Recent deliveries for errors
  - Check Vercel function logs for errors
  - Verify `analysisId` is in checkout session metadata
  - Check Supabase logs for RLS policy issues

### "No analysisId found in session metadata"
- **Cause**: `analysisId` not passed to `/api/create-checkout`
- **Fix**: Ensure frontend passes `analysisId` in request body when creating checkout session

## Security Notes

- ✅ Webhook uses Stripe signature verification - only legitimate Stripe events are processed
- ✅ Webhook uses Supabase Service Role key - bypasses RLS for server-side updates
- ✅ Payment status fields can ONLY be updated by webhook - clients cannot modify them
- ✅ All webhook events are logged for audit trail

## Next Steps

After webhook is working:
1. Update frontend to create analysis BEFORE checkout (with `payment_status='pending'`)
2. Pass `analysisId` to `/api/create-checkout`
3. Webhook will automatically mark as paid when payment completes
4. Frontend can poll or refresh to show updated payment status








