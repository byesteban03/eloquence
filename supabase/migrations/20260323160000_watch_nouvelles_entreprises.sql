-- Active les extensions nécessaires
CREATE EXTENSION IF NOT EXISTS pg_net;
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Supprime l'ancien schedule s'il existe pour éviter les doublons
SELECT cron.unschedule('watch-nouvelles-entreprises-cron');

-- Schedule la veille des nouvelles entreprises chaque lundi à 9h00
-- Note: remplacez par votre URL de projet si nécessaire, ici on utilise une variable dynamique si possible
-- ou on hardcode car c'est une migration spécifique au projet.
SELECT cron.schedule(
  'watch-nouvelles-entreprises-cron',
  '0 9 * * 1',
  $$SELECT net.http_post(
    url := 'https://ofceomjlgnklswpstbiv.supabase.co/functions/v1/watch-nouvelles-entreprises',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key')
    ),
    body := '{}'::jsonb
  )$$
);
