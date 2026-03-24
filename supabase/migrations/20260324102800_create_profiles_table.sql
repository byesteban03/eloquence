CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  secteur TEXT,
  plan TEXT DEFAULT 'free',
  analyses_ce_mois INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Trigger : créer automatiquement un profil à l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO profiles (id, full_name, email)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'full_name',
    NEW.email
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- RLS sur profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_profile" ON profiles
  FOR ALL USING (auth.uid() = id);
