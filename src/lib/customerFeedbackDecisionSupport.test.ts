import { describe, expect, it } from 'vitest';
import { classifyFeedbackDecisionSegments } from './customerFeedbackDecisionSupport';

const base = {
  establishmentId: 'est-1',
  establishmentName: 'Fixture Establishment',
  visitorVolume: 1200,
  satisfaction: 60,
  priorSatisfaction: null,
  ratingCount: 8,
  eligibility: 'eligible' as const,
};

describe('classifyFeedbackDecisionSegments', () => {
  it('classifies high-volume low-satisfaction evidence', () => {
    expect(classifyFeedbackDecisionSegments([base])).toEqual([expect.objectContaining({ segment: 'high_volume_low_satisfaction' })]);
  });

  it('classifies low-volume high-satisfaction, declining, and positive evidence', () => {
    const decisions = classifyFeedbackDecisionSegments([{
      ...base,
      visitorVolume: 50,
      satisfaction: 88,
      priorSatisfaction: 99,
    }]);
    expect(decisions.map((decision) => decision.segment)).toEqual(expect.arrayContaining([
      'low_volume_high_satisfaction',
      'declining_satisfaction',
      'consistently_positive',
    ]));
  });

  it('uses an explicit insufficient-feedback segment and does not infer a satisfaction action', () => {
    const decisions = classifyFeedbackDecisionSegments([{
      ...base,
      visitorVolume: 3000,
      satisfaction: null,
      ratingCount: 2,
      eligibility: 'insufficient_feedback',
    }]);
    expect(decisions).toEqual([expect.objectContaining({ segment: 'insufficient_feedback' })]);
  });

  it('does not create an unsupported segment when the visitor volume is unavailable', () => {
    const decisions = classifyFeedbackDecisionSegments([{ ...base, visitorVolume: null, satisfaction: 90 }]);
    expect(decisions.map((decision) => decision.segment)).toEqual(['consistently_positive']);
  });
});
