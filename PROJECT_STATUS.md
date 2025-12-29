# ServiceSift - Project Status

## Tech Stack
- **Frontend**: Vite + React + TypeScript
- **Backend**: Supabase (auth, database, edge functions)
- **Payments**: Stripe Checkout (via Vercel API route)
- **Hosting**: Vercel
- **Domain**: service-sift.com
- **Styling**: Tailwind CSS
- **Icons**: Lucide React
- **Routing**: React Router v7

## What's Working
- ✅ User authentication (login/signup/password reset)
- ✅ Stripe checkout via `/api/create-checkout` (Vercel API route)
- ✅ Review extraction from Google Business URLs
- ✅ AI-powered review analysis (root causes, coaching scripts, process changes)
- ✅ Dashboard with business analysis history
- ✅ View individual analysis reports (`/report/:analysisId`)
- ✅ Delta reports comparing analyses over time (`/delta/:analysisId`)
- ✅ Payment flow integration
- ✅ Protected routes with authentication
- ✅ Database operations (businesses, analyses, reviews, deltas)

## Recent Major Changes
1. **Switched from Supabase Edge Functions to Vercel API routes for Stripe**
   - Moved `/supabase/functions/create-checkout` → `/api/create-checkout.ts`
   - Changed from Deno edge function to Node.js Vercel serverless function
   - Updated frontend to call `/api/create-checkout` instead of Supabase function URL

2. **Fixed authentication validation issues**
   - Changed from passing auth header in client options to passing token directly to `getUser(token)`
   - Fixed JWT validation in checkout handler

3. **Fixed amount calculation bug**
   - Removed double multiplication (was `amount * 100`, now just `amount`)
   - Frontend already sends amount in cents, so API route doesn't need to convert

## Current File Structure

### API Routes (Vercel)
- `/api/create-checkout.ts` - Stripe checkout session creation handler
  - Handles CORS for service-sift.com
  - Validates user auth via Supabase JWT
  - Creates Stripe checkout session
  - Returns checkout URL

### Frontend Core
- `/src/App.tsx` - Main app router and route definitions
- `/src/main.tsx` - App entry point
- `/src/index.css` - Global styles

### Pages
- `/src/pages/LandingPage.tsx` - Main landing page with review analysis flow
- `/src/pages/Dashboard.tsx` - User dashboard showing analysis history
- `/src/pages/Login.tsx` - User login
- `/src/pages/Signup.tsx` - User registration
- `/src/pages/ForgotPassword.tsx` - Password reset request
- `/src/pages/ResetPassword.tsx` - Password reset form
- `/src/pages/ViewReport.tsx` - Individual analysis report view
- `/src/pages/DeltaReport.tsx` - Comparison report between analyses
- `/src/pages/Maintenance.tsx` - Maintenance mode page

### Components
- `/src/components/Header.tsx` - App header/navigation
- `/src/components/BusinessCard.tsx` - Business card display component
- `/src/components/PaymentModal.tsx` - Payment modal for checkout
- `/src/components/ProtectedRoute.tsx` - Route protection wrapper

### Contexts
- `/src/contexts/AuthContext.tsx` - Authentication context provider

### Libraries
- `/src/lib/supabase.ts` - Supabase client initialization
- `/src/lib/stripe.ts` - Stripe checkout session creation (frontend)
- `/src/lib/database.ts` - Database operations (businesses, analyses, reviews)
- `/src/lib/deltaAnalysis.ts` - Delta analysis comparison logic
- `/src/lib/dateFiltering.ts` - Date filtering utilities

### Supabase Functions (Legacy - Not Used for Payments)
- `/supabase/functions/create-checkout/index.ts` - **DEPRECATED** - Use Vercel API route instead
- `/supabase/functions/extract-reviews/index.ts` - Review extraction from URLs
- `/supabase/functions/analyze-reviews/index.ts` - AI analysis of reviews
- `/supabase/functions/test-auth/index.ts` - Auth testing utility

