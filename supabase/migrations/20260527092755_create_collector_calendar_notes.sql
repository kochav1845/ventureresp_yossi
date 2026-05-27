/*
  # Create collector calendar notes table

  1. New Tables
    - `collector_calendar_notes`
      - `id` (uuid, primary key)
      - `user_id` (uuid, references auth.users)
      - `note_date` (date, the calendar day this note belongs to)
      - `content` (text, the note content)
      - `created_at` (timestamptz)
      - `updated_at` (timestamptz)
      - `organization_id` (uuid, for org isolation)

  2. Security
    - Enable RLS on the table
    - Users can only access their own notes
    - Unique constraint on user_id + note_date (one note per day per user)

  3. Important Notes
    - Each collector can have one note per calendar day
    - Notes can be edited/updated at any time
    - Used by the collector calendar view to show daily annotations
*/

CREATE TABLE IF NOT EXISTS collector_calendar_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  note_date date NOT NULL,
  content text NOT NULL DEFAULT '',
  organization_id uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, note_date)
);

ALTER TABLE collector_calendar_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own calendar notes"
  ON collector_calendar_notes FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own calendar notes"
  ON collector_calendar_notes FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own calendar notes"
  ON collector_calendar_notes FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own calendar notes"
  ON collector_calendar_notes FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE INDEX idx_collector_calendar_notes_user_date
  ON collector_calendar_notes(user_id, note_date);
