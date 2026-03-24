-- ⚠️ IMPORTANT : 
-- 1. Inscris-toi dans l'application via le nouvel écran de connexion
-- 2. Va dans ton Dashboard Supabase -> Authentication -> Users
-- 3. Copie ton UUID (User ID)
-- 4. Remplace 'TON-UUID-ICI' ci-dessous par ton véritable UUID, puis exécute ce script dans le SQL Editor.

DO $$
DECLARE
  esteban_id UUID := 'TON-UUID-ICI';
BEGIN
  -- Assigner toutes les réunions existantes
  UPDATE reunions SET user_id = esteban_id WHERE user_id IS NULL;
  
  -- Assigner toutes les opportunités (salons, anniversaires, etc.)
  UPDATE opportunites SET user_id = esteban_id WHERE user_id IS NULL;
  
  -- Assigner tous les prospects
  UPDATE prospects SET user_id = esteban_id WHERE user_id IS NULL;
  
  -- Assigner tous les messages générés
  UPDATE messages SET user_id = esteban_id WHERE user_id IS NULL;
  
  -- Assigner toutes les notifications planifiées
  UPDATE notifications_planifiees SET user_id = esteban_id WHERE user_id IS NULL;
  
END $$;
