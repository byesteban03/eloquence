-- Add qualification column
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS qualification TEXT DEFAULT 'Non qualifié';
ALTER TABLE opportunites ADD COLUMN IF NOT EXISTS score_pertinence INTEGER DEFAULT 0;

-- Enable pg_cron extension if not already enabled (Supabase instances usually have it)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule the weekly refresh every Monday at 8:00 AM
-- IMPORTANT: We use the ANON_KEY or a secure Service Role Key here.
-- Assuming standard Supabase setup, we'll execute an HTTP POST to the edge function.
-- In local/dev, this pg_cron might not reach the local edge function easily, but works in production.

SELECT cron.schedule(
  'refresh-weekly', 
  '0 8 * * 1', 
  $$
    select net.http_post(
      url:='https://ofceomjlgnklswpstbiv.supabase.co/functions/v1/refresh-opportunites', 
      headers:='{"Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9mY2VvbWpsZ25rbHN3cHN0Yml2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMzA3NzUsImV4cCI6MjA4ODcwNjc3NX0.lKVlXk7jpDeHhVxZyP3GiCPERlS0L9d_X-T-3_brOA8"}'::jsonb
    )
  $$
);
