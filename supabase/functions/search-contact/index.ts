import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TITRES_PRIORITAIRES = [
  // Communication
  'Directeur Communication', 'Directrice Communication',
  'Responsable Communication', 'Head of Communications',
  'Chief Communications Officer', 'CCO',
  'VP Communication', 'VP Communications',
  // Événementiel
  'Directeur Événementiel', 'Directrice Événementielle',
  'Responsable Événementiel', 'Event Manager',
  'Head of Events', 'Events Director',
  'Responsable Organisation Événements',
  'Chef de Projet Événementiel',
  'Chargé Événementiel',
  // Marketing
  'Directeur Marketing', 'Directrice Marketing',
  'Chief Marketing Officer', 'CMO',
  'VP Marketing', 'Head of Marketing',
  'Responsable Marketing',
  'Brand Manager', 'Brand Director',
  'Directeur de la Marque',
  // Communication externe
  'Responsable Relations Presse',
  'Directeur Relations Publiques',
  'Head of PR', 'PR Manager',
  'Responsable Partenariats',
  'Sponsoring Manager',
  // Direction générale (fallback)
  'Directeur Général', 'DG', 'CEO',
  'Président', 'PDG'
]

// FONCTION APOLLO GÉNÉRIQUE
async function apolloSearch(params: any) {
  try {
    const apikey = Deno.env.get('APOLLO_API_KEY')
    const response = await fetch('https://api.apollo.io/api/v1/mixed_people/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
      },
      body: JSON.stringify({
        api_key: apikey,
        ...params
      })
    })
    const data = await response.json()
    console.log(`[Apollo] Query: ${params.q_organization_name || params.q_organization_domains}, Status: ${response.status}, Found: ${data?.people?.length || 0}`)
    return data?.people || []
  } catch (e) {
    console.error('Apollo error:', e)
    return []
  }
}

// SCORE DE PERTINENCE DU CONTACT
function calculerScorePertinence(title: string) {
  if (!title) return 1
  const t = title.toLowerCase()
  if (t.includes('communicat') || t.includes('event')) return 3 // ★★★
  if (t.includes('market') || t.includes('brand') || t.includes('pr')) return 2 // ★★
  return 1 // ★
}

// FORMAT UNIFORME DES CONTACTS
function formatContacts(people: any[], organizationName: string) {
  return {
    fallback: false,
    contacts: people.slice(0, 3).map(p => ({
      nom: (p.first_name || '') + ' ' + (p.last_name || ''),
      titre: p.title || 'Poste inconnu',
      email: p.email || null,
      linkedin_url: p.linkedin_url || null,
      photo_url: p.photo_url || null,
      organisation: p.organization?.name || organizationName,
      score_pertinence: calculerScorePertinence(p.title)
    }))
  }
}

// PASSES DE RECHERCHE
async function passe1(orgName: string) {
  return await apolloSearch({
    q_organization_name: orgName,
    person_titles: TITRES_PRIORITAIRES.slice(0, 15),
    person_locations: ['France'],
    per_page: 5
  })
}

async function passe2(orgName: string) {
  const clean = orgName.replace(/\b(groupe|group|france|sa|sas|sarl|inc|ltd)\b/gi, '').trim()
  return await apolloSearch({
    q_organization_name: clean,
    person_titles: TITRES_PRIORITAIRES.slice(0, 20),
    per_page: 5
  })
}

async function passe3(orgName: string) {
  return await apolloSearch({
    q_organization_name: orgName.split(' ')[0],
    person_titles: TITRES_PRIORITAIRES,
    per_page: 5
  })
}

async function passe4(orgName: string) {
  const first = orgName.split(' ')[0].toLowerCase()
  const domains = [first + '.fr', first + '.com']
  for (const domain of domains) {
    const res = await apolloSearch({ q_organization_domains: [domain], person_titles: TITRES_PRIORITAIRES, per_page: 5 })
    if (res.length > 0) return res
  }
  return []
}

async function passe5(orgName: string) {
  const clean = orgName.replace(/\b(groupe|group|france|sa|sas)\b/gi, '').trim()
  const results = await apolloSearch({ q_organization_name: clean, per_page: 20 })
  return results.filter((p: any) => {
    const t = (p.title || '').toLowerCase()
    return t.includes('communicat') || t.includes('event') || t.includes('market') || t.includes('brand') || t.includes('directeur') || t.includes('responsable')
  })
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { organizationName } = await req.json()
    if (!organizationName) return new Response(JSON.stringify({ contacts: [] }), { headers: corsHeaders })

    let res = await passe1(organizationName)
    if (res.length > 0) return new Response(JSON.stringify(formatContacts(res, organizationName)), { headers: corsHeaders })

    res = await passe2(organizationName)
    if (res.length > 0) return new Response(JSON.stringify(formatContacts(res, organizationName)), { headers: corsHeaders })

    res = await passe3(organizationName)
    if (res.length > 0) return new Response(JSON.stringify(formatContacts(res, organizationName)), { headers: corsHeaders })

    res = await passe4(organizationName)
    if (res.length > 0) return new Response(JSON.stringify(formatContacts(res, organizationName)), { headers: corsHeaders })

    res = await passe5(organizationName)
    if (res.length > 0) return new Response(JSON.stringify(formatContacts(res, organizationName)), { headers: corsHeaders })

    return new Response(JSON.stringify({
      fallback: true,
      contacts: [],
      recherche_linkedin: `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(organizationName + ' directeur communication')}`,
      recherche_google: `https://www.google.com/search?q=${encodeURIComponent('"' + organizationName + '" directeur communication site:linkedin.com')}`
    }), { headers: corsHeaders })
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), { status: 400, headers: corsHeaders })
  }
})
