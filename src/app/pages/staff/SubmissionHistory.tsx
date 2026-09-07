import { useState, useEffect } from "react";
import { Search, Eye, Download, CheckCircle, Clock, XCircle, ChevronDown, CalendarDays, CalendarRange } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy, formatDate, formatMonthYear, groupStaffSubmissions, StaffSubmissionSummary } from "../../../lib/reportMetrics";
import { canSubmitAccommodationReport, canSubmitVisitorReport } from "../../../lib/establishmentReportForms";

interface VisitorReportExportRecord {
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

interface AccommodationReportExportRecord {
  id: string;
  report_date?: string | null;
  created_at?: string | null;
  status?: string | null;
  total_rooms?: number | null;
  total_occupied_rooms?: number | null;
  total_check_ins?: number | null;
  total_guest_nights?: number | null;
}

const statusStyles = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};

const getReportTypeLabel = (type: string) =>
  type === "Visitor Report" ? "Resort" : type === "Accommodation Report" ? "Hotels" : type;

const monthNames = Array.from({ length: 12 }, (_, index) =>
  new Date(2000, index, 1).toLocaleString("default", { month: "long" })
);

const getDateParts = (dateValue?: string | null) => {
  if (!dateValue) return null;
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return null;

  return {
    year: date.getFullYear(),
    month: date.getMonth(),
    day: date.getDate(),
  };
};

const getWeekNumberInFourWeekMonth = (day: number) => Math.min(Math.ceil(day / 7), 4);

const getWeekDateRange = (year: number, month: number, weekNumber: number) => {
  const lastDay = new Date(year, month + 1, 0).getDate();
  const startDay = (weekNumber - 1) * 7 + 1;
  const endDay = weekNumber === 4 ? lastDay : Math.min(weekNumber * 7, lastDay);

  return `${monthNames[month]} ${startDay}-${endDay}`;
};

const formatSelectedMonth = (year: number, month: number) => `${monthNames[month]} ${year}`;

