import { describe, expect, it } from "vitest";

import { aggregateMonthlyMetrics, buildDeterministicAnomalies, coverageConfidence, deriveReportEvidence, hasConsistentAnomalyEvidence } from "./tourismMetrics.js";

describe("tourism monthly metrics", () => {
  it("classifies coverage deterministically without model input", () => {
    expect(coverageConfidence(8.7)).toBe("Very Low");
    expect(coverageConfidence(20)).toBe("Very Low");
    expect(coverageConfidence(41.9)).toBe("Low");
    expect(coverageConfidence(65)).toBe("Moderate");
    expect(coverageConfidence(90)).toBe("High");
    expect(coverageConfidence(null)).toBe(null);
  });
  it("represents empty months inside an explicit period with missing-report evidence", () => {
    const metrics = aggregateMonthlyMetrics(
      [{ report_date: "2026-01-15", establishment_id: "a", total_guests: 10 }],
      [],
      1,
      0,
      { startDate: "2026-01-01", endDate: "2026-03-31" },
    );
    expect(metrics.map((row) => row.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    expect(metrics[1]).toMatchObject({ dayTourVisitors: 0, submittedVisitorReports: 0, expectedVisitorReports: 28, missingVisitorReports: 28, coveragePercent: 0 });
  });

  it("derives consistent evidence from submitted and expected reports", () => {
    expect(deriveReportEvidence(34, 687)).toEqual({
      missingReports: 653,
      coveragePercent: 34 / 687 * 100,
    });
    expect(hasConsistentAnomalyEvidence({
      current_submitted_reports: 34,
      current_expected_reports: 687,
      current_missing_reports: 653,
      current_coverage_percent: Number((34 / 687 * 100).toFixed(2)),
      previous_submitted_reports: 1,
      previous_expected_reports: 30,
      previous_missing_reports: 29,
      previous_coverage_percent: 3.33,
    })).toBe(true);
    expect(hasConsistentAnomalyEvidence({
      current_submitted_reports: 34,
      current_expected_reports: 687,
      current_missing_reports: 653,
      current_coverage_percent: 5.4,
    })).toBe(false);
  });

  it("aggregates visitor rows and counts distinct establishment/date submissions", () => {
    const metrics = aggregateMonthlyMetrics(
      [
        { report_date: "2026-02-01", establishment_id: "a", total_guests: 600 },
        { report_date: "2026-02-01", created_at: "2026-02-02T01:00:00Z", establishment_id: "a", total_guests: 100 },
        { report_date: "2026-02-02", establishment_id: "b", total_guests: 300 },
        { report_date: "2026-03-01", establishment_id: "a", total_guests: 400 },
      ],
      [{ report_date: "2026-02-01", establishment_id: "h", total_check_ins: 50 }],
      2,
    );

    expect(metrics).toEqual([
      expect.objectContaining({
        month: "2026-02",
        dayTourVisitors: 1000,
        guestCheckIns: 50,
        submittedVisitorReports: 2,
        expectedVisitorReports: 56,
        missingVisitorReports: 54,
        enteredAfterReportDateVisitorReports: 1,
        lateVisitorReports: 0,
      }),
      expect.objectContaining({
        month: "2026-03",
        dayTourVisitors: 400,
        submittedVisitorReports: 1,
        expectedVisitorReports: 62,
      }),
    ]);
  });

  it("creates a deterministic high anomaly with evidence for a 50% drop", () => {
    const metrics = aggregateMonthlyMetrics(
      [
        { report_date: "2026-02-01", establishment_id: "a", total_guests: 1200 },
        { report_date: "2026-03-01", establishment_id: "a", total_guests: 600 },
      ],
      [],
      1,
    );
    const [anomaly] = buildDeterministicAnomalies(metrics);

    expect(anomaly).toMatchObject({
      type: "Day-tour visitor decline",
      severity: "high",
      evidence: {
        metric: "dayTourVisitors",
        previous_value: 1200,
        current_value: 600,
        drop_percent: 50,
        anomaly_key: "day-tour-visitors:2026-03",
      },
    });
  });

  it("does not classify a zero-report month as a visitor decline", () => {
    const metrics = aggregateMonthlyMetrics(
      [{ report_date: "2026-11-01", establishment_id: "a", total_guests: 2400 }],
      [],
      1,
      0,
      { startDate: "2026-11-01", endDate: "2026-12-31" },
    );
    expect(metrics[1].submittedVisitorReports).toBe(0);
    expect(buildDeterministicAnomalies(metrics)).toHaveLength(0);
  });
  it("does not compare non-adjacent months as if they were consecutive", () => {
    const metrics = aggregateMonthlyMetrics(
      [
        { report_date: "2026-02-01", establishment_id: "a", total_guests: 1400 },
        { report_date: "2026-11-01", establishment_id: "a", total_guests: 886 },
      ],
      [],
      1,
    );

    expect(buildDeterministicAnomalies(metrics)).toHaveLength(0);
  });

  it("does not alert for a drop below the configured threshold", () => {
    const metrics = aggregateMonthlyMetrics(
      [
        { report_date: "2026-02-01", establishment_id: "a", total_guests: 1000 },
        { report_date: "2026-03-01", establishment_id: "a", total_guests: 800 },
      ],
      [],
      1,
    );

    expect(buildDeterministicAnomalies(metrics)).toHaveLength(0);
  });

  it("creates a separate overnight guest check-in decline with accommodation evidence", () => {
    const metrics = aggregateMonthlyMetrics(
      [],
      [
        { report_date: "2026-04-01", establishment_id: "hotel-a", total_check_ins: 100 },
        { report_date: "2026-05-03", created_at: "2026-05-04T09:00:00Z", establishment_id: "hotel-a", total_check_ins: 60 },
      ],
      0,
      1,
    );
    const anomalies = buildDeterministicAnomalies(metrics);
    const overnight = anomalies.find((anomaly) => anomaly.evidence.metric === "overnightGuestCheckIns");

    expect(overnight).toMatchObject({
      type: "Overnight guest check-in decline",
      severity: "medium",
      evidence: {
        previous_value: 100,
        current_value: 60,
        drop_percent: 40,
        current_late_reports: 0,
        current_entered_after_report_date: 1,
        current_missing_reports: 30,
        current_coverage_percent: 3.23,
      },
    });
    expect(overnight?.description).toContain("Reported overnight guest check-ins decreased 40.0% from April to May 2026, with 3.2% accommodation reporting coverage.");
    expect("recommendation" in (overnight ?? {})).toBe(false);
  });

  it("explains missing and late submissions in deterministic anomaly evidence", () => {
    const metrics = aggregateMonthlyMetrics(
      [
        { report_date: "2026-02-01", establishment_id: "a", total_guests: 1200 },
        { report_date: "2026-03-01", establishment_id: "a", created_at: "2026-03-04T09:00:00Z", total_guests: 600 },
      ],
      [],
      2,
    );

    const [anomaly] = buildDeterministicAnomalies(metrics);

    expect(anomaly.description).toContain("with 1.6% reporting coverage.");
    expect(anomaly.description).toContain("61 expected day-tour reports are missing.");
    expect(anomaly.description).toContain("1 submitted report was entered after the report date; submission timing requires verification.");
    expect(anomaly.evidence).toMatchObject({
      current_missing_reports: 61,
      current_late_reports: 0,
      current_entered_after_report_date: 1,
    });
  });

  it("does not create expected reports for future months after the Manila cutoff", () => {
    const metrics = aggregateMonthlyMetrics(
      [{ report_date: "2026-11-01", establishment_id: "a", total_guests: 2400 }],
      [],
      1,
      0,
      { startDate: "2026-11-01", endDate: "2026-12-31" },
      "2026-11-27",
    );
    expect(metrics.find((row) => row.month === "2026-11")).toMatchObject({ expectedVisitorReports: 27 });
    expect(metrics.find((row) => row.month === "2026-12")).toMatchObject({ expectedVisitorReports: null, missingVisitorReports: null, coveragePercent: null });
    expect(buildDeterministicAnomalies(metrics)).toHaveLength(0);
  });
});
