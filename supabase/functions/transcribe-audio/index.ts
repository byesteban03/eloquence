import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  console.log(`Incoming request: ${req.method} ${req.url}`);

  if (req.method === 'OPTIONS') {
    console.log('Handling OPTIONS request for CORS preflight.');
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    console.log('Attempting to parse request body as JSON.');
    const { audioBase64, duration } = await req.json()
    console.log('Body received. Audio base64 length:', audioBase64?.length ?? 'UNDEFINED', 'Duration:', duration);
    
    if (!audioBase64) {
      console.error('Validation Error: Audio data (audioBase64) is missing from the request body.');
      throw new Error('Audio data is missing');
    }

    console.log('Starting base64 to Blob conversion.');
    // Convert base64 string to a Blob
    const binaryStr = atob(audioBase64);
    const bytes = new Uint8Array(binaryStr.length);
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    const audioBlob = new Blob([bytes], { type: 'audio/webm' });
    console.log('Base64 to Blob conversion complete. Blob size:', audioBlob.size, 'bytes.');

    const formData = new FormData();
    formData.append('file', audioBlob, 'audio.webm');
    formData.append('model', 'whisper-1');
    console.log('FormData created with audio file and model.');

    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    
    if (!openAiApiKey) {
      console.error('Configuration Error: OPENAI_API_KEY environment variable is missing.');
      throw new Error('OPENAI_API_KEY environment variable is missing');
    }

    console.log("Initiating audio transcription with OpenAI Whisper API. Duration:", duration, "ms.");

    const openAiApiUrl = 'https://api.openai.com/v1/audio/transcriptions';
    console.log(`Fetching from OpenAI API: ${openAiApiUrl}`);
    const response = await fetch(openAiApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openAiApiKey}`,
      },
      body: formData,
    });

    console.log(`OpenAI API response status: ${response.status}`);
    const result = await response.json();
    
    if (!response.ok) {
      console.error("OpenAI API Error Response:", JSON.stringify(result));
      throw new Error(result.error?.message || 'Error transcribing audio');
    }

    console.log('Transcription successful. Result text length:', result.text?.length ?? 'UNDEFINED');
    return new Response(
      JSON.stringify({ 
        transcription: result.text,
        duration: duration 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error("Transcription Process Error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    })
  }
})
