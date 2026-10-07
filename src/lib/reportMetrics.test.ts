import { describe, expect, it } from "vitest";

import {
  calculateAccommodationOccupancy,
  groupStaffSubmissions,
  type RawReportRecord,
} from "./reportMetrics";

describe("calculateAccommodationOccupancy", () => {
  it("returns daily occupancy when occupied rooms are within configured inventory", () => {
    expect(calculateAccommodationOccupancy(12, 40, "2026-10-15")).toBe(30);
  });

  it("returns 0 when total room inventory is missing or zero", () => {
    expect(calculateAccommodationOccupancy(8, 0, "2026-10-15")).toBe(0);
    expect(calculateAccommodationOccupancy(8, null, "2026-10-15")).toBe(0);
  });

  it("returns 0 when occupied rooms are missing or zero", () => {
    expect(calculateAccommodationOccupancy(0, 25, "2026-10-15")).toBe(0);
    expect(calculateAccommodationOccupancy(null, 25, "2026-10-15")).toBe(0);
  });

  it("treats impossible occupied counts as monthly room-nights before calculating the rate", () => {
    expect(calculateAccommodationOccupancy(120, 10, "2026-04-01")).toBe(40);
  });

  it("caps unusually large calculated occupancy at 100 percent", () => {
    expect(calculateAccommodationOccupancy(400, 10, "2026-04-01")).toBe(100);
  });
});

describe("groupStaffSubmissions", () => {
  it("groups visitor reports by report date and status, summing guests and record count", () => {
    const visitorReports: RawReportRecord[] = [
      {
        id: "visitor-1",
        report_date: "2026-10-01",
        created_at: "2026-10-02T08:00:00.000Z",
        status: "approved",
        total_guests: 12,
      },
      {
        id: "visitor-2",
        report_date: "2026-10-01",
        created_at: "2026-10-02T09:00:00.000Z",
        status: "approved",
        total_guests: 18,
      },
    ];

    expect(groupStaffSubmissions(visitorReports, [])).toMatchObject([
      {
        id: "visitor-2026-10-01-approved",
        type: "Visitor Report",
        reportDate: "2026-10-01",
        status: "approved",
        dataSummary: "30 visitors across 2 entries",
        recordCount: 2,
      },
    ]);
  });

  it("keeps visitor reports with different statuses in separate summary rows", () => {
    const visitorReports: RawReportRecord[] = [
      {
        id: "visitor-approved",
        report_date: "2026-10-01",
        created_at: "2026-10-02T08:00:00.000Z",
        status: "approved",
        total_guests: 10,
      },
      {
        id: "visitor-pending",
        report_date: "2026-10-01",
        created_at: "2026-10-02T09:00:00.000Z",
        status: "pending",
        total_guests: 5,
      },
    ];

    const result = groupStaffSubmissions(visitorReports, []);

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.id).sort()).toEqual([
      "visitor-2026-10-01-approved",
      "visitor-2026-10-01-pending",
    ]);
  });

  it("creates accommodation summary rows with occupancy percentage text", () => {
    const accommodationReports: RawReportRecord[] = [
      {
        id: "accommodation-1",
        report_date: "2026-10-03",
        created_at: "2026-10-04T10:00:00.000Z",
        status: "on_hold",
        total_occupied_rooms: 15,
        total_rooms: 30,
      },
    ];

    expect(groupStaffSubmissions([], accommodationReports)).toMatchObject([
      {
        id: "accommodation-1",
        type: "Accommodation Report",
        reportDate: "2026-10-03",
        submittedDate: "2026-10-04",
        status: "on_hold",
        dataSummary: "50.0% occupancy",
        recordCount: 1,
      },
    ]);
  });

  it("defaults missing statuses and dates to safe display values", () => {
    const visitorReports: RawReportRecord[] = [
      {
        id: "visitor-missing-fields",
        total_guests: 7,
      },
    ];
    const accommodationReports: RawReportRecord[] = [
      {
        id: "accommodation-missing-fields",
        total_occupied_rooms: 3,
        total_rooms: 6,
      },
    ];

    const result = groupStaffSubmissions(visitorReports, accommodationReports);

    expect(result).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "visitor-No report date-pending",
          reportDate: "No report date",
          submittedDate: "No date",
          status: "pending",
          dataSummary: "7 visitors",
        }),
        expect.objectContaining({
          id: "accommodation-missing-fields",
          reportDate: "No report date",
          submittedDate: "No date",
          status: "pending",
          dataSummary: "50.0% occupancy",
        }),
      ])
    );
  });

  it("sorts combined visitor and accommodation summaries by newest submission date first", () => {
    const visitorReports: RawReportRecord[] = [
      {
        id: "visitor-old",
        report_date: "2026-09-01",
        created_at: "2026-09-02T08:00:00.000Z",
        status: "approved",
        total_guests: 20,
      },
    ];
    const accommodationReports: RawReportRecord[] = [
      {
        id: "accommodation-new",
        report_date: "2026-10-01",
        created_at: "2026-10-02T08:00:00.000Z",
        status: "approved",
        total_occupied_rooms: 5,
        total_rooms: 10,
      },
    ];

    const result = groupStaffSubmissions(visitorReports, accommodationReports);

    expect(result.map((row) => row.id)).toEqual([
      "accommodation-new",
      "visitor-2026-09-01-approved",
    ]);
  });
});
