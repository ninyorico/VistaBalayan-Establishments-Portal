import { describe, expect, it } from 'vitest'
import { detectReviewAnomalies } from './reviewAnomalyDetection'

const review = (id: string, createdAt: string, overrides: Partial<Parameters<typeof detectReviewAnomalies>[0][number]> = {}) => ({
  id,
  establishmentId: 'est-1',
  userId: `user-${id}`,
  rating: 4,
  comment: `Review ${id}`,
  createdAt,
  ...overrides,
})

describe('detectReviewAnomalies', () => {
  it('flags a short-period rating burst and requires human review', () => {
    const reviews = [
      review('old-1', '2026-01-01T00:00:00Z'),
      review('old-2', '2026-01-02T00:00:00Z'),
      ...['a', 'b', 'c', 'd', 'e'].map((id, index) => review(id, `2026-01-${10 + index}T00:00:00Z`)),
    ]
    const flags = detectReviewAnomalies(reviews, { windowDays: 7, burstMinimum: 5 })
    expect(flags.some((flag) => flag.type === 'rating_burst')).toBe(true)
    expect(flags.find((flag) => flag.type === 'rating_burst')?.requiresHumanReview).toBe(true)
  })

  it('flags repetitive content, multiple submissions, and repeated manipulation attempts', () => {
    const reviews = ['a', 'b', 'c'].map((id) => review(id, '2026-02-10T00:00:00Z', {
      userId: 'same-user',
      comment: 'Same wording',
      suspiciousFlag: true,
      moderationStatus: 'flagged',
    }))
    const types = detectReviewAnomalies(reviews, { windowDays: 7 }).map((flag) => flag.type)
    expect(types).toEqual(expect.arrayContaining(['repetitive_content', 'multiple_account_submissions', 'repeated_manipulation_attempt']))
  })

  it('flags a meaningful average-rating shift only when a prior comparable window exists', () => {
    const reviews = [
      review('prior-1', '2026-03-01T00:00:00Z', { rating: 2 }),
      review('prior-2', '2026-03-02T00:00:00Z', { rating: 2 }),
      review('recent-1', '2026-03-10T00:00:00Z', { rating: 5 }),
      review('recent-2', '2026-03-11T00:00:00Z', { rating: 5 }),
    ]
    const flags = detectReviewAnomalies(reviews, { windowDays: 7 })
    expect(flags.some((flag) => flag.type === 'average_rating_shift')).toBe(true)
  })

  it('does not flag a single review as manipulation', () => {
    const flags = detectReviewAnomalies([review('one', '2026-04-01T00:00:00Z')])
    expect(flags).toEqual([])
  })
})
