import { describe, expect, it } from "vitest";
import { getGrandTotalLabels, getGrandTotalMetricConfig, shouldIncludeGrandTotal } from "./officialArrivalsExport";

describe("establishment submission-history export totals", () => {
  it("omits grand total for month, quarter, and week exports", () => {
    expect(shouldIncludeGrandTotal({ selectedMonth: 11 })).toBe(false);
    expect(shouldIncludeGrandTotal({ selectedMonths: [10, 11, 12] })).toBe(false);
    expect(shouldIncludeGrandTotal({ selectedMonths: [11], weeklyLabel: "Week 48" })).toBe(false);
  });

  it("includes grand total only for yearly exports", () => {
    expect(shouldIncludeGrandTotal({})).toBe(true);
  });

  it("removes the overnight block from day-tour grand totals", () => {
    expect(getGrandTotalLabels("daytour")).toEqual({
      E3: "Daytour",
      E9: "All Total",
      E12: "MALE",
      E15: "FEMALE",
      E18: "TOTAL M AND F",
    });
    expect(getGrandTotalLabels("overnight").E6).toBe("Overnight");
  });

  it("uses overnight guest check-ins for overnight grand totals", () => {
    expect(getGrandTotalMetricConfig("overnight")).toEqual({ metricColumn: "E", metricStartRowOffset: 14, metricTotalRowOffset: 26 });
    expect(getGrandTotalMetricConfig("daytour")).toEqual({ metricColumn: "P", metricStartRowOffset: 15, metricTotalRowOffset: 0 });
  });
});
