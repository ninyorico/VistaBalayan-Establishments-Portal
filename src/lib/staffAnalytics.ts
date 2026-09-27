import { calculateAccommodationOccupancy } from "./reportMetrics";

export type VisitorReport = {
  id: string;
  report_date: string | null;
  created_at?: string | null;
  total_guests?: number | null;
  total_male?: number | null;
  total_female?: number | null;
  residence_type?: string | null;
  status?: string | null;
};

export type AccommodationReport = {
  id: string;
  report_date: string | null;
  created_at?: string | null;
  total_rooms?: number | null;
  total_occupied_rooms?: number | null;
  total_check_ins?: number | null;
  total_guest_nights?: number | null;
  status?: string | null;
};

export type VisitorMonth = {
  monthKey: string;
  month: string;
  visitors: number;
  male: number;
  female: number;
  reportCount: number;
};

export type AccommodationMonth = {
  monthKey: string;
  month: string;
  checkIns: number;
  guestNights: number;
  occupancyRate: number;
  guestsPerRoom: number;
  guestNightAverage: number;
  reportCount: number;
};

export const toNumber = (value?: number | null) => Number(value || 0);

export const isOfficialReport = (report: { status?: string | null }) =>
  (report.status || "pending") === "submitted";

export const currentYear = () => new Date().getFullYear();

export const currentMonthKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const monthKeyForReport = (report: { report_date?: string | null; created_at?: string | null }) =>
  (report.report_date || report.created_at || "").slice(0, 7);

export const monthName = (monthKey: string) => {
  const monthNumber = Number(monthKey.slice(5, 7));
  if (!monthNumber) return "No date";
  return new Date(2000, monthNumber - 1, 1).toLocaleString("default", { month: "short" });
};

export const yearMonths = (year: number) =>
  Array.from({ length: 12 }, (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`);

export const buildVisitorMonthlySeries = (reports: VisitorReport[], year: number): VisitorMonth[] => {
  const monthMap = new Map<string, VisitorMonth>();
  yearMonths(year).forEach((monthKey) => {
    monthMap.set(monthKey, { monthKey, month: monthName(monthKey), visitors: 0, male: 0, female: 0, reportCount: 0 });
  });

  reports.forEach((report) => {
    const monthKey = monthKeyForReport(report);
    const current = monthMap.get(monthKey);
    if (!current) return;
    current.visitors += toNumber(report.total_guests);
    current.male += toNumber(report.total_male);
    current.female += toNumber(report.total_female);
    current.reportCount += 1;
  });

  return Array.from(monthMap.values());
};

export const buildAccommodationMonthlySeries = (reports: AccommodationReport[], year: number): AccommodationMonth[] => {
  const monthMap = new Map<string, {
    monthKey: string;
    month: string;
    checkIns: number;
    guestNights: number;
    occupiedRooms: number;
    occupancyRates: number[];
    reportCount: number;
  }>();
  yearMonths(year).forEach((monthKey) => {
    monthMap.set(monthKey, { monthKey, month: monthName(monthKey), checkIns: 0, guestNights: 0, occupiedRooms: 0, occupancyRates: [], reportCount: 0 });
  });

  reports.forEach((report) => {
    const monthKey = monthKeyForReport(report);
    const current = monthMap.get(monthKey);
    if (!current) return;
    current.checkIns += toNumber(report.total_check_ins);
    current.guestNights += toNumber(report.total_guest_nights);
    current.occupiedRooms += toNumber(report.total_occupied_rooms);
    current.occupancyRates.push(calculateAccommodationOccupancy(report.total_occupied_rooms, report.total_rooms, report.report_date));
    current.reportCount += 1;
  });

  return Array.from(monthMap.values()).map((month) => ({
    monthKey: month.monthKey,
    month: month.month,
    checkIns: month.checkIns,
    guestNights: month.guestNights,
    occupancyRate: month.occupancyRates.length > 0
      ? Number((month.occupancyRates.reduce((sum, rate) => sum + rate, 0) / month.occupancyRates.length).toFixed(2))
      : 0,
    guestsPerRoom: month.occupiedRooms > 0 ? Number((month.guestNights / month.occupiedRooms).toFixed(2)) : 0,
    guestNightAverage: month.checkIns > 0 ? Number((month.guestNights / month.checkIns).toFixed(2)) : 0,
    reportCount: month.reportCount,
  }));
};

export const average = (values: number[]) =>
  values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;

export const residenceTotals = (reports: VisitorReport[]) => {
  const totals = new Map<string, number>();
  reports.forEach((report) => {
    const residence = report.residence_type || "Unspecified";
    totals.set(residence, (totals.get(residence) || 0) + toNumber(report.total_guests));
  });
  return Array.from(totals.entries())
    .map(([residence, visitors]) => ({ residence, visitors }))
    .sort((a, b) => b.visitors - a.visitors);
};
