export type ReviewAnomalyReview = {
  id: string
  establishmentId: string
  userId?: string | null
  rating: number
  comment?: string | null
  createdAt: string
  suspiciousFlag?: boolean
  moderationStatus?: string | null
}

export type ReviewAnomalyType =
  | 'rating_burst'
  | 'repetitive_content'
  | 'multiple_account_submissions'
  | 'average_rating_shift'
  | 'repeated_manipulation_attempt'

export type ReviewAnomalyFlag = {
  type: ReviewAnomalyType
  severity: 'low' | 'medium' | 'high'
  establishmentId: string
  reviewIds: string[]
  evidence: {
    recentCount?: number
    priorCount?: number
    averageRatingChange?: number
    repeatedTextCount?: number
    suspiciousCount?: number
  }
  requiresHumanReview: true
}

export type ReviewAnomalyOptions = {
  windowDays?: number
  burstMinimum?: number
  burstMultiplier?: number
  accountSubmissionMinimum?: number
  averageShiftMinimum?: number
}

const DAY_MS = 24 * 60 * 60 * 1000

function normalizedComment(comment: string | null | undefined) {
  const value = (comment || '').trim().toLocaleLowerCase().replace(/\s+/g, ' ')
  return value || null
}

function validReviews(reviews: ReviewAnomalyReview[]) {
  return reviews
    .filter((review) => review.id && review.establishmentId && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5)
    .map((review) => ({ ...review, timestamp: Date.parse(review.createdAt) }))
    .filter((review) => Number.isFinite(review.timestamp))
    .sort((a, b) => a.timestamp - b.timestamp)
}

export function detectReviewAnomalies(
  reviews: ReviewAnomalyReview[],
  options: ReviewAnomalyOptions = {},
): ReviewAnomalyFlag[] {
  const windowDays = options.windowDays ?? 7
  const windowMs = windowDays * DAY_MS
  const burstMinimum = options.burstMinimum ?? 5
  const burstMultiplier = options.burstMultiplier ?? 2
  const accountSubmissionMinimum = options.accountSubmissionMinimum ?? 3
  const averageShiftMinimum = options.averageShiftMinimum ?? 1
  const valid = validReviews(reviews)
  const flags: ReviewAnomalyFlag[] = []
  const establishmentIds = [...new Set(valid.map((review) => review.establishmentId))]

  for (const establishmentId of establishmentIds) {
    const establishmentReviews = valid.filter((review) => review.establishmentId === establishmentId)
    const latest = establishmentReviews[establishmentReviews.length - 1]?.timestamp
    if (latest === undefined) continue
    const recent = establishmentReviews.filter((review) => latest - review.timestamp <= windowMs)
    const prior = establishmentReviews.filter((review) => latest - review.timestamp > windowMs && latest - review.timestamp <= windowMs * 2)

    if (recent.length >= burstMinimum && recent.length >= Math.max(burstMinimum, prior.length * burstMultiplier)) {
      flags.push({
        type: 'rating_burst',
        severity: recent.length >= burstMinimum * 2 ? 'high' : 'medium',
        establishmentId,
        reviewIds: recent.map((review) => review.id),
        evidence: { recentCount: recent.length, priorCount: prior.length },
        requiresHumanReview: true,
      })
    }

    if (recent.length >= 2 && prior.length >= 2) {
      const average = (items: typeof recent) => items.reduce((sum, item) => sum + item.rating, 0) / items.length
      const change = average(recent) - average(prior)
      if (Math.abs(change) >= averageShiftMinimum) {
        flags.push({
          type: 'average_rating_shift',
          severity: Math.abs(change) >= 2 ? 'high' : 'medium',
          establishmentId,
          reviewIds: recent.map((review) => review.id),
          evidence: { averageRatingChange: Number(change.toFixed(2)), recentCount: recent.length, priorCount: prior.length },
          requiresHumanReview: true,
        })
      }
    }

    const repeatedText = new Map<string, string[]>()
    for (const review of recent) {
      const text = normalizedComment(review.comment)
      if (!text) continue
      repeatedText.set(text, [...(repeatedText.get(text) || []), review.id])
    }
    for (const ids of repeatedText.values()) {
      if (ids.length >= 2) {
        flags.push({
          type: 'repetitive_content',
          severity: ids.length >= 3 ? 'high' : 'medium',
          establishmentId,
          reviewIds: ids,
          evidence: { repeatedTextCount: ids.length },
          requiresHumanReview: true,
        })
      }
    }

    const accountCounts = new Map<string, string[]>()
    for (const review of recent) {
      if (!review.userId) continue
      accountCounts.set(review.userId, [...(accountCounts.get(review.userId) || []), review.id])
    }
    for (const ids of accountCounts.values()) {
      if (ids.length >= accountSubmissionMinimum) {
        flags.push({
          type: 'multiple_account_submissions',
          severity: ids.length >= accountSubmissionMinimum * 2 ? 'high' : 'medium',
          establishmentId,
          reviewIds: ids,
          evidence: { recentCount: ids.length },
          requiresHumanReview: true,
        })
      }
    }

    const suspicious = recent.filter((review) => review.suspiciousFlag || ['flagged', 'rejected'].includes(review.moderationStatus || ''))
    if (suspicious.length >= 2) {
      flags.push({
        type: 'repeated_manipulation_attempt',
        severity: suspicious.length >= 4 ? 'high' : 'medium',
        establishmentId,
        reviewIds: suspicious.map((review) => review.id),
        evidence: { suspiciousCount: suspicious.length },
        requiresHumanReview: true,
      })
    }
  }

  return flags
}
