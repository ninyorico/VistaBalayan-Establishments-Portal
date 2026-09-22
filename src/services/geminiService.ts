import { supabase } from '../lib/supabase'

type Insight = {
  title: string
  description: string
  impact: string
  category: string
  recommended_action?: string
  confidence_score?: number
}

type Anomaly = {
  type: string
  severity: string
  description: string
  recommendation: string
  establishment?: string
  confidence_score?: number
}

const callGenerationApi = async (scope: 'municipality' | 'establishment') => {
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
    body: JSON.stringify({ scope, request_id: requestId }),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(result.error || 'AI generation failed')
  return result as { insights: Insight[]; anomalies: Anomaly[] }
}

export const geminiService = {
  async refreshAllData() {
    return callGenerationApi('municipality')
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
