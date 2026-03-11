import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SYSTEM_PROMPT = `Tu es l'assistant commercial de Scénographie France, agence de scénographie événementielle basée à Rennes (14 ans d'expérience, +1200 projets). Nos prestations : stands immersifs, scénographie événementielle, pop-up stores luxe, révélations automobiles, expositions muséographiques, soirées de gala, conventions entreprise. Clients références : Renault, Alpine, BYD, DS Automobiles, E.Leclerc, Groupama, Vieilles Charrues, Paris 2024, Westfield, Stade Rennais.

À partir de la transcription d'une réunion commerciale, tu dois retourner un JSON structuré EXACTEMENT avec ces champs :

- score_global (number 0-100)
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
  ] (génère 2-3 propositions de scénographie très précises et créatives basées EXACTEMENT sur ce qui a été dit. Sois spécifique : dimensions, matériaux, technologies LED/projection, ambiance lumineuse, parcours visiteur. Pense comme un scénographe expert.)
- email_suivi: {
    objet: string (objet de l'email court et accrocheur),
    corps: string (email complet professionnel, ton chaleureux mais business, rappelle les besoins exacts du prospect, propose une prochaine étape concrète, signé 'Esteban — Scénographie France')
  }
- budget_detecte: string | null (montant ou fourchette exact mentionné, ex: '80 000 - 100 000€', null si non mentionné)
- deadline_detectee: string | null (date ou période exacte mentionnée, ex: 'Septembre 2026', null si non mentionnée)
- concurrents_mentionnes: string[] (noms des concurrents ou agences concurrentes cités)
- decideurs_identifies: string[] (noms et/ou postes des décideurs mentionnés)
- mots_cles: string[] (5-8 mots-clés essentiels extraits de la réunion)

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
    
    if (!openAiApiKey) {
      throw new Error('OPENAI_API_KEY environment variable is missing');
    }

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

    const analysis = JSON.parse(resultContent); // parse the JSON from GPT

    return new Response(
      JSON.stringify({ analysis }),
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
