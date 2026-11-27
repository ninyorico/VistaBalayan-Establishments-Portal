export type FeedbackReview = {
  rating: number;
  verified: boolean;
  status: string;
  suspicious: boolean;
};

export type FeedbackEligibility = "no_ratings" | "insufficient_feedback" | "eligible";

export type CustomerFeedbackMetrics = {
  averageRating: number | null;
  ratingCount: number;
  positiveRatingPercentage: number | null;
  customerSatisfactionScore: number | null;
  distribution: Record<1 | 2 | 3 | 4 | 5, { count: number; percentage: number }>;
  eligibility: FeedbackEligibility;
};

const round = (value: number) => Math.round(value * 100) / 100;

export const calculateCustomerFeedback = (reviews: FeedbackReview[], minimumReviews = 5): CustomerFeedbackMetrics => {
  const eligible = (reviews || []).filter((review) => review.verified && review.status === "published" && !review.suspicious && Number.isInteger(review.rating) && review.rating >= 1 && review.rating <= 5);
  const distribution = { 1: { count: 0, percentage: 0 }, 2: { count: 0, percentage: 0 }, 3: { count: 0, percentage: 0 }, 4: { count: 0, percentage: 0 }, 5: { count: 0, percentage: 0 } } as CustomerFeedbackMetrics["distribution"];
  eligible.forEach((review) => { distribution[review.rating as 1 | 2 | 3 | 4 | 5].count += 1; });
  const ratingCount = eligible.length;
  if (ratingCount === 0) return { averageRating: null, ratingCount: 0, positiveRatingPercentage: null, customerSatisfactionScore: null, distribution, eligibility: "no_ratings" };
  Object.values(distribution).forEach((item) => { item.percentage = round((item.count / ratingCount) * 100); });
  const averageRating = round(eligible.reduce((sum, review) => sum + review.rating, 0) / ratingCount);
  const positiveRatingPercentage = round(((distribution[4].count + distribution[5].count) / ratingCount) * 100);
  const customerSatisfactionScore = round(((averageRating - 1) / 4) * 100);
  return { averageRating, ratingCount, positiveRatingPercentage, customerSatisfactionScore, distribution, eligibility: ratingCount >= minimumReviews ? "eligible" : "insufficient_feedback" };
};

export type ProposedPerformanceInputs = {
  visitorVolume: number | null;
  visitorGrowth: number | null;
  reportingCompleteness: number | null;
  satisfaction: number | null;
  accreditation: number | null;
};

export const calculateProposedPerformanceScore = (inputs: ProposedPerformanceInputs) => {
  const hasAccreditation = typeof inputs.accreditation === "number" && Number.isFinite(inputs.accreditation);
  const weights = hasAccreditation
    ? { visitorVolume: 0.3, visitorGrowth: 0.2, reportingCompleteness: 0.2, satisfaction: 0.2, accreditation: 0.1 }
    : { visitorVolume: 0.35, visitorGrowth: 0.25, reportingCompleteness: 0.2, satisfaction: 0.2 };
  const values: Record<string, number | null> = hasAccreditation
    ? inputs
    : { visitorVolume: inputs.visitorVolume, visitorGrowth: inputs.visitorGrowth, reportingCompleteness: inputs.reportingCompleteness, satisfaction: inputs.satisfaction };
  const entries = Object.entries(weights) as Array<[keyof typeof weights, number]>;
  if (entries.some(([key]) => typeof values[key] !== "number" || !Number.isFinite(values[key] as number))) return { score: null, status: "insufficient_data", modelVersion: hasAccreditation ? "proposed-v1-accreditation" : "proposed-v2-no-accreditation", weights };
  const score = round(entries.reduce((sum, [key, weight]) => sum + (values[key] as number) * weight, 0));
  return { score, status: "proposed", modelVersion: hasAccreditation ? "proposed-v1-accreditation" : "proposed-v2-no-accreditation", weights };
};
