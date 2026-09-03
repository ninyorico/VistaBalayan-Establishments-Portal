import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2, TrendingUp } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { geminiService } from '../../../services/geminiService'
import {
  AiAnomalyCard,
  AiEmptyState,
  AiInsightsShell,
  AiRecommendationCard,
  AiSectionCard,
  AiShowMoreButton,
} from '../../components/vista/AiInsightsDesign'

const DEFAULT_AI_ITEMS_VISIBLE = 5

interface Anomaly {
  id: string
  anomaly_type: string
  severity: string
  description: string
  recommendation: string
  establishments?: { name: string }
  detected_at: string
  is_resolved: boolean
}

interface Insight {
  id: string
  title: string
  description: string
  impact: string
  category: string
  recommended_action?: string
  confidence_score?: number
}

export default function AIInsights() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdated, setLastUpdated] = useState<string | null>(null)
  const [showAllServiceGaps, setShowAllServiceGaps] = useState(false)
  const [showAllRecommendations, setShowAllRecommendations] = useState(false)

  const activeAnomalies = anomalies.filter(a => !a.is_resolved)
  const visibleAnomalies = showAllServiceGaps ? activeAnomalies : activeAnomalies.slice(0, DEFAULT_AI_ITEMS_VISIBLE)
  const visibleInsights = showAllRecommendations ? insights : insights.slice(0, DEFAULT_AI_ITEMS_VISIBLE)

  useEffect(() => {
    loadCachedData()
  }, [])

  const loadCachedData = async () => {
    setLoading(true)
    
    try {
      // Load cached anomalies from database
      const { data: anomaliesData } = await supabase
        .from('ai_anomalies_cache')
        .select(`
          *,
          establishments (name)
        `)
        .eq('status', 'active')
        .eq('is_resolved', false)
        .order('detected_at', { ascending: false })

      setAnomalies(anomaliesData || [])

      // Load cached insights from database
      const { data: insightsData } = await supabase
        .from('ai_recommendations')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false })

      setInsights(insightsData || [])

      // Get last update time
      const { data: cacheData } = await supabase
        .from('ai_insights_cache')
        .select('generated_at')
        .eq('insight_type', 'recommendations')
        .order('generated_at', { ascending: false })
        .limit(1)
        .single()

      if (cacheData) {
        setLastUpdated(new Date(cacheData.generated_at).toLocaleString())
      }

      // If no data exists, generate fresh data
      if ((!anomaliesData || anomaliesData.length === 0) && (!insightsData || insightsData.length === 0)) {
        await refreshData()
      }

    } catch (error) {
      console.error('Error loading cached data:', error)
    } finally {
      setLoading(false)
    }
  }

  const refreshData = async () => {
    setRefreshing(true)
    try {
      const { insights: newInsights, anomalies: newAnomalies } = await geminiService.refreshAllData()
      
      // Reload cached data
      await loadCachedData()
      
      console.log(`✅ Data refreshed: ${newInsights?.length || 0} insights, ${newAnomalies?.length || 0} anomalies`)
    } catch (error) {
      console.error('Error refreshing data:', error)
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#1CA7C9] mx-auto mb-4" />
          <p className="text-gray-600">Loading AI insights...</p>
        </div>
      </div>
    )
  }

  return (
    <AiInsightsShell
      subtitle="Municipality-wide service-gap tracking and recommendation review, organized for fast decisions."
      lastUpdated={lastUpdated}
      refreshing={refreshing}
      onRefresh={refreshData}
    >
      <AiSectionCard
        title="Service gaps"
        countLabel={`${activeAnomalies.length} Active`}
        icon={<AlertTriangle className="size-5 text-amber-600" />}
      >
        <div className="space-y-3">
          {activeAnomalies.length > 0 ? (
            visibleAnomalies.map((anomaly) => <AiAnomalyCard key={anomaly.id} {...anomaly} />)
          ) : (
            <AiEmptyState variant="gaps" />
          )}
        </div>
        {activeAnomalies.length > DEFAULT_AI_ITEMS_VISIBLE && (
          <AiShowMoreButton onClick={() => setShowAllServiceGaps((current) => !current)}>
            {showAllServiceGaps ? 'Show fewer service gaps' : `See all service gaps (${activeAnomalies.length})`}
          </AiShowMoreButton>
        )}
      </AiSectionCard>

      <AiSectionCard
        title="Recommended actions"
        countLabel={`${insights.length} Ready`}
        icon={<TrendingUp className="size-5 text-[#0F4C75]" />}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {insights.length > 0 ? (
            visibleInsights.map((insight) => <AiRecommendationCard key={insight.id} {...insight} />)
          ) : (
            <div className="lg:col-span-2">
              <AiEmptyState variant="recommendations" />
            </div>
          )}
        </div>
        {insights.length > DEFAULT_AI_ITEMS_VISIBLE && (
          <AiShowMoreButton onClick={() => setShowAllRecommendations((current) => !current)}>
            {showAllRecommendations ? 'Show fewer recommendations' : `See all recommendations (${insights.length})`}
          </AiShowMoreButton>
        )}
      </AiSectionCard>
    </AiInsightsShell>
  )
}