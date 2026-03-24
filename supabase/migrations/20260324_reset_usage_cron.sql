-- Fonction pour réinitialiser les compteurs d'usage mensuels
CREATE OR REPLACE FUNCTION reset_monthly_usage()
RETURNS void AS $$
BEGIN
  UPDATE usage_monthly
  SET 
    analyses_count = 0,
    opportunites_count = 0,
    zones_count = 0,
    updated_at = now();
END;
$$ LANGUAGE plpgsql;

-- Planification de la tâche (chaque 1er du mois à minuit)
-- Note : pg_cron doit être activé dans Supabase (Settings -> Database -> Extensions)
SELECT cron.schedule(
  'reset-usage-monthly', -- nom de la tâche
  '0 0 1 * *',           -- cron expression (1er du mois à 00:00)
  'SELECT reset_monthly_usage()'
);
