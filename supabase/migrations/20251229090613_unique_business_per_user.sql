-- Create unique index to prevent duplicate businesses per user
-- This ensures each user can only have one business record per Google Maps URL
CREATE UNIQUE INDEX IF NOT EXISTS businesses_user_url_unique 
ON businesses(user_id, google_maps_url);

