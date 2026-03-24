-- Activer RLS
ALTER TABLE reunions ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunites ENABLE ROW LEVEL SECURITY;
ALTER TABLE prospects ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications_planifiees ENABLE ROW LEVEL SECURITY;

-- Policies : chaque utilisateur voit uniquement ses données
CREATE POLICY "users_own_reunions" ON reunions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_opportunites" ON opportunites
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_prospects" ON prospects
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_messages" ON messages
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_notifications" ON notifications_planifiees
  FOR ALL USING (auth.uid() = user_id);
