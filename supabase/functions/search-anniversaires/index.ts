import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const HARDCODED_ANNIVERSARIES = [
  { nom: 'Sojasun', date_creation: '1988-04-12', annee_anniversaire: 40, type_anniversaire: '40', date_anniv: '2028-04-12' },
  { nom: 'Blablacar', date_creation: '2006-09-01', annee_anniversaire: 20, type_anniversaire: '20', date_anniv: '2026-09-01' },
  { nom: 'Deezer', date_creation: '2007-08-22', annee_anniversaire: 20, type_anniversaire: '20', date_anniv: '2027-08-22' },
  { nom: 'Doctolib', date_creation: '2013-12-05', annee_anniversaire: 15, type_anniversaire: '15', date_anniv: '2028-12-05' },
  { nom: 'Leboncoin', date_creation: '2006-03-31', annee_anniversaire: 20, type_anniversaire: '20', date_anniv: '2026-03-31' },
  { nom: 'Voodoo', date_creation: '2013-05-15', annee_anniversaire: 15, type_anniversaire: '15', date_anniv: '2028-05-15' },
  { nom: 'Mirakl', date_creation: '2012-06-08', annee_anniversaire: 15, type_anniversaire: '15', date_anniv: '2027-06-08' }
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Return mock data for Sirene API demonstration
    const anniversaires = [...HARDCODED_ANNIVERSARIES];

    return new Response(JSON.stringify({ anniversaires }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error: any) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
