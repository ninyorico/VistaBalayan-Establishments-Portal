import { useEffect, useRef, useState } from "react";
import { Download, Search } from "lucide-react";
import { formatDate } from "../../lib/reportMetrics";
import { getVisitorResidenceLocation, normalizeResidenceCategory } from "../../lib/reporting";

interface VisitorRecord {
  id: string;
  report_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  guest_name?: string | null;
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
  selectedMonth: number;
  setSelectedMonth: (value: number) => void;
  availableYears: number[];
  onExportVisitor: () => void;
  onExportAccommodation: () => void;
}

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleString("default", { month: "long" })
);

const statusStyles: Record<string, string> = {
  approved: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  rejected: "bg-rose-100 text-rose-700",
  submitted: "bg-sky-100 text-sky-700",
  validated: "bg-violet-100 text-violet-700",
};

const getDateParts = (value?: string | null) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : { year: date.getFullYear(), month: date.getMonth() };
};

const getResidenceLabel = (record: VisitorRecord) => {
  return normalizeResidenceCategory(record) || "—";
};

const getLocationLabel = (record: VisitorRecord) => getVisitorResidenceLocation(record);

const matchesCommonFilters = (
  record: { report_date?: string | null; created_at?: string | null; status?: string | null },
  searchTerm: string,
  selectedYear: number,
  selectedMonth: number,
  extraText: string
) => {
  const parts = getDateParts(record.report_date);
  const searchText = [record.report_date, record.created_at, record.status, extraText].join(" ").toLowerCase();
  return (
    parts?.year === selectedYear &&
    (selectedMonth === -1 || parts.month === selectedMonth) &&
    searchText.includes(searchTerm.toLowerCase())
  );
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
  selectedMonth,
  setSelectedMonth,
  availableYears,
  onExportVisitor,
  onExportAccommodation,
}: Props) {
  const [activeType, setActiveType] = useState<"visitor" | "accommodation">(
    canSubmitVisitor ? "visitor" : "accommodation"
  );

  const tableScrollRef = useRef<HTMLDivElement>(null);
  const tableVerticalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = tableScrollRef.current;
    const verticalContainer = tableVerticalRef.current;
    if (!scrollContainer || !verticalContainer) return;

    let startX = 0;
    let startY = 0;
    let lastX = 0;
    let lastY = 0;
    let axis: "x" | "y" | null = null;

    const handleTouchStart = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      startX = lastX = touch.clientX;
      startY = lastY = touch.clientY;
      axis = null;
    };

    const handleTouchMove = (event: globalThis.TouchEvent) => {
      const touch = event.touches[0];
      const deltaX = touch.clientX - startX;
      const deltaY = touch.clientY - startY;

      if (!axis && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 6) {
        axis = Math.abs(deltaX) > Math.abs(deltaY) ? "x" : "y";
      }

      if (axis === "x") {
        event.preventDefault();
        scrollContainer.scrollLeft += lastX - touch.clientX;
      } else if (axis === "y") {
        event.preventDefault();
        verticalContainer.scrollTop += lastY - touch.clientY;
      }

      lastX = touch.clientX;
      lastY = touch.clientY;
    };

    const resetAxis = () => {
      axis = null;
    };

    scrollContainer.addEventListener("touchstart", handleTouchStart, { passive: true });
    scrollContainer.addEventListener("touchmove", handleTouchMove, { passive: false });
    scrollContainer.addEventListener("touchend", resetAxis, { passive: true });
    scrollContainer.addEventListener("touchcancel", resetAxis, { passive: true });

    return () => {
      scrollContainer.removeEventListener("touchstart", handleTouchStart);
      scrollContainer.removeEventListener("touchmove", handleTouchMove);
      scrollContainer.removeEventListener("touchend", resetAxis);
      scrollContainer.removeEventListener("touchcancel", resetAxis);
    };
  }, []);

  const filteredVisitors = visitorReports.filter((record) =>
    matchesCommonFilters(
      record,
      searchTerm,
      selectedYear,
      selectedMonth,
      [record.guest_name, record.residence_category, record.residence_type, record.place_of_residence, record.municipality, record.province, record.country].join(" ")
    )
  );
  const filteredAccommodation = accommodationReports.filter((record) =>
    matchesCommonFilters(
      record,
      searchTerm,
      selectedYear,
      selectedMonth,
      [record.total_rooms, record.total_check_ins, record.total_guest_nights].join(" ")
    )
  );

  const isVisitor = activeType === "visitor";
  const activeCount = isVisitor ? filteredVisitors.length : filteredAccommodation.length;
  const hasBothReportTypes = canSubmitVisitor && canSubmitAccommodation;
  const submissionKpis = hasBothReportTypes
    ? [
        ["Total report submissions", filteredVisitors.length + filteredAccommodation.length, "text-sky-700"],
        ["Daytour report submissions", filteredVisitors.length, "text-blue-600"],
        ["Overnight report submissions", filteredAccommodation.length, "text-purple-600"],
      ]
    : isVisitor
      ? [
          ["Total submissions", filteredVisitors.length, "text-sky-700"],
          ["Daytour report submissions", filteredVisitors.length, "text-blue-600"],
        ]
      : [
          ["Total submissions", filteredAccommodation.length, "text-sky-700"],
          ["Overnight report submissions", filteredAccommodation.length, "text-purple-600"],
        ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-[-0.035em] text-slate-950">Submission history</h1>
        <p className="mt-1 text-slate-600">Review the reports submitted by this establishment.</p>
      </div>

      {canSubmitVisitor && canSubmitAccommodation && (
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Submission report type">
          <button
            type="button"
            role="tab"
            aria-selected={isVisitor}
            onClick={() => setActiveType("visitor")}
            className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${isVisitor ? "bg-[#0F4C75] text-white shadow-lg shadow-cyan-950/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Resort reports
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isVisitor}
            onClick={() => setActiveType("accommodation")}
            className={`rounded-2xl px-5 py-3 text-sm font-semibold transition ${!isVisitor ? "bg-[#0F4C75] text-white shadow-lg shadow-cyan-950/10" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
          >
            Hotel reports
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
              {isVisitor ? "Resort visitor records" : "Hotel accommodation records"}
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

        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:grid-cols-4">
          <div className="relative min-w-0 md:col-span-2">
            <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 sm:left-3 sm:h-5 sm:w-5" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={isVisitor ? "Search residence or location" : "Search accommodation records"} className="w-full min-w-0 rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-8 pr-2 text-xs outline-none focus:border-[#0F4C75] focus:ring-4 focus:ring-cyan-100 sm:pl-10 sm:pr-4 sm:text-sm" />
          </div>
          <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-xs sm:px-4 sm:text-sm" aria-label="Filter by year">
            {(availableYears.length > 0 ? availableYears : [selectedYear]).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))} className="min-w-0 rounded-2xl border border-slate-200 bg-slate-50 px-2 py-3 text-xs sm:px-4 sm:text-sm" aria-label="Filter by month">
            <option value={-1}>ALL months</option>
            {monthNames.map((month, index) => <option key={month} value={index}>{month}</option>)}
          </select>
        </div>
      </div>

      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 bg-slate-50 px-5 py-4 sm:px-6">
          <h2 className="text-base font-semibold text-slate-900">{isVisitor ? "Visitor records by establishment" : "Accommodation records by establishment"}</h2>
          <p className="mt-1 text-sm text-slate-600">{activeCount} record{activeCount === 1 ? "" : "s"} for {selectedMonth === -1 ? "ALL months" : monthNames[selectedMonth]} {selectedYear}.</p>
        </div>
        <div ref={tableScrollRef} className="touch-none overflow-x-auto overscroll-x-contain [-webkit-overflow-scrolling:touch]">
          <div ref={tableVerticalRef} className={isVisitor ? "min-w-[820px] max-h-[27rem] overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]" : "min-w-[760px] max-h-[27rem] overflow-y-auto overflow-x-hidden overscroll-y-contain [-webkit-overflow-scrolling:touch]"}>
          {isVisitor ? (
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600"><tr><th className="px-5 py-3">Report date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Guest / group</th><th className="px-5 py-3">Residence</th><th className="px-5 py-3">Location</th><th className="px-5 py-3">Male</th><th className="px-5 py-3">Female</th><th className="px-5 py-3">Total visitors</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredVisitors.map((record) => <tr key={record.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-medium text-slate-900">{formatDate(record.report_date)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[record.status || "pending"] || statusStyles.pending}`}>{record.status || "pending"}</span></td><td className="px-5 py-4 text-slate-700">{record.guest_name || "—"}</td><td className="px-5 py-4 text-slate-700">{getResidenceLabel(record)}</td><td className="px-5 py-4 text-slate-700">{getLocationLabel(record)}</td><td className="px-5 py-4 text-blue-600">{Number(record.total_male || 0)}</td><td className="px-5 py-4 text-purple-600">{Number(record.total_female || 0)}</td><td className="px-5 py-4 font-semibold text-slate-900">{Number(record.total_guests || 0)}</td></tr>)}</tbody>
            </table>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600"><tr><th className="px-5 py-3">Report date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Total rooms</th><th className="px-5 py-3">Occupied rooms</th><th className="px-5 py-3">Check-ins</th><th className="px-5 py-3">Guest nights</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredAccommodation.map((record) => <tr key={record.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-medium text-slate-900">{formatDate(record.report_date)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[record.status || "pending"] || statusStyles.pending}`}>{record.status || "pending"}</span></td><td className="px-5 py-4 text-slate-900">{Number(record.total_rooms || 0)}</td><td className="px-5 py-4 text-slate-900">{Number(record.total_occupied_rooms || 0)}</td><td className="px-5 py-4 text-blue-600">{Number(record.total_check_ins || 0)}</td><td className="px-5 py-4 font-semibold text-slate-900">{Number(record.total_guest_nights || 0)}</td></tr>)}</tbody>
            </table>
          )}
          {activeCount === 0 && <p className="px-6 py-12 text-center text-sm font-medium text-slate-500">No records found for the selected filters.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
