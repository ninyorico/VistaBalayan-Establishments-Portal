import { describe, expect, it } from "vitest";
import {
  assignRecommendationsToAnomalies,
  deduplicateStandaloneRecommendations,
  isEvidenceBoundRecommendation,
} from "./aiRecommendationIntegrity";

describe("AI recommendation integrity", () => {
  const candidates = [
    { id: "overnight-1", recommended_action: "Validate missing accommodation reports before planning promotions.", input_snapshot: { metric: "overnightGuestCheckIns" } },
    { id: "overnight-duplicate", recommended_action: "Validate missing accommodation reports before planning promotions.", input_snapshot: { metric: "overnightGuestCheckIns" } },
    { id: "day-tour-1", recommended_action: "Review day-tour visitor origins and adjust outreach for declining locations.", input_snapshot: { metric: "dayTourVisitors" } },
    { id: "generic", recommended_action: "Review this trend and take one focused action.", input_snapshot: { metric: "overnightGuestCheckIns" } },
  ];

  it("assigns at most one evidence-bound recommendation to each anomaly", () => {
    const result = assignRecommendationsToAnomalies(
      [
        { id: "a1", metric: "overnightGuestCheckIns" },
        { id: "a2", metric: "overnightGuestCheckIns" },
        { id: "a3", metric: "dayTourVisitors" },
      ],
      candidates,
    );

    expect(result.assignments.get("a1")?.id).toBe("overnight-1");
    expect(result.assignments.has("a2")).toBe(false);
    expect(result.assignments.get("a3")?.id).toBe("day-tour-1");
  });

  it("removes linked and duplicate actions from standalone recommendations", () => {
    const assignments = assignRecommendationsToAnomalies([{ id: "a1", metric: "overnightGuestCheckIns" }], candidates);
    const standalone = deduplicateStandaloneRecommendations(candidates, assignments.usedCandidateIds, assignments.usedActionKeys);
    expect(standalone.map((item) => item.id)).toEqual(["day-tour-1"]);
  });

  it("rejects generic and unsupported causal actions", () => {
    expect(isEvidenceBoundRecommendation("Review this trend and take one focused action.", "overnightGuestCheckIns")).toBe(false);
    expect(isEvidenceBoundRecommendation("Visitors declined because of bad weather.", "dayTourVisitors")).toBe(false);
    expect(isEvidenceBoundRecommendation("Validate missing accommodation reports.", "overnightGuestCheckIns")).toBe(true);
  });
});
