import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Duplication des constantes pour l'Edge Function (Deno)
const SIGNAUX_PAR_PLAN: Record<string, string[]> = {
  free: ['creation_entreprise', 'anniversaire_entreprise'],
  pro: [
    'creation_entreprise', 'anniversaire_entreprise', 'fusion_acquisition', 
    'changement_dirigeant', 'demenagement_siege', 'radiation_liquidation', 
    'depot_brevet', 'recrutement_massif', 'nouveau_etablissement', 
    'levee_fonds', 'appel_offres_public', 'permis_construire', 
    'anniversaire_predictif', 'creation_association', 'salon_professionnel', 
    'lancement_produit'
  ],
  team: [
    'creation_entreprise', 'anniversaire_entreprise', 'fusion_acquisition', 
    'changement_dirigeant', 'demenagement_siege', 'radiation_liquidation', 
    'depot_brevet', 'recrutement_massif', 'nouveau_etablissement', 
    'levee_fonds', 'appel_offres_public', 'marche_notifie', 
    'permis_construire', 'anniversaire_predictif', 'contrat_expire', 
    'creation_association', 'salon_professionnel', 'lancement_produit'
  ],
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') || ''
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''
    const supabase = createClient(supabaseUrl, supabaseKey)

    const authHeader = req.headers.get('Authorization')
    const { data: { user } } = await supabase.auth.getUser(
      authHeader?.replace('Bearer ', '')
    )
    if (!user) return new Response('Unauthorized', { status: 401 })

    // 1. Récupérer le profil utilisateur
    const { data: profile } = await supabase
      .from('profiles')
      .select('secteur, plan')
      .eq('id', user.id)
      .single()

    const plan = profile?.plan || 'free'
    const secteur = profile?.secteur || ''

    // 2. Récupérer les zones actives selon le plan
    const maxZones = plan === 'free' ? 1 : plan === 'pro' ? 5 : 999
    const { data: zones } = await supabase
      .from('zones_cibles')
      .select('*')
      .eq('user_id', user.id)
      .eq('active', true)
      .limit(maxZones)

    // 3. Récupérer les signaux actifs selon le plan
    const { data: signauxConfig } = await supabase
      .from('types_signaux')
      .select('code')
      .eq('user_id', user.id)
      .eq('active', true)

    const signauxActifs = signauxConfig?.map(s => s.code) || 
      ['creation_entreprise', 'anniversaire_entreprise'] // défaut free

    // Limiter selon le plan
    const signauxAllowed = SIGNAUX_PAR_PLAN[plan] || SIGNAUX_PAR_PLAN.free
    const signaux = signauxActifs.filter(s => signauxAllowed.includes(s))

    // 4. Appeler les Edge Functions de détection en parallèle
    const payload = { zones: zones || [], signaux, secteur, user_id: user.id }
    
    // Headers pour l'invocation interne
    const internalHeaders = { Authorization: authHeader || '' }

    await Promise.allSettled([
      supabase.functions.invoke('search-bodacc', { body: payload, headers: internalHeaders }),
      supabase.functions.invoke('search-data-gouv', { body: payload, headers: internalHeaders }),
      supabase.functions.invoke('search-boamp', { body: payload, headers: internalHeaders }),
      supabase.functions.invoke('search-france-travail', { body: payload, headers: internalHeaders }),
    ])

    // 5. Corrélation de signaux (Pro+)
    if (plan !== 'free') {
      await correlateSignaux(supabase, user.id)
    }

    // 6. Scoring global
    await scoreOpportunites(supabase, user.id, plan)

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    console.error("Refresh Error:", error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})

async function correlateSignaux(supabase: any, userId: string) {
  // Grouper les opportunités de la dernière semaine par SIREN
  const { data: opps } = await supabase
    .from('opportunites')
    .select('*')
    .eq('user_id', userId)
    .gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())

  const bySiren: Record<string, any[]> = {}
  for (const opp of opps || []) {
    const siren = opp.enrichissement?.siren
    if (!siren) continue
    if (!bySiren[siren]) bySiren[siren] = []
    bySiren[siren].push(opp)
  }

  // Si une entreprise a 2+ signaux → créer une opportunité croisée
  for (const [siren, oppsEntreprise] of Object.entries(bySiren)) {
    if (oppsEntreprise.length < 2) continue
    
    const signaux = oppsEntreprise.map(o => o.signal_code)
    const bonusScore = Math.min(signaux.length * 15, 30)
    
    // Mettre à jour le score de la plus récente
    const latest = oppsEntreprise.sort((a,b) => 
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )[0]
    
    await supabase.from('opportunites').update({
      signaux_croises: signaux,
      score_pertinence_v2: Math.min((latest.score_pertinence || 50) + bonusScore, 100),
      qualification: bonusScore >= 25 ? 'Qualifié chaud' : latest.qualification,
    }).eq('id', latest.id)
  }
}

async function scoreOpportunites(supabase: any, userId: string, plan: string) {
  const { data: opps } = await supabase
    .from('opportunites')
    .select('*')
    .eq('user_id', userId)
    .is('score_pertinence_v2', null)
    .limit(50)

  for (const opp of opps || []) {
    let score = opp.score_pertinence || 50

    // Bonus fenêtre temporelle
    if (opp.fenetre_optimale_debut && opp.fenetre_optimale_fin) {
      const now = Date.now()
      const debut = new Date(opp.fenetre_optimale_debut).getTime()
      const fin = new Date(opp.fenetre_optimale_fin).getTime()
      if (now >= debut && now <= fin) score += 15
    }

    // Bonus données financières
    const enrichissement = opp.enrichissement || {}
    if (enrichissement.chiffre_affaires > 10_000_000) score += 10
    if (enrichissement.nombre_etablissements > 5) score += 5
    if (enrichissement.dirigeants?.length > 0) score += 5

    // Score warmth : réunion passée avec cette entreprise
    try {
      const { count } = await supabase
        .from('reunions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', userId)
        .ilike('prospect_nom', `%${opp.nom?.split(' ')[0]}%`)

      if (count && count > 0) score += 20
    } catch (e) {
      console.warn("Could not check reunions for scoring:", e.message)
    }

    await supabase.from('opportunites').update({
      score_pertinence_v2: Math.min(score, 100),
      score_global_v2: Math.min(score, 100),
    }).eq('id', opp.id)
  }
}
