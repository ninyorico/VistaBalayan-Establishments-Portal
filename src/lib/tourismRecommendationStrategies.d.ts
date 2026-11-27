export type TourismRecommendationEvidence = Record<string, unknown> & {
  metric?: string;
  current_coverage_percent?: number;
  current_missing_reports?: number;
  current_value?: number;
  previous_value?: number;
  drop_percent?: number;
};

export type TourismRecommendationAction = {
  action_title: string;
  action_description: string;
  action_category: string;
  primary_objective: string;
  action_priority: string;
  responsible_entity: string;
  suggested_timeframe: string;
  prerequisites?: string[];
  success_indicators: string[];
  validation_required: boolean;
};

export type TourismRecommendationStrategy = {
  actions: TourismRecommendationAction[];
  decisionImplication: string;
};

export function selectTourismRecommendationStrategies(
  evidence?: TourismRecommendationEvidence,
  options?: Record<string, unknown> & {
    metric?: string;
    scope?: "municipality" | "establishment";
    establishmentId?: string;
    establishmentName?: string;
    periodLabel?: string;
  },
): TourismRecommendationStrategy;

export default selectTourismRecommendationStrategies;
