import { createClient } from '@supabase/supabase-js';
import fs from 'fs';

const envContent = fs.readFileSync('.env', 'utf-8');
const env = Object.fromEntries(
  envContent.split('\n')
    .filter(line => line.includes('='))
    .map(line => line.split('='))
);

const supabaseUrl = env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

console.log('URL:', supabaseUrl);
console.log('KEY:', supabaseAnonKey ? supabaseAnonKey.substring(0, 10) + '...' : 'MISSING');

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Testing transcribe-audio Edge Function...');
  const base64Audio = 'UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEF/AAACABAAZGF0YQAAAAA=';
  
  try {
    const { data, error } = await supabase.functions.invoke('transcribe-audio', {
      body: { audioBase64: base64Audio, duration: 100 }
    });
    
    console.log('Response DATA:', data);
    if (error && error.context) {
      try {
        const errBody = await error.context.json();
        console.log('Response ERROR Context Body:', errBody);
      } catch(e) {
        console.log('Response ERROR Context Text:', await error.context.text());
      }
    } else {
      console.log('Response ERROR:', error);
    }
  } catch (err) {
    console.error('Fetch error:', err.message);
  }
}

run();
