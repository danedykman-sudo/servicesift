# Deployment Checklist

This document outlines the exact steps and environment variables needed to deploy ServiceSift.com.

## Prerequisites

- Supabase project created
- Vercel account connected to your repository
- Stripe account with API keys
- Apify account (for review extraction)
- Anthropic API key (for Claude AI analysis)

## 1. Vercel Environment Variables

Set these in your Vercel project settings (Settings → Environment Variables). **All client-side variables must be prefixed with `VITE_`**:

### Client-Side Variables (VITE_ prefix required)
- `VITE_SUPABASE_URL`
  - Value: `https://[your-project-ref].supabase.co`
  - Example: `https://abcdefghijklmnop.supabase.co`
  - **No prefix needed in the value** - use the full Supabase project URL

- `VITE_SUPABASE_ANON_KEY`
  - Value: Your Supabase anonymous/public key
  - Found in: Supabase Dashboard → Settings → API → anon/public key
  - **No prefix needed in the value** - use the key as-is

### Server-Side Variables (Optional - only if using Vercel serverless functions)
Note: Edge functions run on Supabase, not Vercel, so these are typically not needed in Vercel.

## 2. Supabase Secrets (Edge Functions)

These secrets are used by Supabase Edge Functions. Set them using the Supabase CLI:

```bash
# Install Supabase CLI if not already installed
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref [your-project-ref]

# Set secrets (run each command separately)
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
supabase secrets set STRIPE_SECRET_KEY=sk_live_...or_sk_test_...
supabase secrets set APIFY_TOKEN=your-apify-token-here
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...
```

### Required Supabase Secrets:

1. **SUPABASE_SERVICE_ROLE_KEY**
   - Found in: Supabase Dashboard → Settings → API → service_role key
   - ⚠️ **NEVER expose this on the client side** - it bypasses Row Level Security
   - Used by edge functions for server-side operations

2. **STRIPE_SECRET_KEY**
   - Get from: Stripe Dashboard → Developers → API keys
   - Use `sk_test_...` for development, `sk_live_...` for production
   - Used by `create-checkout` edge function

3. **APIFY_TOKEN**
   - Get from: Apify Dashboard → Settings → Integrations → API tokens
   - Used by `extract-reviews` edge function

4. **ANTHROPIC_API_KEY**
   - Get from: Anthropic Console → API Keys
   - Format: `sk-ant-...`
   - Used by `analyze-reviews` edge function

### Optional: SUPABASE_URL
- Supabase automatically injects `SUPABASE_URL` into edge functions
- If you need to override it, use: `supabase secrets set SUPABASE_URL=https://[your-project-ref].supabase.co`
- Usually not needed unless using a custom domain

## 3. Deploy Commands

### Deploy Supabase Edge Functions

```bash
# Deploy all functions
supabase functions deploy

# Deploy specific function
supabase functions deploy create-checkout
supabase functions deploy extract-reviews
supabase functions deploy analyze-reviews

# Deploy with no JWT verification (development only - NOT recommended for production)
supabase functions deploy create-checkout --no-verify-jwt
```

**Note:** The `--no-verify-jwt` flag disables JWT verification. Only use this for local development or debugging. **Never use in production.**

### Deploy to Vercel

```bash
# Install Vercel CLI if not already installed
npm install -g vercel

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

Or use the Vercel dashboard to deploy from your Git repository.

## 4. Post-Deployment Verification

After deployment, verify:

1. **Vercel Deployment:**
   - Visit your Vercel deployment URL
   - Check browser console for any environment variable errors
   - Verify authentication flow works

2. **Supabase Edge Functions:**
   - Test `create-checkout` function:
     ```bash
     curl -X POST https://[your-project-ref].supabase.co/functions/v1/create-checkout \
       -H "Authorization: Bearer [user-jwt-token]" \
       -H "apikey: [anon-key]" \
       -H "Content-Type: application/json" \
       -d '{"amount": 4900, "businessName": "Test", "isReanalysis": false, "url": "https://..."}'
     ```

3. **CORS Configuration:**
   - Verify edge functions accept requests from:
     - `https://service-sift.com`
     - `https://www.service-sift.com`
     - `http://localhost:5173` (development)
     - `http://localhost:3000` (development)

## 5. Environment-Specific Notes

### Development
- Use Stripe test keys (`sk_test_...`)
- Use Supabase project URL (not custom domain)
- Edge functions can use `--no-verify-jwt` for easier debugging (local only)

### Production
- Use Stripe live keys (`sk_live_...`)
- Ensure all CORS origins are correct
- **Never use `--no-verify-jwt` in production**
- Verify all secrets are set correctly
- Test payment flow end-to-end

## Troubleshooting

### "Required environment variables are missing"
- Check that all Supabase secrets are set: `supabase secrets list`
- Verify secrets are set for the correct project

### CORS errors
- Verify the origin is in the allowed list in edge functions
- Check that CORS headers are being returned (especially for OPTIONS requests)

### Authentication errors
- Verify `VITE_SUPABASE_ANON_KEY` is set in Vercel
- Check that Authorization header is being sent from client
- Ensure `apikey` header is included in requests

### Edge function not found
- Verify function is deployed: `supabase functions list`
- Check the function URL matches your Supabase project URL











