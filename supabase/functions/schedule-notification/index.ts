import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { title, body, scheduled_for, reunion_id } = await req.json()

    if (!title || !body || !scheduled_for) {
      throw new Error('Missing required fields: title, body, scheduled_for')
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

    if (!supabaseUrl || !supabaseKey) throw new Error('Missing Supabase env vars')

    const supabase = createClient(supabaseUrl, supabaseKey)
    const authHeader = req.headers.get('Authorization')
    const { data: { user } } = await supabase.auth.getUser(authHeader?.replace('Bearer ', ''))

    const { data, error } = await supabase
      .from('notifications_planifiees')
      .insert({
        reunion_id: reunion_id || null,
        title,
        body,
        scheduled_for,
        sent: false,
        user_id: user?.id,
      })
      .select()
      .single()

    if (error) throw new Error(error.message)

    console.log('🔔 Notification planifiée:', data.id, 'pour', scheduled_for)

    return new Response(
      JSON.stringify({ scheduled: true, notification: data }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('schedule-notification error:', error.message)
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )
  }
})
