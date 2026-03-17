/*
  # Fix Security Issues for Kitty Comps

  1. Security Changes
    - Drop the `kitty_comps_searches` table which had overly permissive RLS policies
    - The table is not currently used by the application
    - Removing it eliminates the security vulnerability of USING (true) policies

  2. Rationale
    - The current KittyCompsScreen implementation does not persist searches to the database
    - All comps data is generated client-side using the mock provider
    - Keeping an unused table with insecure RLS policies creates unnecessary security risk
    
  Note: If database persistence is needed in the future, recreate the table with proper
  authentication-based RLS policies (e.g., auth.uid() checks).
*/

DROP TABLE IF EXISTS kitty_comps_searches CASCADE;
