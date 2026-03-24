export const PLANS = {
  free: {
    nom: 'Free',
    prix_mensuel: 0,
    prix_annuel: 0,
    limites: {
      analyses_par_mois: 3,
      opportunites_par_mois: 10,
      zones_geo: 1,
      types_opportunites: 1,
      utilisateurs: 1,
    },
    features: {
      enrichissement: false,
      export_pdf: false,
      types_custom: false,
      zones_custom: false,
      dashboard_equipe: false,
      support_prioritaire: false,
    }
  },
  pro: {
    nom: 'Pro',
    prix_mensuel: 49,
    prix_annuel: 420,
    limites: {
      analyses_par_mois: 30,
      opportunites_par_mois: -1, // illimité
      zones_geo: 5,
      types_opportunites: 5,
      utilisateurs: 1,
    },
    features: {
      enrichissement: true,
      export_pdf: true,
      types_custom: false,
      zones_custom: true,
      dashboard_equipe: false,
      support_prioritaire: false,
    }
  },
  team: {
    nom: 'Team',
    prix_mensuel: 119,
    prix_annuel: 990,
    limites: {
      analyses_par_mois: -1, // illimité
      opportunites_par_mois: -1,
      zones_geo: -1,
      types_opportunites: -1,
      utilisateurs: 5,
    },
    features: {
      enrichissement: true,
      export_pdf: true,
      types_custom: true,
      zones_custom: true,
      dashboard_equipe: true,
      support_prioritaire: true,
    }
  }
} as const

export type PlanType = keyof typeof PLANS
