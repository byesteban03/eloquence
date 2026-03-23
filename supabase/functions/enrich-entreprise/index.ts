import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const NOISE_WORDS = [
  'salon', 'festival', 'forum', 'congrès', 'congress', 'expo', 
  'exposition', 'foire', 'show', 'awards', 'summit', 'week',
  'journées', 'rencontres', 'championship', 'grand prix', 'concours',
  'de', 'du', 'la', 'le', 'les', 'des', 'et', 'en', 'pour', 'internationale', 'international'
];

async function searchEntreprise(nomEntreprise: string) {
  // PASSE 1 : nom exact
  const pass1 = await fetch(
    `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(nomEntreprise)}&per_page=3`
  );
  const data1 = await pass1.json();
  
  if (data1.results?.length > 0) {
    // Vérifier la pertinence : le nom retourné doit ressembler au nom cherché
    const firstWord = nomEntreprise.toLowerCase().split(' ')[0];
    const bestMatch = data1.results.find((r: any) => 
      r.nom_complet.toLowerCase().includes(firstWord) || 
      nomEntreprise.toLowerCase().includes(r.nom_complet.toLowerCase().split(' ')[0])
    );
    if (bestMatch) return bestMatch;
  }

  // PASSE 2 : extraire le mot-clé principal (retirer les noise words)
  const words = nomEntreprise.split(/[\s']+/);
  const keywords = words.filter(w => 
    !NOISE_WORDS.includes(w.toLowerCase()) && w.length > 3
  );
  
  if (keywords.length === 0) return data1.results?.[0] ?? null;
  
  const cleanQuery = keywords.slice(0, 2).join(' ');
  console.log(`[enrich] Pass 2 avec query nettoyée: "${cleanQuery}"`);
  
  const pass2 = await fetch(
    `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(cleanQuery)}&per_page=3`
  );
  const data2 = await pass2.json();
  
  return data2.results?.[0] ?? data1.results?.[0] ?? null;
}

async function enrichFinances(siren: string) {
  const PAPPERS_API_KEY = Deno.env.get('PAPPERS_API_KEY');
  if (!PAPPERS_API_KEY) return null;
  
  try {
    const response = await fetch(
      `https://api.pappers.fr/v2/entreprise?siren=${siren}&api_token=${PAPPERS_API_KEY}&chiffres_cles=true`
    );
    if (!response.ok) return null;
    const data = await response.json();
    
    // Extraire les 3 derniers exercices
    const exercices = (data.finances || []).slice(0, 3).map((f: any) => ({
      annee: f.annee,
      chiffre_affaires: f.chiffre_affaires,
      resultat_net: f.resultat_net,
      effectifs: f.effectif
    }));
    
    return {
      chiffre_affaires_dernier: exercices?.[0]?.chiffre_affaires ?? null,
      resultat_net_dernier: exercices?.[0]?.resultat_net ?? null,
      historique_finances: exercices ?? []
    };
  } catch (e) {
    console.warn(`[enrich] Pappers error for ${siren}:`, e.message);
    return null;
  }
}

function calculerScoreBonus(enrichissement: any): { score: number; details: string[] } {
  let score = 0;
  const details: string[] = [];

  // Effectifs - Tranches INSEE
  const effectifsMap: Record<string, number> = {
    'NN': 0, '00': 0, '01': 2, '02': 3, '03': 5,
    '11': 5, '12': 5, '21': 8, '22': 8,
    '31': 10, '32': 10, '41': 12, '42': 12,
    '51': 15, '52': 15, '53': 15
  };
  const tranche = enrichissement.tranche_effectif || 'NN';
  const effectifsScore = effectifsMap[tranche] ?? 0;
  if (effectifsScore > 0) {
    score += effectifsScore;
    details.push(`+${effectifsScore} effectifs`);
  }

  // Chiffre d'affaires
  const ca = enrichissement.chiffre_affaires;
  if (ca > 50_000_000) {
    score += 15; details.push('+15 CA > 50M€');
  } else if (ca > 10_000_000) {
    score += 10; details.push('+10 CA > 10M€');
  } else if (ca > 1_000_000) {
    score += 5; details.push('+5 CA > 1M€');
  }

  // Secteur NAF favorable
  const SECTEURS_FAVORABLES = [
    '73', // Publicité et études de marché
    '90', // Arts, spectacles
    '82', // Activités administratives
    '45', // Commerce auto
    '46', // Commerce de gros
    '47', // Commerce de détail
    '55', // Hébergement
    '56', // Restauration
    '70', // Conseil de gestion
    '71', // Ingénierie
  ];
  const codeNaf = enrichissement.code_naf?.substring(0, 2);
  if (SECTEURS_FAVORABLES.includes(codeNaf)) {
    score += 15; details.push('+15 secteur favorable');
  }

  // Dirigeants identifiés
  if (enrichissement.dirigeants?.length > 0) {
    score += 5; details.push('+5 dirigeants identifiés');
  }

  // Établissements multiples
  const nbEt = enrichissement.nombre_etablissements || 1;
  if (nbEt > 10) {
    score += 10; details.push('+10 multi-établissements');
  } else if (nbEt > 3) {
    score += 5; details.push('+5 plusieurs établissements');
  }

  return { score: Math.min(score, 30), details };
}

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

    // 2. Recherche multi-passe
    const result = await searchEntreprise(nom_entreprise);

    if (!result) {
      // Enregistrer que c'est empty pour éviter appels futurs
      await supabaseClient.from('opportunites').update({ enrichissement: { found: false } }).eq('id', opportunite_id);
      return new Response(JSON.stringify({ found: false }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Extractions de base
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
    
    // 3. Enrichissement Pappers (finances)
    const pappersData = await enrichFinances(result.siren);
    
    // Données finales consolidées
    const enrichissement: any = {
      found: true,
      siren: result.siren,
      siret_siege: s.siret,
      nom_officiel,
      adresse,
      effectifs,
      tranche_effectif: result.tranche_effectif_salarie,
      code_naf,
      secteur,
      dirigeants,
      nombre_etablissements: result.nombre_etablissements || 1,
      chiffre_affaires: pappersData?.chiffre_affaires_dernier ?? (result.finances?.[0]?.chiffre_affaires ?? null),
      resultat_net: pappersData?.resultat_net_dernier ?? null,
      historique_finances: pappersData?.historique_finances ?? [],
      latitude: s.latitude,
      longitude: s.longitude
    };

    // 4. Scoring enrichi
    const { score, details } = calculerScoreBonus(enrichissement);
    enrichissement.score_bonus = score;
    enrichissement.score_bonus_details = details;

    // Save
    await supabaseClient.from('opportunites').update({ enrichissement }).eq('id', opportunite_id);

    return new Response(JSON.stringify(enrichissement), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ found: false, error: err.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500
    });
  }
});
