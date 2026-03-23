import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HARDCODED_SALONS = [
  { nom: 'Space Rennes', date: '9-12 Septembre 2026', lieu: 'Rennes', secteur: 'Agricole', organisateur: 'Space' },
  { nom: 'Viva Technology Paris', date: '11-14 Juin 2026', lieu: 'Paris Expo', secteur: 'Tech & Startup', organisateur: 'Viva Technology' },
  { nom: 'Batimat Paris', date: '3-6 Novembre 2026', lieu: 'Paris Expo', secteur: 'Construction', organisateur: 'RX France' },
  { nom: 'SIAL Paris', date: '19-23 Octobre 2026', lieu: 'Paris Nord Villepinte', secteur: 'Alimentaire', organisateur: 'Comexposium' },
  { nom: 'Rétromobile Paris', date: '3-8 Février 2027', lieu: 'Paris Expo', secteur: 'Automobile', organisateur: 'Comexposium' },
  { nom: 'Mondial Auto Paris', date: '14-25 Octobre 2026', lieu: 'Paris Expo', secteur: 'Automobile', organisateur: 'Hopscotch' },
  { nom: 'Maison&Objet Paris', date: '16-20 Janvier 2027', lieu: 'Paris Nord Villepinte', secteur: 'Design & Déco', organisateur: 'SAFI' },
  { nom: 'MIPIM Cannes', date: '10-13 Mars 2027', lieu: 'Palais des Festivals', secteur: 'Immobilier', organisateur: 'RX France' },
  { nom: 'Salon du Bourget', date: 'Juin 2027', lieu: 'Paris Le Bourget', secteur: 'Aéronautique', organisateur: 'SIAE' },
  { nom: 'SIRHA Lyon', date: '25-29 Janvier 2027', lieu: 'Eurexpo Lyon', secteur: 'Restauration', organisateur: 'GL Events' }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // DDG Scrape logic mock - we could fetch HTML from DDG but for robustness and speed we combine with hardcoded.
    // In a real app we would parse the DDG html to extract dynamic ones.
    const salons = await Promise.all(HARDCODED_SALONS.map(async (salon) => {
      let organisateur_info = '';
      if (salon.organisateur) {
        try {
          const res = await fetch(`https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(salon.organisateur)}&per_page=1`);
          const data = await res.json();
          if (data.results && data.results.length > 0) {
            const result = data.results[0];
            const s = result.siege || {};
            const adresse = [s.adresse_ligne_1, s.code_postal, s.libelle_commune].filter(Boolean).join(', ');
            const effectifs = result.tranche_effectif_salarie || 'Effectif inconnu';
            const secteur = result.libelle_activite_principale || 'Secteur inconnu';
            organisateur_info = `${effectifs} | ${secteur} | ${adresse}`;
          }
        } catch (e) {
          console.error(`Erreur data.gouv pour ${salon.organisateur}:`, e);
        }
      }
      return { ...salon, organisateur_info };
    }));

    return new Response(JSON.stringify({ salons }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
