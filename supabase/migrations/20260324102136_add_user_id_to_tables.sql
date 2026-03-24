-- Ajouter user_id sur toutes les tables principales
ALTER TABLE reunions 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE opportunites 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE prospects 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE messages 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

ALTER TABLE notifications_planifiees 
  ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