const escapeCsvValue = (value: string | number) => {
  const stringValue = String(value ?? "");
  return /[",\n\r]/.test(stringValue) ? `"${stringValue.replace(/"/g, '""')}"` : stringValue;
};

const downloadCsv = (filename: string, rows: (string | number)[][]) => {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export default function SubmissionHistory() {
  const [submissions, setSubmissions] = useState<StaffSubmissionSummary[]>([]);
  const [visitorReports, setVisitorReports] = useState<VisitorReportExportRecord[]>([]);
  const [accommodationReports, setAccommodationReports] = useState<AccommodationReportExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [allowedForms, setAllowedForms] = useState({ visitor: false, accommodation: false });
  const now = new Date();
  const [selectedYear, setSelectedYear] = useState(now.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState(now.getMonth());
  const [expandedWeek, setExpandedWeek] = useState<number | null>(getWeekNumberInFourWeekMonth(now.getDate()));
  const [expandedSubmissionId, setExpandedSubmissionId] = useState<string | null>(null);
  const [viewingSubmission, setViewingSubmission] = useState<StaffSubmissionSummary | null>(null);

  useEffect(() => {
    fetchSubmissions();
  }, []);

  const fetchSubmissions = async () => {
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setLoading(false);
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("establishment_id")
      .eq("id", user.id)
      .maybeSingle();

    let canSeeVisitor = false;
    let canSeeAccommodation = false;

    if (profileData?.establishment_id) {
      const { data: establishment } = await supabase
        .from("establishments")
        .select("type,total_rooms")
        .eq("id", profileData.establishment_id)
        .maybeSingle();

      canSeeVisitor = canSubmitVisitorReport(establishment);
      canSeeAccommodation = canSubmitAccommodationReport(establishment);
    }

    setAllowedForms({ visitor: canSeeVisitor, accommodation: canSeeAccommodation });

    const [{ data: visitorData }, { data: accommodationData }] = await Promise.all([
      canSeeVisitor
        ? supabase
            .from("visitor_reports")
            .select("id, report_date, created_at, status, guest_name, total_male, total_female, total_guests, residence_type, place_of_residence")
            .eq("submitted_by", user.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
      canSeeAccommodation
        ? supabase
            .from("accommodation_reports")
            .select("id, report_date, created_at, status, total_rooms, total_occupied_rooms, total_check_ins, total_guest_nights")
            .eq("submitted_by", user.id)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] }),
    ]);

    const visitors = (visitorData || []) as VisitorReportExportRecord[];
    const accommodations = (accommodationData || []) as AccommodationReportExportRecord[];
    const groupedSubmissions = groupStaffSubmissions(visitors, accommodations);
    setVisitorReports(visitors);
    setAccommodationReports(accommodations);
    setSubmissions(groupedSubmissions);

    // If the current month has no data, open the newest available reporting
    // month. A native select can visually fall back to its first option while
    // React state still holds an unavailable year, which made valid historical
    // reports appear as an empty current-year view.
    const hasCurrentPeriod = groupedSubmissions.some((submission) => {
      const parts = getDateParts(submission.reportDate);
      return parts?.year === now.getFullYear() && parts.month === now.getMonth();
    });
    if (!hasCurrentPeriod && groupedSubmissions.length > 0) {
      const newestParts = groupedSubmissions
        .map((submission) => getDateParts(submission.reportDate))
        .filter((parts): parts is NonNullable<ReturnType<typeof getDateParts>> => Boolean(parts))
        .sort((a, b) => b.year - a.year || b.month - a.month || b.day - a.day)[0];
      if (newestParts) {
        setSelectedYear(newestParts.year);
        setSelectedMonth(newestParts.month);
        setExpandedWeek(getWeekNumberInFourWeekMonth(newestParts.day));
      }
    }
    setLoading(false);
  };

  const availableYears = Array.from(
    new Set(submissions.map((sub) => getDateParts(sub.reportDate)?.year).filter((year): year is number => Boolean(year)))
  ).sort((a, b) => b - a);

  const filteredSubmissions = submissions.filter((sub) => {
    const dateParts = getDateParts(sub.reportDate);
    const reportMonth = formatMonthYear(sub.reportDate).toLowerCase();
    const searchText = [reportMonth, sub.dataSummary, getReportTypeLabel(sub.type), sub.status, sub.submittedDate]
      .join(" ")
      .toLowerCase();
    const matchesSearch = searchText.includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || sub.status.toLowerCase() === filterStatus.toLowerCase();
    const matchesDate = dateParts?.year === selectedYear && dateParts.month === selectedMonth;
    return matchesSearch && matchesStatus && matchesDate;
  });

  const filterReportRecord = (
    record: VisitorReportExportRecord | AccommodationReportExportRecord,
    type: "Visitor Report" | "Accommodation Report"
  ) => {
    const dateParts = getDateParts(record.report_date);
    const typeLabel = getReportTypeLabel(type);
    const searchText = [
      formatMonthYear(record.report_date),
      typeLabel,
      record.status,
      formatDate(record.created_at),
      "total_guests" in record ? record.guest_name : "",
      "total_guests" in record ? record.residence_type : "",
      "total_guests" in record ? record.place_of_residence : "",
    ]
      .join(" ")
      .toLowerCase();

    const matchesSearch = searchText.includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || (record.status || "pending").toLowerCase() === filterStatus.toLowerCase();
    const matchesDate = dateParts?.year === selectedYear && dateParts.month === selectedMonth;
    return matchesSearch && matchesStatus && matchesDate;
  };

  const filteredVisitorReports = visitorReports.filter((record) => filterReportRecord(record, "Visitor Report"));
  const filteredAccommodationReports = accommodationReports.filter((record) => filterReportRecord(record, "Accommodation Report"));

  const weeklySubmissions = [1, 2, 3, 4].map((weekNumber) => {
    const weekSubmissions = filteredSubmissions.filter((sub) => {
      const dateParts = getDateParts(sub.reportDate);
      return dateParts ? getWeekNumberInFourWeekMonth(dateParts.day) === weekNumber : false;
    });

    const days = weekSubmissions.reduce<Record<number, StaffSubmissionSummary[]>>((acc, submission) => {
      const dateParts = getDateParts(submission.reportDate);
      if (!dateParts) return acc;
      acc[dateParts.day] = [...(acc[dateParts.day] || []), submission];
      return acc;
    }, {});

    return {
      weekNumber,
      label: `Week ${weekNumber}`,
      dateRange: getWeekDateRange(selectedYear, selectedMonth, weekNumber),
      submissions: weekSubmissions,
      days: Object.entries(days)
        .map(([day, daySubmissions]) => ({ day: Number(day), submissions: daySubmissions }))
        .sort((a, b) => a.day - b.day),
    };
  });

  const totalSubmissions = filteredSubmissions.length;
  const approvedCount = filteredSubmissions.filter((s) => s.status === "approved").length;
  const pendingCount = filteredSubmissions.filter((s) => s.status === "pending").length;
  const rejectedCount = filteredSubmissions.filter((s) => s.status === "rejected").length;

  const exportBaseMetadata = () => {
    const selectedMonthLabel = formatSelectedMonth(selectedYear, selectedMonth);
    return { selectedMonthLabel };
  };

  const buildExportFilename = (prefix: string) => {
    const { selectedMonthLabel } = exportBaseMetadata();
    const filenameParts = [
      prefix,
      selectedMonthLabel.toLowerCase().replace(/\s+/g, "-"),
    ];
    return `${filenameParts.join("-").replace(/[^a-z0-9-]+/g, "-")}.csv`;
  };

  const handleExportResortData = () => {
    const visitorRows = filteredVisitorReports
      .slice()
      .sort((a, b) => (a.report_date || "").localeCompare(b.report_date || ""))
      .map((report) => [
        formatDate(report.report_date),
        formatDate(report.created_at),
        report.status || "pending",
        report.guest_name || "",
        report.residence_type || "",
        report.place_of_residence || "",
        Number(report.total_male || 0),
        Number(report.total_female || 0),
        Number(report.total_guests || 0),
        report.id,
      ]);

    const rows: (string | number)[][] = [
      ["VistaBalayan Resort Visitor Data Export"],
      [],
      ["Visitor report details"],
      ["Report date", "Submitted", "Status", "Guest Group", "Residence type", "Place of residence", "Male", "Female", "Total visitors", "Report ID"],
      ...(visitorRows.length > 0 ? visitorRows : [["No visitor records", "", "", "", "", "", "", "", "", ""]]),
    ];

    downloadCsv(buildExportFilename("resort-visitor-data"), rows);
  };

  const handleExportHotelData = () => {
    const accommodationRows = filteredAccommodationReports
      .slice()
      .sort((a, b) => (a.report_date || "").localeCompare(b.report_date || ""))
      .map((report) => {
        const occupancy = calculateAccommodationOccupancy(report.total_occupied_rooms, report.total_rooms, report.report_date);
        return [
          formatDate(report.report_date),
          formatDate(report.created_at),
          report.status || "pending",
          Number(report.total_rooms || 0),
          Number(report.total_occupied_rooms || 0),
          `${occupancy.toFixed(2)}%`,
          Number(report.total_check_ins || 0),
          Number(report.total_guest_nights || 0),
        ];
      });

    const rows: (string | number)[][] = [
      ["VistaBalayan Hotel Accommodation Data Export"],
      [],
      ["Accommodation report details"],
      ["Report date", "Submitted", "Status", "Total rooms", "Occupied rooms", "Occupancy", "Check-ins", "Guest nights"],
      ...(accommodationRows.length > 0 ? accommodationRows : [["No accommodation records", "", "", "", "", "", "", ""]]),
    ];

    downloadCsv(buildExportFilename("hotel-accommodation-data"), rows);
  };

  const getVisitorRecordsForSubmission = (submission: StaffSubmissionSummary) =>
    visitorReports
      .filter((report) => submission.id === `visitor-${report.report_date || "No report date"}-${report.status || "pending"}`)
      .sort((a, b) => (a.created_at || "").localeCompare(b.created_at || ""));

  const getAccommodationRecordForSubmission = (submission: StaffSubmissionSummary) =>
    accommodationReports.find((report) => report.id === submission.id) || null;

  const handleViewSubmission = (submission: StaffSubmissionSummary) => {
    setViewingSubmission(submission);
  };

  const handleDownloadSubmission = (submission: StaffSubmissionSummary) => {
    if (submission.type === "Visitor Report") {
      const records = getVisitorRecordsForSubmission(submission);
      const rows: (string | number)[][] = [
        ["VistaBalayan Resort Visitor Submission"],
        [],
        ["Report date", "Submitted", "Status", "Guest Group", "Residence type", "Place of residence", "Male", "Female", "Total visitors", "Report ID"],
        ...(records.length > 0
          ? records.map((report) => [
              formatDate(report.report_date),
              formatDate(report.created_at),
              report.status || "pending",
              report.guest_name || "",
              report.residence_type || "",
              report.place_of_residence || "",
              Number(report.total_male || 0),
              Number(report.total_female || 0),
              Number(report.total_guests || 0),
              report.id,
            ])
          : [["No visitor records", "", "", "", "", "", "", "", "", ""]]),
      ];
      downloadCsv(buildExportFilename("resort-submission"), rows);
      return;
    }

    const report = getAccommodationRecordForSubmission(submission);
    const occupancy = report ? calculateAccommodationOccupancy(report.total_occupied_rooms, report.total_rooms, report.report_date) : 0;
    const rows: (string | number)[][] = [
      ["VistaBalayan Hotel Accommodation Submission"],
      [],
      ["Report date", "Submitted", "Status", "Total rooms", "Occupied rooms", "Occupancy", "Check-ins", "Guest nights"],
      report
        ? [
            formatDate(report.report_date),
            formatDate(report.created_at),
            report.status || "pending",
            Number(report.total_rooms || 0),
            Number(report.total_occupied_rooms || 0),
            `${occupancy.toFixed(2)}%`,
            Number(report.total_check_ins || 0),
            Number(report.total_guest_nights || 0),
          ]
        : ["No accommodation record", "", "", "", "", "", "", ""],
    ];
    downloadCsv(buildExportFilename("hotel-submission"), rows);
  };

  if (loading) {
    return (
      <div className="grid min-h-[60vh] place-items-center">
        <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-2 border-slate-200 border-b-[#0F4C75]"></div>
          <p className="mt-4 text-sm font-medium text-slate-600">Loading your submissions</p>
        </div>
      </div>
    );
  }

  const summaryCards = [
    { label: "Total submissions", value: totalSubmissions, icon: CheckCircle, tone: "text-sky-700 bg-sky-50 ring-sky-100" },
    { label: "Approved", value: approvedCount, icon: CheckCircle, tone: "text-emerald-700 bg-emerald-50 ring-emerald-100" },
    { label: "Pending", value: pendingCount, icon: Clock, tone: "text-amber-700 bg-amber-50 ring-amber-100" },
    { label: "Rejected", value: rejectedCount, icon: XCircle, tone: "text-rose-700 bg-rose-50 ring-rose-100" },
  ];

  const showResortExport = allowedForms.visitor;
  const showHotelExport = allowedForms.accommodation;

  return (
    <div className="space-y-6">
      <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <h1 className="text-3xl font-bold tracking-[-0.035em] text-slate-950">Submission history</h1>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {summaryCards.map((card) => (
          <div key={card.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-500">{card.label}</p>
                <p className="mt-2 text-3xl font-bold tracking-[-0.03em] text-slate-950">{card.value}</p>
              </div>
              <div className={`flex h-11 w-11 items-center justify-center rounded-2xl ring-1 ${card.tone}`}>
                <card.icon className="h-5 w-5" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.12em] text-slate-500">Filter submissions</h2>
            <p className="mt-1 text-sm text-slate-500">The report type is detected automatically from your establishment account.</p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            {showResortExport && (
              <button
                type="button"
                onClick={handleExportResortData}
                disabled={filteredVisitorReports.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0E5A72] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-950/10 transition hover:bg-[#073B4C] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                aria-label="Export resort visitor data"
              >
                <Download className="h-4 w-4" />
                Export resort data
              </button>
            )}
            {showHotelExport && (
              <button
                type="button"
                onClick={handleExportHotelData}
                disabled={filteredAccommodationReports.length === 0}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-[#0E5A72] px-4 py-3 text-sm font-semibold text-white shadow-lg shadow-teal-950/10 transition hover:bg-[#073B4C] disabled:cursor-not-allowed disabled:bg-slate-300 disabled:text-slate-500 disabled:shadow-none"
                aria-label="Export hotel accommodation data"
              >
                <Download className="h-4 w-4" />
                Export hotel data
              </button>
            )}
          </div>
        </div>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search month, summary, status"
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 text-sm outline-none transition focus:border-[#0F4C75] focus:bg-white focus:ring-4 focus:ring-cyan-100"
              />
            </div>
          </div>
          <select value={selectedYear} onChange={(e) => { setSelectedYear(Number(e.target.value)); setExpandedSubmissionId(null); }} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#0F4C75] focus:bg-white focus:ring-4 focus:ring-cyan-100" aria-label="Filter by year">
            {(availableYears.length > 0 ? availableYears : [selectedYear]).map((year) => (
              <option key={year} value={year}>{year}</option>
            ))}
          </select>
          <select value={selectedMonth} onChange={(e) => { setSelectedMonth(Number(e.target.value)); setExpandedSubmissionId(null); }} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#0F4C75] focus:bg-white focus:ring-4 focus:ring-cyan-100" aria-label="Filter by month">
            {monthNames.map((month, index) => (
              <option key={month} value={index}>{month}</option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm outline-none focus:border-[#0F4C75] focus:bg-white focus:ring-4 focus:ring-cyan-100">
            <option value="all">All status</option>
            <option value="approved">Approved</option>
            <option value="pending">Pending</option>
            <option value="rejected">Rejected</option>
          </select>
        </div>
      </div>

      <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-base font-bold text-slate-950">{formatSelectedMonth(selectedYear, selectedMonth)} submissions</h2>
            <p className="text-sm text-slate-500">
              Current view is divided into 4 weeks. Click a week to see daily submissions.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 rounded-2xl bg-white px-4 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
            <CalendarRange className="h-4 w-4 text-[#0F4C75]" />
            {filteredSubmissions.length} matching records
          </div>
        </div>

        {filteredSubmissions.length > 0 ? (
          <div className="divide-y divide-slate-100">
            {weeklySubmissions.map((week) => {
              const isWeekExpanded = expandedWeek === week.weekNumber;
              const approvedInWeek = week.submissions.filter((submission) => submission.status === "approved").length;
              const pendingInWeek = week.submissions.filter((submission) => submission.status === "pending").length;
              const rejectedInWeek = week.submissions.filter((submission) => submission.status === "rejected").length;

              return (
                <article key={week.weekNumber} className="bg-white transition hover:bg-slate-50/70">
                  <button
                    type="button"
                    onClick={() => setExpandedWeek(isWeekExpanded ? null : week.weekNumber)}
                    className="grid w-full grid-cols-1 gap-3 px-5 py-4 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                    aria-expanded={isWeekExpanded}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-[#0F4C75]/10 px-2.5 py-1 text-xs font-bold text-[#0F4C75]">
                          {week.label}
                        </span>
                        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">
                          {week.dateRange}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                        <h3 className="text-lg font-bold tracking-[-0.02em] text-slate-950">
                          {week.submissions.length} submission{week.submissions.length === 1 ? "" : "s"}
                        </h3>
                        <span className="hidden h-1 w-1 rounded-full bg-slate-300 sm:block" />
                        <p className="text-sm font-medium text-slate-600">
                          {approvedInWeek} approved • {pendingInWeek} pending • {rejectedInWeek} rejected
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center justify-between gap-3 sm:justify-end">
                      <div className="flex items-center gap-2 text-sm text-slate-500">
                        <CalendarDays className="h-4 w-4" />
                        <span>{week.days.length} active day{week.days.length === 1 ? "" : "s"}</span>
                      </div>
                      <ChevronDown className={`h-5 w-5 text-slate-400 transition ${isWeekExpanded ? "rotate-180" : ""}`} />
                    </div>
                  </button>

                  {isWeekExpanded && (
                    <div className="mx-5 mb-5 space-y-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      {week.days.length > 0 ? (
                        week.days.map((day) => (
                          <div key={day.day} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Day {day.day}</p>
                                <h4 className="text-base font-bold text-slate-950">
                                  {monthNames[selectedMonth]} {day.day}, {selectedYear}
                                </h4>
                              </div>
                              <p className="text-sm font-semibold text-slate-500">
                                {day.submissions.length} submission{day.submissions.length === 1 ? "" : "s"}
                              </p>
                            </div>

                            <div className="mt-3 space-y-3">
                              {day.submissions.map((submission) => {
                                const isExpanded = expandedSubmissionId === submission.id;
                                const StatusIcon = submission.status === "approved" ? CheckCircle : submission.status === "rejected" ? XCircle : Clock;

                                return (
                                  <div key={submission.id} className="rounded-2xl border border-slate-100 bg-slate-50/80">
                                    <button
                                      type="button"
                                      onClick={() => setExpandedSubmissionId(isExpanded ? null : submission.id)}
                                      className="grid w-full grid-cols-1 gap-3 px-4 py-3 text-left sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
                                      aria-expanded={isExpanded}
                                    >
                                      <div className="min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                          <span className="rounded-full bg-[#0F4C75]/10 px-2.5 py-1 text-xs font-bold text-[#0F4C75]">
                                            {getReportTypeLabel(submission.type)}
                                          </span>
                                          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${statusStyles[submission.status as keyof typeof statusStyles] || statusStyles.pending}`}>
                                            <StatusIcon className="h-3 w-3" />
                                            {submission.status}
                                          </span>
                                        </div>
                                        <p className="mt-2 truncate text-sm font-medium text-slate-600">{submission.dataSummary}</p>
                                      </div>

                                      <div className="flex items-center justify-between gap-3 sm:justify-end">
                                        <div className="flex items-center gap-2 text-sm text-slate-500">
                                          <CalendarDays className="h-4 w-4" />
                                          <span>Submitted {submission.submittedDate}</span>
                                        </div>
                                        <ChevronDown className={`h-5 w-5 text-slate-400 transition ${isExpanded ? "rotate-180" : ""}`} />
                                      </div>
                                    </button>

                                    {isExpanded && (
                                      <div className="mx-4 mb-4 rounded-2xl border border-slate-200 bg-white p-4">
                                        <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
                                          <div>
                                            <p className="font-semibold text-slate-500">Report type</p>
                                            <p className="mt-1 font-bold text-slate-950">{getReportTypeLabel(submission.type)}</p>
                                          </div>
                                          <div>
                                            <p className="font-semibold text-slate-500">Report date</p>
                                            <p className="mt-1 font-bold text-slate-950">{formatDate(submission.reportDate)}</p>
                                          </div>
                                          <div>
                                            <p className="font-semibold text-slate-500">Submitted</p>
                                            <p className="mt-1 font-bold text-slate-950">{submission.submittedDate}</p>
                                          </div>
                                        </div>

                                        <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
                                          <p className="text-xs font-bold uppercase tracking-[0.12em] text-slate-500">Data summary</p>
                                          <p className="mt-2 text-sm font-medium text-slate-800">{submission.dataSummary}</p>
                                        </div>

                                        <div className="mt-4 flex flex-wrap gap-2">
                                          <button type="button" onClick={() => handleViewSubmission(submission)} className="inline-flex items-center gap-2 rounded-2xl bg-[#0F4C75] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#0b3d61]" aria-label="View submission">
                                            <Eye className="h-4 w-4" />
                                            View
                                          </button>
                                          <button type="button" onClick={() => handleDownloadSubmission(submission)} className="inline-flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100" aria-label="Download submission">
                                            <Download className="h-4 w-4" />
                                            Download
                                          </button>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="rounded-2xl bg-white px-4 py-6 text-center ring-1 ring-slate-200">
                          <p className="text-sm font-medium text-slate-500">No submissions in this week.</p>
                        </div>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <div className="px-6 py-12 text-center">
            <p className="text-sm font-medium text-slate-500">No submissions found for {formatSelectedMonth(selectedYear, selectedMonth)}.</p>
          </div>
        )}
      </section>

      {viewingSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4">
          <div className="max-h-[85vh] w-full max-w-4xl overflow-hidden rounded-3xl bg-white shadow-2xl">
            <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-6 py-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-500">Submission details</p>
                <h3 className="mt-1 text-xl font-bold text-slate-950">{getReportTypeLabel(viewingSubmission.type)} • {formatDate(viewingSubmission.reportDate)}</h3>
                <p className="mt-1 text-sm text-slate-500">Status: {viewingSubmission.status} • Submitted {viewingSubmission.submittedDate}</p>
              </div>
              <button type="button" onClick={() => setViewingSubmission(null)} className="rounded-full border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-600 hover:bg-slate-50">
                Close
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto p-6">
              {viewingSubmission.type === "Visitor Report" ? (
                <div className="overflow-x-auto">
                  <table className="min-w-[720px] w-full text-left text-sm">
                    <thead className="bg-slate-50 text-xs uppercase tracking-[0.08em] text-slate-500">
                      <tr>
                        <th className="px-3 py-2">Guest Group</th>
                        <th className="px-3 py-2">Residence type</th>
                        <th className="px-3 py-2">Place of residence</th>
                        <th className="px-3 py-2">Male</th>
                        <th className="px-3 py-2">Female</th>
                        <th className="px-3 py-2">Total visitors</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {getVisitorRecordsForSubmission(viewingSubmission).map((report) => (
                        <tr key={report.id}>
                          <td className="px-3 py-2 font-medium text-slate-900">{report.guest_name || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{report.residence_type || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{report.place_of_residence || "—"}</td>
                          <td className="px-3 py-2 text-slate-700">{Number(report.total_male || 0)}</td>
                          <td className="px-3 py-2 text-slate-700">{Number(report.total_female || 0)}</td>
                          <td className="px-3 py-2 font-semibold text-slate-900">{Number(report.total_guests || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                (() => {
                  const report = getAccommodationRecordForSubmission(viewingSubmission);
                  const occupancy = report ? calculateAccommodationOccupancy(report.total_occupied_rooms, report.total_rooms, report.report_date) : 0;
                  return report ? (
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-xs font-bold uppercase text-slate-500">Total rooms</p><p className="mt-2 text-2xl font-bold text-slate-950">{Number(report.total_rooms || 0)}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-xs font-bold uppercase text-slate-500">Occupied rooms</p><p className="mt-2 text-2xl font-bold text-slate-950">{Number(report.total_occupied_rooms || 0)}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-xs font-bold uppercase text-slate-500">Occupancy</p><p className="mt-2 text-2xl font-bold text-slate-950">{occupancy.toFixed(2)}%</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-xs font-bold uppercase text-slate-500">Check-ins</p><p className="mt-2 text-2xl font-bold text-slate-950">{Number(report.total_check_ins || 0)}</p></div>
                      <div className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200"><p className="text-xs font-bold uppercase text-slate-500">Guest nights</p><p className="mt-2 text-2xl font-bold text-slate-950">{Number(report.total_guest_nights || 0)}</p></div>
                    </div>
                  ) : (
                    <p className="text-sm font-medium text-slate-500">No accommodation record found.</p>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
