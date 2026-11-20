import { describe, expect, it } from "vitest";

import { aggregateMonthlyMetrics, buildDeterministicAnomalies } from "./tourismMetrics.js";

describe("tourism monthly metrics", () => {
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
        lateVisitorReports: 1,
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

    expect(anomaly.description).toContain("Reporting coverage was 1.6%.");
    expect(anomaly.description).toContain("61 expected reports are missing.");
    expect(anomaly.description).toContain("1 submitted report was entered after the report date.");
    expect(anomaly.evidence).toMatchObject({
      current_missing_reports: 61,
      current_late_reports: 1,
    });
  });
});
