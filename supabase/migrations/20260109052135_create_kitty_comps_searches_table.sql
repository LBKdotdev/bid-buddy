/*
  # Create kitty_comps_searches table

  1. New Tables
    - `kitty_comps_searches`
      - `id` (uuid, primary key) - Unique identifier for each search
      - `zip` (text) - ZIP code for search center
      - `radius` (integer) - Search radius in miles
      - `year` (integer, nullable) - Optional year filter
      - `make` (text) - Required make filter
      - `model` (text) - Required model filter
      - `trim` (text, nullable) - Optional trim filter
      - `mileage` (integer, nullable) - Optional mileage filter
      - `include_active` (boolean) - Include active listings
      - `include_sold` (boolean) - Include sold results
      - `date_days` (integer) - Date range in days
      - `results` (jsonb, nullable) - Cached search results
      - `created_at` (timestamptz) - When search was created
      - `updated_at` (timestamptz) - When search was last updated

  2. Security
    - Enable RLS on `kitty_comps_searches` table
    - Add policy for anyone to read searches (public demo)
    - Add policy for anyone to create searches (public demo)
    - Add policy for anyone to update searches (public demo)

  Note: Since this is a demo app without authentication, we're allowing public access.
  In production, these policies should be restricted to authenticated users.
*/

CREATE TABLE IF NOT EXISTS kitty_comps_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zip text NOT NULL,
  radius integer NOT NULL DEFAULT 100,
  year integer,
  make text NOT NULL,
  model text NOT NULL,
  trim text,
  mileage integer,
  include_active boolean NOT NULL DEFAULT true,
  include_sold boolean NOT NULL DEFAULT true,
  date_days integer NOT NULL DEFAULT 90,
  results jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE kitty_comps_searches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to searches"
  ON kitty_comps_searches
  FOR SELECT
  USING (true);

CREATE POLICY "Allow public insert access to searches"
  ON kitty_comps_searches
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow public update access to searches"
  ON kitty_comps_searches
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Allow public delete access to searches"
  ON kitty_comps_searches
  FOR DELETE
  USING (true);

CREATE INDEX IF NOT EXISTS idx_kitty_comps_searches_created_at ON kitty_comps_searches(created_at DESC);
