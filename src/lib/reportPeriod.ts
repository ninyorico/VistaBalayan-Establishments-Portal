export type ReportPeriodType = "month" | "quarter" | "week" | "year" | "custom";

export interface ReportPeriodSelection {
  type: ReportPeriodType;
  year: number;
  month: number;
  quarter: number;
  week: number;
  startDate?: string;
  endDate?: string;
}

export const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleString("default", { month: "long" })
);

const formatDate = (date: Date) => date.toISOString().slice(0, 10);

export const getReportWeekRange = (year: number, week: number) => {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const start = new Date(jan4);
  start.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  const end = new Date(start);
  end.setUTCDate(start.getUTCDate() + 6);
  return { startDate: formatDate(start), endDate: formatDate(end) };
};

export const getReportWeekLabel = (year: number, week: number) => {
  const range = getReportWeekRange(year, week);
  return `Week ${week} (${range.startDate} to ${range.endDate})`;
};

export const getReportPeriodRange = (period: ReportPeriodSelection) => {
  if (period.type === "custom") return { startDate: period.startDate || "", endDate: period.endDate || "" };
  if (period.type === "week") return getReportWeekRange(period.year, period.week);
  if (period.type === "month") {
    return {
      startDate: formatDate(new Date(Date.UTC(period.year, period.month, 1))),
      endDate: formatDate(new Date(Date.UTC(period.year, period.month + 1, 0))),
    };
  }
  if (period.type === "quarter") {
    return {
      startDate: formatDate(new Date(Date.UTC(period.year, (period.quarter - 1) * 3, 1))),
      endDate: formatDate(new Date(Date.UTC(period.year, period.quarter * 3, 0))),
    };
  }
  return { startDate: `${period.year}-01-01`, endDate: `${period.year}-12-31` };
};

export const periodMatchesDate = (dateValue: string | null | undefined, period: ReportPeriodSelection) => {
  if (!dateValue) return false;
  const date = dateValue.slice(0, 10);
  const range = getReportPeriodRange(period);
  if (period.type === "week" || period.type === "custom") return Boolean(range.startDate && range.endDate) && date >= range.startDate && date <= range.endDate;
  const parsedDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsedDate.getTime()) || parsedDate.getFullYear() !== period.year) return false;
  if (period.type === "month") return parsedDate.getMonth() === period.month;
  if (period.type === "quarter") return Math.floor(parsedDate.getMonth() / 3) + 1 === period.quarter;
  return true;
};

export const periodToMonthValue = (period: ReportPeriodSelection) =>
  `${period.year}-${String(period.month + 1).padStart(2, "0")}`;
