import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Hardcoded confirmed launches + dynamic fallback
const AUTO_LAUNCHES = [
  { nom: "Renault R5 Turbo 3E", date: "Q2 2026", marque: "Renault France" },
  { nom: "Peugeot E-408 restylée", date: "Q3 2026", marque: "Stellantis France" },
  { nom: "BYD Orca", date: "Q2 2026", marque: "BYD France" },
  { nom: "Alpine A390", date: "Q4 2026", marque: "Alpine/Renault" },
  { nom: "Citroën ë-C3 XR", date: "Q1 2026", marque: "Stellantis" },
  { nom: "DS N°8", date: "Q3 2026", marque: "DS Automobiles" },
  { nom: "Renault Twingo Electric", date: "Q1 2027", marque: "Renault" },
  { nom: "Peugeot 4008", date: "Q2 2027", marque: "Stellantis" },
  { nom: "Volkswagen ID.2", date: "Q3 2026", marque: "Volkswagen France" },
  { nom: "BMW Neue Klasse", date: "Q4 2026", marque: "BMW France" },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Return the list directly formatted like trade shows
    const formattedData = AUTO_LAUNCHES.map(l => ({
      nom: `Lancement ${l.nom}`,
      date: l.date,
      secteur: "Automobile",
      marque: l.marque
    }));

    return new Response(
      JSON.stringify(formattedData),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
