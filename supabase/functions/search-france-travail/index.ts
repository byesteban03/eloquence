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

    const { zones, signaux, user_id } = await req.json()
    if (!signaux.includes('recrutement_massif')) {
      return new Response(JSON.stringify({ inserted: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const results = []
    const FT_TOKEN = Deno.env.get('FRANCE_TRAVAIL_TOKEN')
    
    for (const zone of zones) {
      const dept = zone.departement || zone.code_postal?.slice(0,2)
      if (!dept) continue;
      
      const url = `https://api.francetravail.io/partenaire/offresdemploi/v2/offres/search?` +
        `departement=${dept}&range=0-149`
      
      const resFT = await fetch(url, {
        headers: { 'Authorization': `Bearer ${FT_TOKEN}` }
      })
      
      if (!resFT.ok) continue;
      const data = await resFT.json()

      // Grouper par entreprise et compter
      const countByEntreprise: Record<string, number> = {}
      for (const offre of data.resultats ?? []) {
        const nom = offre.entreprise?.nom
        if (nom) countByEntreprise[nom] = (countByEntreprise[nom] || 0) + 1
      }

      // Garder seulement les entreprises avec 5+ offres (recrutement massif)
      for (const [nom, count] of Object.entries(countByEntreprise)) {
        if (count < 5) continue
        results.push({
          signal_code: 'recrutement_massif',
          signal_source: 'france_travail',
          nom,
          detail: `${count} offres d'emploi actives · Signal de croissance`,
          ville: zone.ville,
          score_pertinence: count >= 20 ? 85 : count >= 10 ? 70 : 60,
          user_id,
          zone_cible_id: zone.id,
        })
      }
    }

    if (results.length > 0) {
      await supabase.from('opportunites').upsert(
        results.map(r => ({ ...r, type: 'anniversaire', qualification: 'Nouveau' })),
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
