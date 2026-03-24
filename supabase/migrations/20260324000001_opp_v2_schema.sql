-- Migration: Opportunités v2.0 - Schéma complet
-- Date: 2026-03-24

CREATE TABLE IF NOT EXISTS zones_cibles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  nom TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('ville', 'departement', 'region', 'rayon', 'code_postal')),
  code_postal TEXT,
  ville TEXT,
  departement TEXT,
  region TEXT,
  adresse_centre TEXT,
  latitude_centre FLOAT,
  longitude_centre FLOAT,
  rayon_km INTEGER DEFAULT 50,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS types_signaux (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  nom TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('bodacc', 'data_gouv', 'boamp', 'sitadel', 'france_travail', 'infogreffe', 'inpi', 'gpt')),
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Ajouter colonnes enrichies sur opportunites
ALTER TABLE opportunites
  ADD COLUMN IF NOT EXISTS signal_code TEXT,
  ADD COLUMN IF NOT EXISTS signal_source TEXT,
  ADD COLUMN IF NOT EXISTS signal_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signaux_croises JSONB DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS score_pertinence_v2 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_maturite INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_warmth INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_financier INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS score_global_v2 INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fenetre_optimale_debut TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS fenetre_optimale_fin TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS action_recommandee TEXT,
  ADD COLUMN IF NOT EXISTS ville TEXT,
  ADD COLUMN IF NOT EXISTS departement TEXT,
  ADD COLUMN IF NOT EXISTS region TEXT,
  ADD COLUMN IF NOT EXISTS latitude FLOAT,
  ADD COLUMN IF NOT EXISTS longitude FLOAT,
  ADD COLUMN IF NOT EXISTS distance_km FLOAT,
  ADD COLUMN IF NOT EXISTS zone_cible_id UUID REFERENCES zones_cibles(id);

-- RLS
ALTER TABLE zones_cibles ENABLE ROW LEVEL SECURITY;
ALTER TABLE types_signaux ENABLE ROW LEVEL SECURITY;

-- Note: Les politiques peuvent échouer si elles existent déjà, on utilise une approche sécurisée
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_zones') THEN
        CREATE POLICY "users_own_zones" ON zones_cibles FOR ALL USING (auth.uid() = user_id);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'users_own_signaux') THEN
        CREATE POLICY "users_own_signaux" ON types_signaux FOR ALL USING (auth.uid() = user_id);
    END IF;
END $$;
