import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_ANON_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Parallel calls to our own edge functions
    const [salonsRes, anniversairesRes, autoRes] = await Promise.all([
      supabase.functions.invoke('search-salons'),
      supabase.functions.invoke('search-anniversaires'),
      supabase.functions.invoke('search-lancements-auto')
    ]);

    const salons = salonsRes.data?.salons || salonsRes.data || [];
    const anniversaires = anniversairesRes.data?.anniversaires || anniversairesRes.data || [];
    const autos = autoRes.data || [];

    // LIMITS: 8 salons, 7 anniversaires, 5 auto
    const limitedSalons = salons.slice(0, 8);
    const limitedAnnivs = anniversaires.slice(0, 7);
    const limitedAutos = autos.slice(0, 5);

    const opportunitesToInsert = [];
    const now = new Date().toISOString();

    // Map salons
    for (const salon of limitedSalons) {
      opportunitesToInsert.push({
        nom: salon.nom,
        type: 'salon',
        detail: `${salon.date} · ${salon.lieu}`,
        secteur: salon.secteur || 'Événementiel',
        created_at: now,
        qualification: 'Non qualifié',
        score_pertinence: 0
      });
    }

    // Map anniversaires
    for (const anniv of limitedAnnivs) {
      opportunitesToInsert.push({
        nom: anniv.nom,
        type: 'anniversaire',
        detail: `Anniversaire ${anniv.type_anniversaire} en ${anniv.annee_anniversaire}`,
        created_at: now,
        qualification: 'Non qualifié',
        score_pertinence: 0
      });
    }

    // Map auto launches
    for (const auto of limitedAutos) {
      opportunitesToInsert.push({
        nom: auto.nom,
        type: 'auto',
        detail: `${auto.date} · ${auto.marque}`,
        secteur: auto.secteur || 'Automobile',
        created_at: now,
        qualification: 'Non qualifié',
        score_pertinence: 0
      });
    }

    // Score all opportunities concurrently using the AI Edge Function
    if (opportunitesToInsert.length > 0) {
      // Create a batch of promises to get score_pertinence for each opportunity
      const scorePromises = opportunitesToInsert.map(async (opp) => {
        try {
          const aiRes = await supabase.functions.invoke('analyse-reunion', {
            body: { 
              transcription: `Type: ${opp.type}, Nom: ${opp.nom}, Secteur: ${opp.secteur || 'Inconnu'}, Détail: ${opp.detail}`, 
              mode: 'prospect-score' 
            }
          });
          
          if (aiRes.data && aiRes.data.analysis && typeof aiRes.data.analysis.score_pertinence === 'number') {
            opp.score_pertinence = aiRes.data.analysis.score_pertinence;
            // Auto qualify if score is high
            if (opp.score_pertinence >= 80) opp.qualification = 'Qualifié chaud';
            else if (opp.score_pertinence >= 60) opp.qualification = 'À contacter';
          }
        } catch (e) {
          console.error(`Failed to score ${opp.nom}:`, e);
          // Keep default score_pertinence = 0
        }
      });
      
      await Promise.all(scorePromises);
    }

    // Insert into Supabase table 'opportunites' with upsert on 'nom'
    if (opportunitesToInsert.length > 0) {
      const { error } = await supabase
        .from('opportunites')
        .upsert(opportunitesToInsert, { onConflict: 'nom' })
        
      if (error) throw error;
    }

    return new Response(JSON.stringify({ 
      success: true, 
      insertedCount: opportunitesToInsert.length 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
