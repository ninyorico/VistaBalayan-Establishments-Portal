import { describe, expect, it } from "vitest";
import { buildAnalyticsAnalysis, filterAnalyticsFindings, matchesCoverageFilter, type AnalysisEstablishment, type PeriodEvidence } from "./analyticsAnalysis";

const evidence = (value: number | null, submittedReports: number, expectedReports: number | null): PeriodEvidence => ({
  startDate: "2026-10-01",
  endDate: "2026-10-31",
  value,
  submittedReports,
  expectedReports,
  coveragePercent: expectedReports === null ? null : (submittedReports / expectedReports) * 100,
});

const row = (current: PeriodEvidence, previous: PeriodEvidence): AnalysisEstablishment => ({
  id: "a",
  name: "Resort A",
  reportingMode: "visitor",
  current: { daytour: current, overnight: evidence(null, 0, null) },
  previous: { daytour: previous, overnight: evidence(null, 0, null) },
});

describe("analytics analysis", () => {
  it("detects a complete-reporting unusual decline and exposes evidence", () => {
    const result = buildAnalyticsAnalysis([row(evidence(248, 31, 31), evidence(3000, 30, 30))]);
    const finding = result.findings.find((item) => item.pattern === "unusual-decline");
    expect(finding?.evidenceStatus).toBe("complete");
    expect(finding?.absoluteChange).toBe(-2752);
    expect(finding?.percentChange).toBeCloseTo(-91.733, 2);
    expect(finding?.current.coveragePercent).toBe(100);
  });

  it("does not treat missing reports as zero visitor activity", () => {
    const result = buildAnalyticsAnalysis([row(evidence(0, 0, 31), evidence(3000, 30, 30))]);
    expect(result.findings.some((item) => item.pattern === "zero-activity")).toBe(false);
    expect(result.findings.some((item) => item.pattern === "unusual-decline")).toBe(false);
  });

  it("detects a multiple-establishment decline only when the configured minimum is met", () => {
    const rows = [
      row(evidence(750, 31, 31), evidence(3000, 30, 30)),
      { ...row(evidence(1000, 31, 31), evidence(2500, 30, 30)), id: "b", name: "Resort B" },
      { ...row(evidence(900, 31, 31), evidence(1800, 30, 30)), id: "c", name: "Resort C" },
      { ...row(evidence(2400, 31, 31), evidence(2200, 30, 30)), id: "d", name: "Resort D" },
    ];
    const result = buildAnalyticsAnalysis(rows);
    expect(result.multipleDecline.daytour.affectedEstablishments).toBe(3);
    expect(result.multipleDecline.daytour.affectedPercentage).toBe(75);
    expect(result.findings.some((item) => item.pattern === "multiple-establishment-decline")).toBe(true);
  });

  it("filters findings by verified coverage and severity", () => {
    const result = buildAnalyticsAnalysis([row(evidence(248, 20, 31), evidence(3000, 30, 30))]);
    const incomplete = filterAnalyticsFindings(result.findings, "unusual-decline", "incomplete", "all");
    expect(incomplete).toHaveLength(1);
    expect(matchesCoverageFilter(incomplete[0].current, "100")).toBe(false);
  });
});
