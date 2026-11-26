import { supabase } from '../lib/supabase'

type Insight = {
  title: string
  description: string
  impact: string
  category: string
  recommended_action?: string
}

type Anomaly = {
  type: string
  severity: string
  description: string
  recommendation: string
  establishment?: string
}

type AnalysisContext = {
  selectedStartDate?: string
  selectedEndDate?: string
  comparisonStartDate?: string
  comparisonEndDate?: string
  label?: string
}

const callGenerationApi = async (scope: 'municipality' | 'establishment', analysisContext?: AnalysisContext) => {
  const requestId = crypto.randomUUID()
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  const accessToken = sessionData.session?.access_token
  if (sessionError || !accessToken) throw new Error('Your session expired. Please sign in again.')

  const response = await fetch('/api/generate-insights', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ scope, request_id: requestId, analysis_period: analysisContext }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'AI generation failed')
  return result as { insights: Insight[]; anomalies: Anomaly[] }
}

export const geminiService = {
  async refreshAllData(analysisContext?: AnalysisContext) {
    return callGenerationApi('municipality', analysisContext)
  },

  async generateForEstablishment() {
    return callGenerationApi('establishment')
  },

  async generateAndSaveInsightsForEstablishment(_establishmentData: unknown) {
    const result = await callGenerationApi('establishment')
    return result.insights
  },

  async generateAndSaveAnomaliesForEstablishment(_visitorData: unknown[], _establishmentId: string, _establishmentName: string) {
    const result = await callGenerationApi('establishment')
    return result.anomalies
  },
}
