import { useState } from "react";
import { Download, Search } from "lucide-react";
import { formatDate } from "../../lib/reportMetrics";
import { getVisitorResidenceLabel, getVisitorResidenceLocation } from "../../lib/reporting";
import ReportPeriodFilter from "./ReportPeriodFilter";
import { periodMatchesDate } from "../../lib/reportPeriod";
import type { ReportPeriodSelection } from "../../lib/reportPeriod";
import { PageHero } from "./vista/PolishedShell";
import { useDominantAxisTableScroll } from "../../hooks/useDominantAxisTableScroll";

interface VisitorRecord {
  id: string;
  report_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  guest_name?: string | null;
  guest_group_name?: string | null;
  total_male?: number | null;
  total_female?: number | null;
  total_guests?: number | null;
  residence_category?: string | null;
  residence_type?: string | null;
  place_of_residence?: string | null;
  municipality?: string | null;
  province?: string | null;
  country?: string | null;
}

interface AccommodationRecord {
  id: string;
  report_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  total_rooms?: number | null;
  total_occupied_rooms?: number | null;
  total_check_ins?: number | null;
  total_guest_nights?: number | null;
}

interface Props {
  visitorReports: VisitorRecord[];
  accommodationReports: AccommodationRecord[];
  canSubmitVisitor: boolean;
  canSubmitAccommodation: boolean;
  searchTerm: string;
  setSearchTerm: (value: string) => void;
  selectedYear: number;
  setSelectedYear: (value: number) => void;
  period: ReportPeriodSelection;
  onPeriodChange: (value: ReportPeriodSelection) => void;
  availableYears: number[];
  onExportVisitor: () => void;
  onExportAccommodation: () => void;
}

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleString("default", { month: "long" })
);

const getDateParts = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { year: date.getFullYear(), month: date.getMonth() };
};

const getResidenceLabel = (record: VisitorRecord) => {
  return getVisitorResidenceLabel(record);
};

const getLocationLabel = (record: VisitorRecord) => getVisitorResidenceLocation(record);

const matchesCommonFilters = (
  record: { report_date?: string | null; created_at?: string | null; status?: string | null },
  searchTerm: string,
  period: ReportPeriodSelection,
  extraText: string
) => {
  const parts = getDateParts(record.report_date);
  const searchText = extraText.toLowerCase();
  return Boolean(parts && periodMatchesDate(record.report_date, period) && searchText.includes(searchTerm.toLowerCase()));
};

