import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const NAF_BY_SECTEUR: Record<string, string> = {
  'Événementiel & Scénographie': '90',
  'BTP & Construction': '41',
  'IT & SaaS': '62',
  'Formation': '85',
  'Conseil': '70',
  'Automobile': '45',
  'Luxe & Mode': '47',
  'Santé & Pharma': '86',
  'Finance & Assurance': '64',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { zones, signaux, secteur, user_id } = await req.json()
    const anneeCourante = new Date().getFullYear()
    const results = []

    for (const zone of zones) {
      // Anniversaires d'entreprise
      if (signaux.includes('anniversaire_entreprise') || 
          signaux.includes('anniversaire_predictif')) {
        
        const anneesAnniversaire = [5,10,15,20,25,30,40,50,75,100]
          .map(n => anneeCourante - n)

        for (const annee of anneesAnniversaire) {
          const nbAns = anneeCourante - annee
          let url = buildDataGouvUrl(zone)
          url += `&date_creation_min=${annee}-01-01&date_creation_max=${annee}-12-31`
          url += `&per_page=10`
          
          if (secteur && NAF_BY_SECTEUR[secteur]) {
            url += `&activite_principale=${NAF_BY_SECTEUR[secteur]}`
          }

          const data = await fetch(url).then(r => r.json())
          
          for (const ent of data.results ?? []) {
            const dateAnnivStr = `${anneeCourante}-${ent.date_creation?.slice(5)}`
            const dateAnniv = new Date(dateAnnivStr)
            const daysUntil = Math.floor((dateAnniv.getTime() - Date.now()) / 86400000)
            const isPredictif = daysUntil > 0 && daysUntil <= 90

            results.push({
              signal_code: isPredictif ? 'anniversaire_predictif' : 'anniversaire_entreprise',
              signal_source: 'data_gouv',
              nom: `${ent.nom_complet} — ${nbAns} ans`,
              detail: `Fondée en ${annee} · ${nbAns} ans${isPredictif ? ` · Dans ${daysUntil} jours` : ''}`,
              ville: ent.siege?.libelle_commune,
              departement: ent.siege?.code_postal?.slice(0,2),
              latitude: ent.siege?.latitude,
              longitude: ent.siege?.longitude,
              signal_date: dateAnnivStr,
              score_pertinence: nbAns >= 20 ? 75 : 60,
              fenetre_optimale_debut: isPredictif ? new Date().toISOString() : null,
              fenetre_optimale_fin: isPredictif ? 
                new Date(Date.now() + daysUntil * 86400000).toISOString() : null,
              user_id,
              zone_cible_id: zone.id,
              enrichissement: {
                siren: ent.siren,
                secteur: ent.libelle_activite_principale,
                code_naf: ent.activite_principale,
                adresse: `${ent.siege?.adresse_ligne_1}, ${ent.siege?.code_postal} ${ent.siege?.libelle_commune}`,
              }
            })
          }
        }
      }

      // Nouveaux établissements
      if (signaux.includes('nouveau_etablissement')) {
        const dateMois = new Date()
        dateMois.setMonth(dateMois.getMonth() - 3)
        let url = buildDataGouvUrl(zone)
        url += `&date_mise_a_jour_min=${dateMois.toISOString().split('T')[0]}`
        url += `&etat_administratif=A&per_page=15`
        
        const data = await fetch(url).then(r => r.json())
        for (const ent of data.results ?? []) {
          if (ent.nombre_etablissements < 2) continue
          results.push({
            signal_code: 'nouveau_etablissement',
            signal_source: 'data_gouv',
            nom: ent.nom_complet,
            detail: `${ent.nombre_etablissements} établissements · Expansion récente`,
            ville: ent.siege?.libelle_commune,
            latitude: ent.siege?.latitude,
            longitude: ent.siege?.longitude,
            user_id,
            zone_cible_id: zone.id,
            enrichissement: {
              siren: ent.siren,
              nombre_etablissements: ent.nombre_etablissements,
            }
          })
        }
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

function buildDataGouvUrl(zone: any): string {
  const base = 'https://recherche-entreprises.api.gouv.fr/search?'
  if (zone.type === 'ville' || zone.type === 'code_postal') return base + `code_postal=${zone.code_postal}`
  if (zone.type === 'departement') return base + `departement=${zone.departement}`
  if (zone.type === 'region') return base + `region=${zone.region}`
  return base + 'per_page=10'
}
