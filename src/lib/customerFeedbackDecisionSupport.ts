export type FeedbackDecisionInput = {
  establishmentId: string;
  establishmentName: string;
  visitorVolume: number | null;
  satisfaction: number | null;
  priorSatisfaction?: number | null;
  ratingCount: number;
  eligibility: 'eligible' | 'insufficient_feedback' | 'no_ratings' | string;
};

export type FeedbackDecisionSegment =
  | 'high_volume_low_satisfaction'
  | 'low_volume_high_satisfaction'
  | 'declining_satisfaction'
  | 'consistently_positive'
  | 'insufficient_feedback';

export type FeedbackDecision = {
  segment: FeedbackDecisionSegment;
  establishmentId: string;
  establishmentName: string;
  evidence: {
    visitorVolume: number | null;
    satisfaction: number | null;
    priorSatisfaction?: number | null;
    ratingCount: number;
  };
};

export type FeedbackDecisionOptions = {
  highVolumeMinimum?: number;
  lowVolumeMaximum?: number;
  lowSatisfactionMaximum?: number;
  highSatisfactionMinimum?: number;
  declineMinimum?: number;
  positiveMinimum?: number;
  minimumReviews?: number;
};

export function classifyFeedbackDecisionSegments(
  inputs: FeedbackDecisionInput[],
  options: FeedbackDecisionOptions = {},
): FeedbackDecision[] {
  const highVolumeMinimum = options.highVolumeMinimum ?? 1000;
  const lowVolumeMaximum = options.lowVolumeMaximum ?? 100;
  const lowSatisfactionMaximum = options.lowSatisfactionMaximum ?? 70;
  const highSatisfactionMinimum = options.highSatisfactionMinimum ?? 80;
  const declineMinimum = options.declineMinimum ?? 10;
  const positiveMinimum = options.positiveMinimum ?? 85;
  const minimumReviews = options.minimumReviews ?? 5;
  const decisions: FeedbackDecision[] = [];

  for (const input of inputs) {
    const satisfaction = input.satisfaction;
    const evidence = {
      visitorVolume: input.visitorVolume,
      satisfaction,
      priorSatisfaction: input.priorSatisfaction,
      ratingCount: input.ratingCount,
    };
    const eligible = input.eligibility === 'eligible' && input.ratingCount >= minimumReviews && satisfaction != null;
    if (!eligible) {
      decisions.push({ segment: 'insufficient_feedback', establishmentId: input.establishmentId, establishmentName: input.establishmentName, evidence });
      continue;
    }
    if (input.visitorVolume != null && input.visitorVolume >= highVolumeMinimum && satisfaction <= lowSatisfactionMaximum) {
      decisions.push({ segment: 'high_volume_low_satisfaction', establishmentId: input.establishmentId, establishmentName: input.establishmentName, evidence });
    }
    if (input.visitorVolume != null && input.visitorVolume <= lowVolumeMaximum && satisfaction >= highSatisfactionMinimum) {
      decisions.push({ segment: 'low_volume_high_satisfaction', establishmentId: input.establishmentId, establishmentName: input.establishmentName, evidence });
    }
    if (input.priorSatisfaction != null && input.priorSatisfaction - satisfaction >= declineMinimum) {
      decisions.push({ segment: 'declining_satisfaction', establishmentId: input.establishmentId, establishmentName: input.establishmentName, evidence });
    }
    if (satisfaction >= positiveMinimum) {
      decisions.push({ segment: 'consistently_positive', establishmentId: input.establishmentId, establishmentName: input.establishmentName, evidence });
    }
  }
  return decisions;
}
