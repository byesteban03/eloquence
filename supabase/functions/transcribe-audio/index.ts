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
    let { audioBase64, duration } = await req.json()
    console.log('Body received. Audio base64 length:', audioBase64?.length ?? 'UNDEFINED', 'Duration:', duration);
    
    if (!audioBase64) {
      console.error('Validation Error: Audio data (audioBase64) is missing from the request body.');
      throw new Error('Audio data is missing');
    }

    // Strip data URL prefix if present
    if (audioBase64.includes(';base64,')) {
      console.log('Stripping data URL prefix from audioBase64.');
      audioBase64 = audioBase64.split(';base64,').pop();
    }

    const openAiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openAiApiKey) {
      console.error('Configuration Error: OPENAI_API_KEY environment variable is missing.');
      throw new Error('OPENAI_API_KEY environment variable is missing');
    }

    const transcribeChunk = async (base64: string, index: number) => {
      console.log(`Transcribing chunk ${index}. Base64 length: ${base64.length}`);
      const binaryStr = atob(base64);
      const bytes = new Uint8Array(binaryStr.length);
      for (let i = 0; i < binaryStr.length; i++) {
        bytes[i] = binaryStr.charCodeAt(i);
      }
      const audioBlob = new Blob([bytes], { type: 'audio/mpeg' });
      const formData = new FormData();
      formData.append('file', audioBlob, `audio_${index}.m4a`);
      formData.append('model', 'whisper-1');

      const openAiApiUrl = 'https://api.openai.com/v1/audio/transcriptions';
      const response = await fetch(openAiApiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openAiApiKey}`,
        },
        body: formData,
      });

      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error?.message || `Error transcribing chunk ${index}`);
      }
      return result.text;
    };

    let fullTranscription = "";
    const CHUNK_SIZE_CHARS = 20000000; // ~15MB of binary data per chunk

    if (audioBase64.length > 33000000) {
      console.log(`Large audio detected (${audioBase64.length} chars). Splitting into chunks...`);
      const chunks: string[] = [];
      for (let i = 0; i < audioBase64.length; i += CHUNK_SIZE_CHARS) {
        chunks.push(audioBase64.slice(i, i + CHUNK_SIZE_CHARS));
      }
      console.log(`Split into ${chunks.length} chunks.`);

      for (let i = 0; i < chunks.length; i++) {
        const text = await transcribeChunk(chunks[i], i);
        fullTranscription += (fullTranscription ? " " : "") + text;
      }
    } else {
      fullTranscription = await transcribeChunk(audioBase64, 0);
    }

    console.log('Transcription successful. Total text length:', fullTranscription.length);
    return new Response(
      JSON.stringify({ 
        transcription: fullTranscription,
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
