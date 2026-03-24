export type Signal = {
  code: string;
  nom: string;
  description: string;
  source: 'scrapping' | 'gpt';
  icon: string;
  fiabilite: 1 | 2 | 3;
  cas_usage: string[];
  plan_minimum: 'free' | 'pro' | 'team';
  module: 'OPEN_DATA' | 'SOCIAL' | 'EVENTS' | 'FINANCIAL';
};

export const SIGNAUX_BIBLIOTHEQUE: readonly Signal[] = [
  {
    code: 'creation_entreprise',
    nom: 'Créations d\'entreprises',
    description: 'Nouvelles immatriculations au RNCS',
    source: 'scrapping',
    icon: 'business-outline',
    fiabilite: 3,
    cas_usage: ['Expert-Comptable', 'Assurances', 'Bureautique'],
    plan_minimum: 'free',
    module: 'OPEN_DATA',
  },
  {
    code: 'anniversaire_entreprise',
    nom: 'Anniversaires (3, 5, 10 ans)',
    description: 'Moments clés pour le renouvellement d\'équipement',
    source: 'scrapping',
    icon: 'calendar-outline',
    fiabilite: 3,
    cas_usage: ['Banque', 'Conseil', 'Cadeaux d\'affaires'],
    plan_minimum: 'free',
    module: 'OPEN_DATA',
  },
  {
    code: 'croissance_rapide',
    nom: 'Hyper-croissance',
    description: 'Augmentation subite des effectifs (+20%)',
    source: 'gpt',
    icon: 'trending-up-outline',
    fiabilite: 2,
    cas_usage: ['Recrutement', 'Immobilier Pro', 'Logiciels RH'],
    plan_minimum: 'pro',
    module: 'SOCIAL',
  },
  {
    code: 'levee_fonds',
    nom: 'Levées de fonds',
    description: 'Annonces de tours de table (Pre-seed à Série C)',
    source: 'gpt',
    icon: 'cash-outline',
    fiabilite: 3,
    cas_usage: ['Conseil Financement', 'Marketing', 'Luxe'],
    plan_minimum: 'pro',
    module: 'FINANCIAL',
  },
  {
    code: 'ouverture_etablissement',
    nom: 'Ouvertures de sites',
    description: 'Nouveaux SIRET secondaires détectés',
    source: 'scrapping',
    icon: 'storefront-outline',
    fiabilite: 3,
    cas_usage: ['Sécurité', 'Nettoyage', 'Télécoms'],
    plan_minimum: 'pro',
    module: 'OPEN_DATA',
  },
  {
    code: 'demenagement',
    nom: 'Transferts de siège',
    description: 'Changement d\'adresse siganlé au greffe',
    source: 'scrapping',
    icon: 'home-outline',
    fiabilite: 3,
    cas_usage: ['Déménagement', 'Aménagement', 'Internet'],
    plan_minimum: 'pro',
    module: 'OPEN_DATA',
  },
  {
    code: 'difficulte_financiere',
    nom: 'Alertes procédures',
    description: 'Sauvegardes et redressements judiciaires',
    source: 'scrapping',
    icon: 'trending-down-outline',
    fiabilite: 3,
    cas_usage: ['Rachat de créances', 'Avocats', 'Restructuration'],
    plan_minimum: 'team',
    module: 'FINANCIAL',
  },
  {
    code: 'monument',
    nom: 'Monuments Historiques',
    description: 'Propriétaires de biens classés ou inscrits',
    source: 'gpt',
    icon: 'business-outline',
    fiabilite: 3,
    cas_usage: ['Tous secteurs'],
    plan_minimum: 'pro',
    module: 'EVENTS',
  },
  {
    code: 'lancement_produit',
    nom: 'Lancements de produits',
    description: 'Événements de lancement détectés par IA',
    source: 'gpt',
    icon: 'rocket-outline',
    fiabilite: 3,
    cas_usage: ['Événementiel', 'Communication', 'Marketing'],
    plan_minimum: 'pro',
    module: 'EVENTS',
  },
] as const;

export type SignalCode = typeof SIGNAUX_BIBLIOTHEQUE[number]['code'];

// Signaux accessibles par plan
export const SIGNAUX_PAR_PLAN: Record<string, string[]> = {
  free: ['creation_entreprise', 'anniversaire_entreprise'],
  pro: SIGNAUX_BIBLIOTHEQUE
    .filter(s => s.plan_minimum !== 'team')
    .map(s => s.code),
  team: SIGNAUX_BIBLIOTHEQUE.map(s => s.code),
};
