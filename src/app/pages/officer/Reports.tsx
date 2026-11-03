import { useState, useEffect } from "react";
import { useDominantAxisTableScroll } from "../../../hooks/useDominantAxisTableScroll";
import {
  FileSpreadsheet,
  Eye,
  X,
  AlertTriangle,
  Loader2,
  Sparkles,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { downloadOfficialArrivalsWorkbook } from "../../../lib/officialArrivalsExport";
import {
  normalizeReportStatus,
  reportStatusClasses,
  reportStatusLabel,
} from "../../../lib/governance";

import { PageHero } from "../../components/vista/PolishedShell";

const getCurrentYear = () => new Date().getFullYear().toString();

const getCurrentMonth = () => new Date().toLocaleString("default", { month: "short" });

const getWeekRange = (year: string, week: string) => {
  const yearNumber = parseInt(year, 10) || new Date().getFullYear();
  const weekNumber = parseInt(week, 10) || 1;
  const start = new Date(yearNumber, 0, 1 + (weekNumber - 1) * 7);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  const yearEnd = new Date(yearNumber, 11, 31);
  if (end > yearEnd) end.setTime(yearEnd.getTime());

  const toDateString = (date: Date) => date.toISOString().slice(0, 10);

  return {
    startDate: toDateString(start),
    endDate: toDateString(end),
  };
};

const getReportTypeLabel = (report: Submission) => report.type === "Visitor Report" ? "Day-tour" : "Accommodation";

const statusStyles = reportStatusClasses;
const normalizeStatus = normalizeReportStatus;
const formatStatus = reportStatusLabel;

type VisitorAggregate = {
  period: string;
  visitorTotal: number;
  recordCount: number;
  submissionCount: number;
  establishmentCount: number;
};

type AiAdministrativeReport = {
  overview: string;
  weekly: string;
  monthly: string;
  quarterly: string;
  yearly: string;
  followUp: string;
  source: {
    dateRange: { startDate: string; endDate: string };
    visitorRecordCount: number;
    submissionCount: number;
    visitorTotal: number;
    establishmentCount: number;
    aggregates: Record<string, VisitorAggregate[]>;
  };
};

const getIsoWeekKey = (reportDate: string) => {
  const date = new Date(`${reportDate}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return reportDate;
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const year = date.getUTCFullYear();
  const firstDay = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((date.getTime() - firstDay.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
};

interface Submission {
  id: string;
  establishment: string;
  type: "Visitor Report" | "Accommodation Report";
  reportDate: string;
  visitors: number;
  submitted: string;
  status: string;
  reviewedBy?: string;
  reviewedDate?: string;
  notes?: string;
  details: any;
}

const renderResponsivePeriodTick = ({ x = 0, y = 0, payload }: any) => {
  const fullLabel = String(payload?.value || "");
  const compactLabel = fullLabel.startsWith("Week ") ? `Wk${fullLabel.slice(5)}` : fullLabel.slice(0, 3);
  const desktopLabel = fullLabel;

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#64748b" fontSize={12} dy={16}>
        <tspan className="hidden sm:inline">{desktopLabel}</tspan>
        <tspan className="sm:hidden">{compactLabel}</tspan>
      </text>
    </g>
  );
};

const renderYearlyPeriodTick = ({ x = 0, y = 0, payload }: any) => {
  const fullLabel = String(payload?.value || "");
  const compactLabel = fullLabel.slice(0, 3);

  return (
    <g transform={`translate(${x},${y})`}>
      <text textAnchor="middle" fill="#64748b" fontSize={12} dy={16}>
        <tspan className="hidden sm:inline">{fullLabel}</tspan>
        <tspan className="sm:hidden">{compactLabel}</tspan>
      </text>
    </g>
  );
};

export default function Reports() {
  const { horizontalRef: submissionsTableRef } = useDominantAxisTableScroll();
  const [filterType, setFilterType] = useState<"year" | "quarter" | "month" | "week">("month");
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [selectedQuarter, setSelectedQuarter] = useState("1");
  const [selectedMonth, setSelectedMonth] = useState(getCurrentMonth());
  const [selectedWeek, setSelectedWeek] = useState("1");
  const [searchTerm, setSearchTerm] = useState("");

  const [establishmentDirectory, setEstablishmentDirectory] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [visitorReports, setVisitorReports] = useState<any[]>([]);
  const [accommodationReports, setAccommodationReports] = useState<any[]>([]);
  const [selectedSubmission, setSelectedSubmission] = useState<Submission | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [showAiReportModal, setShowAiReportModal] = useState(false);
  const [aiReport, setAiReport] = useState<AiAdministrativeReport | null>(null);
  const [aiReportSaved, setAiReportSaved] = useState(false);
  const [aiReportLoading, setAiReportLoading] = useState(false);
  const [aiReportError, setAiReportError] = useState("");
  const [loading, setLoading] = useState(true);
  const aiReportPeriodKey = [filterType, selectedYear, selectedQuarter, selectedMonth, selectedWeek].join(":");
  
  const [chartData, setChartData] = useState<any[]>([]);
  const [visitorStats, setVisitorStats] = useState({
    currentTotal: 0,
    previousTotal: 0,
    difference: 0,
    percentageChange: "0",
    isIncrease: true,
  });

  const months = [
    "Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
  ];

  const weekOptions = Array.from({ length: 53 }, (_, index) => {
    const week = String(index + 1);
    const { startDate, endDate } = getWeekRange(selectedYear, week);
    return {
      value: week,
      label: `Week ${week} (${startDate} to ${endDate})`,
    };
  });

  const fetchSubmissions = async () => {
    setLoading(true);
    
    const { startDate, endDate } = getReportRange();
    const fetchAllReports = async (table: "visitor_reports" | "accommodation_reports") => {
      const rows: any[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from(table)
          .select(`*, establishments!${table === "visitor_reports" ? "visitor_reports_establishment_id_fkey" : "accommodation_reports_establishment_id_fkey"} (name, type, dot_classification, total_rooms, ae_id, attraction_code)`)
          .order("created_at", { ascending: false })
          .gte("report_date", startDate)
          .lte("report_date", endDate)
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return rows;
    };

    const fetchAllEstablishments = async () => {
      const rows: any[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from("establishments")
          .select("id,name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status,business_permit_number")
          .order("name", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return rows;
    };

    let visitorData: any[] = [];
    let accommodationData: any[] = [];
    try {
      const [directory, visitorRows, accommodationRows] = await Promise.all([
        fetchAllEstablishments(),
        fetchAllReports("visitor_reports"),
        fetchAllReports("accommodation_reports"),
      ]);
      setEstablishmentDirectory(directory);
      visitorData = visitorRows;
      accommodationData = accommodationRows;
      setVisitorReports(visitorRows);
      setAccommodationReports(accommodationRows);
    } catch (error) {
      setEstablishmentDirectory([]);
      setVisitorReports([]);
      setAccommodationReports([]);
      console.error("Reports loading error:", error);
      toast.error(`Failed to load reports: ${error instanceof Error ? error.message : "Unknown error"}`);
    }

    const getEstablishmentName = (item: any) => {
      if (item.establishments) {
        if (Array.isArray(item.establishments) && item.establishments.length > 0) {
          return item.establishments[0].name;
        } else if (item.establishments.name) {
          return item.establishments.name;
        }
      }
      return "Unknown";
    };

    const visitorSubmissions: Submission[] = (visitorData || []).map((item: any) => ({
      id: item.id,
      establishment: getEstablishmentName(item),
      type: "Visitor Report",
      reportDate: item.report_date,
      visitors: item.total_guests || 0,
      submitted: new Date(item.created_at).toISOString().slice(0, 10),
      status: item.status,
      reviewedBy: item.reviewed_by ? "Municipal Tourism Officer" : undefined,
      reviewedDate: item.reviewed_at ? new Date(item.reviewed_at).toISOString().slice(0, 10) : undefined,
      notes: item.notes,
      details: item,
    }));

    const accommodationSubmissions: Submission[] = (accommodationData || []).map((item: any) => ({
      id: item.id,
      establishment: getEstablishmentName(item),
      type: "Accommodation Report",
      reportDate: item.report_date,
      visitors: item.total_check_ins || 0,
      submitted: new Date(item.created_at).toISOString().slice(0, 10),
      status: item.status,
      reviewedBy: item.reviewed_by ? "Municipal Tourism Officer" : undefined,
      reviewedDate: item.reviewed_at ? new Date(item.reviewed_at).toISOString().slice(0, 10) : undefined,
      notes: item.notes,
      details: item,
    }));

    const combined = [...visitorSubmissions, ...accommodationSubmissions].sort(
      (a, b) => new Date(b.submitted).getTime() - new Date(a.submitted).getTime()
    );
    setSubmissions(combined);
    const submittedReportYears = combined
      .filter((report) => normalizeStatus(report.status) === "submitted")
      .map((report) => Number(report.reportDate.slice(0, 4)))
      .filter((year) => Number.isFinite(year));
    if (submittedReportYears.length > 0) {
      setSelectedYear(String(Math.max(...submittedReportYears)));
    }
    setLoading(false);
  };

  const getReportRange = () => {
    if (filterType === "week" && selectedYear && selectedWeek) {
      return getWeekRange(selectedYear, selectedWeek);
    }

    if (filterType === "month" && selectedYear && selectedMonth) {
      const monthNum = months.indexOf(selectedMonth) + 1;
      const monthStr = String(monthNum).padStart(2, "0");
      const lastDay = new Date(parseInt(selectedYear), monthNum, 0).getDate();
      return {
        startDate: `${selectedYear}-${monthStr}-01`,
        endDate: `${selectedYear}-${monthStr}-${String(lastDay).padStart(2, "0")}`,
      };
    }

    if (filterType === "quarter" && selectedYear && selectedQuarter) {
      const quarter = parseInt(selectedQuarter);
      const startMonth = (quarter - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      const endDay = new Date(parseInt(selectedYear), endMonth, 0).getDate();
      return {
        startDate: `${selectedYear}-${String(startMonth).padStart(2, "0")}-01`,
        endDate: `${selectedYear}-${String(endMonth).padStart(2, "0")}-${String(endDay).padStart(2, "0")}`,
      };
    }

    return {
      startDate: `${selectedYear || getCurrentYear()}-01-01`,
      endDate: `${selectedYear || getCurrentYear()}-12-31`,
    };
  };

  const getChartPeriod = (date: Date, reportDate: string) => {
    if (filterType === "week") return date.toLocaleDateString("default", { weekday: "short" });
    if (filterType === "month") return `Week ${Math.ceil(date.getDate() / 7)}`;
    if (filterType === "quarter") return date.toLocaleString("default", { month: "short" });
    return date.toLocaleString("default", { month: "short" });
  };

  const fetchChartData = async () => {
    const { startDate, endDate } = getReportRange();

    const fetchTrendReports = async (
      table: "visitor_reports" | "accommodation_reports",
      select: string,
    ) => {
      const rows: any[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .eq("status", "submitted")
          .gte("report_date", startDate)
          .lte("report_date", endDate)
          .order("report_date", { ascending: true })
          .range(offset, offset + pageSize - 1);
        if (error) return { data: null, error };
        rows.push(...(data || []));
        if (!data || data.length < pageSize) break;
      }
      return { data: rows, error: null };
    };

    const [visitorResult, accommodationResult] = await Promise.all([
      fetchTrendReports("visitor_reports", "report_date, total_guests"),
      fetchTrendReports("accommodation_reports", "report_date, total_check_ins, guest_check_ins"),
    ]);
    const visitorData = visitorResult.data;
    const accommodationData = accommodationResult.data;
    const visitorError = visitorResult.error;
    const accommodationError = accommodationResult.error;

    if (visitorError || accommodationError) {
      console.error("Visitor trends loading error:", visitorError || accommodationError);
    }

    const trendRows = [
      ...(visitorData || []).map((item: any) => ({
        report_date: item.report_date,
        visitors: Number(item.total_guests || 0),
        guestCheckIns: 0,
      })),
      ...(accommodationData || []).map((item: any) => ({
        report_date: item.report_date,
        visitors: 0,
        guestCheckIns: Number(item.guest_check_ins ?? item.total_check_ins ?? 0),
      })),
    ].sort((a, b) => a.report_date.localeCompare(b.report_date));

    if (trendRows.length || filterType === "year") {
      const { startDate } = getReportRange();
      const periodOrder = filterType === "year"
        ? months
        : filterType === "quarter"
          ? months.slice((Number(selectedQuarter) - 1) * 3, Number(selectedQuarter) * 3)
          : filterType === "month"
            ? Array.from({ length: 5 }, (_, index) => `Week ${index + 1}`)
            : Array.from({ length: 7 }, (_, index) => {
                const date = new Date(`${startDate}T00:00:00`);
                date.setDate(date.getDate() + index);
                return date.toLocaleDateString("default", { weekday: "short" });
              });
      const grouped: Record<string, { visitors: number; guestCheckIns: number }> = Object.fromEntries(
        periodOrder.map((period) => [period, { visitors: 0, guestCheckIns: 0 }])
      );
      trendRows.forEach((item) => {
        const date = new Date(item.report_date);
        const key = filterType === "year" ? months[date.getMonth()] : getChartPeriod(date, item.report_date);
        if (!grouped[key]) grouped[key] = { visitors: 0, guestCheckIns: 0 };
        grouped[key].visitors += item.visitors;
        grouped[key].guestCheckIns += item.guestCheckIns;
      });

      const chartDataArray = periodOrder.map((period) => ({
        period,
        visitors: (grouped[period]?.visitors || 0) + (grouped[period]?.guestCheckIns || 0),
        dayTourVisitors: grouped[period]?.visitors || 0,
        guestCheckIns: grouped[period]?.guestCheckIns || 0,
      }));
      setChartData(chartDataArray);
      
      const currentTotal = chartDataArray[chartDataArray.length - 1]?.visitors || 0;
      const previousTotal = chartDataArray[chartDataArray.length - 2]?.visitors || 0;
      const difference = currentTotal - previousTotal;
      const percentageChange = previousTotal > 0 ? ((difference / previousTotal) * 100).toFixed(1) : "0";
      setVisitorStats({
        currentTotal,
        previousTotal,
        difference,
        percentageChange,
        isIncrease: difference >= 0,
      });
    } else {
      setChartData([]);
      setVisitorStats({
        currentTotal: 0,
        previousTotal: 0,
        difference: 0,
        percentageChange: "0",
        isIncrease: true,
      });
    }
  };

  useEffect(() => {
    fetchSubmissions();
  }, [filterType, selectedYear, selectedQuarter, selectedMonth, selectedWeek]);

  useEffect(() => {
    fetchChartData();
  }, [filterType, selectedYear, selectedQuarter, selectedMonth, selectedWeek]);

  useEffect(() => {
    let cancelled = false;
    const loadSavedAiReport = async () => {
      if (loading) return;
      setAiReport(null);
      setAiReportSaved(false);
      setAiReportError("");
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session?.access_token) return;
        const response = await fetch("/api/generate-administrative-report", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ action: "get", periodKey: aiReportPeriodKey }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || cancelled || !result.cached?.report) return;
        setAiReport(result.cached.report);
        setAiReportSaved(true);
      } catch (error) {
        if (!cancelled) console.error("Unable to load saved AI report:", error);
      }
    };
    void loadSavedAiReport();
    return () => { cancelled = true; };
  }, [loading, aiReportPeriodKey]);

  const handleExport = async () => {
    try {
      const { startDate, endDate } = getReportRange();
      const fetchExportReports = async (table: "visitor_reports" | "accommodation_reports", relationship: string) => {
        const rows: any[] = [];
        const pageSize = 1000;
        for (let offset = 0; ; offset += pageSize) {
          const { data, error } = await supabase
            .from(table)
            .select(`*, establishments!${relationship} (name, type, dot_classification, reporting_mode, total_rooms, ae_id, attraction_code)`)
            .gte("report_date", startDate)
            .lte("report_date", endDate)
            .order("created_at", { ascending: false })
            .range(offset, offset + pageSize - 1);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < pageSize) break;
        }
        return rows;
      };
      const [{ data: freshEstablishments, error: establishmentError }, freshVisitors, freshAccommodation] = await Promise.all([
        supabase
          .from("establishments")
          .select("id,name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status,business_permit_number")
          .order("name", { ascending: true }),
        fetchExportReports("visitor_reports", "visitor_reports_establishment_id_fkey"),
        fetchExportReports("accommodation_reports", "accommodation_reports_establishment_id_fkey"),
      ]);
      if (establishmentError) throw establishmentError;

      const establishmentsById = new Map<string, any>((freshEstablishments || []).map((establishment) => [String(establishment.id), establishment]));
      const accommodation = freshAccommodation.map((report) => ({ ...report, establishment_id: String(report.establishment_id) }));
      const visitors = freshVisitors.map((report) => ({ ...report, establishment_id: String(report.establishment_id) }));
      [...freshVisitors, ...freshAccommodation].forEach((report) => {
        const establishmentId = String(report.establishment_id || "");
        if (!establishmentId || establishmentsById.has(establishmentId)) return;
        const joined = Array.isArray(report.establishments) ? report.establishments[0] : report.establishments;
        establishmentsById.set(establishmentId, {
          id: establishmentId,
          name: joined?.name || "Unknown",
          type: joined?.type || "resort",
          reporting_mode: joined?.reporting_mode || "both",
          ae_id: joined?.ae_id || "",
          attraction_code: joined?.attraction_code || "",
          total_rooms: Number(joined?.total_rooms || 0),
          status: "active",
        });
      });
      const visitorEstablishmentIds = new Set(visitors.map((report) => report.establishment_id));
      const accommodationEstablishmentIds = new Set(accommodation.map((report) => report.establishment_id));
      for (const establishmentId of new Set([...visitorEstablishmentIds, ...accommodationEstablishmentIds])) {
        const establishment = establishmentsById.get(establishmentId);
        if (!establishment) continue;
        const hasVisitorReports = visitorEstablishmentIds.has(establishmentId);
        const hasAccommodationReports = accommodationEstablishmentIds.has(establishmentId);
        if (hasVisitorReports && hasAccommodationReports) {
          establishment.reporting_mode = "both";
        } else if (!establishment.reporting_mode) {
          establishment.reporting_mode = hasVisitorReports ? "visitor" : "accommodation";
        }
      }
      const exportEstablishmentIds = searchTerm.trim()
        ? new Set(Array.from(establishmentsById.values())
            .filter((establishment) => String(establishment.name || "").toLowerCase().includes(searchTerm.trim().toLowerCase()))
            .map((establishment) => String(establishment.id)))
        : null;
      const exportEstablishments = exportEstablishmentIds
        ? Array.from(establishmentsById.values()).filter((establishment) => exportEstablishmentIds.has(String(establishment.id)))
        : Array.from(establishmentsById.values());
      const exportVisitors = exportEstablishmentIds
        ? visitors.filter((report) => exportEstablishmentIds.has(String(report.establishment_id)))
        : visitors;
      const exportAccommodation = exportEstablishmentIds
        ? accommodation.filter((report) => exportEstablishmentIds.has(String(report.establishment_id)))
        : accommodation;
      const exportStart = new Date(`${startDate}T00:00:00`);
      const exportEnd = new Date(`${endDate}T00:00:00`);
      const exportMonths = filterType === "year" || (filterType === "month" && !selectedMonth)
        ? undefined
        : Array.from(new Set(
            Array.from({ length: Math.max(1, Math.round((exportEnd.getTime() - exportStart.getTime()) / 86400000) + 1) }, (_, index) => {
              const date = new Date(exportStart);
              date.setDate(exportStart.getDate() + index);
              return date.getFullYear() === Number(selectedYear) ? date.getMonth() + 1 : null;
            }).filter((value): value is number => value !== null),
          ));
      const isAnnual = !exportMonths;
      await downloadOfficialArrivalsWorkbook({
        filename: isAnnual ? `Balayan_Official_Arrivals_Annual_${selectedYear}.xlsx` : `Balayan_Official_Arrivals_${filterType}_${selectedYear}.xlsx`,
        year: Number(selectedYear),
        selectedMonths: exportMonths,
        includeEstablishmentsWithoutPermit: false,
        weeklyLabel: filterType === "week" ? `WEEK ${selectedWeek} ${selectedYear}` : undefined,
        weeklyStartDate: filterType === "week" ? startDate : undefined,
        weeklyEndDate: filterType === "week" ? endDate : undefined,
        establishments: exportEstablishments,
        accommodation: exportAccommodation,
        visitors: exportVisitors,
      });
      toast.success(`Exported official arrivals template for ${getFilterLabel()}`);
    } catch (error) {
      console.error("Official Excel export error:", error);
      toast.error(error instanceof Error ? error.message : "Failed to export official Excel workbook");
    }
  };

  const handleViewDetails = (submission: Submission) => {
    setSelectedSubmission(submission);
    setShowDetailModal(true);
  };

  const handleGenerateAiReport = async (forceRegenerate = false) => {
    if (aiReportLoading) return;
    setAiReportLoading(true);
    setAiReportError("");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Your officer session has expired. Please sign in again.");
      const { startDate, endDate } = getReportRange();
      const response = await fetch("/api/generate-administrative-report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          periodKey: aiReportPeriodKey,
          periodLabel: getFilterLabel(),
          forceRegenerate,
          startDate,
          endDate,
        }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || !result.report) throw new Error(result.error || "Unable to create the AI report.");
      setAiReport(result.report);
      setAiReportSaved(Boolean(result.cached || result.saved));
      setShowAiReportModal(true);
    } catch (error) {
      setAiReportError(error instanceof Error ? error.message : "Unable to create the AI report.");
    } finally {
      setAiReportLoading(false);
    }
  };


  // Get filter label for display
  const getFilterLabel = () => {
    if (filterType === "week" && selectedYear && selectedWeek) {
      const { startDate, endDate } = getReportRange();
      return `Weekly Report: Week ${selectedWeek}, ${selectedYear} (${startDate} to ${endDate})`;
    }
    if (filterType === "month" && selectedYear && selectedMonth) {
      return `Monthly Report: ${selectedMonth} ${selectedYear}`;
    }
    if (filterType === "quarter" && selectedYear && selectedQuarter) {
      return `Quarterly Report: Q${selectedQuarter} ${selectedYear}`;
    }
    if (filterType === "year" && selectedYear) return `Yearly Report: ${selectedYear}`;
    return "All Data";
  };

  const handleFilterTypeChange = (type: "year" | "quarter" | "month" | "week") => {
    setFilterType(type);
    if (type === "year") { setSelectedMonth(""); setSelectedQuarter("1"); }
    if (type === "quarter") setSelectedMonth("");
    if (type === "month" && !selectedMonth) setSelectedMonth(getCurrentMonth());
    if (type === "week") { setSelectedYear(getCurrentYear()); setSelectedMonth(""); setSelectedWeek("1"); }
  };

  // Filter submissions for table
  const filteredReports = submissions.filter((report) => {
    const matchesSearch = report.establishment.toLowerCase().includes(searchTerm.toLowerCase());
    const { startDate, endDate } = getReportRange();
    const matchesDate = report.reportDate >= startDate && report.reportDate <= endDate;
    
    return matchesSearch && matchesDate;
  });

  const submittedFilteredReports = filteredReports.filter((report) => normalizeStatus(report.status) === "submitted");
  const totalSubmissions = submittedFilteredReports.length;
  const totalVisitors = submittedFilteredReports.reduce((sum, report) => sum + report.visitors, 0);
  const establishmentsCovered = new Set(submittedFilteredReports.map((report) => report.establishment)).size;
  const topEstablishment = Object.entries(
    submittedFilteredReports.reduce<Record<string, number>>((acc, report) => {
      acc[report.establishment] = (acc[report.establishment] || 0) + report.visitors;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1])[0];

  const reportTrendMax = Math.max(
    1,
    ...chartData.flatMap((item) => [Number(item.dayTourVisitors) || 0, Number(item.guestCheckIns) || 0])
  );
  const reportTrendTicks = Array.from({ length: 5 }, (_, index) =>
    Math.round((reportTrendMax * (4 - index)) / 4)
  );
  const monthYearValue = selectedMonth
    ? `${selectedYear}-${String(months.indexOf(selectedMonth) + 1).padStart(2, "0")}`
    : `${selectedYear}-01`;
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const reportYears = ["2024", "2025", "2026"];

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Reporting workspace"
        title="Reports"
        description="Generate, review, and export official tourism data reports for municipal decision-making."
        compact
      />

      {/* Report filters */}
      <div className="rounded-2xl border border-gray-200 bg-white p-3 shadow-sm sm:p-4">
        <div className="grid grid-cols-2 gap-3 sm:flex sm:flex-wrap sm:items-center">
          <label className="sr-only" htmlFor="report-period-filter">Report period</label>
          <select
            id="report-period-filter"
            value={filterType}
            onChange={(e) => handleFilterTypeChange(e.target.value as "year" | "quarter" | "month" | "week")}
            className="w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:w-auto"
          >
            <option value="year">Year</option>
            <option value="quarter">Quarter</option>
            <option value="month">Month</option>
            <option value="week">Week</option>
          </select>

          {filterType !== "month" ? (
            <>
              <label className="sr-only" htmlFor="report-year-filter">Report year</label>
              <select
                id="report-year-filter"
                value={selectedYear}
                onChange={(e) => setSelectedYear(e.target.value)}
                className="w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:w-auto"
              >
                <option value="2024">2024</option>
                <option value="2025">2025</option>
                <option value="2026">2026</option>
              </select>
            </>
          ) : (
            <>
              <label className="sr-only" htmlFor="report-month-year-filter">Report month and year</label>
              <select
                id="report-month-year-filter"
                value={monthYearValue}
                onChange={(e) => {
                  const [year, month] = e.target.value.split("-");
                  const monthIndex = Number(month) - 1;
                  if (year && monthIndex >= 0 && monthIndex < months.length) {
                    setSelectedYear(year);
                    setSelectedMonth(months[monthIndex]);
                  }
                }}
                className="w-full min-w-0 max-w-full rounded-xl border border-gray-300 px-3 py-2 text-sm sm:w-auto"
                title="Select report month and year"
              >
                {reportYears.flatMap((year) => months.map((month, index) => (
                  <option key={`${year}-${index + 1}`} value={`${year}-${String(index + 1).padStart(2, "0")}`}>
                    {monthNames[index]} {year}
                  </option>
                )))}
              </select>
            </>
          )}

          {filterType === "quarter" && (
            <>
              <label className="sr-only" htmlFor="report-quarter-filter">Report quarter</label>
              <select id="report-quarter-filter" value={selectedQuarter} onChange={(e) => setSelectedQuarter(e.target.value)} className="col-span-1 w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:col-span-1 sm:w-auto">
                <option value="1">Q1</option>
                <option value="2">Q2</option>
                <option value="3">Q3</option>
                <option value="4">Q4</option>
              </select>
            </>
          )}



          {filterType === "week" && (
            <>
              <label className="sr-only" htmlFor="report-week-filter">Report week</label>
              <select id="report-week-filter" value={selectedWeek} onChange={(e) => setSelectedWeek(e.target.value)} className="col-span-1 w-full min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm sm:col-span-1 sm:w-auto" title="Choose report week">
                {weekOptions.map((week) => <option key={week.value} value={week.value}>{week.label}</option>)}
              </select>
            </>
          )}

          <label className="sr-only" htmlFor="report-establishment-search">Search establishment</label>
          <input
            id="report-establishment-search"
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search establishment..."
            className={`min-w-0 rounded-xl border border-gray-300 px-3 py-2 text-sm ${filterType === "quarter" || filterType === "week" ? "col-span-1 sm:col-span-1" : "col-span-2 sm:col-span-2"} sm:min-w-[180px] sm:flex-1`}
          />

          <button
            type="button"
            onClick={handleExport}
            className="col-span-1 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-3 py-2 text-sm text-white hover:bg-green-700 sm:col-span-1 sm:w-auto sm:px-4"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export
          </button>
          <button
            type="button"
            onClick={() => {
              if (aiReportSaved && aiReport) {
                setShowAiReportModal(true);
              } else {
                void handleGenerateAiReport();
              }
            }}
            disabled={aiReportLoading || loading || visitorReports.length === 0}
            className="col-span-1 flex w-full items-center justify-center gap-2 rounded-xl bg-[#193364] px-3 py-2 text-sm text-white hover:bg-[#27477D] disabled:cursor-not-allowed disabled:opacity-60 sm:col-span-1 sm:w-auto sm:px-4"
          >
            {aiReportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {aiReportLoading ? "Generating..." : aiReportSaved ? "View saved AI report" : "Generate AI report"}
          </button>
        </div>
      </div>

      {/* Report Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Tourism Trends ({getFilterLabel()})
        </h3>
        {chartData.length > 0 ? (
          <div className="-mx-2 sm:mx-0">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 8 }}>
                <defs>
                  <linearGradient id="reportsVisitorFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#193364" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="#193364" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="period"
                  interval={0}
                  tickFormatter={(value: string, index: number) => {
                    if (filterType === "year") return index % 2 === 0 ? "" : value.slice(0, 3);
                    return filterType === "month" ? value.replace("Week ", "Wk") : value.slice(0, 3);
                  }}
                  height={32}
                  tickMargin={8}
                  padding={{ left: 0, right: 0 }}
                />
                <YAxis width={52} domain={[0, reportTrendMax]} ticks={reportTrendTicks} />
                <Tooltip />
                <Legend />
                <Area
                  type="monotone"
                  dataKey="dayTourVisitors"
                  stroke="#193364"
                  fill="url(#reportsVisitorFill)"
                  fillOpacity={0.28}
                  dot={{ r: 3, strokeWidth: 1, fill: "#193364" }}
                  activeDot={{ r: 5 }}
                  name="Day-tour visitors"
                />
                <Area
                  type="monotone"
                  dataKey="guestCheckIns"
                  stroke="#D69A3A"
                  fill="#D69A3A"
                  fillOpacity={0.16}
                  dot={{ r: 3, strokeWidth: 1, fill: "#D69A3A" }}
                  activeDot={{ r: 5 }}
                  name="Guest check-ins"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">No data available for the selected period</div>
        )}
      </div>

      {/* Administrative Summary Output */}
      <div className="overflow-hidden rounded-2xl border border-slate-300/70 bg-[#E0E5EC] p-4 shadow-[7px_7px_14px_rgba(163,177,198,0.45),-7px_-7px_14px_rgba(255,255,255,0.6)] sm:p-6">
        <div className="flex flex-col gap-3 border-b border-slate-300/70 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-lg font-bold text-[#193364]">Administrative Report Summary</h3>
            <p className="mt-1 text-sm text-slate-600">Submitted report totals for {getFilterLabel()}.</p>
          </div>
          <span className="w-fit rounded-full bg-[#E0E5EC] px-3 py-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#0F4C75] shadow-[inset_2px_2px_5px_rgba(163,177,198,0.45),inset_-2px_-2px_5px_rgba(255,255,255,0.65)]">
            {filterType} report
          </span>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <div className="min-w-0 rounded-xl bg-[#E0E5EC] p-4 shadow-[inset_4px_4px_8px_rgba(163,177,198,0.42),inset_-4px_-4px_8px_rgba(255,255,255,0.62)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:text-xs">Total Visitors / Check-ins</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-[#193364]">{totalVisitors.toLocaleString()}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-[#E0E5EC] p-4 shadow-[inset_4px_4px_8px_rgba(163,177,198,0.42),inset_-4px_-4px_8px_rgba(255,255,255,0.62)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:text-xs">Reports Included</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-[#193364]">{totalSubmissions}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-[#E0E5EC] p-4 shadow-[inset_4px_4px_8px_rgba(163,177,198,0.42),inset_-4px_-4px_8px_rgba(255,255,255,0.62)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:text-xs">Establishments Covered</p>
            <p className="mt-2 text-2xl font-black tabular-nums text-[#193364]">{establishmentsCovered}</p>
          </div>
          <div className="min-w-0 rounded-xl bg-[#E0E5EC] p-4 shadow-[inset_4px_4px_8px_rgba(163,177,198,0.42),inset_-4px_-4px_8px_rgba(255,255,255,0.62)]">
            <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-500 sm:text-xs">Top Establishment</p>
            <p className="mt-2 truncate text-base font-black text-[#193364] sm:text-lg">{topEstablishment ? topEstablishment[0] : "N/A"}</p>
            {topEstablishment && <p className="mt-1 text-xs text-slate-500 sm:text-sm">{topEstablishment[1].toLocaleString()} visitors/check-ins</p>}
          </div>
        </div>
        <p className="mt-4 rounded-xl bg-[#F5F8FF] px-4 py-3 text-sm leading-6 text-slate-600 shadow-sm">
          {totalSubmissions} submitted reports are included in this selected period.
          {visitorStats.difference !== 0 && ` The latest chart bucket changed by ${visitorStats.difference.toLocaleString()} visitors/check-ins (${visitorStats.percentageChange}%).`}
        </p>
      </div>

      {/* Submissions Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Submissions</h3>
          <p className="text-sm text-gray-600">Daily reports submitted by establishments. Municipal officers can view the submitted records without approving or rejecting them.</p>
        </div>
        <div ref={submissionsTableRef} className="max-h-[28rem] overflow-auto overscroll-contain touch-none [-webkit-overflow-scrolling:touch]">
          {loading ? (
            <div className="space-y-3 p-4" role="status" aria-label="Loading submissions">
              {Array.from({ length: 6 }, (_, index) => (
                <div key={index} className="grid grid-cols-6 gap-4 rounded-xl bg-gray-50 p-4 motion-reduce:animate-none">
                  {Array.from({ length: 6 }, (_, cellIndex) => (
                    <div key={cellIndex} className="h-4 animate-pulse rounded bg-gray-200 motion-reduce:animate-none" />
                  ))}
                </div>
              ))}
            </div>
          ) : (
            <table className="w-full min-w-[38rem] table-fixed">
              <colgroup>
                <col className="w-[25%]" />
                <col className="w-[18%]" />
                <col className="w-[17%]" />
                <col className="w-[12%]" />
                <col className="w-[18%]" />
                <col className="w-[10%]" />
              </colgroup>
              <thead className="sticky top-0 z-20 bg-gray-50 shadow-sm">
                <tr>
                  <th className="sticky left-0 z-20 bg-gray-50 px-2 py-2 text-left text-[10px] font-semibold text-gray-700 shadow-[2px_0_4px_rgba(148,163,184,0.24)] sm:px-4 sm:py-3 sm:text-xs">Establishment</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 sm:px-4 sm:py-3 sm:text-xs">Type</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 sm:px-4 sm:py-3 sm:text-xs">Date</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 sm:px-4 sm:py-3 sm:text-xs">Visitors</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 sm:px-4 sm:py-3 sm:text-xs">Status</th>
                  <th className="px-2 py-2 text-left text-[10px] font-semibold text-gray-700 sm:px-4 sm:py-3 sm:text-xs">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredReports.map((report) => (
                  <tr key={report.id} className="group hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-2 py-2 text-[11px] font-medium text-gray-900 shadow-[2px_0_4px_rgba(148,163,184,0.18)] group-hover:bg-gray-50 sm:px-4 sm:py-3 sm:text-sm">{report.establishment}</td>
                    <td className="px-2 py-2 text-[11px] text-gray-600 sm:px-4 sm:py-3 sm:text-sm">{getReportTypeLabel(report)}</td>
                    <td className="px-2 py-2 text-[11px] text-gray-900 sm:px-4 sm:py-3 sm:text-sm">{report.reportDate}</td>
                    <td className="px-2 py-2 text-[11px] text-gray-900 sm:px-4 sm:py-3 sm:text-sm">{report.visitors}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[normalizeStatus(report.status)] || statusStyles.pending}`}>
                        {formatStatus(report.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => handleViewDetails(report)} className="text-blue-600 hover:text-blue-800 text-sm font-medium">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
                {filteredReports.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      No submissions found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Review Modal */}
      {showDetailModal && selectedSubmission && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#193364]/35 p-4 backdrop-blur-[3px]" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowDetailModal(false); }}>
          <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-[2rem] border border-white/50 bg-[#E0E5EC] text-[#193364] shadow-[18px_18px_36px_rgba(163,177,198,0.62),-12px_-12px_30px_rgba(255,255,255,0.76)]" role="dialog" aria-modal="true" aria-labelledby="review-submission-title">
            <div className="flex items-start justify-between gap-4 border-b border-[#c7ced8]/70 px-5 py-5 sm:px-7 sm:py-6">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0E5A72]">Submission details</p>
                <h2 id="review-submission-title" className="mt-1 text-xl font-bold text-[#193364] sm:text-2xl">Review Submission</h2>
                <p className="mt-1 text-sm font-medium text-[#64748b]">{selectedSubmission.establishment} <span className="text-[#94a3b8]">•</span> {getReportTypeLabel(selectedSubmission)}</p>
              </div>
              <button type="button" onClick={() => setShowDetailModal(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E0E5EC] text-[#193364] shadow-[inset_4px_4px_8px_rgba(163,177,198,0.42),inset_-4px_-4px_8px_rgba(255,255,255,0.78)] transition hover:text-[#0E5A72] focus:outline-none focus:ring-2 focus:ring-[#0E5A72]/30" aria-label="Close review submission">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_5px_5px_10px_rgba(163,177,198,0.42),inset_-5px_-5px_10px_rgba(255,255,255,0.76)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Report date</p>
                  <p className="mt-2 text-base font-bold text-[#193364]">{selectedSubmission.reportDate}</p>
                </div>
                <div className="rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_5px_5px_10px_rgba(163,177,198,0.42),inset_-5px_-5px_10px_rgba(255,255,255,0.76)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Visitors / check-ins</p>
                  <p className="mt-2 text-2xl font-bold text-[#0E5A72]">{selectedSubmission.visitors.toLocaleString()}</p>
                </div>
                <div className="rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_5px_5px_10px_rgba(163,177,198,0.42),inset_-5px_-5px_10px_rgba(255,255,255,0.76)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Submitted</p>
                  <p className="mt-2 text-base font-bold text-[#193364]">{selectedSubmission.submitted}</p>
                </div>
                <div className="rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_5px_5px_10px_rgba(163,177,198,0.42),inset_-5px_-5px_10px_rgba(255,255,255,0.76)]">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">Status</p>
                  <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold shadow-[3px_3px_6px_rgba(163,177,198,0.38),-3px_-3px_6px_rgba(255,255,255,0.7)] ${statusStyles[normalizeStatus(selectedSubmission.status)] || statusStyles.pending}`}>{formatStatus(selectedSubmission.status)}</span>
                </div>
              </div>
              {selectedSubmission.notes && (
                <div className="rounded-2xl bg-[#E0E5EC] p-4 text-sm text-[#9a5a18] shadow-[inset_5px_5px_10px_rgba(163,177,198,0.38),inset_-5px_-5px_10px_rgba(255,255,255,0.72)]">
                  <div className="flex items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#E0E5EC] shadow-[inset_3px_3px_6px_rgba(163,177,198,0.38),inset_-3px_-3px_6px_rgba(255,255,255,0.72)]"><AlertTriangle className="h-4 w-4" /></span>
                    <div><p className="font-bold text-[#8a5318]">Review note</p><p className="mt-1 leading-6">{selectedSubmission.notes}</p></div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end border-t border-[#c7ced8]/70 px-5 py-5 sm:px-7 sm:py-6">
              <button type="button" onClick={() => setShowDetailModal(false)} className="rounded-xl bg-[#E0E5EC] px-5 py-2.5 text-sm font-bold text-[#193364] shadow-[6px_6px_12px_rgba(163,177,198,0.55),-6px_-6px_12px_rgba(255,255,255,0.78)] transition hover:text-[#0E5A72] active:shadow-[inset_4px_4px_8px_rgba(163,177,198,0.45),inset_-4px_-4px_8px_rgba(255,255,255,0.76)] focus:outline-none focus:ring-2 focus:ring-[#0E5A72]/30">Close</button>
            </div>
          </div>
        </div>
      )}
      {showAiReportModal && aiReport && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[#193364]/35 p-3 backdrop-blur-[3px] sm:items-center sm:p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowAiReportModal(false); }}>
          <div className="my-0 flex max-h-[calc(100dvh-1.5rem)] min-h-0 w-full max-w-3xl flex-col overflow-hidden rounded-[1.5rem] border border-white/50 bg-[#E0E5EC] text-[#193364] shadow-[18px_18px_36px_rgba(163,177,198,0.62),-12px_-12px_30px_rgba(255,255,255,0.76)] sm:my-4 sm:max-h-[90vh] sm:rounded-[2rem]" role="dialog" aria-modal="true" aria-labelledby="ai-administrative-report-title">
            <div className="flex items-start justify-between gap-4 border-b border-[#c7ced8]/70 px-5 py-5 sm:px-7 sm:py-6">
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#0E5A72]">Decision support</p>
                <h2 id="ai-administrative-report-title" className="mt-1 text-xl font-bold text-[#193364] sm:text-2xl">AI Administrative Report</h2>
                <p className="mt-1 text-sm font-medium text-[#64748b]">Aggregated submitted visitor data for {getFilterLabel()}</p>
              </div>
              <button type="button" onClick={() => setShowAiReportModal(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#E0E5EC] text-[#193364] shadow-[inset_4px_4px_8px_rgba(163,177,198,0.42),inset_-4px_-4px_8px_rgba(255,255,255,0.78)]" aria-label="Close AI administrative report"><X className="h-5 w-5" /></button>
            </div>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-5 [-webkit-overflow-scrolling:touch] sm:px-7 sm:py-6">
              <section className="rounded-2xl border border-[#0E5A72]/20 bg-[#d7eef2]/60 p-4"><h3 className="text-sm font-bold text-[#193364]">System-verified source totals</h3><p className="mt-1 text-xs leading-5 text-[#475569]">Recalculated by the server from submitted visitor records. A visitor submission can contain multiple residence-category rows, so both counts are shown.</p><div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5"><div><p className="text-[10px] font-semibold uppercase text-[#64748b]">Source records</p><p className="text-lg font-bold text-[#193364]">{aiReport.source.visitorRecordCount.toLocaleString()}</p></div><div><p className="text-[10px] font-semibold uppercase text-[#64748b]">Submission groups</p><p className="text-lg font-bold text-[#193364]">{aiReport.source.submissionCount.toLocaleString()}</p></div><div><p className="text-[10px] font-semibold uppercase text-[#64748b]">Visitors</p><p className="text-lg font-bold text-[#193364]">{aiReport.source.visitorTotal.toLocaleString()}</p></div><div><p className="text-[10px] font-semibold uppercase text-[#64748b]">Establishments</p><p className="text-lg font-bold text-[#193364]">{aiReport.source.establishmentCount.toLocaleString()}</p></div><div><p className="text-[10px] font-semibold uppercase text-[#64748b]">Date range</p><p className="text-xs font-bold text-[#193364]">{aiReport.source.dateRange.startDate} to {aiReport.source.dateRange.endDate}</p></div></div><div className="mt-4 space-y-2">{Object.entries(aiReport.source.aggregates).map(([periodType, rows]) => <div key={periodType} className="rounded-xl bg-white/45 p-2.5"><p className="text-xs font-bold capitalize text-[#193364]">{periodType}</p>{(rows as VisitorAggregate[]).map((row) => <p key={row.period} className="mt-1 text-xs text-[#475569]"><span className="font-semibold">{row.period}</span>: {row.visitorTotal.toLocaleString()} visitors · {row.recordCount.toLocaleString()} source records · {row.submissionCount.toLocaleString()} submission groups · {row.establishmentCount.toLocaleString()} establishments</p>)}</div>)}</div></section>
              {([
                ["Overview", aiReport.overview],
                ["Weekly aggregation", aiReport.weekly],
                ["Monthly aggregation", aiReport.monthly],
                ["Quarterly aggregation", aiReport.quarterly],
                ["Yearly aggregation", aiReport.yearly],
                ["Suggested follow-up", aiReport.followUp],
              ] as const).map(([title, text]) => (
                <section key={title} className="rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_5px_5px_10px_rgba(163,177,198,0.35),inset_-5px_-5px_10px_rgba(255,255,255,0.72)]">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[#193364]"><Sparkles className="h-4 w-4 text-[#0E5A72]" />{title}</h3>
                  <p className="mt-2 whitespace-pre-line text-sm leading-6 text-[#334155]">{text}</p>
                </section>
              ))}
              {aiReport.source.aggregates && (
                <section className="rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_5px_5px_10px_rgba(163,177,198,0.35),inset_-5px_-5px_10px_rgba(255,255,255,0.72)]">
                  <h3 className="flex items-center gap-2 text-sm font-bold text-[#193364]"><FileSpreadsheet className="h-4 w-4 text-[#0E5A72]" />Deterministic visitor aggregation</h3>
                  <p className="mt-2 text-xs leading-5 text-[#64748b]">These totals are calculated from submitted visitor reports and are shown alongside the AI narrative for verification.</p>
                  <div className="mt-3 space-y-4">
                    {([
                      ["Weekly", aiReport.source.aggregates.weekly],
                      ["Monthly", aiReport.source.aggregates.monthly],
                      ["Quarterly", aiReport.source.aggregates.quarterly],
                      ["Yearly", aiReport.source.aggregates.yearly],
                    ] as const).map(([title, rows]) => (
                      <div key={title}>
                        <h4 className="mb-2 text-xs font-bold uppercase tracking-[0.12em] text-[#0E5A72]">{title}</h4>
                        {rows.length === 0 ? (
                          <p className="text-sm text-[#64748b]">No submitted visitor data.</p>
                        ) : (
                          <div className="overflow-x-auto rounded-xl border border-[#c7ced8]/70">
                            <table className="min-w-full text-left text-xs">
                              <thead className="bg-[#F5F8FF] text-[#64748b]"><tr><th className="px-3 py-2 font-semibold">Period</th><th className="px-3 py-2 font-semibold">Visitors</th><th className="px-3 py-2 font-semibold">Source records</th><th className="px-3 py-2 font-semibold">Submission groups</th><th className="px-3 py-2 font-semibold">Establishments</th></tr></thead>
                                                            <tbody>{rows.map((row) => <tr key={row.period} className="border-t border-[#c7ced8]/60"><td className="whitespace-nowrap px-3 py-2 font-medium text-[#193364]">{row.period}</td><td className="px-3 py-2 text-[#334155]">{row.visitorTotal.toLocaleString()}</td><td className="px-3 py-2 text-[#334155]">{row.recordCount.toLocaleString()}</td><td className="px-3 py-2 text-[#334155]">{row.submissionCount.toLocaleString()}</td><td className="px-3 py-2 text-[#334155]">{row.establishmentCount.toLocaleString()}</td></tr>)}</tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </section>
              )}
              <p className="text-[11px] leading-4 text-[#64748b]">AI-generated decision support based on the selected period’s submitted visitor records. Verify source totals before official use.</p>
            </div>
            <div className="flex flex-col-reverse gap-3 border-t border-[#c7ced8]/70 px-5 py-5 sm:flex-row sm:items-center sm:justify-end sm:px-7 sm:py-6">
              <button type="button" onClick={() => { setShowAiReportModal(false); void handleGenerateAiReport(true); }} disabled={aiReportLoading} className="rounded-xl bg-[#E0E5EC] px-5 py-2.5 text-sm font-bold text-[#0E5A72] shadow-[6px_6px_12px_rgba(163,177,198,0.55),-6px_-6px_12px_rgba(255,255,255,0.78)] disabled:cursor-not-allowed disabled:opacity-60">Regenerate</button>
              <button type="button" onClick={() => setShowAiReportModal(false)} className="rounded-xl bg-[#E0E5EC] px-5 py-2.5 text-sm font-bold text-[#193364] shadow-[6px_6px_12px_rgba(163,177,198,0.55),-6px_-6px_12px_rgba(255,255,255,0.78)]">Close</button>
            </div>
          </div>
        </div>
      )}
      {aiReportError && <p className="fixed bottom-5 right-5 z-[70] max-w-sm rounded-xl bg-[#E0E5EC] px-4 py-3 text-sm font-semibold text-[#9a5a18] shadow-lg">{aiReportError}</p>}
    </div>
  );
}