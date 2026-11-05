import { describe, expect, it } from "vitest";
import { getReportWeekRange, periodMatchesDate } from "./reportPeriod";

describe("report period matching", () => {
  it("matches ISO Monday-Sunday weeks", () => {
    const range = getReportWeekRange(2026, 1);
    expect(range).toEqual({ startDate: "2025-12-29", endDate: "2026-01-04" });
    expect(periodMatchesDate("2025-12-29", { type: "week", year: 2026, month: 0, quarter: 1, week: 1 })).toBe(true);
    expect(periodMatchesDate("2026-01-04", { type: "week", year: 2026, month: 0, quarter: 1, week: 1 })).toBe(true);
    expect(periodMatchesDate("2026-01-05", { type: "week", year: 2026, month: 0, quarter: 1, week: 1 })).toBe(false);
  });
});
