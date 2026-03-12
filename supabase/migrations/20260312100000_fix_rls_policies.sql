-- Relax RLS for testing purposes
-- Allow anon to insert into reunions
CREATE POLICY "Allow anon insert into reunions" ON reunions
  FOR INSERT TO anon
  WITH CHECK (true);

-- Make reunions-audio bucket public
UPDATE storage.buckets SET public = true WHERE id = 'reunions-audio';

-- Allow anon to upload/read audio
CREATE POLICY "Anon can upload audio" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'reunions-audio');

CREATE POLICY "Anon can read audio" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'reunions-audio');
