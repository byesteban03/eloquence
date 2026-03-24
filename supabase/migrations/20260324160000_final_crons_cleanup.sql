-- Migration: Consolidation finale des Crons (Sprint 7)
-- Date: 2026-03-24

-- 1. Nettoyage des anciens noms de jobs pour repartir sur une base propre
SELECT cron.unschedule('refresh-weekly');
SELECT cron.unschedule('refresh-prospects-daily');
SELECT cron.unschedule('watch-nouvelles-entreprises-cron');
SELECT cron.unschedule('correlate-signaux-daily');

-- 2. Création des jobs selon les spécifications utilisateur

-- Job 1 : Détection complète (Lundi 8h)
SELECT cron.schedule(
  'refresh-opportunites-weekly',
  '0 8 * * 1',
  $$
  SELECT net.http_post(
    url := 'https://ofceomjlgnklswpstbiv.supabase.co/functions/v1/refresh-opportunites',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Job 2 : Veille nouvelles entreprises (Mercredi 9h)
SELECT cron.schedule(
  'watch-nouvelles-entreprises-weekly',
  '0 9 * * 3',
  $$
  SELECT net.http_post(
    url := 'https://ofceomjlgnklswpstbiv.supabase.co/functions/v1/watch-nouvelles-entreprises',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Job 3 : Corrélation et Scoring (Quotidien 7h)
-- Note: On réutilise refresh-opportunites qui gère le scoring et la corrélation en fin de process
SELECT cron.schedule(
  'correlate-signaux-daily',
  '0 7 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ofceomjlgnklswpstbiv.supabase.co/functions/v1/refresh-opportunites',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Les commentaires pour le suivi dans le dashboard
COMMENT ON JOB 'refresh-opportunites-weekly' IS 'Détection complète des opportunités';
COMMENT ON JOB 'watch-nouvelles-entreprises-weekly' IS 'Veille ciblée nouvelles créations';
COMMENT ON JOB 'correlate-signaux-daily' IS 'Calcul quotidien des scores et corrélations';