export default function EstablishmentSubmissionRecords({
  visitorReports,
  accommodationReports,
  canSubmitVisitor,
  canSubmitAccommodation,
  searchTerm,
  setSearchTerm,
  selectedYear,
  setSelectedYear,
  period,
  onPeriodChange,
  availableYears,
  onExportVisitor,
  onExportAccommodation,
}: Props) {
  const [activeType, setActiveType] = useState<"visitor" | "accommodation">(
    canSubmitVisitor ? "visitor" : "accommodation"
  );

  const { horizontalRef: tableScrollRef } = useDominantAxisTableScroll();

  const filteredVisitors = visitorReports.filter((record) =>
    matchesCommonFilters(
      record,
      searchTerm,
      period,
      [record.guest_group_name, record.residence_category, record.residence_type, record.place_of_residence, record.municipality, record.province, record.country].join(" ")
    )
  );
  const filteredAccommodation = accommodationReports.filter((record) =>
    matchesCommonFilters(
      record,
      searchTerm,
      period,
      [record.total_rooms, record.total_check_ins, record.total_guest_nights].join(" ")
    )
  );

  const isVisitor = activeType === "visitor";
  const activeCount = isVisitor ? filteredVisitors.length : filteredAccommodation.length;
  const hasBothReportTypes = canSubmitVisitor && canSubmitAccommodation;
  const submissionKpis = hasBothReportTypes
    ? [
        ["Total report submissions", filteredVisitors.length + filteredAccommodation.length, "text-sky-700"],
        ["Day-tour report submissions", filteredVisitors.length, "text-blue-600"],
        ["Accommodation report submissions", filteredAccommodation.length, "text-purple-600"],
      ]
    : isVisitor
      ? [
          ["Total submissions", filteredVisitors.length, "text-sky-700"],
          ["Day-tour report submissions", filteredVisitors.length, "text-blue-600"],
        ]
      : [
          ["Total submissions", filteredAccommodation.length, "text-sky-700"],
          ["Accommodation report submissions", filteredAccommodation.length, "text-purple-600"],
        ];

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Establishment portal"
        title="Submission history"
        description="Review the reports submitted by this establishment."
        compact
      />

      {canSubmitVisitor && canSubmitAccommodation && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Submission report type">
          <button
            type="button"
            role="tab"
            aria-selected={isVisitor}
            onClick={() => setActiveType("visitor")}
            className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${isVisitor ? "bg-[#0F4C75] text-white shadow-lg shadow-cyan-950/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Day-tour reports
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isVisitor}
            onClick={() => setActiveType("accommodation")}
            className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${!isVisitor ? "bg-[#0F4C75] text-white shadow-lg shadow-cyan-950/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Accommodation reports
          </button>
        </div>
      )}

      <div className={`grid gap-2 sm:gap-4 ${hasBothReportTypes ? "grid-cols-3" : "grid-cols-2"}`}>
        {submissionKpis.map(([label, value, tone]) => (
          <div key={String(label)} className="min-w-0 rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5">
            <p className="break-words text-[11px] font-medium leading-4 text-slate-500 sm:text-sm sm:leading-5">
              {label}
            </p>
            <p className={`mt-1 text-2xl font-bold tracking-[-0.03em] sm:mt-2 sm:text-3xl ${tone}`}>{value}</p>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">
              {isVisitor ? "Day-tour visitor records" : "Accommodation records"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">Filter the same record set used by the tourism officer monitoring screens.</p>
          </div>
          <button
            type="button"
            onClick={isVisitor ? onExportVisitor : onExportAccommodation}
            disabled={activeCount === 0}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0F4C75] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#0B3D61] disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            <Download className="h-4 w-4" />
            Export {isVisitor ? "resort" : "hotel"} data
          </button>
        </div>

        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4 lg:grid-cols-[minmax(0,1fr)_minmax(304px,auto)] lg:items-center">
          <div className="relative col-span-3 min-w-0 md:col-span-2 lg:col-span-1">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:left-3 sm:h-5 sm:w-5" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={isVisitor ? "Search residence or location" : "Search accommodation records"} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-2 text-xs outline-none focus:border-[#0F4C75] focus:ring-4 focus:ring-cyan-100 sm:pl-10 sm:pr-4 sm:text-sm" />
          </div>
          <ReportPeriodFilter value={period} availableYears={availableYears} onChange={onPeriodChange} className="col-span-3 md:col-span-2 lg:col-span-1 lg:min-w-0" />
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-slate-900">{isVisitor ? "Visitor records by establishment" : "Accommodation records by establishment"}</h2>
          <p className="mt-1 text-sm text-slate-600">{activeCount} record{activeCount === 1 ? "" : "s"} for {period.type === "month" ? `${monthNames[period.month]} ${period.year}` : period.type === "quarter" ? `Q${period.quarter} ${period.year}` : `${period.type === "week" ? "Weeks" : "Year"} ${period.year}`}.</p>
        </div>
        <div ref={tableScrollRef} className="max-h-[27rem] overflow-auto overscroll-contain touch-none [-webkit-overflow-scrolling:touch]">
          <div className={isVisitor ? "min-w-[760px]" : "min-w-[680px]"}>
          {isVisitor ? (
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-600"><tr><th className="sticky left-0 top-0 z-30 whitespace-nowrap bg-slate-50 px-3 py-2 shadow-[2px_0_4px_rgba(148,163,184,0.24)]">Report date</th><th className="px-3 py-2">Guest / group</th><th className="px-3 py-2">Residence</th><th className="px-3 py-2">Location</th><th className="px-3 py-2">Male</th><th className="px-3 py-2">Female</th><th className="px-3 py-2">Total visitors</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredVisitors.map((record) => <tr key={record.id} className="hover:bg-slate-50"><td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-900 shadow-[2px_0_4px_rgba(148,163,184,0.18)]">{formatDate(record.report_date)}</td><td className="px-3 py-2 text-slate-700">{record.guest_name || "—"}</td><td className="px-3 py-2 text-slate-700">{getResidenceLabel(record)}</td><td className="px-3 py-2 text-slate-700">{getLocationLabel(record)}</td><td className="px-3 py-2 text-blue-600">{Number(record.total_male || 0)}</td><td className="px-3 py-2 text-purple-600">{Number(record.total_female || 0)}</td><td className="px-3 py-2 font-semibold text-slate-900">{Number(record.total_guests || 0)}</td></tr>)}</tbody>
            </table>
          ) : (
            <table className="w-full min-w-[560px] text-left text-xs">
              <thead className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-600"><tr><th className="sticky left-0 top-0 z-30 whitespace-nowrap bg-slate-50 px-3 py-2 shadow-[2px_0_4px_rgba(148,163,184,0.24)]">Report date</th><th className="px-3 py-2">Total rooms</th><th className="px-3 py-2">Occupied rooms</th><th className="px-3 py-2">Check-ins</th><th className="px-3 py-2">Guest nights</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredAccommodation.map((record) => <tr key={record.id} className="hover:bg-slate-50"><td className="sticky left-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-medium text-slate-900 shadow-[2px_0_4px_rgba(148,163,184,0.18)]">{formatDate(record.report_date)}</td><td className="px-3 py-2 text-slate-900">{Number(record.total_rooms || 0)}</td><td className="px-3 py-2 text-slate-900">{Number(record.total_occupied_rooms || 0)}</td><td className="px-3 py-2 text-blue-600">{Number(record.total_check_ins || 0)}</td><td className="px-3 py-2 font-semibold text-slate-900">{Number(record.total_guest_nights || 0)}</td></tr>)}</tbody>
            </table>
          )}
          {activeCount === 0 && <p className="px-6 py-12 text-center text-sm font-medium text-slate-500">No records found for the selected filters.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
