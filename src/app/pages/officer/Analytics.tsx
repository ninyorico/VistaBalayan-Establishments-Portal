import { useState, useEffect } from "react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { TrendingUp, TrendingDown, MapPin, X } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy } from "../../../lib/reportMetrics";
import { getEstablishmentReportingMode, type ReportingMode } from "../../../lib/establishmentReportForms";
import DataState from "../../components/DataState";
import { PageHero } from "../../components/vista/PolishedShell";

interface AnalyticsData {
  seasonalData: { month: string; visitors: number; guestCheckIns: number; guestNights: number }[];
  performanceData: { name: string; visitors: number; occupancyRate: number; score: number }[];
  visitorOrigins: { location: string; visitors: number; growth: number }[];
  lowPerformersDayTour: LowPerformer[];
  lowPerformersOvernight: LowPerformer[];
  peakSeason: { month: string; visitors: number; growth: number };
  topOrigin: { location: string; percentage: number };
  growthRate: number | null;
}

type LowPerformer = {
    id: string;
    establishment: string;
    reportingMode: ReportingMode;
    latestMonth: string;
    previousMonth: string;
    latestVisitors: number;
    previousVisitors: number | null;
    latestVisitorReportCount: number;
    latestAccommodationReportCount: number;
    occupancyRate: number | null;
    visitorTrend: number | null;
    guestNights: number;
    issue: string;
    reasons: string[];
};

type Establishment = {
  id: string;
  name: string;
  type?: string | null;
  total_rooms?: number | null;
  reporting_mode?: ReportingMode | null;
  status?: string | null;
};

type VisitorReport = {
  establishment_id: string;
  report_date: string;
  total_guests: number | null;
  residence_type: string | null;
  place_of_residence: string | null;
  establishments?: { name: string } | null;
};

type AccommodationReport = {
  establishment_id: string;
  report_date: string;
  total_rooms: number | null;
  total_occupied_rooms: number | null;
  total_check_ins: number | null;
  total_guest_nights: number | null;
  establishments?: { name: string } | null;
};

type ResidenceCategory = "THIS_PROVINCE" | "OTHER_PROVINCE" | "FOREIGN";

const RESIDENCE_CATEGORIES: ResidenceCategory[] = ["THIS_PROVINCE", "OTHER_PROVINCE", "FOREIGN"];

const normalizeResidenceCategory = (record: VisitorReport): ResidenceCategory | null => {
  const residenceType = String(record.residence_type || "").trim().toUpperCase();
  if (RESIDENCE_CATEGORIES.includes(residenceType as ResidenceCategory)) {
    return residenceType as ResidenceCategory;
  }

  const searchText = `${record.residence_type || ""} ${record.place_of_residence || ""}`.toLowerCase();
  if (searchText.includes("foreign") || searchText.includes("international")) return "FOREIGN";
  if (searchText.includes("batangas") || searchText.includes("within") || searchText.includes("this province")) return "THIS_PROVINCE";
  if (searchText.includes("other") || searchText.includes("domestic") || searchText.includes("province") || searchText.includes("municipality")) return "OTHER_PROVINCE";
  return null;
};

const getSpecificOriginLabel = (record: VisitorReport, category: ResidenceCategory): string | null => {
  if (category === "THIS_PROVINCE") return "Batangas";
  const specificOrigin = record.place_of_residence?.trim();
  return specificOrigin || null;
};

const monthLabel = (date: string) =>
  new Date(date).toLocaleString("default", { month: "short", year: "numeric" });

const seasonalTickLabel = (value: string, index: number) => {
  if (index % 2 === 0) return "";
  return String(value).split(" ")[0];
};

const performanceColors = ["#193364", "#0E5A72", "#D69A3A", "#E9C98A", "#6C63FF", "#E65355"];

const monthKey = (date: string) => date.slice(0, 7);

const percentChange = (current: number, previous: number) =>
  previous > 0 ? ((current - previous) / previous) * 100 : current > 0 ? 100 : null;

