import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { organizationName } = await req.json()
    const scraperUrl = Deno.env.get('LINKEDIN_SCRAPER_URL')
    const email = Deno.env.get('LINKEDIN_EMAIL')
    const password = Deno.env.get('LINKEDIN_PASSWORD')

    // Connexion LinkedIn
    await fetch(`${scraperUrl}/connect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    })

    // Attendre 3 secondes
    await new Promise(r => setTimeout(r, 3000))

    // Recherche contacts
    const response = await fetch(`${scraperUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        company: organizationName,
        titles: [
          'directeur communication',
          'responsable evenementiel',
          'directeur marketing',
          'brand manager',
          'event manager'
        ]
      })
    })

    const data = await response.json()
    console.log('Contacts trouvés:', JSON.stringify(data))

    return new Response(JSON.stringify({
      success: true,
      contacts: data.contacts || []
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error) {
    console.error('Erreur scraper:', error)
    return new Response(JSON.stringify({
      success: false,
      contacts: [],
      error: error.message
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
