CREATE TABLE prospects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    nom TEXT,
    entreprise TEXT,
    poste TEXT,
    email TEXT,
    linkedin TEXT,
    telephone TEXT,
    statut_pipeline TEXT,
    secteur TEXT,
    notes TEXT
);

CREATE TABLE reunions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    prospect_nom TEXT,
    prospect_secteur TEXT,
    duree_audio TEXT,
    transcription TEXT,
    score_global INTEGER,
    indicateurs JSONB,
    besoins JSONB,
    prestations JSONB,
    plan_action JSONB
);

CREATE TABLE messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    prospect_id UUID REFERENCES prospects(id),
    contenu TEXT,
    canal TEXT,
    relation_type TEXT,
    statut TEXT,
    reunion_id UUID REFERENCES reunions(id)
);

CREATE TABLE opportunites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    type TEXT,
    nom TEXT,
    detail TEXT,
    date_evenement TEXT,
    contact_nom TEXT,
    contact_poste TEXT,
    statut TEXT
);
