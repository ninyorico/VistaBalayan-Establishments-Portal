export type ReportPeriodType = "month" | "quarter" | "week" | "year";

export interface ReportPeriodSelection {
  type: ReportPeriodType;
  year: number;
  month: number;
  quarter: number;
  week: number;
}

export const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleString("default", { month: "long" })
);

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export const getReportWeekRange = (year: number, week: number) => {
  const start = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7 - 1));
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

export const getReportWeekLabel = (year: number, week: number) => {
  const range = getReportWeekRange(year, week);
  return `Week ${week} (${range.startDate} to ${range.endDate})`;
};

export const periodMatchesDate = (dateValue: string | null | undefined, period: ReportPeriodSelection) => {
  if (!dateValue) return false;
  const date = dateValue.slice(0, 10);
  if (period.type === "week") {
    const range = getReportWeekRange(period.year, period.week);
    return date >= range.startDate && date <= range.endDate;
  }
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.getFullYear() !== period.year) return false;
  if (period.type === "month") return parsedDate.getMonth() === period.month;
  if (period.type === "quarter") return Math.floor(parsedDate.getMonth() / 3) + 1 === period.quarter;
  return true;
};

export const periodToMonthValue = (period: ReportPeriodSelection) =>
  `${period.year}-${String(period.month + 1).padStart(2, "0")}`;
