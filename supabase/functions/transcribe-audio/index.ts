import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { decode } from "https://deno.land/std@0.168.0/encoding/base64.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.7'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const MAX_WHISPER_SIZE = 24.5 * 1024 * 1024 // Restore to 24.5MB to skip ffmpeg on the user's 24.1MB file

async function compressAudio(inputPath: string): Promise<string> {
  const outputPath = inputPath.replace(/\.[^.]+$/, '_compressed.mp3')
  
  try {
    const checkProcess = new Deno.Command('ffmpeg', { args: ['-version'] })
    const { code } = await checkProcess.output()
    if (code !== 0) throw new Error('ffmpeg not available')
  } catch (e) {
    console.error('[ffmpeg] binary not found in this environment')
    throw new Error('La compression audio (ffmpeg) n\'est pas disponible dans cet environnement.')
  }

  console.log(`[ffmpeg] Compressing ${inputPath} to ${outputPath}...`)
  const process = new Deno.Command('ffmpeg', {
    args: ['-i', inputPath, '-ar', '16000', '-ac', '1', '-b:a', '32k', '-y', outputPath],
    stderr: 'piped'
  })
  
  const { code, stderr } = await process.output()
  if (code !== 0) {
    const errorMsg = new TextDecoder().decode(stderr)
    throw new Error(`ffmpeg compression failed: ${errorMsg}`)
  }
  return outputPath
}

async function segmentAudio(inputPath: string, logTime: (tag: string) => void): Promise<string[]> {
  const outputPattern = `/tmp/seg_%03d.m4a`
  console.log(`[ffmpeg] Segmenting ${inputPath}...`)
  
  const process = new Deno.Command('ffmpeg', {
    args: ['-i', inputPath, '-f', 'segment', '-segment_time', '600', '-c', 'copy', '-y', outputPattern],
    stderr: 'piped'
  })
  
  const { code, stderr } = await process.output()
  if (code !== 0) {
    const errorMsg = new TextDecoder().decode(stderr)
    console.error('[ffmpeg] segmentation error:', errorMsg)
    throw new Error(`ffmpeg segmentation failed: ${errorMsg}`)
  }
  
  const segments: string[] = []
  for await (const entry of Deno.readDir('/tmp')) {
    if (entry.name.startsWith('seg_') && entry.name.endsWith('.m4a')) {
      segments.push(`/tmp/${entry.name}`)
    }
  }
  logTime(`Segmentation complete (${segments.length} segments)`)
  return segments.sort()
}

async function transcribeSegment(
  filePath: string, 
  apiKey: string, 
  mimeType: string, 
  index: number
): Promise<string> {
  const fileData = await Deno.readFile(filePath)
  const formData = new FormData()
  const file = new File([fileData], `seg_${index}.m4a`, { type: mimeType })
  formData.append('file', file)
  formData.append('model', 'whisper-1')
  formData.append('language', 'fr')

  console.log(`[Whisper] Sending segment ${index} (${(fileData.length / 1024 / 1024).toFixed(1)} MB)...`)
  
  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData,
  })

  if (!response.ok) {
    const errorText = await response.text()
    throw new Error(`Whisper Segment ${index} Error: ${response.status} - ${errorText}`)
  }

  const { text } = await response.json()
  return text
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const startTime = Date.now()
  const logTime = (tag: string) => console.log(`[Timer] ${tag}: ${Date.now() - startTime}ms`)
  let tempInputPath = ""
  let finalPath = ""
  let segmentFiles: string[] = []

  try {
    const body = await req.json()
    const { audioBase64, storagePath, mimeType = 'audio/m4a' } = body

    const tempId = crypto.randomUUID()
    tempInputPath = `/tmp/${tempId}_input.m4a`

    if (storagePath) {
      console.log(`[Storage] Downloading: ${storagePath}`)
      const supabaseUrl = Deno.env.get('SUPABASE_URL')
      const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
      if (!supabaseUrl || !supabaseKey) throw new Error('Supabase configuration missing')

      const supabaseClient = createClient(supabaseUrl, supabaseKey, {
        auth: { persistSession: false },
      })

      const { data, error } = await supabaseClient.storage.from('reunions-audio').download(storagePath)
      if (error) throw new Error(`Storage download error: ${error.message}`)

      const file = await Deno.open(tempInputPath, { create: true, write: true })
      await data.stream().pipeTo(file.writable)
      logTime('File downloaded to disk')
    } else if (audioBase64) {
      const base64Data = audioBase64.includes(';base64,') ? audioBase64.split(';base64,').pop()! : audioBase64
      const fileData = decode(base64Data)
      await Deno.writeFile(tempInputPath, fileData)
      logTime('Base64 decoded to disk')
    } else {
      throw new Error('Neither storagePath nor audioBase64 provided')
    }

    const fileStat = await Deno.stat(tempInputPath)
    const fileSize = fileStat.size
    console.log(`[Process] Input file size: ${(fileSize / 1024 / 1024).toFixed(1)} MB`)

    finalPath = tempInputPath
    let finalMime = mimeType

    // Compression logic (only for massive files now)
    if (fileSize > MAX_WHISPER_SIZE) {
      console.log(`[Process] File > 25MB. Compressing...`)
      try {
        finalPath = await compressAudio(tempInputPath)
        finalMime = 'audio/mpeg'
        logTime('Compression complete')
      } catch (err) {
        console.warn(`[Process] Compression failed:`, err)
      }
    }

    const apiKey = Deno.env.get('OPENAI_API_KEY')
    if (!apiKey) throw new Error('OPENAI_API_KEY not configured')

    // SPLIT AND TRANSCRIBE PARALLEL
    segmentFiles = await segmentAudio(finalPath, logTime)
    
    console.log(`[Process] Transcribing ${segmentFiles.length} segments in parallel...`)
    const transcriptionPromises = segmentFiles.map((path, idx) => 
      transcribeSegment(path, apiKey, finalMime, idx)
    )
    
    const results = await Promise.all(transcriptionPromises)
    const combinedText = results.join(' ')
    logTime('All segments transcribed')

    // Cleanup
    const cleanup = async () => {
      try {
        if (tempInputPath) await Deno.remove(tempInputPath)
        if (finalPath && finalPath !== tempInputPath) await Deno.remove(finalPath)
        for (const f of segmentFiles) await Deno.remove(f)
      } catch (e) { console.warn('Cleanup error:', e) }
    }
    await cleanup()

    return new Response(
      JSON.stringify({ transcription: combinedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (e: any) {
    console.error('Error in transcribe-audio:', e)
    try {
      if (tempInputPath) await Deno.remove(tempInputPath)
      if (finalPath && finalPath !== tempInputPath) await Deno.remove(finalPath)
      for (const f of segmentFiles) await Deno.remove(f)
    } catch (_) {}

    return new Response(
      JSON.stringify({ 
        error: 'Edge Function Error', 
        message: e.message || String(e),
        timer: Date.now() - startTime
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})

