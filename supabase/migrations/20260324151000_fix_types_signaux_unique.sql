-- Migration: Fix contrainte unique pour types_signaux
-- Date: 2026-03-24

ALTER TABLE types_signaux 
  ADD CONSTRAINT types_signaux_user_id_code_key UNIQUE (user_id, code);
