import { useState, useEffect } from "react";
import { Search, Eye, Download, CheckCircle, Clock, XCircle, ChevronDown, CalendarDays, CalendarRange } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy, formatDate, formatMonthYear, groupStaffSubmissions, StaffSubmissionSummary } from "../../../lib/reportMetrics";
import { canSubmitAccommodationReport, canSubmitVisitorReport } from "../../../lib/establishmentReportForms";
import DataState from "../../components/DataState";
import EstablishmentSubmissionRecords from "../../components/EstablishmentSubmissionRecords";
import { LoadingState } from "../../components/vista/PolishedShell";

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
  const [loadError, setLoadError] = useState<{ kind: "error" | "session-expired"; message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
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
    setLoading(true);
    setLoadError(null);
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      setLoadError({ kind: "session-expired", message: "Your staff session has expired. Sign in again to continue." });
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

    const establishmentId = profileData?.establishment_id;
    // Submission History is a historical record, so it must load every report
    // family belonging to the establishment. Current form eligibility is still
    // used for the sidebar and new-report routes, but it must not hide imported
    // accommodation history when an establishment's current type is Resort or
    // another category that no longer exposes the accommodation form.
    const [{ data: visitorData, error: visitorError }, { data: accommodationData, error: accommodationError }] = await Promise.all([
      establishmentId
        ? supabase
            .from("visitor_reports")
            .select("id, report_date, created_at, status, guest_name, total_male, total_female, total_guests, residence_type, place_of_residence")
            .eq("establishment_id", establishmentId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
      establishmentId
        ? supabase
            .from("accommodation_reports")
            .select("id, report_date, created_at, status, total_rooms, total_occupied_rooms, total_check_ins, total_guest_nights")
            .eq("establishment_id", establishmentId)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (visitorError || accommodationError) {
      console.error("Error fetching submission history:", visitorError || accommodationError);
      setLoadError({ kind: "error", message: "The submission history service returned an error. Please retry." });
      setLoading(false);
      return;
    }

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
    const matchesDate = dateParts?.year === selectedYear && dateParts.month === selectedMonth;
    return matchesSearch && matchesDate;
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
    const matchesDate = dateParts?.year === selectedYear && dateParts.month === selectedMonth;
    return matchesSearch && matchesDate;
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
    return <LoadingState label="Loading your submissions" />;
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
    <EstablishmentSubmissionRecords
      visitorReports={visitorReports}
      accommodationReports={accommodationReports}
      canSubmitVisitor={showResortExport}
      canSubmitAccommodation={showHotelExport}
      searchTerm={searchTerm}
      setSearchTerm={setSearchTerm}
      selectedYear={selectedYear}
      setSelectedYear={(year) => { setSelectedYear(year); setExpandedSubmissionId(null); }}
      selectedMonth={selectedMonth}
      setSelectedMonth={(month) => { setSelectedMonth(month); setExpandedSubmissionId(null); }}
      availableYears={availableYears}
      onExportVisitor={handleExportResortData}
      onExportAccommodation={handleExportHotelData}
    />
  );

}
