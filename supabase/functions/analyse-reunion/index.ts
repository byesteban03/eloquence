import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Tu es l'assistant commercial de Scénographie France, agence de scénographie événementielle basée à Rennes (14 ans d'expérience, +1200 projets). Nos prestations : stands immersifs, scénographie événementielle, pop-up stores luxe, révélations automobiles, expositions muséographiques, soirées de gala, conventions entreprise. Clients références : Renault, Alpine, BYD, DS Automobiles, E.Leclerc, Groupama, Vieilles Charrues, Paris 2024, Westfield, Stade Rennais.

À partir de la transcription d'une réunion commerciale, tu dois retourner un JSON structuré EXACTEMENT avec ces champs :

- score_global (number 0-100)
- resume_tweet: string (1 phrase max 280 caractères, synthèse ultra-concise de la réunion, ton direct, pas de formule de politesse)
- indicateurs: { engagement: number, clarte_besoin: number, probabilite_conversion: number, budget_detecte: number, objections: number } (chacun 0-100)
- besoins_detectes: string[] (besoins exprimés par le prospect)
- prestations_recommandees: { nom_prestation: string, justification: string, emoji: string, pertinence: number }[]
- plan_action: string[] (exactement 3 actions prioritaires)
- resume: string (2 phrases de synthèse)
- prospect_nom: string
- prospect_secteur: string
- propositions_techniques: [
    {
      titre: string,
      description: string (2-3 phrases très techniques et précises, avec dimensions, matériaux, technologies),
      elements: string[] (éléments concrets : mobilier, éclairage, structure, technologie, parcours),
      budget_estime: string,
      emoji: string
    }
  ] (génère 2-3 propositions de scénographie très précises et créatives basées EXACTEMENT sur ce qui a été dit. Sois spécifique : dimensions, matériaux, technologies LED/projection, ambiance lumineuse, parcours visiteur.)
