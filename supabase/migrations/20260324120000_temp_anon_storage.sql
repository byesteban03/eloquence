-- Temporary policy to allow anonymous uploads for testing (REMOVABLE)
CREATE POLICY "Temp: Anonymous uploads for testing" ON storage.objects
  FOR INSERT TO anon
  WITH CHECK (bucket_id = 'reunions-audio');

CREATE POLICY "Temp: Anonymous reads for testing" ON storage.objects
  FOR SELECT TO anon
  USING (bucket_id = 'reunions-audio');
