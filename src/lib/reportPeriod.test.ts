import { describe, expect, it } from "vitest";
import { getReportPeriodRange, getReportWeekRange, periodMatchesDate } from "./reportPeriod";

describe("report period matching", () => {
  it("matches ISO Monday-Sunday weeks", () => {
    const range = getReportWeekRange(2026, 1);
    expect(range).toEqual({ startDate: "2025-12-29", endDate: "2026-01-04" });
    expect(periodMatchesDate("2025-12-29", { type: "week", year: 2026, month: 0, quarter: 1, week: 1 })).toBe(true);
    expect(periodMatchesDate("2026-01-04", { type: "week", year: 2026, month: 0, quarter: 1, week: 1 })).toBe(true);
    expect(periodMatchesDate("2026-01-05", { type: "week", year: 2026, month: 0, quarter: 1, week: 1 })).toBe(false);
  });

  it("supports custom date ranges", () => {
    const period = { type: "custom" as const, year: 2026, month: 0, quarter: 1, week: 1, startDate: "2026-02-10", endDate: "2026-03-05" };
    expect(getReportPeriodRange(period)).toEqual({ startDate: "2026-02-10", endDate: "2026-03-05" });
    expect(periodMatchesDate("2026-02-10", period)).toBe(true);
    expect(periodMatchesDate("2026-03-06", period)).toBe(false);
  });
});
