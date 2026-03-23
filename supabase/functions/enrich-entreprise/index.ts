import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { opportunite_id, nom_entreprise } = await req.json();

    if (!opportunite_id || !nom_entreprise) {
      return new Response(JSON.stringify({ found: false, error: "Missing parameters" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      });
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    // 1. Vérifier si data existe déjà
    const { data: opp, error: oppError } = await supabaseClient
      .from('opportunites')
      .select('enrichissement')
      .eq('id', opportunite_id)
      .single();

    if (!oppError && opp?.enrichissement && Object.keys(opp.enrichissement).length > 0) {
      if (opp.enrichissement.found === false) {
        return new Response(JSON.stringify({ found: false }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      return new Response(JSON.stringify({ found: true, ...opp.enrichissement }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Appel API data.gouv.fr
    const API_URL = `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(nom_entreprise)}&per_page=1`;
    let gouvData;
    try {
      const res = await fetch(API_URL);
      gouvData = await res.json();
    } catch (e) {
      return new Response(JSON.stringify({ found: false, error: "API indisponible" }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!gouvData?.results || gouvData.results.length === 0) {
      // Enregistrer que c'est empty pour éviter appels futurs
      await supabaseClient.from('opportunites').update({ enrichissement: { found: false } }).eq('id', opportunite_id);
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const result = gouvData.results[0];
    
    // Extractions
    const nom_officiel = result.nom_complet || "";
    const s = result.siege || {};
    const adresse = [s.adresse_ligne_1, s.code_postal, s.libelle_commune].filter(Boolean).join(", ");
    const effectifs = result.tranche_effectif_salarie || "Inconnu";
    const code_naf = result.activite_principale || "";
    const secteur = result.libelle_activite_principale || "";
    const dirigeants = (result.dirigeants || []).slice(0, 3).map((d: any) => ({
      nom: d.nom,
      prenom: d.prenoms,
      qualite: d.qualite
    }));
    const financesArray = result.finances || [];
    const CA = financesArray.length > 0 ? financesArray[0].chiffre_affaires : null;

    // 3. Score bonus
    let score_bonus = 0;
    
    // Parsing effectifs
    const effLower = effectifs.toLowerCase();
    
    // Affinement effectif
    let eVal = 0;
    if (effLower.includes('500') || effLower.includes('1 000') || effLower.includes('2 000') || effLower.includes('5 000') || effLower.includes('10 000')) eVal = 500;
    else if (effLower.includes('100') || effLower.includes('200') || effLower.includes('250')) eVal = 100;
    else if (effLower.includes('50 à 99')) eVal = 50;
    
    if (eVal >= 500) score_bonus += 10;
    else if (eVal >= 100) score_bonus += 5;
    
    if (CA !== null) {
      if (CA > 50000000) score_bonus += 10;
      else if (CA >= 10000000) score_bonus += 5;
    }

    if (dirigeants.length > 0) score_bonus += 5;

    // Plafond à 25
    score_bonus = Math.min(score_bonus, 25);

    const jsonFormate = {
      nom_officiel,
      adresse,
      effectifs,
      code_naf,
      secteur,
      dirigeants,
      chiffre_affaires: CA,
      score_bonus
    };

    // 4. Save
    await supabaseClient.from('opportunites').update({ enrichissement: jsonFormate }).eq('id', opportunite_id);

    return new Response(JSON.stringify({ found: true, ...jsonFormate }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ found: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
