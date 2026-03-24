import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { zones, signaux, secteur, user_id } = await req.json()
    const results = []

    for (const zone of zones) {
      if (!signaux.includes('appel_offres_public') && 
          !signaux.includes('marche_notifie') &&
          !signaux.includes('contrat_expire')) continue

      const deptParam = zone.departement || zone.code_postal?.slice(0,2) || ''
      
      if (signaux.includes('appel_offres_public') && deptParam) {
        const url = `https://api.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records?` +
          `where=lieu_exec_code_dept="${deptParam}"` +
          `&order_by=dateparution desc&limit=15` +
          `&select=objet,acheteur_nom,lieu_exec_ville,dateparution,url_avis,ref_avis`

        const data = await fetch(url).then(r => r.json())
        
        for (const avis of data.results ?? []) {
          // Filtrage pertinence par secteur via GPT
          const pertinent = await checkPertinenceAO(avis.objet, secteur)
          if (!pertinent) continue
          
          results.push({
            signal_code: 'appel_offres_public',
            signal_source: 'boamp',
            nom: avis.acheteur_nom,
            detail: avis.objet,
            ville: avis.lieu_exec_ville,
            signal_date: avis.dateparution,
            score_pertinence: pertinent.score,
            user_id,
            zone_cible_id: zone.id,
          })
        }
      }

      const isMarcheNotifie = signaux.includes('marche_notifie');
      if (isMarcheNotifie && deptParam) {
        const url = `https://api.boamp.fr/api/explore/v2.1/catalog/datasets/boamp/records?` +
          `where=lieu_exec_code_dept="${deptParam}" AND typeavis="ATTRIBUTION"` +
          `&order_by=dateparution desc&limit=10`
        
        const data = await fetch(url).then(r => r.json())
        for (const avis of data.results ?? []) {
          results.push({
            signal_code: 'marche_notifie',
            signal_source: 'boamp',
            nom: avis.acheteur_nom,
            detail: `Marché attribué : ${avis.objet}`,
            ville: avis.lieu_exec_ville,
            user_id,
            zone_cible_id: zone.id,
          })
        }
      }
    }

    if (results.length > 0) {
      await supabase.from('opportunites').upsert(
        results.map(r => ({ ...r, type: 'salon', qualification: 'Nouveau' })),
        { onConflict: 'nom,user_id' }
      )
    }

    return new Response(JSON.stringify({ inserted: results.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

async function checkPertinenceAO(objet: string, secteur: string): Promise<{score: number} | null> {
  if (!secteur) return { score: 60 }
  const prompt = `L'appel d'offres suivant est-il pertinent pour un commercial en ${secteur} ?
Objet : "${objet}"
Réponds UNIQUEMENT avec un JSON : {"pertinent": true/false, "score": 0-100}
Score 0 = pas du tout pertinent, 100 = parfaitement pertinent.`
  
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('OPENAI_API_KEY')}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 50,
      response_format: { type: "json_object" }
    })
  })
  
  try {
    const data = await res.json()
    const result = JSON.parse(data.choices[0].message.content)
    return result.pertinent ? { score: result.score } : null
  } catch {
    return { score: 60 }
  }
}
