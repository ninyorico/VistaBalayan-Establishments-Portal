import { useState, useEffect } from "react";
import {
  FileSpreadsheet,
  Eye,
  X,
  TrendingUp,
  TrendingDown,
  Users,
  AlertTriangle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { toast } from "sonner";
import { supabase } from "../../../lib/supabase";
import { downloadOfficialArrivalsWorkbook } from "./GeneratedReports";
import {
  normalizeReportStatus,
  reportStatusClasses,
  reportStatusLabel,
} from "../../../lib/governance";

const getCurrentYear = () => new Date().getFullYear().toString();

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

const getReportTypeLabel = (report: Submission) => report.type === "Visitor Report" ? "Resort" : "Hotels";

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

export default function Reports() {
  const [filterType, setFilterType] = useState<"year" | "quarter" | "month" | "week">("month");
  const [selectedYear, setSelectedYear] = useState(getCurrentYear());
  const [selectedQuarter, setSelectedQuarter] = useState("1");
  const [selectedMonth, setSelectedMonth] = useState("");
  const [selectedWeek, setSelectedWeek] = useState("1");
  const [searchTerm, setSearchTerm] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
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
    
    const fetchAllReports = async (table: "visitor_reports" | "accommodation_reports") => {
      const rows: any[] = [];
      const pageSize = 1000;
      for (let offset = 0; ; offset += pageSize) {
        const { data, error } = await supabase
          .from(table)
          .select(`*, establishments!${table === "visitor_reports" ? "visitor_reports_establishment_id_fkey" : "accommodation_reports_establishment_id_fkey"} (name, type, dot_classification, total_rooms, ae_id, attraction_code)`)
          .order("created_at", { ascending: false })
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
          .select("id,name,type,dot_classification,reporting_mode,ae_id,attraction_code,total_rooms,status")
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

    if (trendRows.length) {
      const grouped: Record<string, number> = {};
      trendRows.forEach((item) => {
        const date = new Date(item.report_date);
        const key = getChartPeriod(date, item.report_date);
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
  }, []);

  useEffect(() => {
    fetchChartData();
  }, [filterType, selectedYear, selectedQuarter, selectedMonth, selectedWeek]);

  const handleExport = async () => {
    try {
      const establishmentsById = new Map<string, any>(establishmentDirectory.map((establishment) => [establishment.id, establishment]));
      const accommodation = accommodationReports.map((report) => ({ ...report, establishment_id: String(report.establishment_id) }));
      const visitors = visitorReports.map((report) => ({ ...report, establishment_id: String(report.establishment_id) }));
      [...visitorReports, ...accommodationReports].forEach((report) => {
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
      const { startDate, endDate } = getReportRange();
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
        weeklyLabel: filterType === "week" ? `WEEK ${selectedWeek} ${selectedYear}` : undefined,
        weeklyStartDate: filterType === "week" ? startDate : undefined,
        weeklyEndDate: filterType === "week" ? endDate : undefined,
        establishments: Array.from(establishmentsById.values()),
        accommodation,
        visitors,
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

  // Filter submissions for table
  const filteredReports = submissions.filter((report) => {
    const matchesSearch = report.establishment.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === "all" || normalizeStatus(report.status) === normalizeStatus(filterStatus);
    const { startDate, endDate } = getReportRange();
    const matchesDate = report.reportDate >= startDate && report.reportDate <= endDate;
    
    return matchesSearch && matchesStatus && matchesDate;
  });

  const totalSubmissions = filteredReports.length;
  const totalVisitors = filteredReports.reduce((sum, report) => sum + report.visitors, 0);
  const establishmentsCovered = new Set(filteredReports.map((report) => report.establishment)).size;
  const topEstablishment = Object.entries(
    filteredReports.reduce<Record<string, number>>((acc, report) => {
      acc[report.establishment] = (acc[report.establishment] || 0) + report.visitors;
      return acc;
    }, {})
  ).sort((a, b) => b[1] - a[1])[0];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Reports</h1>
        <p className="text-gray-600 mt-1">Generate and export tourism data reports</p>
      </div>

      {/* Simplified Filters */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Filter Type Toggle */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {["year", "quarter", "month", "week"].map((type) => (
              <button
                key={type}
                onClick={() => {
                  setFilterType(type as any);
                  if (type === "year") { setSelectedMonth(""); setSelectedQuarter("1"); }
                  if (type === "quarter") setSelectedMonth("");
                  if (type === "week") { setSelectedYear(getCurrentYear()); setSelectedMonth(""); setSelectedWeek("1"); }
                }}
                className={`px-3 py-1.5 text-sm rounded-lg transition ${
                  filterType === type
                    ? "bg-blue-600 text-white"
                    : "text-gray-600 hover:bg-gray-200"
                }`}
              >
                {type.charAt(0).toUpperCase() + type.slice(1)}
              </button>
            ))}
          </div>

          {/* Year Dropdown */}
          {filterType && (
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="2024">2024</option>
              <option value="2025">2025</option>
              <option value="2026">2026</option>
            </select>
          )}

          {/* Quarter Dropdown */}
          {filterType === "quarter" && (
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="1">Q1</option>
              <option value="2">Q2</option>
              <option value="3">Q3</option>
              <option value="4">Q4</option>
            </select>
          )}

          {/* Month Dropdown */}
          {filterType === "month" && (
            <select
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
            >
              <option value="">All Months</option>
              {months.map((month) => (
                <option key={month} value={month}>{month}</option>
              ))}
            </select>
          )}

          {/* Week Dropdown */}
          {filterType === "week" && (
            <select
              value={selectedWeek}
              onChange={(e) => setSelectedWeek(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
              title="Choose report week"
            >
              {weekOptions.map((week) => (
                <option key={week.value} value={week.value}>{week.label}</option>
              ))}
            </select>
          )}

          <span className="text-gray-300">|</span>

          {/* Status Filter */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          >
            <option value="all">All Status</option>
            <option value="submitted">Submitted</option>
          </select>

          {/* Search */}
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search establishment..."
            className="flex-1 min-w-[150px] px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
          />


          {/* Export Button */}
          <button
            onClick={handleExport}
            className="flex items-center gap-2 px-4 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm"
          >
            <FileSpreadsheet className="w-4 h-4" /> Export
          </button>
        </div>
      </div>

      {/* Report Chart */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">
          Tourism Trends ({getFilterLabel()})
        </h3>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="period" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="visitors" stroke="#3b82f6" strokeWidth={2} name="Visitors" />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-500">No data available for the selected period</div>
        )}
      </div>

      {/* Administrative Summary Output */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Administrative Report Summary</h3>
            <p className="text-sm text-gray-600">Summarized output for review and reference: {getFilterLabel()}</p>
          </div>
          <span className="px-3 py-1 rounded-full bg-blue-50 text-blue-700 text-xs font-medium uppercase">
            {filterType} report
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          <div className="min-w-0 rounded-lg bg-slate-50 p-3 sm:p-4">
            <p className="text-[10px] font-medium uppercase leading-tight text-slate-500 sm:text-xs">Total Visitors / Check-ins</p>
            <p className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">{totalVisitors.toLocaleString()}</p>
          </div>
          <div className="min-w-0 rounded-lg bg-slate-50 p-3 sm:p-4">
            <p className="text-[10px] font-medium uppercase leading-tight text-slate-500 sm:text-xs">Reports Included</p>
            <p className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">{totalSubmissions}</p>
          </div>
          <div className="min-w-0 rounded-lg bg-slate-50 p-3 sm:p-4">
            <p className="text-[10px] font-medium uppercase leading-tight text-slate-500 sm:text-xs">Establishments Covered</p>
            <p className="mt-2 text-xl font-bold text-slate-900 sm:text-2xl">{establishmentsCovered}</p>
          </div>
          <div className="min-w-0 rounded-lg bg-slate-50 p-3 sm:p-4">
            <p className="text-[10px] font-medium uppercase leading-tight text-slate-500 sm:text-xs">Top Establishment</p>
            <p className="mt-2 truncate text-sm font-bold text-slate-900 sm:text-base">{topEstablishment ? topEstablishment[0] : "N/A"}</p>
            {topEstablishment && <p className="text-xs text-slate-500 sm:text-sm">{topEstablishment[1].toLocaleString()} visitors/check-ins</p>}
          </div>
        </div>
        <p className="mt-4 text-sm text-slate-600">
          Summary: {totalSubmissions} submitted reports are included in this selected period.
          {visitorStats.difference !== 0 && ` The latest chart period changed by ${visitorStats.difference.toLocaleString()} visitors/check-ins (${visitorStats.percentageChange}%).`}
        </p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2 sm:gap-4 md:grid-cols-3 lg:gap-6">
        <div className="col-span-2 min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-6 md:col-span-1">
          <p className="mb-1 text-[11px] text-gray-600 sm:text-sm">Submitted Reports</p>
          <p className="text-2xl font-bold text-gray-900 sm:text-3xl">{totalSubmissions}</p>
        </div>
        <div className="col-span-2 min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-6 md:col-span-1">
          <div className="mb-2 flex min-w-0 items-center gap-1.5 sm:gap-3">
            {visitorStats.isIncrease ? <TrendingUp className="h-4 w-4 shrink-0 text-green-600 sm:h-5 sm:w-5" /> : <TrendingDown className="h-4 w-4 shrink-0 text-red-600 sm:h-5 sm:w-5" />}
            <p className="truncate text-[11px] text-gray-600 sm:text-sm">Change</p>
          </div>
          <div className="flex flex-wrap items-baseline gap-x-1 sm:gap-x-2">
            <p className={`text-2xl font-bold sm:text-3xl ${visitorStats.isIncrease ? "text-green-600" : "text-red-600"}`}>
              {visitorStats.isIncrease ? "+" : ""}
              {visitorStats.difference.toLocaleString()}
            </p>
            <span className={`text-[11px] font-medium sm:text-sm ${visitorStats.isIncrease ? "text-green-600" : "text-red-600"}`}>
              ({visitorStats.isIncrease ? "+" : ""}{visitorStats.percentageChange}%)
            </span>
          </div>
        </div>
        <div className="col-span-3 min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-6 md:col-span-1">
          <div className="mb-2 flex min-w-0 items-center gap-1.5 sm:gap-3">
            <Users className="h-4 w-4 shrink-0 text-blue-600 sm:h-5 sm:w-5" />
            <p className="truncate text-[11px] text-gray-600 sm:text-sm">Current Period</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 sm:text-3xl">{visitorStats.currentTotal.toLocaleString()}</p>
        </div>
        <div className="col-span-3 min-w-0 rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-6 md:col-span-1">
          <div className="mb-2 flex min-w-0 items-center gap-1.5 sm:gap-3">
            <Users className="h-4 w-4 shrink-0 text-purple-600 sm:h-5 sm:w-5" />
            <p className="truncate text-[11px] text-gray-600 sm:text-sm">Previous Period</p>
          </div>
          <p className="text-2xl font-bold text-gray-900 sm:text-3xl">{visitorStats.previousTotal.toLocaleString()}</p>
        </div>
      </div>

      {/* Submissions Table */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-4 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Submissions</h3>
          <p className="text-sm text-gray-600">Daily reports submitted by establishments. Municipal officers can view the submitted records without approving or rejecting them.</p>
        </div>
        <div className="max-h-[28rem] overflow-auto overscroll-contain">
          {loading ? (
            <div className="p-8 text-center">Loading...</div>
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