const getAnalyticsYearRange = (year: string) => {
  const now = new Date();
  const currentYear = String(now.getFullYear());
  const currentDate = `${currentYear}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return {
    label: year,
    start: `${year}-01-01`,
    end: year === currentYear ? currentDate : `${year}-12-31`,
  };
};

export default function Analytics() {
  const [data, setData] = useState<AnalyticsData>({
    seasonalData: [],
    performanceData: [],
    visitorOrigins: [],
    lowPerformersDayTour: [],
    lowPerformersOvernight: [],
    peakSeason: { month: "", visitors: 0, growth: 0 },
    topOrigin: { location: "", percentage: 0 },
    growthRate: null,
  });
  const [loading, setLoading] = useState(true);
  const [selectedLowPerformer, setSelectedLowPerformer] = useState<LowPerformer | null>(null);
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState(String(currentDate.getFullYear()));

  useEffect(() => {
    fetchAnalytics();
  }, [selectedYear]);

  const fetchAnalytics = async () => {
    setLoading(true);
    const selectedRange = getAnalyticsYearRange(selectedYear);

    const { data: establishmentData, error: establishmentError } = await supabase
      .from("establishments")
      .select("id,name,type,total_rooms,reporting_mode,status");

    if (establishmentError) console.error("Error fetching establishments:", establishmentError);

    const fetchAllReports = async (
      table: "visitor_reports" | "accommodation_reports",
      select: string,
    ) => {
      const pageSize = 1000;
      const allRows: Record<string, unknown>[] = [];

      for (let page = 0; ; page += 1) {
        const { data, error } = await supabase
          .from(table)
          .select(select)
          .eq("status", "submitted")
          .gte("report_date", selectedRange.start)
          .lte("report_date", selectedRange.end)
          .order("report_date", { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) return { data: null, error };
        allRows.push(...((data || []) as unknown as Record<string, unknown>[]));
        if (!data || data.length < pageSize) break;
      }

      return { data: allRows, error: null };
    };

    const { data: visitorData, error: visitorError } = await fetchAllReports(
      "visitor_reports",
      `
        establishment_id,
        report_date,
        total_guests,
        residence_type,
        place_of_residence,
        establishments (name)
      `,
    );

    if (visitorError) console.error("Error fetching visitor data:", visitorError);

    const { data: accommodationData, error: accError } = await fetchAllReports(
      "accommodation_reports",
      `
        establishment_id,
        report_date,
        total_rooms,
        total_occupied_rooms,
        total_check_ins,
        total_guest_nights,
        establishments (name)
      `,
    );

    if (accError) console.error("Error fetching accommodation data:", accError);

    const establishments = (establishmentData || [])
      .filter((establishment) => !["inactive", "deleted"].includes(String(establishment.status || "").toLowerCase())) as Establishment[];
    const visitors = (visitorData || []) as unknown as VisitorReport[];
    const accommodations = (accommodationData || []) as unknown as AccommodationReport[];

    const monthlyData: Record<string, { label: string; visitors: number; guestCheckIns: number; guestNights: number }> = {};
    visitors.forEach((item) => {
      const key = monthKey(item.report_date);
      if (!monthlyData[key]) {
        monthlyData[key] = { label: monthLabel(item.report_date), visitors: 0, guestCheckIns: 0, guestNights: 0 };
      }
      monthlyData[key].visitors += item.total_guests || 0;
    });

    accommodations.forEach((item) => {
      const key = monthKey(item.report_date);
      if (!monthlyData[key]) {
        monthlyData[key] = { label: monthLabel(item.report_date), visitors: 0, guestCheckIns: 0, guestNights: 0 };
      }
      monthlyData[key].guestCheckIns += item.total_check_ins || 0;
      monthlyData[key].guestNights += item.total_guest_nights || 0;
    });

    const sortedMonthKeys = Object.keys(monthlyData).sort();
    const calendarMonthKeys = Array.from({ length: 12 }, (_, index) => `${selectedYear}-${String(index + 1).padStart(2, "0")}`);
    const seasonalData = calendarMonthKeys.map((key) => ({
      month: monthlyData[key]?.label || monthLabel(`${key}-01`),
      visitors: monthlyData[key]?.visitors || 0,
      guestCheckIns: monthlyData[key]?.guestCheckIns || 0,
      guestNights: monthlyData[key]?.guestNights || 0,
    }));

    const visitorsByEstablishment: Record<string, { id: string; name: string; visitors: number; monthly: Record<string, number>; reportCounts: Record<string, number> }> = {};
    establishments.forEach((establishment) => {
      visitorsByEstablishment[establishment.id] = {
        id: establishment.id,
        name: establishment.name,
        visitors: 0,
        monthly: {},
        reportCounts: {},
      };
    });
    visitors.forEach((item) => {
      const id = item.establishment_id;
      const name = item.establishments?.name || establishments.find((establishment) => establishment.id === id)?.name || "Unknown";
      const key = monthKey(item.report_date);
      if (!visitorsByEstablishment[id]) {
        visitorsByEstablishment[id] = { id, name, visitors: 0, monthly: {}, reportCounts: {} };
      }
      visitorsByEstablishment[id].visitors += item.total_guests || 0;
      visitorsByEstablishment[id].monthly[key] =
        (visitorsByEstablishment[id].monthly[key] || 0) + (item.total_guests || 0);
      visitorsByEstablishment[id].reportCounts[key] = (visitorsByEstablishment[id].reportCounts[key] || 0) + 1;
    });

    const accommodationByEstablishment: Record<string, { months: Record<string, { rooms: number; occupied: number; guestNights: number; reportCount: number }> }> = {};
    accommodations.forEach((item) => {
      const id = item.establishment_id;
      const key = monthKey(item.report_date);
      if (!accommodationByEstablishment[id]) {
        accommodationByEstablishment[id] = { months: {} };
      }
      const month = accommodationByEstablishment[id].months[key] || { rooms: 0, occupied: 0, guestNights: 0, reportCount: 0 };
      month.rooms += item.total_rooms || 0;
      month.occupied += item.total_occupied_rooms || 0;
      month.guestNights += item.total_guest_nights || 0;
      month.reportCount += 1;
      accommodationByEstablishment[id].months[key] = month;
    });

    const visitorMonthKeys = Array.from(new Set(visitors.map((item) => monthKey(item.report_date)))).sort();
    const latestMonth = visitorMonthKeys[visitorMonthKeys.length - 1] || "";
    const previousMonth = visitorMonthKeys[visitorMonthKeys.length - 2] || "";

    const maxVisitors = Math.max(1, ...Object.values(visitorsByEstablishment).map((est) => est.visitors));
    const performanceData = Object.values(visitorsByEstablishment)
      .map((est) => {
        const occupancyReports = Object.values(accommodationByEstablishment[est.id]?.months || {});
        const occupancyRate = occupancyReports.reduce((sum, month) => sum + calculateAccommodationOccupancy(month.occupied, month.rooms), 0) / Math.max(1, occupancyReports.length);
        const visitorScore = (est.visitors / maxVisitors) * 70;
        const occupancyScore = Math.min(occupancyRate, 100) * 0.3;
        return {
          name: est.name.length > 18 ? est.name.slice(0, 18) + "..." : est.name,
          visitors: est.visitors,
          occupancyRate,
          score: Math.round(visitorScore + occupancyScore),
        };
      })
      .filter((establishment) => establishment.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    const originByMonth: Record<string, Record<string, number>> = {};
    const originCounts: Record<string, number> = {};
    visitors.forEach((item) => {
      const category = normalizeResidenceCategory(item);
      const origin = category
        ? getSpecificOriginLabel(item, category) || (
          category === "THIS_PROVINCE" ? "Batangas" : category === "OTHER_PROVINCE" ? "Other Province" : "Foreign Residence"
        )
        : "Unknown";
      originCounts[origin] = (originCounts[origin] || 0) + (item.total_guests || 0);
      const key = monthKey(item.report_date);
      if (!originByMonth[origin]) originByMonth[origin] = {};
      originByMonth[origin][key] = (originByMonth[origin][key] || 0) + (item.total_guests || 0);
    });

    const visitorOrigins = Object.entries(originCounts)
      .map(([location, total]) => ({
        location,
        visitors: total,
        growth: percentChange(
          originByMonth[location]?.[latestMonth] || 0,
          originByMonth[location]?.[previousMonth] || 0
        ) ?? 0,
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 8);

    const buildLowPerformers = (category: "daytour" | "overnight") => establishments
      .filter((establishment) => {
        const mode = getEstablishmentReportingMode(establishment);
        return category === "overnight" ? mode === "accommodation" || mode === "both" : mode === "visitor";
      })
      .map((establishment): LowPerformer | null => {
        const visitorEst = visitorsByEstablishment[establishment.id] || { id: establishment.id, name: establishment.name, visitors: 0, monthly: {}, reportCounts: {} };
        const accommodationEst = accommodationByEstablishment[establishment.id];
        const latestAccommodation = accommodationEst?.months[latestMonth];
        const visitorTrend = previousMonth && visitorEst.reportCounts[previousMonth]
          ? percentChange(visitorEst.monthly[latestMonth] || 0, visitorEst.monthly[previousMonth] || 0)
          : null;
        const occupancyRate = latestAccommodation && latestAccommodation.rooms > 0
          ? (latestAccommodation.occupied / latestAccommodation.rooms) * 100
          : null;
        const reasons: string[] = [];
        if (category === "daytour" || getEstablishmentReportingMode(establishment) === "both") {
          if (!visitorEst.reportCounts[latestMonth]) reasons.push(`No submitted day-tour report for ${monthlyData[latestMonth]?.label || latestMonth || "the latest period"}.`);
          else if (visitorTrend !== null && visitorTrend < -20) reasons.push(`Visitor volume decreased ${Math.abs(visitorTrend).toFixed(1)}% compared with ${monthlyData[previousMonth]?.label || previousMonth}.`);
        }
        if (category === "overnight") {
          if (!latestAccommodation) reasons.push(`No submitted overnight report for ${monthlyData[latestMonth]?.label || latestMonth || "the latest period"}.`);
          if (occupancyRate !== null && occupancyRate < 35) reasons.push(`Latest room occupancy is ${occupancyRate.toFixed(1)}%, below the 35% attention benchmark.`);
        }
        if (reasons.length === 0) return null;
        return {
          id: establishment.id,
          establishment: establishment.name,
          reportingMode: getEstablishmentReportingMode(establishment),
          latestMonth: monthlyData[latestMonth]?.label || latestMonth || "No latest period",
          previousMonth: monthlyData[previousMonth]?.label || previousMonth || "No comparison period",
          latestVisitors: visitorEst.monthly[latestMonth] || 0,
          previousVisitors: previousMonth ? visitorEst.monthly[previousMonth] || 0 : null,
          latestVisitorReportCount: visitorEst.reportCounts[latestMonth] || 0,
          latestAccommodationReportCount: latestAccommodation?.reportCount || 0,
          occupancyRate,
          visitorTrend,
          guestNights: latestAccommodation?.guestNights || 0,
          issue: reasons.join(" "),
          reasons,
        };
      })
      .filter((establishment): establishment is LowPerformer => Boolean(establishment))
      .sort((a, b) => (a.occupancyRate ?? 0) - (b.occupancyRate ?? 0) || a.latestVisitors - b.latestVisitors)
      .slice(0, 10);

    const peakKey = sortedMonthKeys.reduce(
      (best, key) => (monthlyData[key].visitors > (monthlyData[best]?.visitors || 0) ? key : best),
      sortedMonthKeys[0] || ""
    );
    const peakIndex = sortedMonthKeys.indexOf(peakKey);
    const beforePeakKey = peakIndex > 0 ? sortedMonthKeys[peakIndex - 1] : "";

    const totalVisitors = visitors.reduce((sum, item) => sum + (item.total_guests || 0), 0);
    const [topLocation, topVisitors] = Object.entries(originCounts).sort((a, b) => b[1] - a[1])[0] || ["", 0];

    setData({
      seasonalData,
      performanceData,
      visitorOrigins,
      lowPerformersDayTour: buildLowPerformers("daytour"),
      lowPerformersOvernight: buildLowPerformers("overnight"),
      peakSeason: {
        month: monthlyData[peakKey]?.label || "N/A",
        visitors: monthlyData[peakKey]?.visitors || 0,
        growth: percentChange(monthlyData[peakKey]?.visitors || 0, monthlyData[beforePeakKey]?.visitors || 0) ?? 0,
      },
      topOrigin: {
        location: topLocation,
        percentage: totalVisitors > 0 ? Math.round((topVisitors / totalVisitors) * 100) : 0,
      },
      growthRate: percentChange(
        monthlyData[latestMonth]?.visitors || 0,
        monthlyData[previousMonth]?.visitors || 0
      ),
    });

    setLoading(false);
  };

  if (loading) {
    return <DataState state="loading" message="Retrieving analytics data..." />;
  }

  const underperformingEstablishments = Array.from(
    new Map(
      [...data.lowPerformersDayTour, ...data.lowPerformersOvernight].map((establishment) => [establishment.id, establishment])
    ).values()
  );
  const analyticsYears = Array.from({ length: 5 }, (_, index) => String(currentDate.getFullYear() - 2 + index));

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Tourism intelligence"
        title="Analytics Dashboard"
        description={`Data-driven tourism analytics and decision support for ${getAnalyticsYearRange(selectedYear).label}. All charts, rankings, origins, and performance findings use the selected year.`}
        compact
      >
        <label className="block w-full text-xs font-medium text-slate-200 sm:w-44">
          Year
          <select value={selectedYear} onChange={(event) => setSelectedYear(event.target.value)} className="mt-1 w-full rounded-xl border border-white/20 bg-white px-3 py-2.5 text-sm text-gray-900 focus:border-cyan-200 focus:outline-none focus:ring-2 focus:ring-cyan-200/30">
            {analyticsYears.map((year) => <option key={year} value={year}>{year}</option>)}
          </select>
        </label>
      </PageHero>

      <div className="grid grid-cols-3 gap-2 sm:gap-4" data-analytics-kpi-row="mobile-one-row">
        <div className="bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm sm:p-5">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm">Peak Season</p>
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-600 sm:h-5 sm:w-5" />
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl">{data.peakSeason.month || "N/A"}</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-green-600 sm:text-sm">
            {data.peakSeason.visitors.toLocaleString()} visitors
          </p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm sm:p-5">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm">Top Origin</p>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-purple-600 sm:h-5 sm:w-5" />
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl">{data.topOrigin.location || "N/A"}</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-purple-600 sm:text-sm">{data.topOrigin.percentage}% visitors</p>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm sm:p-5">
          <div className="mb-1.5 flex items-center justify-between gap-1">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm">Latest Growth</p>
            {data.growthRate === null ? null : data.growthRate >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-600 sm:h-5 sm:w-5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-600 sm:h-5 sm:w-5" />
            )}
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl">{data.growthRate === null ? "N/A" : `${data.growthRate.toFixed(1)}%`}</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-orange-600 sm:text-sm">{data.growthRate === null ? "Not enough monthly data" : "Month over month"}</p>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 sm:p-6">
        <h3 className="text-base font-semibold text-gray-900 mb-4 sm:text-lg">Tourism Trends and Seasonal Patterns ({getAnalyticsYearRange(selectedYear).label})</h3>
        {data.seasonalData.length > 0 ? (
          <div className="-mx-2 sm:mx-0">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={data.seasonalData} margin={{ top: 8, right: 4, left: 4, bottom: 8 }}>
                <defs>
                  <linearGradient id="analyticsVisitorFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#193364" stopOpacity={0.34} />
                    <stop offset="95%" stopColor="#193364" stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} />
                <XAxis dataKey="month" interval={0} tickFormatter={seasonalTickLabel} height={32} tickMargin={8} padding={{ left: 0, right: 0 }} />
                <YAxis width={52} />
              <Tooltip />
              <Legend />
              <Area
                type="monotone"
                dataKey="visitors"
                stroke="#193364"
                fill="url(#analyticsVisitorFill)"
                fillOpacity={0.28}
                dot={{ r: 3, strokeWidth: 1, fill: "#193364" }}
                activeDot={{ r: 5 }}
                name="Visitors"
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
          <div className="text-center py-12 text-gray-500">No seasonal data available</div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="p-6 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">Visitor Origins & Actual Growth</h3>
        </div>
        <div className="max-h-[20rem] overflow-auto" aria-label="Visitor origins table; scroll to view more than five locations">
          <table className="w-full">
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Visitors</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Growth Rate</th>
                <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.visitorOrigins.length > 0 ? (
                data.visitorOrigins.map((origin, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-6 py-4 font-medium text-gray-900">{origin.location}</td>
                    <td className="px-6 py-4 text-gray-900">{origin.visitors.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`font-medium ${origin.growth >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {origin.growth >= 0 ? "+" : ""}{origin.growth.toFixed(1)}%
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className={`flex items-center gap-1 ${origin.growth >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {origin.growth >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                        <span className="text-sm font-medium">{origin.growth >= 0 ? "Growing" : "Declining"}</span>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No visitor origin data available</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">High-Performing Establishments</h3>
        {data.performanceData.length > 0 ? (
          <ResponsiveContainer width="100%" height={350}>
            <BarChart data={data.performanceData} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" domain={[0, 100]} />
              <YAxis dataKey="name" type="category" width={0} tick={false} axisLine={false} tickLine={false} />
              <Tooltip formatter={(value, name) => [name === "score" ? `${value}/100` : value, name === "score" ? "Performance Score" : name]} />
              <Bar dataKey="score" name="Performance Score">
                {data.performanceData.map((entry, index) => (
                  <Cell key={`${entry.name}-${index}`} fill={performanceColors[index % performanceColors.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="text-center py-12 text-gray-500">No establishment data available</div>
        )}
        {data.performanceData.length > 0 && (
          <div className="mt-4 flex flex-wrap justify-center gap-x-4 gap-y-2 text-sm text-gray-700" aria-label="High-performing establishments legend">
            {data.performanceData.map((entry, index) => (
              <span key={`legend-${entry.name}-${index}`} className="inline-flex max-w-full items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-sm"
                  style={{ backgroundColor: performanceColors[index % performanceColors.length] }}
                  aria-hidden="true"
                />
                <span className="max-w-[14rem] truncate" title={entry.name}>{entry.name}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-6 border-b border-gray-200">
            <h3 className="text-lg font-semibold text-gray-900">Underperforming Establishments</h3>
            <p className="text-sm text-gray-600 mt-1">Establishments requiring attention based on submitted visitor trends, missing reports, and accommodation occupancy.</p>
          </div>
          <div className="max-h-[20rem] overflow-auto" aria-label="Underperforming establishments table; scroll to view more than five establishments">
            <table className="w-full">
              <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Establishment</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Occupancy Rate</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Visitor Trend</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Reason</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {underperformingEstablishments.length > 0 ? underperformingEstablishments.map((establishment) => (
                  <tr
                    key={establishment.id}
                    className="cursor-pointer hover:bg-gray-50 focus:outline-none focus-visible:bg-blue-50"
                    tabIndex={0}
                    aria-haspopup="dialog"
                    onClick={() => setSelectedLowPerformer(establishment)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        setSelectedLowPerformer(establishment);
                      }
                    }}
                  >
                    <td className="px-6 py-4 font-medium text-gray-900">{establishment.establishment}</td>
                    <td className="px-6 py-4">
                      {establishment.occupancyRate !== null ? (
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 w-24">
                            <div className="h-2 rounded-full bg-[#B86B78]" style={{ width: `${Math.min(establishment.occupancyRate, 100)}%` }} />
                          </div>
                          <span className="text-sm font-medium text-[#B86B78]">{establishment.occupancyRate.toFixed(1)}%</span>
                        </div>
                      ) : <span className="text-sm text-gray-500">Not applicable / no data</span>}
                    </td>
                    <td className="px-6 py-4">
                      {establishment.visitorTrend === null ? <span className="text-sm text-gray-500">No comparison</span> : (
                        <div className={`flex items-center gap-1 ${establishment.visitorTrend >= 0 ? "text-green-600" : "text-red-600"}`}>
                          {establishment.visitorTrend >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                          <span className="font-medium text-sm">{establishment.visitorTrend >= 0 ? "+" : ""}{establishment.visitorTrend.toFixed(1)}%</span>
                        </div>
                      )}
                    </td>
                    <td className="max-w-[18rem] px-6 py-4 text-sm text-gray-600"><span className="block max-w-[18rem] truncate" title={establishment.issue}>{establishment.issue}</span></td>
                  </tr>
                )) : (
                  <tr><td colSpan={4} className="px-6 py-8 text-center text-gray-500">No establishments currently meet the attention criteria.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {selectedLowPerformer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-sm" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedLowPerformer(null); }}>
            <section className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-2xl sm:p-6" role="dialog" aria-modal="true" aria-labelledby="underperforming-establishment-title">
              <div className="flex items-start justify-between gap-4 border-b border-gray-200 pb-4">
                <div><p className="text-xs font-semibold uppercase tracking-wider text-gray-500">Underperforming establishment</p><h2 id="underperforming-establishment-title" className="mt-1 text-2xl font-bold text-gray-900">{selectedLowPerformer.establishment}</h2><p className="mt-1 text-sm text-gray-500">{selectedLowPerformer.issue}</p></div>
                <button type="button" onClick={() => setSelectedLowPerformer(null)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-gray-500 transition hover:bg-gray-100 hover:text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500" aria-label="Close establishment details"><X className="h-5 w-5" /></button>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2 sm:mt-5 sm:gap-4 lg:grid-cols-4">
                <div className="rounded-xl bg-gray-50 p-3 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-xs">Latest visitors</p><p className="mt-1 text-lg font-bold text-gray-900 sm:mt-2 sm:text-xl">{selectedLowPerformer.latestVisitors.toLocaleString()}</p><p className="text-[11px] text-gray-500 sm:text-xs">{selectedLowPerformer.latestMonth}</p></div>
                <div className="rounded-xl bg-gray-50 p-3 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-xs">Previous visitors</p><p className="mt-1 text-lg font-bold text-gray-900 sm:mt-2 sm:text-xl">{selectedLowPerformer.previousVisitors === null ? "N/A" : selectedLowPerformer.previousVisitors.toLocaleString()}</p><p className="text-[11px] text-gray-500 sm:text-xs">{selectedLowPerformer.previousMonth}</p></div>
                <div className="rounded-xl bg-gray-50 p-3 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-xs">Latest reports</p><p className="mt-1 text-xs font-bold leading-5 text-gray-900 sm:mt-2 sm:text-sm">{selectedLowPerformer.latestVisitorReportCount} day-tour · {selectedLowPerformer.latestAccommodationReportCount} overnight</p></div>
                <div className="rounded-xl bg-gray-50 p-3 sm:p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500 sm:text-xs">Guest nights</p><p className="mt-1 text-lg font-bold text-gray-900 sm:mt-2 sm:text-xl">{selectedLowPerformer.guestNights.toLocaleString()}</p><p className="text-[11px] text-gray-500 sm:text-xs">Latest overnight period</p></div>
              </div>
              <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4"><p className="font-semibold text-gray-800">Why this establishment is listed</p><ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-gray-600">{selectedLowPerformer.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul></div>
              <div className="mt-6 flex justify-end"><button type="button" onClick={() => setSelectedLowPerformer(null)} className="rounded-lg bg-[#0F4C75] px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-[#0B3B5C] focus:outline-none focus:ring-2 focus:ring-blue-500">Close</button></div>
            </section>
          </div>
        )}
    </div>
  );
}
