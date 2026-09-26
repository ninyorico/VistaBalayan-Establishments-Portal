import { useState } from "react";
import { Download, Search } from "lucide-react";
import { formatDate } from "../../lib/reportMetrics";

interface VisitorRecord {
  id: string;
  report_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  guest_name?: string | null;
  total_male?: number | null;
  total_female?: number | null;
  total_guests?: number | null;
  residence_type?: string | null;
  place_of_residence?: string | null;
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
  totalSubmissions: number;
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
  totalSubmissions,
}: Props) {
  const [activeType, setActiveType] = useState<"visitor" | "accommodation">(
    canSubmitVisitor ? "visitor" : "accommodation"
  );

  const filteredVisitors = visitorReports.filter((record) =>
    matchesCommonFilters(
      record,
      searchTerm,
      selectedYear,
      selectedMonth,
      [record.guest_name, record.residence_type, record.place_of_residence].join(" ")
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
  const activeTotal = isVisitor
    ? filteredVisitors.reduce((sum, record) => sum + Number(record.total_guests || 0), 0)
    : filteredAccommodation.reduce((sum, record) => sum + Number(record.total_guest_nights || 0), 0);
  const activeMale = filteredVisitors.reduce((sum, record) => sum + Number(record.total_male || 0), 0);
  const activeFemale = filteredVisitors.reduce((sum, record) => sum + Number(record.total_female || 0), 0);
  const activeApproved = (isVisitor ? filteredVisitors : filteredAccommodation).filter((record) => record.status === "approved").length;

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

      <div className={`grid grid-cols-2 gap-4 ${isVisitor ? "md:grid-cols-4" : "md:grid-cols-5"}`}>
        {(isVisitor
          ? [
              ["Total visitors", activeTotal, "text-sky-700"],
              ["Male", activeMale, "text-blue-600"],
              ["Female", activeFemale, "text-purple-600"],
              ["Approved reports", activeApproved, "text-emerald-700"],
            ]
          : [
   ["Total submissions", totalSubmissions, "text-sky-700"],
   ["Guest nights", activeTotal, "text-sky-700"],
   ["Accommodation reports", activeCount, "text-blue-600"],
   ["Check-ins", filteredAccommodation.reduce((sum, record) => sum + Number(record.total_check_ins || 0), 0), "text-purple-600"],
   ["Approved reports", activeApproved, "text-emerald-700"],
 ]
        ).map(([label, value, tone]) => (
          <div key={String(label)} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-sm font-medium text-slate-500">{label}</p>
            <p className={`mt-2 text-3xl font-bold tracking-[-0.03em] ${tone}`}>{value}</p>
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

        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="relative md:col-span-2">
            <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={isVisitor ? "Search residence or location" : "Search accommodation records"} className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none focus:border-[#0F4C75] focus:ring-4 focus:ring-cyan-100" />
          </div>
          <select value={selectedYear} onChange={(event) => setSelectedYear(Number(event.target.value))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" aria-label="Filter by year">
            {(availableYears.length > 0 ? availableYears : [selectedYear]).map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
          <select value={selectedMonth} onChange={(event) => setSelectedMonth(Number(event.target.value))} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" aria-label="Filter by month">
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
        <div className={isVisitor ? "overflow-x-auto" : "max-h-[27rem] overflow-auto"}>
          {isVisitor ? (
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600"><tr><th className="px-5 py-3">Report date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Guest / group</th><th className="px-5 py-3">Residence</th><th className="px-5 py-3">Male</th><th className="px-5 py-3">Female</th><th className="px-5 py-3">Total visitors</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredVisitors.map((record) => <tr key={record.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-medium text-slate-900">{formatDate(record.report_date)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[record.status || "pending"] || statusStyles.pending}`}>{record.status || "pending"}</span></td><td className="px-5 py-4 text-slate-700">{record.guest_name || "—"}</td><td className="px-5 py-4 text-slate-700">{record.place_of_residence || record.residence_type || "—"}</td><td className="px-5 py-4 text-blue-600">{Number(record.total_male || 0)}</td><td className="px-5 py-4 text-purple-600">{Number(record.total_female || 0)}</td><td className="px-5 py-4 font-semibold text-slate-900">{Number(record.total_guests || 0)}</td></tr>)}</tbody>
            </table>
          ) : (
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wider text-slate-600"><tr><th className="px-5 py-3">Report date</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Total rooms</th><th className="px-5 py-3">Occupied rooms</th><th className="px-5 py-3">Check-ins</th><th className="px-5 py-3">Guest nights</th></tr></thead>
              <tbody className="divide-y divide-slate-100">{filteredAccommodation.map((record) => <tr key={record.id} className="hover:bg-slate-50"><td className="px-5 py-4 font-medium text-slate-900">{formatDate(record.report_date)}</td><td className="px-5 py-4"><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${statusStyles[record.status || "pending"] || statusStyles.pending}`}>{record.status || "pending"}</span></td><td className="px-5 py-4 text-slate-900">{Number(record.total_rooms || 0)}</td><td className="px-5 py-4 text-slate-900">{Number(record.total_occupied_rooms || 0)}</td><td className="px-5 py-4 text-blue-600">{Number(record.total_check_ins || 0)}</td><td className="px-5 py-4 font-semibold text-slate-900">{Number(record.total_guest_nights || 0)}</td></tr>)}</tbody>
            </table>
          )}
          {activeCount === 0 && <p className="px-6 py-12 text-center text-sm font-medium text-slate-500">No records found for the selected filters.</p>}
        </div>
      </div>
    </div>
  );
}
