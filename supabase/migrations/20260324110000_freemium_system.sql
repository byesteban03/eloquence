-- Migration: subscriptions and usage_monthly
-- Sprint 3: Freemium System

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE UNIQUE,
  plan TEXT NOT NULL DEFAULT 'free' 
    CHECK (plan IN ('free', 'pro', 'team')),
  billing_cycle TEXT CHECK (billing_cycle IN ('monthly', 'annual')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'cancelled', 'past_due', 'trialing')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS usage_monthly (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  mois TEXT NOT NULL, -- format 'YYYY-MM'
  analyses_count INTEGER DEFAULT 0,
  opportunites_count INTEGER DEFAULT 0,
  zones_count INTEGER DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, mois)
);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE usage_monthly ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_subscription" ON subscriptions
  FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "users_own_usage" ON usage_monthly
  FOR ALL USING (auth.uid() = user_id);

-- Insérer un plan free automatiquement à l'inscription
CREATE OR REPLACE FUNCTION handle_new_subscription()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO subscriptions (user_id, plan, status)
  VALUES (NEW.id, 'free', 'active');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Check if trigger already exists to avoid error if re-run
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_user_created_subscription') THEN
    CREATE TRIGGER on_user_created_subscription
      AFTER INSERT ON auth.users
      FOR EACH ROW EXECUTE FUNCTION handle_new_subscription();
  END IF;
END $$;
