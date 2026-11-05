import { describe, expect, it } from "vitest";
import { shouldIncludeGrandTotal } from "./officialArrivalsExport";

describe("establishment submission-history export totals", () => {
  it("omits grand total for month, quarter, and week exports", () => {
    expect(shouldIncludeGrandTotal({ selectedMonth: 11 })).toBe(false);
    expect(shouldIncludeGrandTotal({ selectedMonths: [10, 11, 12] })).toBe(false);
    expect(shouldIncludeGrandTotal({ selectedMonths: [11], weeklyLabel: "Week 48" })).toBe(false);
  });

  it("includes grand total only for yearly exports", () => {
    expect(shouldIncludeGrandTotal({})).toBe(true);
  });
});
