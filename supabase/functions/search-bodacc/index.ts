import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const BODACC_API = 'https://bodacc-datadila.opendatasoft.com/api/explore/v2.1'

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { zones, signaux, user_id } = await req.json()
    const results = []

    for (const zone of zones) {
      const geoParam = buildGeoParam(zone)
      if (!geoParam) continue;

      // Créations d'entreprise
      if (signaux.includes('creation_entreprise')) {
        const url = `${BODACC_API}/catalog/datasets/annonces-commerciales/records?` +
          `where=typeavis="CREATION" AND ${geoParam}` +
          `&order_by=dateparution desc&limit=20`
        const data = await fetch(url).then(r => r.json())
        for (const rec of data.results ?? []) {
          results.push({
            signal_code: 'creation_entreprise',
            signal_source: 'bodacc',
            nom: rec.registre || rec.denomination,
            detail: `Création le ${rec.dateparution} · ${rec.ville}`,
            ville: rec.ville,
            signal_date: rec.dateparution,
            user_id,
            zone_cible_id: zone.id,
          })
        }
      }

      // Fusions & acquisitions
      if (signaux.includes('fusion_acquisition')) {
        const url = `${BODACC_API}/catalog/datasets/annonces-commerciales/records?` +
          `where=typeavis IN ("VENTE","CESSION") AND ${geoParam}` +
          `&order_by=dateparution desc&limit=20`
        const data = await fetch(url).then(r => r.json())
        for (const rec of data.results ?? []) {
          results.push({
            signal_code: 'fusion_acquisition',
            signal_source: 'bodacc',
            nom: rec.denomination,
            detail: `${rec.typeavis} le ${rec.dateparution}`,
            ville: rec.ville,
            signal_date: rec.dateparution,
            user_id,
            zone_cible_id: zone.id,
          })
        }
      }

      // Déménagements
      if (signaux.includes('demenagement_siege')) {
        const url = `${BODACC_API}/catalog/datasets/annonces-commerciales/records?` +
          `where=typeavis="MODIFICATION" AND ${geoParam}` +
          `&refine=famille:"Transfert de siège"` +
          `&order_by=dateparution desc&limit=20`
        const data = await fetch(url).then(r => r.json())
        for (const rec of data.results ?? []) {
          results.push({
            signal_code: 'demenagement_siege',
            signal_source: 'bodacc',
            nom: rec.denomination,
            detail: `Transfert siège le ${rec.dateparution}`,
            ville: rec.ville,
            signal_date: rec.dateparution,
            user_id,
            zone_cible_id: zone.id,
          })
        }
      }
    }

    // Insérer en DB
    if (results.length > 0) {
      await supabase.from('opportunites').upsert(
        results.map(r => ({
          ...r,
          type: 'anniversaire', // ou un type par défaut approprié
          qualification: 'Nouveau',
          score_pertinence: 50,
        })),
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

function buildGeoParam(zone: any): string {
  if (zone.type === 'ville' || zone.type === 'code_postal') {
    return `cp="${zone.code_postal}"`
  } else if (zone.type === 'departement') {
    return `cp LIKE "${zone.departement}%"`
  } else if (zone.type === 'region') {
    return `region="${zone.region}"`
  }
  return ''
}
