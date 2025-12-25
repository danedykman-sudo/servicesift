/*
  # Create reviews table

  1. New Tables
    - `reviews`
      - `id` (uuid, primary key)
      - `analysis_id` (uuid, foreign key to analyses)
      - `rating` (integer, 1-5 star rating)
      - `text` (text, review content)
      - `review_date` (timestamptz, when the review was posted)
      - `author` (text, reviewer name)
      - `created_at` (timestamptz, when we stored this review)

  2. Security
    - Enable RLS on `reviews` table
    - Add policies for authenticated users to read their own reviews

  3. Indexes
    - Index on analysis_id for fast lookups
    - Index on review_date for date-based filtering
*/

CREATE TABLE IF NOT EXISTS reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id uuid NOT NULL REFERENCES analyses(id) ON DELETE CASCADE,
  rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
  text text NOT NULL,
  review_date timestamptz NOT NULL,
  author text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own reviews"
  ON reviews
  FOR SELECT
  TO authenticated
  USING (
    analysis_id IN (
      SELECT id FROM analyses WHERE user_id = auth.uid()
    )
  );

CREATE INDEX IF NOT EXISTS idx_reviews_analysis_id ON reviews(analysis_id);
CREATE INDEX IF NOT EXISTS idx_reviews_review_date ON reviews(review_date);
