const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function checkData() {
  console.log('--- TEST 1 & 6 : Vérification de la table opportunites ---');
  
  // 1. Opportunités avec enrichissement (Total)
  const { data: enriched, error: e1 } = await supabase
    .from('opportunites')
    .select('id, nom, enrichissement')
    .not('enrichissement', 'is', null);
    
  if (e1) {
    console.error('Erreur SQL:', e1);
    return;
  }
  
  console.log(`Nombre total d'opportunités enrichies : ${enriched.length}`);
  if (enriched.length > 0) {
    console.log('Exemple de donnée enrichie (5 premières) :');
    enriched.slice(0, 5).forEach(o => {
      console.log(`- ${o.nom} : Found=${o.enrichissement.found}, SIREN=${o.enrichissement.siren || 'N/A'}`);
    });
  }

  // 2. Veille creation
  const { data: watchOpps, error: e2 } = await supabase
    .from('opportunites')
    .select('id, nom, enrichissement')
    .eq('enrichissement->>source', 'veille_creation');
    
  if (e2) {
    console.error('Erreur SQL (source):', e2);
  } else {
    console.log(`\nNombre d'opportunités issues de la veille (Test 6) : ${watchOpps.length}`);
    watchOpps.forEach(o => {
      console.log(`- [WATCH] ${o.nom} : ${o.enrichissement.date_creation}`);
    });
  }
}

checkData();
