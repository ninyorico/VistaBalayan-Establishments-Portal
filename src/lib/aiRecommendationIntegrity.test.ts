import { describe, expect, it } from "vitest";
import {
  assignRecommendationsToAnomalies,
  deduplicateStandaloneRecommendations,
  isEvidenceBoundRecommendation,
  recommendationSupportsPeriod,
} from "./aiRecommendationIntegrity";

describe("AI recommendation integrity", () => {
  const candidates = [
    { id: "overnight-1", recommended_action: "Contact reporting establishments with missing accommodation reports and set a completion deadline.", input_snapshot: { metric: "overnightGuestCheckIns" } },
    { id: "overnight-duplicate", recommended_action: "Contact reporting establishments with missing accommodation reports and set a completion deadline.", input_snapshot: { metric: "overnightGuestCheckIns" } },
    { id: "day-tour-1", recommended_action: "Assign follow-up on day-tour visitor origins and target declining locations for the next reporting period.", input_snapshot: { metric: "dayTourVisitors" } },
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

  it("does not attach a recommendation outside its generated period", () => {
    expect(recommendationSupportsPeriod({ id: "period", input_snapshot: { analysis_period: { selectedStartDate: "2026-01-01", selectedEndDate: "2026-01-31" } } }, "2026-01")).toBe(true);
    expect(recommendationSupportsPeriod({ id: "period", input_snapshot: { analysis_period: { selectedStartDate: "2026-01-01", selectedEndDate: "2026-01-31" } } }, "2026-02")).toBe(false);
  });

  it("rejects generic and unsupported causal actions", () => {
    expect(isEvidenceBoundRecommendation("Review this trend and take one focused action.", "overnightGuestCheckIns")).toBe(false);
    expect(isEvidenceBoundRecommendation("Visitors declined because of bad weather.", "dayTourVisitors")).toBe(false);
    expect(isEvidenceBoundRecommendation("Contact reporting establishments with missing accommodation reports and set a completion deadline.", "overnightGuestCheckIns")).toBe(true);
    expect(isEvidenceBoundRecommendation("Review missing accommodation reports.", "overnightGuestCheckIns")).toBe(false);
    expect(isEvidenceBoundRecommendation("Compare June and July 2025 accommodation reports.", "overnightGuestCheckIns")).toBe(false);
    expect(isEvidenceBoundRecommendation("Launch targeted promotions to increase overnight stays.", "overnightGuestCheckIns")).toBe(false);
    expect(isEvidenceBoundRecommendation("Review lodging capacity to match demand.", "overnightGuestCheckIns")).toBe(false);
    expect(isEvidenceBoundRecommendation("Assign follow-up on visitor origin growth for the next reporting period.", "visitorOrigins")).toBe(true);
    expect(isEvidenceBoundRecommendation("Coordinate establishment consultations for low reported visitor volume.", "establishmentPerformance")).toBe(true);
  });
});
