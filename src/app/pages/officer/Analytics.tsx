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
import { TrendingUp, TrendingDown, MapPin } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { getEstablishmentReportingMode, type ReportingMode } from "../../../lib/establishmentReportForms";
import DataState from "../../components/DataState";
import { PageHero } from "../../components/vista/PolishedShell";
import EstablishmentPerformanceDashboard, { type PerformanceInputWithMode } from "../../components/vista/EstablishmentPerformanceDashboard";

interface AnalyticsData {
  seasonalData: { month: string; visitors: number; guestCheckIns: number; guestNights: number }[];
  visitorOrigins: { location: string; visitors: number; growth: number }[];
  performancePeriods: Record<string, PerformanceInputWithMode[]>;
  peakSeason: { month: string; visitors: number; growth: number };
  topOrigin: { location: string; percentage: number };
  growthRate: number | null;
}

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
    visitorOrigins: [],
    performancePeriods: {},
    peakSeason: { month: "", visitors: 0, growth: 0 },
    topOrigin: { location: "", percentage: 0 },
    growthRate: null,
  });
  const [loading, setLoading] = useState(true);
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

    const performancePeriods: Record<string, PerformanceInputWithMode[]> = {};
    const performancePeriodKeys = Array.from(new Set([
      ...visitors.map((item) => monthKey(item.report_date)),
      ...accommodations.map((item) => monthKey(item.report_date)),
    ])).sort();
    performancePeriodKeys.forEach((periodKey) => {
      const visitorTotals = new Map<string, number>();
      const visitorReportIds = new Set<string>();
      visitors.filter((item) => monthKey(item.report_date) === periodKey).forEach((item) => {
        const current = visitorTotals.get(item.establishment_id) || 0;
        visitorTotals.set(item.establishment_id, current + (item.total_guests ?? 0));
        visitorReportIds.add(item.establishment_id);
      });
      const overnightTotals = new Map<string, number>();
      const overnightReportIds = new Set<string>();
      accommodations.filter((item) => monthKey(item.report_date) === periodKey).forEach((item) => {
        const current = overnightTotals.get(item.establishment_id) || 0;
        overnightTotals.set(item.establishment_id, current + (item.total_check_ins ?? 0));
        overnightReportIds.add(item.establishment_id);
      });
      performancePeriods[periodKey] = establishments.flatMap((establishment) => {
        const mode = getEstablishmentReportingMode(establishment);
        const rows: PerformanceInputWithMode[] = [];
        if (mode === "visitor" || mode === "both") rows.push({ id: establishment.id, name: establishment.name, serviceType: mode, category: "daytour", visitorCount: visitorReportIds.has(establishment.id) ? visitorTotals.get(establishment.id) || 0 : null });
        if (mode === "accommodation" || mode === "both") rows.push({ id: establishment.id, name: establishment.name, serviceType: mode, category: "overnight", visitorCount: overnightReportIds.has(establishment.id) ? overnightTotals.get(establishment.id) || 0 : null });
        return rows;
      });
    });

    const performanceYearKeys = Array.from(new Set(performancePeriodKeys.map((periodKey) => periodKey.slice(0, 4))));
    performanceYearKeys.forEach((performanceYear) => {
      const visitorTotals = new Map<string, number>();
      const visitorReportIds = new Set<string>();
      visitors.filter((item) => item.report_date.startsWith(`${performanceYear}-`)).forEach((item) => {
        const current = visitorTotals.get(item.establishment_id) || 0;
        visitorTotals.set(item.establishment_id, current + (item.total_guests ?? 0));
        visitorReportIds.add(item.establishment_id);
      });
      const overnightTotals = new Map<string, number>();
      const overnightReportIds = new Set<string>();
      accommodations.filter((item) => item.report_date.startsWith(`${performanceYear}-`)).forEach((item) => {
        const current = overnightTotals.get(item.establishment_id) || 0;
        overnightTotals.set(item.establishment_id, current + (item.total_check_ins ?? 0));
        overnightReportIds.add(item.establishment_id);
      });
      performancePeriods[`${performanceYear}-FULL_YEAR`] = establishments.flatMap((establishment) => {
        const mode = getEstablishmentReportingMode(establishment);
        const rows: PerformanceInputWithMode[] = [];
        if (mode === "visitor" || mode === "both") rows.push({ id: establishment.id, name: establishment.name, serviceType: mode, category: "daytour", visitorCount: visitorReportIds.has(establishment.id) ? visitorTotals.get(establishment.id) || 0 : null });
        if (mode === "accommodation" || mode === "both") rows.push({ id: establishment.id, name: establishment.name, serviceType: mode, category: "overnight", visitorCount: overnightReportIds.has(establishment.id) ? overnightTotals.get(establishment.id) || 0 : null });
        return rows;
      });
    });
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
      visitorOrigins,
      performancePeriods,
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

      <EstablishmentPerformanceDashboard periods={data.performancePeriods} year={selectedYear} />
    </div>
  );
}
