import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabase'
import { PLANS, PlanType } from '../constants/plans'

export function usePlan() {
  const [plan, setPlan] = useState<PlanType>('free')
  const [usage, setUsage] = useState({
    analyses_count: 0,
    opportunites_count: 0,
    zones_count: 0,
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchPlanAndUsage()
  }, [])

  async function fetchPlanAndUsage() {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const [subResult, usageResult] = await Promise.all([
        supabase.from('subscriptions')
          .select('plan, status')
          .eq('user_id', user.id)
          .maybeSingle(),
        supabase.from('usage_monthly')
          .select('analyses_count, opportunites_count, zones_count')
          .eq('user_id', user.id)
          .eq('mois', new Date().toISOString().substring(0, 7))
          .maybeSingle()
      ])

      if (subResult.data) setPlan(subResult.data.plan as PlanType)
      if (usageResult.data) setUsage(usageResult.data)
    } finally {
      setLoading(false)
    }
  }

  function canAnalyse(): boolean {
    const limite = PLANS[plan].limites.analyses_par_mois
    if (limite === -1) return true
    return usage.analyses_count < limite
  }

  function canAddZone(): boolean {
    const limite = PLANS[plan].limites.zones_geo
    if (limite === -1) return true
    return usage.zones_count < limite
  }

  function hasFeature(feature: keyof typeof PLANS.free.features): boolean {
    return PLANS[plan].features[feature]
  }

  function getRemainingAnalyses(): number {
    const limite = PLANS[plan].limites.analyses_par_mois
    if (limite === -1) return 999
    return Math.max(0, limite - usage.analyses_count)
  }

  async function incrementAnalyses() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const mois = new Date().toISOString().substring(0, 7)
    
    // Check if record exists for this month
    const { data: existingUsage } = await supabase
      .from('usage_monthly')
      .select('id')
      .eq('user_id', user.id)
      .eq('mois', mois)
      .maybeSingle()

    if (existingUsage) {
      await supabase.from('usage_monthly').update({
        analyses_count: usage.analyses_count + 1,
        updated_at: new Date().toISOString()
      }).eq('id', existingUsage.id)
    } else {
      await supabase.from('usage_monthly').insert({
        user_id: user.id,
        mois,
        analyses_count: 1
      })
    }
    
    setUsage(prev => ({ 
      ...prev, 
      analyses_count: prev.analyses_count + 1 
    }))
  }

  return {
    plan,
    usage,
    loading,
    canAnalyse,
    canAddZone,
    hasFeature,
    getRemainingAnalyses,
    incrementAnalyses,
    refetch: fetchPlanAndUsage,
  }
}
