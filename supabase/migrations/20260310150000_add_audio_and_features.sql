-- Migration: Add new columns for Module 01 features
-- Features: audio storage, scenography proposals, follow-up email, detected signals

ALTER TABLE reunions
  ADD COLUMN IF NOT EXISTS audio_url text,
  ADD COLUMN IF NOT EXISTS propositions_techniques jsonb,
  ADD COLUMN IF NOT EXISTS email_suivi jsonb,
  ADD COLUMN IF NOT EXISTS budget_detecte text,
  ADD COLUMN IF NOT EXISTS deadline_detectee text,
  ADD COLUMN IF NOT EXISTS mots_cles jsonb,
  ADD COLUMN IF NOT EXISTS decideurs jsonb,
  ADD COLUMN IF NOT EXISTS concurrents jsonb;

-- Create storage bucket for meeting audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('reunions-audio', 'reunions-audio', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow authenticated users to upload their audio files
CREATE POLICY "Authenticated users can upload audio" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'reunions-audio');

CREATE POLICY "Authenticated users can read audio" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'reunions-audio');
