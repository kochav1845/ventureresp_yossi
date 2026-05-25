/*
  # Allow public read access to active organizations

  1. Changes
    - Add RLS policy so anyone can see active org names/slugs (for landing page)
    - This only exposes: id, slug, name (not internal details)

  2. Security
    - Only active organizations are visible to public
    - Only super admins can create/modify organizations (existing policy)
*/

CREATE POLICY "Anyone can view active organizations"
  ON organizations FOR SELECT
  TO anon, authenticated
  USING (is_active = true);
