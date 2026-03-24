import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import Stripe from 'https://esm.sh/stripe@11.1.0?target=deno'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY') as string, {
  apiVersion: '2022-11-15',
  httpClient: Stripe.createFetchHttpClient(),
})

const cryptoProvider = Stripe.createSubtleCryptoProvider()

serve(async (req) => {
  const signature = req.headers.get('Stripe-Signature')

  if (!signature) {
    return new Response('No signature', { status: 400 })
  }

  const body = await req.text()
  let event

  try {
    event = await stripe.webhooks.constructEventAsync(
      body,
      signature,
      Deno.env.get('STRIPE_WEBHOOK_SECRET') as string,
      undefined,
      cryptoProvider
    )
  } catch (err) {
    return new Response(`Webhook Error: ${err.message}`, { status: 400 })
  }

  const supabaseClient = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  const subscription = event.data.object as any

  if (event.type === 'customer.subscription.created' || event.type === 'customer.subscription.updated') {
    const stripeCustomerId = subscription.customer
    const status = subscription.status
    const priceId = subscription.items.data[0].price.id
    
    // Map your Stripe Price IDs to your plan names here
    // Replace these with actual IDs from your Stripe Dashboard
    let plan = 'free'
    if (priceId === Deno.env.get('STRIPE_PRICE_PRO_MONTHLY') || priceId === Deno.env.get('STRIPE_PRICE_PRO_YEARLY')) {
      plan = 'pro'
    } else if (priceId === Deno.env.get('STRIPE_PRICE_TEAM_MONTHLY') || priceId === Deno.env.get('STRIPE_PRICE_TEAM_YEARLY')) {
      plan = 'team'
    }

    const { error } = await supabaseClient
      .from('subscriptions')
      .upsert({
        stripe_customer_id: stripeCustomerId,
        stripe_subscription_id: subscription.id,
        status: status,
        plan: plan,
        billing_cycle: subscription.items.data[0].price.recurring?.interval === 'year' ? 'annual' : 'monthly',
        current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
        current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
        updated_at: new Date().toISOString(),
      }, { onConflict: 'stripe_customer_id' })

    if (error) console.error('Error updating subscription:', error)
  }

  if (event.type === 'customer.subscription.deleted') {
    const { error } = await supabaseClient
      .from('subscriptions')
      .update({ status: 'cancelled', plan: 'free', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', subscription.id)

    if (error) console.error('Error cancelling subscription:', error)
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { 'Content-Type': 'application/json' },
    status: 200,
  })
})
