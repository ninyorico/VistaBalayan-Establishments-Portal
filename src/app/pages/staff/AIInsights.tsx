import { useEffect, useState } from 'react'
import { AlertTriangle, Loader2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { geminiService } from '../../../services/geminiService'
import { calculateAverageAccommodationOccupancy } from '../../../lib/reportMetrics'
import {
  AiAnomalyCard,
  AiEmptyState,
  AiInsightsShell,
  AiRecommendationCard,
  AiSectionCard,
} from '../../components/vista/AiInsightsDesign'

interface Anomaly {
  id: string
  anomaly_type: string
  severity: string
  description: string
  recommendation: string
  detected_at: string
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

export default function StaffAIInsights() {
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [insights, setInsights] = useState<Insight[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [establishmentName, setEstablishmentName] = useState<string>('')
  const [establishmentId, setEstablishmentId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadUserAndData()
  }, [])

  const loadUserAndData = async () => {
    setLoading(true)
    setError(null)
    
    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        setError('User not found. Please log in again.')
        setLoading(false)
        return
      }
      
      console.log('Current user:', user.id)
      
      // Get user profile
      const { data: profileData, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
      
      if (profileError) {
        console.error('Profile error:', profileError)
        setError('Could not load your profile. Please contact support.')
        setLoading(false)
        return
      }
      
      console.log('Profile data:', profileData)
      
      if (!profileData?.establishment_id) {
        setError('No establishment associated with your account. Please contact the municipal tourism officer.')
        setLoading(false)
        return
      }
      
      setEstablishmentId(profileData.establishment_id)
      
      // Fetch establishment name separately
      const { data: estData, error: estError } = await supabase
        .from('establishments')
        .select('name')
        .eq('id', profileData.establishment_id)
        .single()
      
      if (estError) {
        console.error('Establishment error:', estError)
      }
      
      if (estData) {
        setEstablishmentName(estData.name)
        console.log('Establishment name:', estData.name)
      }
      
      // Load cached data for this establishment
      await loadCachedData(profileData.establishment_id)
      
    } catch (error) {
      console.error('Error loading user data:', error)
      setError('Failed to load your data. Please refresh the page.')
    } finally {
      setLoading(false)
    }
  }

const loadCachedData = async (estId: string) => {
  if (!estId) return
  
  console.log('Loading cached data for establishment:', estId)
  
  try {
    // Load anomalies specific to this establishment
    const { data: anomaliesData, error: anomaliesError } = await supabase
      .from('ai_anomalies_cache')
      .select('*')
      .eq('establishment_id', estId)
      .eq('status', 'active')
      .eq('is_resolved', false)
      .order('detected_at', { ascending: false })

    if (anomaliesError) {
      console.error('Anomalies error:', anomaliesError)
    } else {
      console.log('Anomalies found:', anomaliesData?.length || 0)
      setAnomalies(anomaliesData || [])
    }

    // Load recommendations specific to this establishment ONLY
    const { data: insightsData, error: insightsError } = await supabase
      .from('ai_recommendations')
      .select('*')
      .eq('status', 'active')
      .eq('establishment_id', estId)  // ← ADD THIS FILTER
      .order('created_at', { ascending: false })
      .limit(10)

    if (insightsError) {
      console.error('Insights error:', insightsError)
    } else {
      console.log('Insights found:', insightsData?.length || 0)
      setInsights(insightsData || [])
    }

  } catch (error) {
    console.error('Error loading cached data:', error)
  }
}

  const refreshData = async () => {
    if (!establishmentId) {
      setError('No establishment associated with your account')
      return
    }
    
    setRefreshing(true)
    setError(null)
    
    try {
      // Fetch this establishment's visitor data only
      const { data: visitorData, error: visitorError } = await supabase
        .from('visitor_reports')
        .select('report_date, total_guests, residence_type')
        .eq('establishment_id', establishmentId)
        .eq('status', 'approved')
        .order('report_date', { ascending: false })
        .limit(200)

      if (visitorError) {
        console.error('Visitor data error:', visitorError)
      }

      // Fetch this establishment's accommodation data
      const { data: accommodationData, error: accError } = await supabase
        .from('accommodation_reports')
        .select('id, report_date, total_rooms, total_occupied_rooms')
        .eq('establishment_id', establishmentId)
        .eq('status', 'approved')

      if (accError) {
        console.error('Accommodation data error:', accError)
      }

      // Calculate analytics for this establishment
      const totalVisitors = visitorData?.reduce((sum, v) => sum + (v.total_guests || 0), 0) || 0
      
      const avgOccupancy = calculateAverageAccommodationOccupancy(accommodationData || [])

      // Monthly trends for this establishment
      const monthlyTrends: Record<string, number> = {}
      visitorData?.forEach(v => {
        if (v.report_date) {
          const month = v.report_date.slice(0, 7)
          monthlyTrends[month] = (monthlyTrends[month] || 0) + (v.total_guests || 0)
        }
      })

      // Generate insights and anomalies for this establishment
      const [newInsights, newAnomalies] = await Promise.all([
        geminiService.generateAndSaveInsightsForEstablishment({
          establishmentName,
          establishmentId,
          totalVisitors,
          avgOccupancy,
          monthlyTrends
        }),
        geminiService.generateAndSaveAnomaliesForEstablishment(
          visitorData || [],
          establishmentId,
          establishmentName
        )
      ])

      // Reload cached data
      await loadCachedData(establishmentId)
      
      console.log(`✅ Data refreshed for ${establishmentName}: ${newInsights?.length || 0} insights, ${newAnomalies?.length || 0} anomalies`)
      
    } catch (error) {
      console.error('Error refreshing data:', error)
      setError('Failed to refresh data. Please try again.')
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Loader2 className="w-12 h-12 animate-spin text-[#1CA7C9] mx-auto mb-4" />
          <p className="text-gray-600">Loading AI insights for your establishment...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Unable to Load AI Insights</h3>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={loadUserAndData}
            className="px-4 py-2 bg-[#1CA7C9] text-white rounded-lg hover:bg-[#0F4C75] transition"
          >
            Try Again
          </button>
        </div>
      </div>
    )
  }

  return (
    <AiInsightsShell
      subtitle={`Recommendation review and service-gap tracking for ${establishmentName || 'your establishment'}.`}
      refreshing={refreshing}
      onRefresh={refreshData}
    >
      <AiSectionCard
        title="Service gaps"
        countLabel={`${anomalies.filter((a) => a.severity === "medium" || a.severity === "high").length} Active`}
        icon={<AlertTriangle className="size-5 text-amber-600" />}
      >
        <div className="space-y-3">
          {anomalies.length > 0 ? (
            anomalies.map((anomaly) => (
              <AiAnomalyCard key={anomaly.id} {...anomaly} establishments={{ name: establishmentName || 'Your establishment' }} />
            ))
          ) : (
            <AiEmptyState variant="gaps" />
          )}
        </div>
      </AiSectionCard>

      <AiSectionCard
        title="Recommended actions"
        countLabel={`${insights.length} Ready`}
        icon={<span className="size-2.5 rounded-full bg-[#1CA7C9] shadow-[0_0_0_6px_rgba(28,167,201,0.12)]" />}
      >
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {insights.length > 0 ? (
            insights.map((insight) => <AiRecommendationCard key={insight.id} {...insight} />)
          ) : (
            <div className="lg:col-span-2">
              <AiEmptyState variant="recommendations" />
            </div>
          )}
        </div>
      </AiSectionCard>
    </AiInsightsShell>
  )
}