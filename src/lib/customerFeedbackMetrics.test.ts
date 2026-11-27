import { describe, expect, it } from "vitest";
import { calculateCustomerFeedback, calculateProposedPerformanceScore } from "./customerFeedbackMetrics";

describe("customer feedback metrics", () => {
  it("uses only verified published non-suspicious reviews", () => {
    const result = calculateCustomerFeedback([
      { rating: 5, verified: true, status: "published", suspicious: false },
      { rating: 4, verified: true, status: "published", suspicious: false },
      { rating: 1, verified: false, status: "published", suspicious: false },
      { rating: 5, verified: true, status: "hidden", suspicious: false },
    ], 2);
    expect(result).toMatchObject({ averageRating: 4.5, ratingCount: 2, positiveRatingPercentage: 100, customerSatisfactionScore: 87.5, eligibility: "eligible" });
  });

  it("does not turn insufficient feedback into a zero score", () => {
    expect(calculateCustomerFeedback([], 5)).toMatchObject({ averageRating: null, customerSatisfactionScore: null, eligibility: "no_ratings" });
    expect(calculateCustomerFeedback([{ rating: 5, verified: true, status: "published", suspicious: false }], 5).eligibility).toBe("insufficient_feedback");
  });

  it("keeps proposed scoring models versioned and non-official", () => {
    const result = calculateProposedPerformanceScore({ visitorVolume: 80, visitorGrowth: 70, reportingCompleteness: 90, satisfaction: 60, accreditation: null });
    expect(result).toMatchObject({ modelVersion: "proposed-v2-no-accreditation", status: "proposed", score: 75.5 });
  });
});
