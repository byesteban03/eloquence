-- Migration: Étape 8 - Mise à jour des Crons Supabase
-- Cette migration active les extensions nécessaires et planifie le rafraîchissement quotidien.

-- 1. Activer les extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- 2. Nettoyer les anciens jobs si présents
SELECT cron.unschedule('refresh-prospects-daily');

-- 3. Planifier l'appel à la fonction refresh-opportunites
-- NOTE : L'utilisateur devra remplacer 'YOUR_SERVICE_ROLE_KEY' par sa clé réelle 
-- ou utiliser le système de secrets de Supabase si disponible en SQL.
-- Fréquence : Tous les jours à 04:00 AM UTC.

SELECT cron.schedule(
  'refresh-prospects-daily',
  '0 4 * * *',
  $$
  SELECT net.http_post(
    url := 'https://ofceomjlgnklswpstbiv.supabase.co/functions/v1/refresh-opportunites',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer YOUR_SERVICE_ROLE_KEY"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Note informative pour l'utilisateur
COMMENT ON JOB 'refresh-prospects-daily' IS 'Rafraîchissement automatique des opportunités (Architecture 5 couches)';
