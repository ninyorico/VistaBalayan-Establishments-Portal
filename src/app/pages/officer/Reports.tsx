import { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Eye,
  X,
  AlertTriangle,
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

const getReportTypeLabel = (report: Submission) => report.type === "Visitor Report" ? "Day-tour" : "Overnight";

const statusStyles = reportStatusClasses;
const normalizeStatus = normalizeReportStatus;
const formatStatus = reportStatusLabel;

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

export default function Reports() {
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
  const [loading, setLoading] = useState(true);
  
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

    const [{ data: visitorData, error: visitorError }, { data: accommodationData, error: accommodationError }] = await Promise.all([
      supabase
        .from("visitor_reports")
        .select("report_date, total_guests")
        .eq("status", "submitted")
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .order("report_date", { ascending: true }),
      supabase
        .from("accommodation_reports")
        .select("report_date, total_check_ins, guest_check_ins")
        .eq("status", "submitted")
        .gte("report_date", startDate)
        .lte("report_date", endDate)
        .order("report_date", { ascending: true }),
    ]);

    if (visitorError || accommodationError) {
      console.error("Visitor trends loading error:", visitorError || accommodationError);
    }

    const trendRows = [
      ...(visitorData || []).map((item: any) => ({ report_date: item.report_date, visitors: Number(item.total_guests || 0) })),
      ...(accommodationData || []).map((item: any) => ({
        report_date: item.report_date,
        visitors: Number(item.total_check_ins ?? item.guest_check_ins ?? 0),
      })),
    ].sort((a, b) => a.report_date.localeCompare(b.report_date));

    if (trendRows.length || filterType === "year") {
      const grouped: Record<string, number> = filterType === "year"
        ? Object.fromEntries(months.map((month) => [month, 0]))
        : {};
      trendRows.forEach((item) => {
        const date = new Date(item.report_date);
        const key = filterType === "year" ? months[date.getMonth()] : getChartPeriod(date, item.report_date);
        grouped[key] = (grouped[key] || 0) + item.visitors;
      });

      const chartDataArray = Object.entries(grouped).map(([period, visitors]) => ({
        period,
        visitors,
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

  const reportTrendMax = Math.max(1, ...chartData.map((item) => Number(item.visitors) || 0));
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
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600 mt-1">Generate and export tourism data reports</p>
      </div>

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
            className="col-span-2 flex w-full items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 sm:col-span-2 sm:w-auto"
          >
            <FileSpreadsheet className="h-4 w-4" /> Export
          </button>
        </div>
      </div>

      {/* Report Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Tourism Trends ({getFilterLabel()})
        </h3>
        {chartData.length > 0 ? (
          <div className="flex min-w-0">
            <div className="relative h-[350px] w-14 shrink-0 border-r border-gray-200 bg-white pr-1 text-right text-[11px] text-gray-500">
              <div className="absolute inset-x-0 top-1 bottom-[75px] flex flex-col justify-between">
                {reportTrendTicks.map((tick, index) => (
                  <span key={`${tick}-${index}`} className="relative pr-2">
                    {tick.toLocaleString()}
                    <span className="absolute right-[-4px] top-1/2 h-px w-1 bg-gray-400" aria-hidden="true" />
                  </span>
                ))}
              </div>
            </div>
            <div className={`min-w-0 flex-1 ${chartData.length > 8 ? "overflow-x-auto" : "overflow-x-hidden"}`}>
              <div className={chartData.length > 8 ? "min-w-[960px]" : "w-full"}>
                <ResponsiveContainer width="100%" height={350}>
                  <AreaChart data={chartData} margin={{ top: 5, right: 16, bottom: 8, left: 8 }}>
                    <defs>
                      <linearGradient id="reportsVisitorFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6C63FF" stopOpacity={0.34} />
                        <stop offset="95%" stopColor="#6C63FF" stopOpacity={0.03} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="period" interval={0} tick={renderResponsivePeriodTick} />
                    <YAxis hide domain={[0, reportTrendMax]} ticks={reportTrendTicks} />
                    <Tooltip />
                    <Legend />
                    <Area type="monotone" dataKey="visitors" stroke="#6C63FF" fill="url(#reportsVisitorFill)" strokeWidth={3} name="Visitors" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
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
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
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
        <div className="max-h-[28rem] overflow-auto overscroll-contain">
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
            <table className="w-full min-w-[720px]">
              <thead className="sticky top-0 z-10 bg-gray-50 shadow-sm">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Establishment</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Type</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Visitors</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredReports.slice(0, 50).map((report) => (
                  <tr key={report.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">{report.establishment}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{getReportTypeLabel(report)}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{report.reportDate}</td>
                    <td className="px-4 py-3 text-sm text-gray-900">{report.visitors}</td>
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
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-gray-900">Review Submission</h2>
                <p className="text-sm text-gray-600">{selectedSubmission.establishment} - {getReportTypeLabel(selectedSubmission)}</p>
              </div>
              <button onClick={() => setShowDetailModal(false)} className="p-1 hover:bg-gray-100 rounded">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-sm font-medium text-gray-700">Report Date</label><p className="text-gray-900">{selectedSubmission.reportDate}</p></div>
                <div><label className="text-sm font-medium text-gray-700">Visitors</label><p className="text-gray-900">{selectedSubmission.visitors}</p></div>
                <div><label className="text-sm font-medium text-gray-700">Submitted</label><p className="text-gray-900">{selectedSubmission.submitted}</p></div>
                <div><label className="text-sm font-medium text-gray-700">Status</label>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusStyles[normalizeStatus(selectedSubmission.status)] || statusStyles.pending}`}>{formatStatus(selectedSubmission.status)}</span>
                </div>
              </div>
              {selectedSubmission.notes && (
                <div className="rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                    <div>
                      <p className="font-semibold">Review note</p>
                      <p>{selectedSubmission.notes}</p>
                    </div>
                  </div>
                </div>
              )}
              
            </div>
            <div className="p-6 border-t border-gray-200 flex justify-end">
              <button onClick={() => setShowDetailModal(false)} className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm">
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}