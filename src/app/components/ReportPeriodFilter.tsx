import type { ReportPeriodSelection, ReportPeriodType } from "../../lib/reportPeriod";
import { monthNames, periodToMonthValue, getReportWeekLabel } from "../../lib/reportPeriod";

interface Props {
  value: ReportPeriodSelection;
  availableYears: number[];
  onChange: (value: ReportPeriodSelection) => void;
  className?: string;
}

const periodOptions: Array<{ value: ReportPeriodType; label: string }> = [
  { value: "month", label: "Month" },
  { value: "quarter", label: "Quarter" },
  { value: "week", label: "Week" },
  { value: "year", label: "Year" },
];

const selectClass = "min-w-0 rounded-2xl border border-[#D2D8E0] bg-[#E8EDF2] px-3 py-2.5 text-sm text-[#3D4852] shadow-[inset_3px_3px_7px_rgba(163,177,198,0.35),inset_-3px_-3px_7px_rgba(255,255,255,0.7)] outline-none transition focus:border-[#8FC9DC] focus:ring-2 focus:ring-[#8FC9DC]/50 sm:px-4";

export default function ReportPeriodFilter({ value, availableYears, onChange, className = "" }: Props) {
  const years = availableYears.length > 0 ? availableYears : [value.year];
  const monthValue = periodToMonthValue(value);

  return (
    <div className={`flex min-w-0 flex-wrap items-center gap-2 ${className}`}>
      <select
        value={value.type}
        onChange={(event) => onChange({ ...value, type: event.target.value as ReportPeriodType })}
        className={`${selectClass} w-[116px] shrink-0`}
        aria-label="Select reporting period type"
      >
        {periodOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>

      {value.type === "month" ? (
        <select
          value={monthValue}
          onChange={(event) => {
            const [year, month] = event.target.value.split("-").map(Number);
            onChange({ ...value, year, month: month - 1 });
          }}
          className={`${selectClass} w-[190px] shrink-0`}
          aria-label="Select reporting month"
        >
          {years.flatMap((year) => monthNames.map((month, index) => (
            <option key={`${year}-${index + 1}`} value={`${year}-${String(index + 1).padStart(2, "0")}`}>
              {month} {year}
            </option>
          )))}
        </select>
      ) : value.type === "week" ? (
        <>
          <select
            value={value.year}
            onChange={(event) => onChange({ ...value, year: Number(event.target.value) })}
            className={`${selectClass} w-[96px] shrink-0`}
            aria-label="Select reporting year"
          >
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <select
            value={value.week}
            onChange={(event) => onChange({ ...value, week: Number(event.target.value) })}
            className={`${selectClass} w-[132px] sm:w-[310px] shrink-0`}
            aria-label="Select reporting week"
          >
            {Array.from({ length: 53 }, (_, index) => index + 1).map((week) => (
              <option key={week} value={week}>{getReportWeekLabel(value.year, week)}</option>
            ))}
          </select>
        </>
      ) : (
        <>
          <select
            value={value.year}
            onChange={(event) => onChange({ ...value, year: Number(event.target.value) })}
            className={`${selectClass} w-[96px] shrink-0`}
            aria-label="Select reporting year"
          >
            {years.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          {value.type === "quarter" && (
            <select
              value={value.quarter}
              onChange={(event) => onChange({ ...value, quarter: Number(event.target.value) })}
              className={`${selectClass} w-[76px] shrink-0`}
              aria-label="Select reporting quarter"
            >
              {[1, 2, 3, 4].map((quarter) => <option key={quarter} value={quarter}>Q{quarter}</option>)}
            </select>
          )}
        </>
      )}
    </div>
  );
}
