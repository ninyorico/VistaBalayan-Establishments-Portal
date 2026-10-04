import { useState, useEffect } from "react";
import { Search, Eye, CheckCircle, Clock, XCircle, ChevronDown, CalendarDays, CalendarRange } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { formatDate, formatMonthYear, groupStaffSubmissions, StaffSubmissionSummary } from "../../../lib/reportMetrics";
import { canSubmitAccommodationReport, canSubmitVisitorReport } from "../../../lib/establishmentReportForms";
import { downloadOfficialArrivalsWorkbook } from "../../../lib/officialArrivalsExport";
import type { EstablishmentReportingRow } from "../../../lib/reporting";
import DataState from "../../components/DataState";
import EstablishmentSubmissionRecords from "../../components/EstablishmentSubmissionRecords";
import { LoadingState } from "../../components/vista/PolishedShell";

interface VisitorReportExportRecord {
  id: string;
  establishment_id?: string | null;
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
  establishment_id?: string | null;
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

const formatSelectedMonth = (year: number, month: number) => `${month === -1 ? "ALL months" : monthNames[month]} ${year}`;

export default function SubmissionHistory() {
  const [submissions, setSubmissions] = useState<StaffSubmissionSummary[]>([]);
  const [visitorReports, setVisitorReports] = useState<VisitorReportExportRecord[]>([]);
  const [accommodationReports, setAccommodationReports] = useState<AccommodationReportExportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ kind: "error" | "session-expired"; message: string } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [allowedForms, setAllowedForms] = useState({ visitor: false, accommodation: false });
  const [establishment, setEstablishment] = useState<EstablishmentReportingRow | null>(null);
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
        .select("id,name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status,business_permit_number")
        .eq("id", profileData.establishment_id)
        .maybeSingle();

      canSeeVisitor = canSubmitVisitorReport(establishment);
      canSeeAccommodation = canSubmitAccommodationReport(establishment);
      setEstablishment(establishment as EstablishmentReportingRow | null);
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
    const matchesDate = dateParts?.year === selectedYear && (selectedMonth === -1 || dateParts.month === selectedMonth);
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
    const matchesDate = dateParts?.year === selectedYear && (selectedMonth === -1 || dateParts.month === selectedMonth);
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

  const exportOfficialWorkbook = async (section: "daytour" | "overnight") => {
    if (!establishment) throw new Error("Establishment information is unavailable. Please retry.");
    const selectedMonths = selectedMonth === -1 ? undefined : [selectedMonth + 1];
    const period = selectedMonth === -1 ? String(selectedYear) : `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}`;
    await downloadOfficialArrivalsWorkbook({
      filename: section === "daytour"
        ? `Balayan_Resort_Daytour_Arrivals_${period}.xlsx`
        : `Balayan_Overnight_Arrivals_${period}.xlsx`,
      year: selectedYear,
      selectedMonths,
      exportSection: section,
      includeEstablishmentsWithoutPermit: true,
      establishments: [establishment],
      visitors: section === "daytour" ? visitorReports.map((report) => ({
        ...report,
        establishment_id: establishment.id,
        report_date: report.report_date || "",
      })) : [],
      accommodation: section === "overnight" ? accommodationReports.map((report) => ({
        ...report,
        establishment_id: establishment.id,
        report_date: report.report_date || "",
      })) : [],
    });
  };

  const handleExportResortData = () => {
    void exportOfficialWorkbook("daytour").catch((error) => console.error("Resort workbook export error:", error));
  };

  const handleExportHotelData = () => {
    void exportOfficialWorkbook("overnight").catch((error) => console.error("Overnight workbook export error:", error));
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

  const handleDownloadSubmission = async (submission: StaffSubmissionSummary) => {
    if (!establishment) return;
    const dateParts = getDateParts(submission.reportDate);
    if (!dateParts) return;
    if (submission.type === "Visitor Report") {
      const records = getVisitorRecordsForSubmission(submission);
      await downloadOfficialArrivalsWorkbook({
        filename: `Balayan_Resort_Daytour_Submission_${submission.reportDate || "report"}.xlsx`,
        year: dateParts.year,
        selectedMonths: [dateParts.month + 1],
        exportSection: "daytour",
        includeEstablishmentsWithoutPermit: true,
        establishments: [establishment],
        visitors: records.map((report) => ({ ...report, establishment_id: establishment.id, report_date: report.report_date || "" })),
        accommodation: [],
      });
      return;
    }

    const report = getAccommodationRecordForSubmission(submission);
    await downloadOfficialArrivalsWorkbook({
      filename: `Balayan_Overnight_Submission_${submission.reportDate || "report"}.xlsx`,
      year: dateParts.year,
      selectedMonths: [dateParts.month + 1],
      exportSection: "overnight",
      includeEstablishmentsWithoutPermit: true,
      establishments: [establishment],
      visitors: [],
      accommodation: report
        ? [{ ...report, establishment_id: establishment.id, report_date: report.report_date || "" }]
        : [],
    });
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
