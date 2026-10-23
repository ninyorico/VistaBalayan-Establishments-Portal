import { describe, expect, it } from "vitest";
import { buildAccommodationMonthlySeries, buildVisitorMonthlySeries } from "./staffAnalytics";

describe("staff analytics monthly averages", () => {
  it("calculates average occupied rooms per submitted overnight report", () => {
    const months = buildAccommodationMonthlySeries([
      { id: "a", report_date: "2026-10-01", total_rooms: 10, total_occupied_rooms: 4, total_check_ins: 3, total_guest_nights: 4, status: "submitted" },
      { id: "b", report_date: "2026-10-02", total_rooms: 10, total_occupied_rooms: 6, total_check_ins: 7, total_guest_nights: 8, status: "submitted" },
    ], 2026);

    const october = months.find((month) => month.monthKey === "2026-10");
    expect(october?.occupiedRooms).toBe(10);
    expect(october?.averageOccupiedRooms).toBe(5);
  });

  it("keeps combined arrivals average as day-tour visitors plus check-ins per report", () => {
    const visitors = buildVisitorMonthlySeries([
      { id: "v", report_date: "2026-10-01", total_guests: 20, total_male: 10, total_female: 10, status: "submitted" },
    ], 2026);
    const accommodation = buildAccommodationMonthlySeries([
      { id: "a", report_date: "2026-10-02", total_rooms: 10, total_occupied_rooms: 4, total_check_ins: 10, total_guest_nights: 12, status: "submitted" },
    ], 2026);

    const octoberVisitors = visitors.find((month) => month.monthKey === "2026-10");
    const octoberAccommodation = accommodation.find((month) => month.monthKey === "2026-10");
    const reportCount = (octoberVisitors?.reportCount || 0) + (octoberAccommodation?.reportCount || 0);
    const combinedArrivals = (octoberVisitors?.visitors || 0) + (octoberAccommodation?.checkIns || 0);

    expect(combinedArrivals / reportCount).toBe(15);
  });
});
