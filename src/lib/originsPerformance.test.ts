import { describe, expect, it } from "vitest";
import { buildVisitorOriginMetrics, classifyOriginMetric } from "./visitorOriginMetrics";
import { buildPerformanceScores } from "./establishmentPerformanceScores";

describe("visitor origin metrics", () => {
  it("calculates known-origin share and keeps unknown visitors outside the denominator", () => {
    const result = buildVisitorOriginMetrics([
      { origin: "Batangas", scope: "Domestic", currentVisitors: 750, previousVisitors: 500 },
      { origin: "Japan", scope: "International", currentVisitors: 250, previousVisitors: 400 },
    ], { currentTotalVisitors: 1200, previousTotalVisitors: 1000, currentUnknownVisitors: 200, previousUnknownVisitors: 100 });
    expect(result.currentKnownVisitors).toBe(1000);
    expect(result.rows[0]).toMatchObject({ marketShare: 75, classification: "Dominant", absoluteChange: 250 });
    expect(result.rows[1]).toMatchObject({ marketShare: 25, classification: "Declining" });
    expect(result.currentOriginCoverage).toBeCloseTo(83.333, 2);
  });

  it("does not call a new small-base observation growth without a prior", () => {
    expect(classifyOriginMetric({ currentVisitors: 7, previousVisitors: 0, marketShare: 1 })).toBe("Insufficient Data");
  });

  it("keeps dominance independent from growth direction and distinguishes newly observed markets", () => {
    const result = buildVisitorOriginMetrics([
      { origin: "Batangas", scope: "Domestic", currentVisitors: 1200, previousVisitors: 900 },
      { origin: "New town", scope: "Domestic", currentVisitors: 7, previousVisitors: 0 },
    ], { currentTotalVisitors: 1207, previousTotalVisitors: 900 });
    expect(result.rows[0]).toMatchObject({ isDominant: true, growthDirection: "Growing", developmentStatus: "Established" });
    expect(result.rows[1]).toMatchObject({ isDominant: false, growthDirection: "Insufficient Data", developmentStatus: "Newly observed" });
  });

  it("does not classify a small new origin as proven emerging growth", () => {
    const result = buildVisitorOriginMetrics([
      { origin: "Small new origin", scope: "Domestic", currentVisitors: 99, previousVisitors: 0 },
    ], { currentTotalVisitors: 99, previousTotalVisitors: 0 });
    expect(result.rows[0].developmentStatus).toBe("Newly observed");
    expect(result.rows[0].classification).toBe("Dominant");
  });
});

describe("establishment performance scores", () => {
  it("matches the documented four-indicator calculation", () => {
    const [row] = buildPerformanceScores([{
      id: "a", name: "Resort A", category: "daytour", currentVisitors: 13000, previousVisitors: 11818.1818,
      averageRating: 1.5, ratingCount: 20, feedbackEligible: true, submittedReports: 365, expectedReports: 365,
    }, {
      id: "b", name: "Resort B", category: "daytour", currentVisitors: 9100, previousVisitors: 7000,
      averageRating: 4.6, ratingCount: 20, feedbackEligible: true, submittedReports: 347, expectedReports: 365,
    }]);
    expect(row.score).toBeCloseTo(61.375, 2);
    expect(row.rank).toBe(2);
  });

  it("withholds the score when a required indicator is unavailable", () => {
    const [row] = buildPerformanceScores([{
      id: "a", name: "No Reviews", category: "daytour", currentVisitors: 100, previousVisitors: 100,
      averageRating: null, ratingCount: 0, feedbackEligible: false, submittedReports: 10, expectedReports: 10,
    }]);
    expect(row.score).toBeNull();
    expect(row.eligibilityReason).toContain("eligible rating sample");
  });
});
