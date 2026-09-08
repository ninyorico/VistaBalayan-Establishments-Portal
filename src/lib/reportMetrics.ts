export interface RawReportRecord {
  id: string;
  report_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  total_guests?: number | null;
  total_rooms?: number | null;
  total_occupied_rooms?: number | null;
  total_check_ins?: number | null;
  total_guest_nights?: number | null;
}

export interface StaffSubmissionSummary {
  id: string;
  type: "Visitor Report" | "Accommodation Report";
  reportDate: string;
  submittedDate: string;
  status: string;
  dataSummary: string;
  recordCount: number;
  sortDate: string;
}

export const getDaysInMonth = (dateValue?: string | null) => {
  if (!dateValue) return 1;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 1;
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
};

export const formatMonthYear = (dateValue?: string | null) => {
  if (!dateValue) return "No report date";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toLocaleString("default", { month: "long", year: "numeric" });
};

export const formatDate = (dateValue?: string | null) => {
  if (!dateValue) return "No date";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return "Invalid date";
  return date.toISOString().slice(0, 10);
};

export const calculateAccommodationOccupancy = (
  occupiedRooms?: number | null,
  totalRooms?: number | null,
  reportDate?: string | null
) => {
  const occupied = Number(occupiedRooms || 0);
  const rooms = Number(totalRooms || 0);
  if (rooms <= 0 || occupied <= 0) return 0;

  // Normal reports in this app are daily: occupied rooms / configured rooms.
  // Some historical rows contain impossible occupied counts. When occupied
  // exceeds inventory, treat it as room-nights for that month, then cap at 100%
  // so the UI never shows impossible values like 2530%.
  const denominator = occupied > rooms ? rooms * getDaysInMonth(reportDate) : rooms;
  return denominator > 0 ? Math.min((occupied / denominator) * 100, 100) : 0;
};

export const calculateAverageAccommodationOccupancy = (
  reports: RawReportRecord[] = []
) => {
  if (reports.length === 0) return 0;

  const totals = reports.reduce(
    (result, report) => {
      const occupied = Number(report.total_occupied_rooms ?? 0);
      const rooms = Number(report.total_rooms ?? 0);
      if (rooms <= 0 || occupied < 0) return result;
      const representedDays = occupied > rooms ? getDaysInMonth(report.report_date) : 1;
      result.occupied += occupied;
      result.available += rooms * representedDays;
      return result;
    },
    { occupied: 0, available: 0 }
  );

  return totals.available > 0 ? (totals.occupied / totals.available) * 100 : 0;
};

export const groupStaffSubmissions = (
  visitorReports: RawReportRecord[] = [],
  accommodationReports: RawReportRecord[] = []
): StaffSubmissionSummary[] => {
  const visitorGroups = new Map<string, StaffSubmissionSummary & { totalVisitors: number }>();

  visitorReports.forEach((item) => {
    const status = item.status || "pending";
    const reportDate = item.report_date || "No report date";
    const key = `visitor-${reportDate}-${status}`;
    const current = visitorGroups.get(key);

    if (current) {
      current.totalVisitors += Number(item.total_guests || 0);
      current.recordCount += 1;
      if ((item.created_at || "") > current.sortDate) {
        current.sortDate = item.created_at || current.sortDate;
        current.submittedDate = formatDate(item.created_at);
      }
    } else {
      visitorGroups.set(key, {
        id: key,
        type: "Visitor Report",
        reportDate,
        submittedDate: formatDate(item.created_at),
        status,
        dataSummary: "0 visitors",
        recordCount: 1,
        sortDate: item.created_at || reportDate,
        totalVisitors: Number(item.total_guests || 0),
      });
    }
  });

  const visitorSubmissions = Array.from(visitorGroups.values()).map((group) => ({
    ...group,
    dataSummary:
      group.recordCount > 1
        ? `${group.totalVisitors.toLocaleString()} visitors across ${group.recordCount} entries`
        : `${group.totalVisitors.toLocaleString()} visitors`,
  }));

  const accommodationSubmissions = accommodationReports.map((item) => {
    const occupancy = calculateAccommodationOccupancy(
      item.total_occupied_rooms,
      item.total_rooms,
      item.report_date
    );

    return {
      id: item.id,
      type: "Accommodation Report" as const,
      reportDate: item.report_date || "No report date",
      submittedDate: formatDate(item.created_at),
      status: item.status || "pending",
      dataSummary: `${occupancy.toFixed(1)}% occupancy`,
      recordCount: 1,
      sortDate: item.created_at || item.report_date || "",
    };
  });

  return [...visitorSubmissions, ...accommodationSubmissions].sort(
    (a, b) => new Date(b.sortDate).getTime() - new Date(a.sortDate).getTime()
  );
};