- email_suivi: {
    objet: string (objet de l'email court et accrocheur),
    corps: string (email complet professionnel, ton chaleureux mais business, rappelle les besoins exacts du prospect, propose une prochaine étape concrète, signé 'Esteban — Scénographie France')
  }
- budget_detecte: string | null (montant ou fourchette exact mentionné, ex: '80 000 - 100 000€', null si non mentionné)
- deadline_detectee: string | null (date ou période exacte mentionnée, ex: 'Septembre 2026', null si non mentionnée)
- concurrents_mentionnes: string[] (noms des concurrents ou agences concurrentes cités)
- decideurs_identifies: string[] (noms et/ou postes des déciseurs mentionnés)
- mots_cles: string[] (5-8 mots-clés essentiels extraits de la réunion)

- ton_prospect: {
    valeur: "enthousiaste" | "réticent" | "pressé" | "neutre",
    evolution: "monte" | "descend" | "stable",
    evolution_detail: string (1 phrase expliquant comment le ton a évolué au fil de la réunion),
    phrases_revelatrices: string[] (2-3 phrases exactes du prospect qui révèlent son ton)
  }

- objections_verbatim: [
    {
      phrase: string (la phrase exacte ou quasi-exacte de l'objection),
      type: "budget" | "timing" | "concurrent" | "technique" | "interne" | "autre",
      severite: "bloquante" | "modérée" | "légère"
    }
  ] (liste vide [] si aucune objection)

- signaux_achat: string[] (phrases exactes du prospect indiquant un signal positif d'achat : "on a le budget", "c'est urgent", "je veux avancer vite", etc. Liste vide [] si aucun signal)

- questions_prospect: string[] (questions exactes ou quasi-exactes posées par le prospect durant la réunion, révélatrices de ses préoccupations réelles)

- maturite_decisionnelle: {
    niveau: "découverte" | "comparaison" | "validation" | "ready_to_sign",
    confiance: number (0-100, niveau de confiance dans cette évaluation),
    justification: string (1-2 phrases expliquant pourquoi ce niveau de maturité)
  }

- coherence_discours: {
    score: number (0-100, 100 = discours parfaitement cohérent),
    contradictions: [
      {
        enonce_1: string,
        enonce_2: string,
        interpretation: string (ce que cette contradiction peut signifier)
      }
    ] (liste vide [] si aucune contradiction détectée)
  }

- prochaine_action_prioritaire: {
    action: string (action concrète et précise à effectuer),
    date_suggeree: string | null (date ISO 8601 suggérée pour cette action, ex: "2026-04-06T09:00:00", null si impossible à estimer),
    raison: string (pourquoi cette action en priorité)
  }

Retourne UNIQUEMENT du JSON valide, aucun texte autour, aucune explication.`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { transcription, mode } = await req.json()
    if (!transcription) {
      throw new Error('Transcription is missing')
    }

    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!openAiApiKey) throw new Error('OPENAI_API_KEY environment variable is missing');

    let systemMsg = SYSTEM_PROMPT;
    let format = { type: "json_object" };
    let userMsg = `Voici la transcription de la réunion :\n\n"${transcription}"\n\nMerci de renvoyer uniquement le JSON d'analyse.`;

    if (mode === 'message') {
      systemMsg = "Tu es un expert en prospection B2B. Génère uniquement le texte du message de prospection demandé, avec le bon prénom, sans aucun format JSON, sans introduction ni conclusion.";
      // @ts-ignore
      format = { type: "text" };
      userMsg = transcription;
    } else if (mode === 'prospect-score') {
      systemMsg = `Tu es l'assistant de qualification de Scénographie France, agence de scénographie événementielle.
Nous cherchons des prospects (exposants salons, organisateurs d'anniversaires, constructeurs automobiles).
Calcule la pertinence d'une opportunité sur 100 en te basant sur ces critères métiers :
+30 si "Automobile", "Tech", "Luxe", "Industrie", "Cosmétique", "Agroalimentaire" ou "Événementiel"
+20 si c'est un "lancement" ou un gros salon international ou anniversaire important
+20 selon l'urgence (< 6 mois)
+30 selon cohérence globale avec de la scénographie de stand

Renvoie UNIQUEMENT un JSON de cette forme exacte : {"score_pertinence": 85}`;
      format = { type: "json_object" };
      userMsg = `Voici l'opportunité à scorer :\n\n${transcription}`;
    }

    console.log("Analyzing with mode:", mode);

    const bodyData: any = {
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemMsg },
        { role: 'user', content: userMsg }
      ],
      temperature: 0.7,
    };

    if (mode !== 'message') {
      bodyData.response_format = format;
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyData),
    });

    const result = await response.json();
    if (!response.ok) {
      console.error("OpenAI Error:", result.error);
      throw new Error(result.error?.message || 'Error with OpenAI API');
    }

    const resultContent = result.choices[0].message.content;

    if (mode === 'message') {
      return new Response(JSON.stringify({ message: resultContent }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const analysis = JSON.parse(resultContent);

    // ── Matching opportunité ──────────────────────────────────────────────────
    let opportunite_id: string | null = null;

    if (supabaseUrl && supabaseKey && analysis.prospect_nom) {
      try {
        const supabase = createClient(supabaseUrl, supabaseKey);
        const { data: opps } = await supabase
          .from('opportunites')
          .select('id, nom')
          .or(`nom.ilike.%${analysis.prospect_nom}%,detail.ilike.%${analysis.prospect_nom}%`)
          .limit(1);

        if (opps && opps.length > 0) {
          opportunite_id = opps[0].id;
          console.log('🔗 Match opportunité:', opps[0].nom);

          // Si la maturité est ready_to_sign → forcer qualification chaud
          if (analysis.maturite_decisionnelle?.niveau === 'ready_to_sign') {
            await supabase
              .from('opportunites')
              .update({ qualification: 'Qualifié chaud' })
              .eq('id', opportunite_id);
            console.log('🔥 Opportunité mise à jour : Qualifié chaud');
          }
        }
      } catch (matchErr) {
        console.error('Erreur matching opportunité (non bloquant):', matchErr);
      }
    }

    return new Response(
      JSON.stringify({ analysis, opportunite_id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error("Analysis Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
