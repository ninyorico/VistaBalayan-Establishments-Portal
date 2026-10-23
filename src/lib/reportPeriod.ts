export type ReportPeriodType = "month" | "quarter" | "week" | "year";

export interface ReportPeriodSelection {
  type: ReportPeriodType;
  year: number;
  month: number;
  quarter: number;
}

export const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleString("default", { month: "long" })
);

export const periodMatchesDate = (dateValue: string | null | undefined, period: ReportPeriodSelection) => {
  if (!dateValue) return false;
  const date = new Date(`${dateValue.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime()) || date.getFullYear() !== period.year) return false;
  if (period.type === "month") return date.getMonth() === period.month;
  if (period.type === "quarter") return Math.floor(date.getMonth() / 3) + 1 === period.quarter;
  return true;
};

export const periodToMonthValue = (period: ReportPeriodSelection) =>
  `${period.year}-${String(period.month + 1).padStart(2, "0")}`;
