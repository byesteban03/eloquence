-- Migration: Champs avancés pour le compte rendu IA et table des notifications planifiées
-- Date: 2026-03-23

-- ── Nouvelles colonnes dans la table reunions ─────────────────────────────────

ALTER TABLE reunions 
  ADD COLUMN IF NOT EXISTS resume_tweet TEXT,
  ADD COLUMN IF NOT EXISTS ton_prospect JSONB,
  ADD COLUMN IF NOT EXISTS objections_verbatim JSONB,
  ADD COLUMN IF NOT EXISTS signaux_achat JSONB,
  ADD COLUMN IF NOT EXISTS questions_prospect JSONB,
  ADD COLUMN IF NOT EXISTS maturite_decisionnelle JSONB,
  ADD COLUMN IF NOT EXISTS coherence_discours JSONB,
  ADD COLUMN IF NOT EXISTS prochaine_action_prioritaire JSONB,
  ADD COLUMN IF NOT EXISTS opportunite_id UUID REFERENCES opportunites(id);

-- ── Table des notifications planifiées ───────────────────────────────────────

CREATE TABLE IF NOT EXISTS notifications_planifiees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  reunion_id UUID REFERENCES reunions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ── RLS pour notifications_planifiees ────────────────────────────────────────

ALTER TABLE notifications_planifiees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications"
  ON notifications_planifiees FOR SELECT
  USING (
    reunion_id IN (
      SELECT id FROM reunions
    )
  );

CREATE POLICY "Service role can manage notifications"
  ON notifications_planifiees FOR ALL
  USING (true)
  WITH CHECK (true);

-- ── Index pour les notifications non envoyées ─────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_notifications_planifiees_unsent
  ON notifications_planifiees (scheduled_for)
  WHERE sent = false;

CREATE INDEX IF NOT EXISTS idx_reunions_opportunite_id
  ON reunions (opportunite_id)
  WHERE opportunite_id IS NOT NULL;
