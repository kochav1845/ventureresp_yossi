/*
  # Create Ticket Merge Tracking System

  1. New Tables
    - `ticket_merge_events`
      - `id` (uuid, primary key)
      - `target_ticket_id` (uuid) - The ticket that invoices were merged into
      - `merged_at` (timestamptz) - When the merge occurred
      - `merged_by` (uuid) - User who performed the merge
      - `invoice_count` (integer) - Number of invoices added in this merge
      - `invoice_reference_numbers` (text[]) - Array of invoice reference numbers added
      - `notes` (text) - Optional notes about the merge

  2. Security
    - Enable RLS on `ticket_merge_events` table
    - Allow authenticated users with appropriate permissions to view merge events
    - Only users who can manage tickets can create merge events

  3. Indexes
    - Index on target_ticket_id for fast lookup of merge history
    - Index on merged_at for chronological queries
*/

-- Create ticket merge events table
CREATE TABLE IF NOT EXISTS ticket_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_ticket_id uuid NOT NULL REFERENCES collection_tickets(id) ON DELETE CASCADE,
  merged_at timestamptz DEFAULT now(),
  merged_by uuid REFERENCES user_profiles(id) ON DELETE SET NULL,
  invoice_count integer NOT NULL DEFAULT 0,
  invoice_reference_numbers text[] NOT NULL DEFAULT '{}',
  notes text
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_ticket_merge_events_target_ticket
  ON ticket_merge_events(target_ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_merge_events_merged_at
  ON ticket_merge_events(merged_at DESC);

-- Enable RLS
ALTER TABLE ticket_merge_events ENABLE ROW LEVEL SECURITY;

-- Policy: Authenticated users with ticket management permissions can view merge events
CREATE POLICY "Users with ticket permissions can view merge events"
  ON ticket_merge_events
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager', 'collector')
    )
  );

-- Policy: Only admins and managers can create merge events
CREATE POLICY "Admins and managers can create merge events"
  ON ticket_merge_events
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_profiles
      WHERE user_profiles.id = auth.uid()
      AND user_profiles.role IN ('admin', 'manager')
    )
  );

-- Create a function to get ticket merge history with details
CREATE OR REPLACE FUNCTION get_ticket_merge_history(p_ticket_id uuid)
RETURNS TABLE (
  merge_id uuid,
  merged_at timestamptz,
  merged_by_name text,
  merged_by_email text,
  invoice_count integer,
  invoice_reference_numbers text[],
  notes text
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    tme.id,
    tme.merged_at,
    up.full_name,
    up.email,
    tme.invoice_count,
    tme.invoice_reference_numbers,
    tme.notes
  FROM ticket_merge_events tme
  LEFT JOIN user_profiles up ON tme.merged_by = up.id
  WHERE tme.target_ticket_id = p_ticket_id
  ORDER BY tme.merged_at DESC;
END;
$$;