### Database Migrations
- `/supabase/migrations/20251223165651_create_review_miner_schema.sql` - Initial schema
- `/supabase/migrations/20251223232304_add_user_auth_to_analyses.sql` - User auth on analyses
- `/supabase/migrations/20251223233919_create_analysis_deltas_table.sql` - Delta analysis table
- `/supabase/migrations/20251224000843_create_reviews_table.sql` - Reviews table
- `/supabase/migrations/20251224002709_fix_reviews_rls_policies.sql` - RLS policy fixes
- `/supabase/migrations/20251225203635_add_payment_columns_to_analyses.sql` - Payment tracking

## Environment Variables Needed

### Local Development (.env.local)
```env
VITE_SUPABASE_URL=https://kbjxtjylecievqbpdrdj.supabase.co
VITE_SUPABASE_ANON_KEY=sb_publishable_...
STRIPE_SECRET_KEY=sk_test_... (or sk_live_...)
```

### Vercel Production
Same variables as above, set in Vercel project settings:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `STRIPE_SECRET_KEY`

**Note**: Vite requires `VITE_` prefix for client-side variables. Server-side variables (like `STRIPE_SECRET_KEY` in API routes) don't need the prefix.

### Supabase Secrets (Edge Functions)
- `STRIPE_SECRET_KEY` - For Stripe integration
- `ANON_KEY` - Custom anon key (fallback if auto-injected one doesn't work)
- `SUPABASE_ANON_KEY` - Auto-injected by Supabase (may be manually set, but shouldn't be)

**Note**: Supabase auto-injects `SUPABASE_URL` and `SUPABASE_ANON_KEY` into edge functions. If you need to override, use custom `ANON_KEY` secret.

## Known Issues
- None currently documented

## Next Steps
- [To be filled in by next session]

## Important Notes

### Payment Integration
- **DO NOT** use Supabase Edge Functions for Stripe checkout - use Vercel API routes instead
- The checkout handler is at `/api/create-checkout.ts` (project root)
- Frontend calls `/api/create-checkout` (relative URL works in production)
- Frontend sends amount in **cents** (4900 = $49.00), don't multiply by 100 in API route

### Authentication
- Supabase ANON_KEY is auto-injected in edge functions
- If auto-injected key doesn't work, use custom `ANON_KEY` secret as fallback
- JWT tokens should be passed directly to `getUser(token)`, not in client options
- Frontend refreshes session before making checkout requests

### Project Reference
- Supabase Project Ref: `kbjxtjylecievqbpdrdj`
- Supabase URL: `https://kbjxtjylecievqbpdrdj.supabase.co`
- Region: West US (Oregon)

### Pricing
- First Analysis: $49.00 (4900 cents)
- Re-analysis: $10.00 (1000 cents)
- Defined in `/src/lib/stripe.ts` as constants

### API Route Format
- Vercel API routes use Node.js format: `export default async function handler(req: any, res: any)`
- Use `res.status().json()` for responses, not `new Response()`
- CORS headers must be set on all responses
- Request body is in `req.body` (not `await req.json()`)

### Database Schema
- Businesses table - stores business info and Google Business URLs
- Analyses table - stores analysis results with user_id and payment tracking
- Reviews table - stores individual reviews
- Analysis_deltas table - stores comparison data between analyses

### Maintenance Mode
- Toggle in `/src/App.tsx`: `MAINTENANCE_MODE` constant
- When enabled, shows maintenance page instead of app

## Deployment Checklist
1. ✅ Environment variables set in Vercel
2. ✅ Stripe secret key configured
3. ✅ Supabase project linked
4. ✅ API route deployed at `/api/create-checkout`
5. ✅ CORS configured for service-sift.com
6. ✅ Domain configured (service-sift.com)

## Testing
- Test checkout flow: Create analysis → Payment modal → Stripe checkout
- Test auth: Login → Dashboard → Protected routes
- Test analysis: Submit Google Business URL → Wait for extraction → View results








