import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Secteurs NAF à surveiller (événementiel, luxe, auto, comm)
const SECTEURS_CIBLES = ['90.01Z', '90.02Z', '73.11Z', '45.11Z', '32.12Z'];
const DAYS_LOOKBACK = 60; // Plus large pour le test initial

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''; // Use service role for cron tasks
    const supabase = createClient(supabaseUrl, supabaseKey);

    const resultsSummary = [];

    // Rechercher les entreprises créées dans les 30 derniers jours
    for (const secteur of SECTEURS_CIBLES) {
      const dateMin = new Date();
      dateMin.setDate(dateMin.getDate() - DAYS_LOOKBACK);
      const dateMinStr = dateMin.toISOString().split('T')[0];
      
      const response = await fetch(
        `https://recherche-entreprises.api.gouv.fr/search?` +
        `activite_principale=${secteur}` +
        `&date_creation_min=${dateMinStr}` +
        `&per_page=10` +
        `&tri=date_creation&ordre=desc`
      );
      
      if (!response.ok) continue;
      const data = await response.json();
      
      for (const entreprise of data.results ?? []) {
        // Insérer comme nouvelle opportunité de type 'anniversaire' 
        // (création = anniversaire futur potentiel)
        const { error } = await supabase.from('opportunites').upsert({
          type: 'anniversaire',
          nom: entreprise.nom_complet,
          detail: `Nouvelle entreprise (créée le ${entreprise.date_creation}) — ${entreprise.libelle_activite_principale}`,
          secteur: entreprise.libelle_activite_principale,
          qualification: 'À contacter', // Directement à contacter car nouveau business
          score_pertinence: 60,
          enrichissement: {
            found: true,
            siren: entreprise.siren,
            adresse: `${entreprise.siege?.adresse_ligne_1}, ${entreprise.siege?.code_postal} ${entreprise.siege?.libelle_commune}`,
            code_naf: entreprise.activite_principale,
            secteur: entreprise.libelle_activite_principale,
            date_creation: entreprise.date_creation,
            source: 'veille_creation',
            nombre_etablissements: entreprise.nombre_etablissements || 1,
            latitude: entreprise.siege?.latitude,
            longitude: entreprise.siege?.longitude
          }
        }, { onConflict: 'nom' });

        if (!error) {
          resultsSummary.push({ nom: entreprise.nom_complet, secteur: entreprise.libelle_activite_principale });
        }
      }
    }

    return new Response(JSON.stringify({ 
      success: true, 
      count: resultsSummary.length,
      found: resultsSummary 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
