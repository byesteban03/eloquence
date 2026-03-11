import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();

const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY
);

async function run() {
  console.log('Testing transcribe-audio Edge Function...');
  // A tiny valid blank audio in base64 (this is a literal wave header with no data or just nonsense, 
  // actually let's just send 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEF/AAACABAAZGF0YQAAAAA=')
  const base64Audio = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEF/AAACABAAZGF0YQAAAAA=';
  
  try {
    const { data, error } = await supabase.functions.invoke('transcribe-audio', {
      body: { audioBase64: base64Audio, duration: 100 }
    });
    
    console.log('Response DATA:', data);
    console.log('Response ERROR:', error);
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

run();
