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
  ReferenceDot,
  ResponsiveContainer,
} from "recharts";
import { RefreshCw, TrendingUp, TrendingDown, MapPin } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { getEstablishmentReportingMode, type ReportingMode } from "../../../lib/establishmentReportForms";
import { formatResidencePlace } from "../../../lib/reporting";
import { aggregateMonthlyMetrics, coverageConfidence } from "../../../lib/tourismMetrics.js";
import DataState from "../../components/DataState";
import { PageHero } from "../../components/vista/PolishedShell";
import EstablishmentPerformanceDashboard, { type PerformanceInputWithMode } from "../../components/vista/EstablishmentPerformanceDashboard";
import { useDominantAxisTableScroll } from "../../../hooks/useDominantAxisTableScroll";
import { AiAnomalyCard, AiRecommendationCard, type AiDecisionSupport } from "../../components/vista/AiInsightsDesign";
import { MAX_AI_ITEMS } from "../../../lib/aiInsights";
import ReportPeriodFilter from "../../components/ReportPeriodFilter";
import { getReportPeriodRange, type ReportPeriodSelection } from "../../../lib/reportPeriod";
import { geminiService } from "../../../services/geminiService";
import { assignRecommendationsToAnomalies, deduplicateStandaloneRecommendations, isEvidenceBoundRecommendation, recommendationSupportsMetric, recommendationSupportsPeriod } from "../../../lib/aiRecommendationIntegrity";
import { selectTourismRecommendationStrategies } from "../../../lib/tourismRecommendationStrategies.js";
import { classifyFeedbackThemes, type FeedbackTheme } from "../../../lib/customerFeedbackThemes";
import { classifyFeedbackDecisionSegments } from "../../../lib/customerFeedbackDecisionSupport";
import { buildAnalyticsAnalysis, filterAnalyticsFindings, formatCoverage, type AnalyticsFinding, type AnalyticsPattern, type AnomalySeverity, type CoverageFilter, type AnalysisEstablishment, type AnalyticsCategory, type PeriodEvidence } from "../../../lib/analyticsAnalysis";

interface AnalyticsData {
  seasonalData: { month: string; visitors: number; guestCheckIns: number; guestNights: number }[];
  visitorOrigins: { location: string; visitors: number; growth: number | null }[];
  performancePeriods: Record<string, PerformanceInputWithMode[]>;
  peakSeason: { month: string; activity: number; visitors: number; guestCheckIns: number; growth: number };
  topOrigin: { location: string; percentage: number };
  growthRate: number | null;
  comparisonLabel: string;
  comparisonRankings: { name: string; current: number; comparison: number; change: number | null }[];
  customerFeedback: CustomerFeedbackRow[];
  feedbackThemes: FeedbackTheme[];
  feedbackCurrentSatisfaction: Record<string, number | null>;
  feedbackPriorSatisfaction: Record<string, number | null>;
  analysisRows: AnalysisEstablishment[];
  analysisFindings: AnalyticsFinding[];
  multipleDecline: ReturnType<typeof buildAnalyticsAnalysis>["multipleDecline"];
}

type Establishment = {
  id: string;
  name: string;
  type?: string | null;
  total_rooms?: number | null;
  reporting_mode?: ReportingMode | null;
  status?: string | null;
};

type CustomerFeedbackRow = {
  establishment_id: string;
  average_rating: number | null;
  rating_count: number;
  positive_rating_percentage: number | null;
  customer_satisfaction_score: number | null;
  feedback_eligibility: string;
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

type AnalyticsAiAnomaly = {
  id: string;
  anomaly_type: string;
  severity: string;
  description: string;
  recommendation: string;
  establishments?: { name: string } | null;
  detected_at: string;
  is_resolved: boolean;
  input_snapshot?: Record<string, unknown> | null;
};

type AnalyticsAiInsight = {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: string;
  recommended_action?: string;
  input_snapshot?: Record<string, unknown> | null;
};

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
  const specificOrigin = formatResidencePlace(record.place_of_residence);
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
  previous > 0 ? ((current - previous) / previous) * 100 : null;

const getAnalyticsYearRange = (year: string) => ({
  label: year,
  start: `${year}-01-01`,
  end: `${year}-12-31`,
});

const getComparisonPeriod = (period: ReportPeriodSelection, year: number): ReportPeriodSelection => {
  if (period.type !== "custom") return { ...period, year };
  const shift = (value: string | undefined) => value ? `${year}-${value.slice(5)}` : "";
  return { ...period, year, startDate: shift(period.startDate), endDate: shift(period.endDate) };
};

const getComparisonLabel = (period: ReportPeriodSelection, comparisonYear: string) =>
  period.type === "year" ? `Year ${comparisonYear}` : `${period.type === "quarter" ? `Q${period.quarter}` : period.type === "month" ? new Date(2000, period.month, 1).toLocaleString("default", { month: "short" }) : period.type === "week" ? `Week ${period.week}` : "Custom range"} ${comparisonYear}`;

const aiFindingMatchesPeriod = (anomaly: AnalyticsAiAnomaly, period: ReportPeriodSelection) => {
  const month = anomaly.input_snapshot?.current_month;
  if (typeof month !== "string" || !/^\d{4}-\d{2}$/.test(month)) return true;
  const monthStart = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const range = getReportPeriodRange(period);
  return monthStart <= range.endDate && monthEnd >= range.startDate;
};

const aiRecommendationMatchesPeriod = (insight: AnalyticsAiInsight, period: ReportPeriodSelection) => {
  const snapshot = insight.input_snapshot || {};
  const month = snapshot.current_month;
  if (typeof month === "string" && /^\d{4}-\d{2}$/.test(month)) {
    const monthStart = `${month}-01`;
    const [year, monthNumber] = month.split("-").map(Number);
    const monthEnd = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
    const range = getReportPeriodRange(period);
    if (!(monthStart <= range.endDate && monthEnd >= range.startDate)) return false;
  }
  const analysisPeriod = snapshot.analysis_period;
  if (analysisPeriod && typeof analysisPeriod === "object") {
    const saved = analysisPeriod as Record<string, unknown>;
    const savedStart = String(saved.selectedStartDate || saved.queryStart || "");
    const savedEnd = String(saved.selectedEndDate || saved.queryEnd || "");
    if (savedStart && savedEnd) {
      const range = getReportPeriodRange(period);
      if (savedEnd < range.startDate || savedStart > range.endDate) return false;
    }
  }
  return true;
};

export default function Analytics() {
  const { horizontalRef: originsTableRef } = useDominantAxisTableScroll();
  const [data, setData] = useState<AnalyticsData>({
    seasonalData: [],
    visitorOrigins: [],
    performancePeriods: {},
    peakSeason: { month: "", activity: 0, visitors: 0, guestCheckIns: 0, growth: 0 },
    topOrigin: { location: "", percentage: 0 },
    growthRate: null,
    comparisonLabel: "",
    comparisonRankings: [],
    customerFeedback: [],
    feedbackThemes: [],
    feedbackCurrentSatisfaction: {},
    feedbackPriorSatisfaction: {},
    analysisRows: [],
    analysisFindings: [],
    multipleDecline: {
      daytour: { eligibleEstablishments: 0, affectedEstablishments: 0, stableEstablishments: 0, increasingEstablishments: 0, insufficientEstablishments: 0, affectedPercentage: null, combinedDecrease: 0 },
      overnight: { eligibleEstablishments: 0, affectedEstablishments: 0, stableEstablishments: 0, increasingEstablishments: 0, insufficientEstablishments: 0, affectedPercentage: null, combinedDecrease: 0 },
    },
  });
  const [loading, setLoading] = useState(true);
  const currentDate = new Date();
  const [analyticsPeriod, setAnalyticsPeriod] = useState<ReportPeriodSelection>({ type: "year", year: currentDate.getFullYear(), month: currentDate.getMonth(), quarter: Math.floor(currentDate.getMonth() / 3) + 1, week: 1 });
  const selectedYear = String(analyticsPeriod.year);
  const [comparisonYear, setComparisonYear] = useState(String(currentDate.getFullYear() - 1));
  const [aiAnomalies, setAiAnomalies] = useState<AnalyticsAiAnomaly[]>([]);
  const [aiInsights, setAiInsights] = useState<AnalyticsAiInsight[]>([]);
  const [refreshingAi, setRefreshingAi] = useState(false);
  const [aiRefreshError, setAiRefreshError] = useState<string | null>(null);
  const [feedbackSort, setFeedbackSort] = useState<"satisfaction" | "rating" | "positive" | "count">("satisfaction");
  const [selectedEstablishmentIds, setSelectedEstablishmentIds] = useState<string[]>([]);
  const selectedEstablishmentId = selectedEstablishmentIds.length === 1 ? selectedEstablishmentIds[0] : "";
  const [availableEstablishments, setAvailableEstablishments] = useState<Establishment[]>([]);
  const [availableYears, setAvailableYears] = useState<number[]>([currentDate.getFullYear() - 2, currentDate.getFullYear() - 1, currentDate.getFullYear()]);
  const [analysisPattern, setAnalysisPattern] = useState<AnalyticsPattern>("all");


  useEffect(() => {
    fetchAnalytics();
  }, [analyticsPeriod, comparisonYear, selectedEstablishmentIds]);

  const fetchAnalytics = async () => {
    setLoading(true);
    const selectedRange = getReportPeriodRange(analyticsPeriod);
    const comparisonPeriod = getComparisonPeriod(analyticsPeriod, Number(comparisonYear));
    const comparisonRange = getReportPeriodRange(comparisonPeriod);

    const fetchAllReports = async (
      table: "visitor_reports" | "accommodation_reports",
      select: string,
      range = selectedRange,
    ) => {
      const pageSize = 1000;
      const allRows: Record<string, unknown>[] = [];

      for (let page = 0; ; page += 1) {
        let query = supabase
          .from(table)
          .select(select)
          .in("status", ["pending", "submitted", "validated", "approved"])
          .gte("report_date", range.startDate)
          .lte("report_date", range.endDate)
          .order("report_date", { ascending: true });
        if (selectedEstablishmentIds.length === 1) query = query.eq("establishment_id", selectedEstablishmentIds[0]);
        if (selectedEstablishmentIds.length > 1) query = query.in("establishment_id", selectedEstablishmentIds);
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);

        if (error) return { data: null, error };
        allRows.push(...((data || []) as unknown as Record<string, unknown>[]));
        if (!data || data.length < pageSize) break;
      }

      return { data: allRows, error: null };
    };

    const fetchAllFeedbackRows = async (
      table: "establishment_rating_reviews" | "establishment_rating_period_summaries",
      select: string,
      orderColumn: "created_at" | "period_start",
    ) => {
      const pageSize = 1000;
      const allRows: Record<string, unknown>[] = [];
      for (let page = 0; ; page += 1) {
        let query = supabase
          .from(table)
          .select(select)
          .order(orderColumn, { ascending: true });
        if (selectedEstablishmentIds.length === 1) query = query.eq("establishment_id", selectedEstablishmentIds[0]);
        if (selectedEstablishmentIds.length > 1) query = query.in("establishment_id", selectedEstablishmentIds);
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) return { data: null, error };
        allRows.push(...((data || []) as unknown as Record<string, unknown>[]));
        if (!data || data.length < pageSize) break;
      }
      return { data: allRows, error: null };
    };

    const fetchAvailableReportYears = async () => {
      const years = new Set<number>();
      for (const table of ["visitor_reports", "accommodation_reports"] as const) {
        for (let page = 0; ; page += 1) {
          const { data, error } = await supabase
            .from(table)
            .select("report_date")
            .in("status", ["pending", "submitted", "validated", "approved"])
            .order("report_date", { ascending: true })
            .range(page * 1000, (page + 1) * 1000 - 1);
          if (error) return [];
          (data || []).forEach((row) => {
            const year = Number(String(row.report_date || "").slice(0, 4));
            if (Number.isInteger(year) && year > 1900) years.add(year);
          });
          if (!data || data.length < 1000) break;
        }
      }
      return [...years].sort((a, b) => a - b);
    };

    const aiAnomalyQuery = supabase
      .from("ai_anomalies_cache")
      .select("id,anomaly_type,severity,description,recommendation,detected_at,is_resolved,input_snapshot,establishments(name)")
      .eq("status", "active")
      .eq("is_resolved", false)
      .order("detected_at", { ascending: false })
      .limit(MAX_AI_ITEMS);
    const scopedAiAnomalyQuery = selectedEstablishmentId ? aiAnomalyQuery.eq("establishment_id", selectedEstablishmentId) : aiAnomalyQuery.is("establishment_id", null);
    const aiInsightQuery = supabase
      .from("ai_recommendations")
      .select("id,title,description,impact,category,recommended_action,input_snapshot")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(MAX_AI_ITEMS);
    const scopedAiInsightQuery = selectedEstablishmentId ? aiInsightQuery.eq("establishment_id", selectedEstablishmentId) : aiInsightQuery.is("establishment_id", null);
    const feedbackSummaryQuery = selectedEstablishmentId
      ? supabase.from("establishment_rating_summaries").select("establishment_id,average_rating,rating_count,positive_rating_percentage,customer_satisfaction_score,feedback_eligibility").eq("establishment_id", selectedEstablishmentId)
      : supabase.from("establishment_rating_summaries").select("establishment_id,average_rating,rating_count,positive_rating_percentage,customer_satisfaction_score,feedback_eligibility");

    const [
      { data: establishmentData, error: establishmentError },
      visitorResult,
      accommodationResult,
      comparisonVisitorResult,
      comparisonAccommodationResult,
      aiAnomalyResult,
      aiInsightResult,
      customerFeedbackResult,
      feedbackThemeResult,
      feedbackPeriodResult,
      availableYearsResult,
    ] = await Promise.all([
      supabase
        .from("establishments")
        .select("id,name,type,total_rooms,reporting_mode,status"),
      fetchAllReports(
        "visitor_reports",
        `
          establishment_id,
          report_date,
          total_guests,
          residence_type,
          place_of_residence,
          establishments (name)
        `,
      ),
      fetchAllReports(
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
      ),
      fetchAllReports("visitor_reports", `establishment_id, report_date, total_guests`, comparisonRange),
      fetchAllReports("accommodation_reports", `establishment_id, report_date, total_check_ins`, comparisonRange),
      scopedAiAnomalyQuery,
      scopedAiInsightQuery,
      feedbackSummaryQuery,
      fetchAllFeedbackRows("establishment_rating_reviews", "establishment_id,comment,verified_account", "created_at"),
      fetchAllFeedbackRows("establishment_rating_period_summaries", "establishment_id,period_start,customer_satisfaction_score,rating_count", "period_start"),
      fetchAvailableReportYears(),
    ]);

    const periodAnomalies = (aiAnomalyResult.data || [])
      .map((anomaly) => ({
        ...anomaly,
        establishments: Array.isArray(anomaly.establishments) ? anomaly.establishments[0] || null : anomaly.establishments,
      }))
      .filter((anomaly) => aiFindingMatchesPeriod(anomaly as AnalyticsAiAnomaly, analyticsPeriod)) as AnalyticsAiAnomaly[];
    setAiAnomalies(periodAnomalies);
    setAiInsights((aiInsightResult.data || []) as AnalyticsAiInsight[]);

    const { data: visitorData, error: visitorError } = visitorResult;
    const { data: accommodationData, error: accError } = accommodationResult;

    if (establishmentError) console.error("Error fetching establishments:", establishmentError);
    if (visitorError) console.error("Error fetching visitor data:", visitorError);
    if (accError) console.error("Error fetching accommodation data:", accError);

    const establishments = (establishmentData || []) as Establishment[];
    setAvailableEstablishments(establishments);
    if (availableYearsResult.length > 0) setAvailableYears(availableYearsResult);
    const visitors = (visitorData || []) as unknown as VisitorReport[];
    const accommodations = (accommodationData || []) as unknown as AccommodationReport[];
    const comparisonVisitors = (comparisonVisitorResult.data || []) as unknown as VisitorReport[];
    const comparisonAccommodations = (comparisonAccommodationResult.data || []) as unknown as AccommodationReport[];
    const currentVisitorTotals = new Map<string, number>();
    visitors.forEach((item) => currentVisitorTotals.set(item.establishment_id, (currentVisitorTotals.get(item.establishment_id) || 0) + (item.total_guests || 0)));
    const comparisonVisitorTotals = new Map<string, number>();
    comparisonVisitors.forEach((item) => comparisonVisitorTotals.set(item.establishment_id, (comparisonVisitorTotals.get(item.establishment_id) || 0) + (item.total_guests || 0)));
    const comparisonRankings = establishments.map((establishment) => {
      const current = currentVisitorTotals.get(establishment.id) || 0;
      const comparison = comparisonVisitorTotals.get(establishment.id) || 0;
      return { name: establishment.name, current, comparison, change: percentChange(current, comparison) };
    }).sort((a, b) => b.current - a.current).slice(0, 10);

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
    const monthlyData = Object.fromEntries(
      aggregateMonthlyMetrics(visitors, accommodations, 0, 0, { startDate: selectedRange.startDate, endDate: selectedRange.endDate }).map((item) => [item.month, {
        label: monthLabel(`${item.month}-01`),
        visitors: item.dayTourVisitors,
        guestCheckIns: item.guestCheckIns,
        guestNights: accommodations
          .filter((row) => monthKey(row.report_date) === item.month)
          .reduce((sum, row) => sum + Number((row as AccommodationReport & { total_guest_nights?: number | null }).total_guest_nights || 0), 0),
      }])
    );

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
        ),
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

    if (customerFeedbackResult.error) console.warn("Customer feedback summary unavailable:", customerFeedbackResult.error.message);
    const customerFeedback = ((customerFeedbackResult.data || []) as CustomerFeedbackRow[]).map((row) => ({
      ...row,
      average_rating: row.average_rating == null ? null : Number(row.average_rating),
      rating_count: Number(row.rating_count || 0),
      positive_rating_percentage: row.positive_rating_percentage == null ? null : Number(row.positive_rating_percentage),
      customer_satisfaction_score: row.customer_satisfaction_score == null ? null : Number(row.customer_satisfaction_score),
    }));

    const periodRows = (feedbackPeriodResult.data || []) as Array<{ establishment_id: string; period_start: string; customer_satisfaction_score?: number | null; rating_count?: number | null }>;
    const aggregatePeriodSatisfaction = (year: string) => {
      const grouped = new Map<string, { weighted: number; count: number }>();
      for (const row of periodRows) {
        if (!row.period_start.startsWith(`${year}-`) || row.customer_satisfaction_score == null) continue;
        const count = Number(row.rating_count || 0);
        const current = grouped.get(row.establishment_id) || { weighted: 0, count: 0 };
        current.weighted += Number(row.customer_satisfaction_score) * count;
        current.count += count;
        grouped.set(row.establishment_id, current);
      }
      return Object.fromEntries([...grouped.entries()].map(([id, value]) => [id, value.count ? Number((value.weighted / value.count).toFixed(2)) : null]));
    };
    const currentPeriodSatisfaction = aggregatePeriodSatisfaction(selectedYear);
    const feedbackPriorSatisfaction = aggregatePeriodSatisfaction(comparisonYear);

    const feedbackThemes = classifyFeedbackThemes(((feedbackThemeResult.data || []) as Array<{ comment?: string | null; verified_account?: boolean }>).map((row) => ({
      comment: row.comment,
      verified: row.verified_account === true,
      status: "published",
      suspicious: false,
    })));

    const daysInRange = (startDate: string, endDate: string) => {
      if (!startDate || !endDate) return 0;
      const start = new Date(`${startDate}T00:00:00Z`).getTime();
      const end = new Date(`${endDate}T00:00:00Z`).getTime();
      return start <= end ? Math.floor((end - start) / 86400000) + 1 : 0;
    };
    const buildEvidence = <T extends { establishment_id: string; report_date: string }>(
      rows: T[],
      establishmentId: string,
      startDate: string,
      endDate: string,
      valueOf: (row: T) => number | null | undefined,
      applicable: boolean,
    ): PeriodEvidence => {
      const matchingRows = rows.filter((row) => row.establishment_id === establishmentId);
      const submittedDates = new Set(matchingRows.map((row) => row.report_date.slice(0, 10)));
      const submittedReports = submittedDates.size;
      const value = submittedReports > 0 ? matchingRows.reduce((sum, row) => sum + Number(valueOf(row) || 0), 0) : null;
      const expectedReports = applicable ? daysInRange(startDate, endDate) : null;
      const coveragePercent = expectedReports && expectedReports > 0 ? Math.min(100, (submittedReports / expectedReports) * 100) : null;
      return { startDate, endDate, value, submittedReports, expectedReports, coveragePercent };
    };
    const analysisRows = establishments.map((establishment): AnalysisEstablishment => {
      const mode = getEstablishmentReportingMode(establishment);
      return {
        id: establishment.id,
        name: establishment.name,
        reportingMode: mode,
        current: {
          daytour: buildEvidence(visitors, establishment.id, selectedRange.startDate, selectedRange.endDate, (row) => row.total_guests, mode === "visitor" || mode === "both"),
          overnight: buildEvidence(accommodations, establishment.id, selectedRange.startDate, selectedRange.endDate, (row) => row.total_check_ins, mode === "accommodation" || mode === "both"),
        },
        previous: {
          daytour: buildEvidence(comparisonVisitors, establishment.id, comparisonRange.startDate, comparisonRange.endDate, (row) => row.total_guests, mode === "visitor" || mode === "both"),
          overnight: buildEvidence(comparisonAccommodations, establishment.id, comparisonRange.startDate, comparisonRange.endDate, (row) => row.total_check_ins, mode === "accommodation" || mode === "both"),
        },
      };
    });
    const analysisResult = buildAnalyticsAnalysis(analysisRows, {
      seasonalValues: {
        daytour: seasonalData.map((item) => item.visitors),
        overnight: seasonalData.map((item) => item.guestCheckIns),
      },
    });

    setData({
      seasonalData,
      visitorOrigins,
      performancePeriods,
      peakSeason: {
        month: monthlyData[peakKey]?.label || "N/A",
        activity: monthlyData[peakKey]?.visitors || 0,
        visitors: monthlyData[peakKey]?.visitors || 0,
        guestCheckIns: monthlyData[peakKey]?.guestCheckIns || 0,
        growth: percentChange(
          monthlyData[peakKey]?.visitors || 0,
          monthlyData[beforePeakKey]?.visitors || 0
        ) ?? 0,
      },
      topOrigin: {
        location: topLocation,
        percentage: totalVisitors > 0 ? Math.round((topVisitors / totalVisitors) * 100) : 0,
      },
      growthRate: percentChange(
        monthlyData[latestMonth]?.visitors || 0,
        monthlyData[previousMonth]?.visitors || 0
      ),
      comparisonLabel: getComparisonLabel(analyticsPeriod, comparisonYear),
      comparisonRankings,
      customerFeedback,
      feedbackThemes,
      feedbackCurrentSatisfaction: currentPeriodSatisfaction,
      feedbackPriorSatisfaction,
      analysisRows,
      analysisFindings: analysisResult.findings,
      multipleDecline: analysisResult.multipleDecline,
    });

    setLoading(false);
  };

  const refreshAiInsights = async () => {
    setRefreshingAi(true);
    setAiRefreshError(null);
    try {
      const selectedRange = getReportPeriodRange(analyticsPeriod);
      const comparisonRange = getReportPeriodRange(getComparisonPeriod(analyticsPeriod, Number(comparisonYear)));
      await geminiService.refreshAllData({
        selectedStartDate: selectedRange.startDate,
        selectedEndDate: selectedRange.endDate,
        comparisonStartDate: comparisonRange.startDate,
        comparisonEndDate: comparisonRange.endDate,
        establishmentId: selectedEstablishmentId || undefined,
        label: analyticsPeriod.type === "year" ? `Year ${selectedYear} compared with ${comparisonYear}` : `${selectedRange.startDate} to ${selectedRange.endDate} compared with ${comparisonRange.startDate} to ${comparisonRange.endDate}`,
      });
      await fetchAnalytics();
    } catch (error) {
      setAiRefreshError(error instanceof Error ? error.message : "Unable to refresh AI analysis right now.");
    } finally {
      setRefreshingAi(false);
    }
  };

  if (loading) {
    return <DataState state="loading" message="Retrieving analytics data..." />;
  }

  const analyticsYears = availableYears;
  const panelFilter = (label: string) => {
    const activeEstablishments = availableEstablishments.filter((establishment) => establishment.status === "active").sort((a, b) => a.name.localeCompare(b.name));
    const scopeLabel = selectedEstablishmentIds.length === 0 ? "All establishments" : `${selectedEstablishmentIds.length} establishment${selectedEstablishmentIds.length === 1 ? "" : "s"} selected`;
    return (
      <div className="flex w-full min-w-0 flex-col items-stretch gap-1 sm:w-auto sm:flex-row sm:items-center sm:justify-end sm:gap-2">
        <p className="shrink-0 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-right">Scope</p>
        <details className="group relative w-full sm:w-64">
          <summary className="flex min-h-10 cursor-pointer list-none items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm text-slate-700 shadow-sm [&::-webkit-details-marker]:hidden">
            <span className="truncate">{scopeLabel}</span><span aria-hidden="true" className="ml-2 text-slate-400 transition group-open:rotate-180">▾</span>
          </summary>
          <div className="absolute right-0 z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white p-2 shadow-xl">
            <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50"><input type="checkbox" checked={selectedEstablishmentIds.length === 0} onChange={() => setSelectedEstablishmentIds([])} /> All establishments</label>
            {activeEstablishments.map((establishment) => <label key={establishment.id} className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-slate-700 hover:bg-slate-50"><input type="checkbox" checked={selectedEstablishmentIds.includes(establishment.id)} onChange={(event) => setSelectedEstablishmentIds(event.target.checked ? [...selectedEstablishmentIds, establishment.id] : selectedEstablishmentIds.filter((id) => id !== establishment.id))} /> <span className="truncate">{establishment.name}</span></label>)}
          </div>
        </details>
        <p className="shrink-0 text-left text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:text-right">{label}</p>
        <ReportPeriodFilter value={analyticsPeriod} availableYears={analyticsYears.map(Number)} onChange={setAnalyticsPeriod} className="w-full sm:w-auto" />
      </div>
    );
  };

  const anomalyMarkers = aiAnomalies.slice(0, 4).map((anomaly) => ({
    anomaly,
    month: anomaly.input_snapshot?.current_month,
    value: Number(anomaly.input_snapshot?.current_value || 0),
    metric: anomaly.input_snapshot?.metric,
  })).filter((item) => typeof item.month === "string" && item.value >= 0);
  const seasonalPeak = data.seasonalData
    .map((item, index) => ({ ...item, index, combinedActivity: item.visitors + item.guestCheckIns }))
    .filter((item) => item.combinedActivity > 0)
    .sort((a, b) => b.combinedActivity - a.combinedActivity)[0];
  const seasonalFindings: AnalyticsAiAnomaly[] = seasonalPeak ? [{
    id: `seasonality-peak-${selectedYear}`,
    anomaly_type: "Seasonal activity peak",
    severity: "low",
    description: `The selected year recorded its highest combined reported visitor and overnight check-in activity in ${seasonalPeak.month}, with ${seasonalPeak.visitors.toLocaleString()} visitors and ${seasonalPeak.guestCheckIns.toLocaleString()} overnight guest check-ins.`,
    recommendation: "",
    detected_at: new Date().toISOString(),
    is_resolved: false,
    input_snapshot: {
      metric: "seasonality",
      current_month: `${selectedYear}-${String(seasonalPeak.index + 1).padStart(2, "0")}`,
      current_value: seasonalPeak.combinedActivity,
      peak_month: seasonalPeak.month,
      visitor_value: seasonalPeak.visitors,
      overnight_check_in_value: seasonalPeak.guestCheckIns,
    },
  }] : [];
  const originPeak = data.visitorOrigins[0];
  const originFindings: AnalyticsAiAnomaly[] = originPeak ? [{
    id: `visitor-origins-${selectedYear}`,
    anomaly_type: "Visitor origin concentration",
    severity: "low",
    description: `${originPeak.location} is the largest reported visitor origin in the selected period with ${originPeak.visitors.toLocaleString()} visitors${originPeak.growth === null ? "." : ` and ${originPeak.growth >= 0 ? "growth" : "decline"} of ${Math.abs(originPeak.growth).toFixed(1)}% versus the prior period.`}`,
    recommendation: "",
    detected_at: new Date().toISOString(),
    is_resolved: false,
    input_snapshot: { metric: "visitorOrigins", current_month: `${selectedYear}-12`, origin: originPeak.location, current_value: originPeak.visitors, growth_percent: originPeak.growth },
  }] : [];
  const performanceRows = data.performancePeriods[`${selectedYear}-FULL_YEAR`] || [];
  const establishmentNames = new Map(performanceRows.map((row) => [row.id, row.name]));
  const feedbackRows = [...data.customerFeedback]
    .map((row) => ({ ...row, establishmentName: establishmentNames.get(row.establishment_id) || row.establishment_id }))
    .sort((a, b) => {
      const value = (row: typeof a) => feedbackSort === "rating" ? (row.average_rating ?? -1) : feedbackSort === "positive" ? (row.positive_rating_percentage ?? -1) : feedbackSort === "count" ? row.rating_count : (row.customer_satisfaction_score ?? -1);
      return value(b) - value(a);
    });
  const performanceCounts = performanceRows.reduce<Record<string, number>>((counts, row) => {
    const key = `${row.category}-${row.visitorCount === null ? "INSUFFICIENT_DATA" : row.visitorCount > 0 ? "REPORTED" : "ZERO_REPORTED"}`;
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const performanceFindings: AnalyticsAiAnomaly[] = performanceRows.length > 0 ? [{
    id: `establishment-performance-${selectedYear}`,
    anomaly_type: "Establishment visitor-volume distribution",
    severity: "low",
    description: `The selected year contains ${performanceRows.length} establishment service records across day-tour and overnight categories. The distribution is based on reported volume, not quality or profitability.`,
    recommendation: "",
    detected_at: new Date().toISOString(),
    is_resolved: false,
    input_snapshot: { metric: "establishmentPerformance", current_month: `${selectedYear}-12`, current_value: performanceRows.length, classification_counts: performanceCounts },
  }] : [];
  const feedbackDecisionSegments = classifyFeedbackDecisionSegments(feedbackRows.map((row) => {
    const performance = performanceRows.find((item) => item.id === row.establishment_id);
    return {
      establishmentId: row.establishment_id,
      establishmentName: establishmentNames.get(row.establishment_id) || row.establishment_id,
      visitorVolume: performance?.visitorCount ?? null,
      satisfaction: data.feedbackCurrentSatisfaction[row.establishment_id] ?? row.customer_satisfaction_score,
      priorSatisfaction: data.feedbackPriorSatisfaction[row.establishment_id] ?? null,
      ratingCount: row.rating_count,
      eligibility: row.feedback_eligibility,
    };
  }));
  const feedbackSegmentCounts = feedbackDecisionSegments.reduce<Record<string, number>>((counts, decision) => {
    counts[decision.segment] = (counts[decision.segment] || 0) + 1;
    return counts;
  }, {});
  const feedbackFindings: AnalyticsAiAnomaly[] = feedbackRows.length > 0 ? [{
    id: `customer-feedback-${selectedYear}`,
    anomaly_type: "Published verified customer feedback",
    severity: feedbackRows.some((row) => (row.customer_satisfaction_score ?? 100) < 70) ? "medium" : "low",
    description: `Customer feedback is available for ${feedbackRows.length} establishments. Results include only published, eligible reviews and are not proof of visitor volume or establishment cause.`,
    recommendation: "",
    detected_at: new Date().toISOString(),
    is_resolved: false,
    input_snapshot: { metric: "customerFeedback", current_month: `${selectedYear}-FULL_YEAR`, current_value: feedbackRows.length, feedback_count: feedbackRows.reduce((sum, row) => sum + row.rating_count, 0), low_satisfaction_count: feedbackRows.filter((row) => (row.customer_satisfaction_score ?? 100) < 70).length, segment_counts: feedbackSegmentCounts },
  }] : [];
  const allAiFindings = [...aiAnomalies, ...seasonalFindings, ...originFindings, ...performanceFindings, ...feedbackFindings];
  const recommendationAssignments = assignRecommendationsToAnomalies(
    allAiFindings.map((anomaly) => ({
      id: anomaly.id,
      metric: anomaly.input_snapshot?.metric,
      currentMonth: anomaly.input_snapshot?.current_month,
    })),
    aiInsights,
  );

  const evidenceAwareFallbackDecisionSupport = (anomaly: AnalyticsAiAnomaly): AiDecisionSupport | null => {
    const evidence = anomaly.input_snapshot || {};
    const selected = selectTourismRecommendationStrategies(evidence, {
      scope: selectedEstablishmentId ? "establishment" : "municipality",
      establishmentId: selectedEstablishmentId || undefined,
      establishmentName: availableEstablishments.find((item) => item.id === selectedEstablishmentId)?.name || undefined,
      metric: String(evidence.metric || ""),
      periodLabel: String(evidence.current_month || "the selected reporting period"),
    });
    if (!selected.actions.length) return null;
    return {
      insight_category: selected.actions[0].action_category,
      data_confidence: Number.isFinite(Number(evidence.current_coverage_percent)) ? coverageConfidence(Number(evidence.current_coverage_percent)) || "Not calculated" : undefined,
      data_limitations: ["This deterministic strategy is based only on verified evidence and remains advisory; it does not establish a cause."],
      decision_implication: selected.decisionImplication,
      recommended_actions: selected.actions.slice(0, 1),
      validation_required: selected.actions.slice(0, 1).some((action) => action.validation_required),
    };
  };

  const fallbackDecisionSupport = (anomaly: AnalyticsAiAnomaly): AiDecisionSupport | null => {
    const evidence = anomaly.input_snapshot || {};
    const metric = String(evidence.metric || "");
    const month = String(evidence.current_month || "the selected period");
    const monthLabel = month.length === 7 ? new Date(`${month}-01T00:00:00Z`).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) : month;
    const missingReports = Number(evidence.current_missing_reports);
    const coverage = Number(evidence.current_coverage_percent);
    const confidence = Number.isFinite(coverage) ? coverageConfidence(coverage) || "Not calculated" : undefined;
    let action;
    let limitation = "This action is generated from the verified chart evidence and remains subject to officer review.";

    if (metric === "dayTourVisitors" || metric === "overnightGuestCheckIns") {
      const metricLabel = metric === "overnightGuestCheckIns" ? "overnight guest check-in" : "day-tour visitor";
      const dropPercent = Number(evidence.drop_percent);
      if (Number.isFinite(missingReports) && missingReports > 0) {
        action = {
          action_title: `Follow up on ${missingReports} missing reports`,
          action_description: `Assign reporting follow-up for the ${missingReports} missing ${metricLabel} reports for ${monthLabel}.`,
          action_priority: "Medium",
          action_category: "Reporting Compliance",
          responsible_entity: "Tourism Operations Assistant",
          suggested_timeframe: "Within 7 days",
          success_indicators: [`All ${missingReports} missing ${metricLabel} reports are submitted or documented as unavailable.`],
          validation_required: true,
        };
      } else if (Number.isFinite(dropPercent) && dropPercent >= 30 && Number.isFinite(coverage) && coverage >= 80) {
        action = {
          action_title: "Run a measured visitor-recovery response",
          action_description: `Coordinate one approved visitor-recovery intervention for the ${monthLabel} decline and compare the next reporting period with the ${evidence.current_value} ${metricLabel} baseline.`,
          action_priority: "High",
          action_category: "Tourism Planning",
          responsible_entity: "Municipal Tourism Officer",
          suggested_timeframe: "Within 30 days",
          success_indicators: [`The next reporting period is compared with the ${evidence.current_value} ${metricLabel} baseline and the intervention result is recorded.`],
          validation_required: false,
        };
        limitation = "Reporting coverage is sufficiently complete for a diagnostic intervention, but the data does not establish the decline's cause.";
      } else {
        action = {
          action_title: `Assess reported ${metricLabel} decline`,
          action_description: `Schedule a diagnostic assessment of reported ${metricLabel} volume for ${monthLabel} against ${String(evidence.previous_month || "the previous month")}.`,
          action_priority: "Medium",
          action_category: "Diagnostic Assessment",
          responsible_entity: "Municipal Tourism Officer",
          suggested_timeframe: "Within 14 days",
          success_indicators: [`A written comparison of the verified ${metricLabel} values is recorded for the selected period.`],
          validation_required: true,
        };
      }
    } else if (metric === "visitorOrigins") {
      const origin = String(evidence.origin || "the leading origin category");
      const growth = Number(evidence.growth_percent);
      const hasGrowth = Number.isFinite(growth) && growth > 0;
      action = {
        action_title: hasGrowth ? `Target the ${origin} visitor segment` : "Balance visitor-origin outreach",
        action_description: hasGrowth
          ? `Prioritize one documented outreach or program-planning response for the growing ${origin} segment, then compare its next-period visitor volume.`
          : `Design one outreach response for the reported visitor-origin mix and compare next-period origin volumes before expanding it.`,
        action_priority: "Medium",
        action_category: "Tourism Promotion",
        responsible_entity: "Municipal Tourism Officer",
        suggested_timeframe: "Within 30 days",
        success_indicators: [`The response is documented and next-period visitor-origin volumes are compared with the selected-period baseline.`],
        validation_required: true,
      };
      limitation = "The chart shows reported origin distribution; it does not establish visitor motivation or cause.";
    } else if (metric === "establishmentPerformance") {
      action = {
        action_title: "Prioritize establishment support by volume",
        action_description: `Group establishments by reported visitor-volume category for ${selectedYear} and assign one support follow-up to each low-volume group.`,
        action_priority: "Medium",
        action_category: "Resource Allocation",
        responsible_entity: "Municipal Tourism Officer",
        suggested_timeframe: "Within 30 days",
        success_indicators: ["Volume groups and assigned support follow-ups are recorded for the selected year."],
        validation_required: true,
      };
      limitation = "The distribution is based on reported volume and does not establish quality, profitability, or cause.";
    } else if (metric === "seasonality") {
      const peak = String(evidence.peak_month || monthLabel);
      action = {
        action_title: `Prepare monitoring for ${peak}`,
        action_description: `Prepare a monitoring checklist for the verified ${peak} activity peak during the next reporting period.`,
        action_priority: "Medium",
        action_category: "Tourism Planning",
        responsible_entity: "Municipal Tourism Officer",
        suggested_timeframe: "Before the anticipated peak season",
        success_indicators: [`The ${peak} monitoring checklist is approved and used during the next corresponding reporting period.`],
        validation_required: true,
      };
    } else if (metric === "customerFeedback") {
      const reviewCount = Number(evidence.feedback_count);
      const segmentCounts = (evidence.segment_counts || {}) as Record<string, number>;
      const segment = Object.entries(segmentCounts).find(([, count]) => Number(count) > 0)?.[0] || "insufficient_feedback";
      const actionBySegment = {
        high_volume_low_satisfaction: { action_title: "Coordinate service-improvement review", action_description: "Review recurring published feedback themes with the establishment operator and document an approved service-improvement assessment for high-volume, low-satisfaction establishments.", action_priority: "High", action_category: "Customer Experience", responsible_entity: "Municipal Tourism Officer", suggested_timeframe: "Within 30 days", success_indicators: ["The feedback themes, operator consultation, and agreed service-improvement assessment are documented."], validation_required: true },
        low_volume_high_satisfaction: { action_title: "Assess promotional exposure", action_description: "Assess whether a high-satisfaction, low-volume establishment should receive additional public-portal or municipal tourism campaign exposure.", action_priority: "Medium", action_category: "Tourism Promotion", responsible_entity: "Municipal Tourism Officer", suggested_timeframe: "Within 45 days", success_indicators: ["A promotion decision and next-period visitor comparison are documented without promising a specific outcome."], validation_required: true },
        declining_satisfaction: { action_title: "Compare satisfaction periods", action_description: "Compare eligible feedback across equivalent periods, review recurring themes, and document an appropriate service-improvement assessment.", action_priority: "High", action_category: "Customer Experience", responsible_entity: "Municipal Tourism Officer", suggested_timeframe: "Within 30 days", success_indicators: ["Equivalent-period satisfaction values and recurring themes are documented with a reviewable follow-up."], validation_required: true },
        consistently_positive: { action_title: "Share positive service practices", action_description: "Consider the establishment for tourism knowledge-sharing and document which published feedback themes support the consideration.", action_priority: "Low", action_category: "Tourism Knowledge Sharing", responsible_entity: "Municipal Tourism Officer", suggested_timeframe: "During the next tourism planning cycle", success_indicators: ["Any knowledge-sharing activity identifies the supporting aggregate feedback evidence."], validation_required: true },
        insufficient_feedback: { action_title: "Encourage unbiased visitor feedback", action_description: "Encourage voluntary and unbiased feedback collection without requiring positive ratings or offering incentives only for favorable reviews.", action_priority: "Low", action_category: "Customer Feedback", responsible_entity: "Municipal Tourism Officer", suggested_timeframe: "During the next public-engagement cycle", success_indicators: [`The establishment remains marked as insufficient until the approved review threshold is reached; current eligible review count is ${reviewCount}.`], validation_required: true },
      };
      action = actionBySegment[segment as keyof typeof actionBySegment] || actionBySegment.insufficient_feedback;
      limitation = "Verified account status does not prove that a reviewer visited the establishment; feedback is advisory and must not be treated as proof of cause.";
    }
    if (!action) return null;
    return {
      insight_category: action.action_category,
      data_confidence: confidence,
      data_limitations: [limitation],
      decision_implication: "A defined follow-up converts the verified chart finding into a reviewable municipal action without assuming an unsupported cause.",
      recommended_actions: [action],
      validation_required: true,
    };
  };

  const renderRelatedAiFindings = (metrics: string[]) => {
    const related = allAiFindings.filter((anomaly) => metrics.includes(String(anomaly.input_snapshot?.metric || "")));
    const standalone = deduplicateStandaloneRecommendations(
      aiInsights.filter((candidate) => {
        const metric = String(candidate.input_snapshot?.metric || "");
        return metrics.includes(metric)
          && recommendationSupportsMetric(candidate, metric as any)
          && recommendationSupportsPeriod(candidate)
          && aiRecommendationMatchesPeriod(candidate, analyticsPeriod)
          && isEvidenceBoundRecommendation(candidate.recommended_action, metric as any);
      }),
      recommendationAssignments.usedCandidateIds,
      recommendationAssignments.usedActionKeys,
    );
    const evidenceHref = metrics.includes("visitorOrigins")
      ? "#analytics-origins"
      : metrics.includes("establishmentPerformance")
        ? "#analytics-performance"
        : "#analytics-trends";
    const totalFindings = related.length + standalone.length;
    return (
      <div className="mt-5 border-t border-slate-200 pt-5" aria-label="AI findings related to this chart">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h4 className="text-sm font-semibold text-slate-900">Related AI findings and recommendations</h4>
            <p className="mt-1 text-xs text-slate-500">All valid evidence-matched findings for the active chart and reporting filter are shown.</p>
          </div>
          <button type="button" onClick={refreshAiInsights} disabled={refreshingAi} className="inline-flex items-center gap-2 rounded-xl bg-[#193364] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0E5A72] disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw className={`size-4 ${refreshingAi ? "animate-spin" : ""}`} aria-hidden="true" />
            {refreshingAi ? "Refreshing…" : "Refresh AI analysis"}
          </button>
        </div>
        {aiRefreshError && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{aiRefreshError}</p>}
        {totalFindings === 0 && !aiRefreshError && <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">No evidence-matched finding is available for this chart yet. Refresh AI analysis to generate current metric-specific guidance.</p>}
        {totalFindings > 0 && (
          <>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-800">{totalFindings} finding{totalFindings === 1 ? "" : "s"}</p>
            <div className={`grid grid-cols-1 gap-4 ${totalFindings > 1 ? "xl:grid-cols-2" : ""}`}>
              {related.map((anomaly) => {
                const matchingInsight = recommendationAssignments.assignments.get(anomaly.id);
                const fallback = evidenceAwareFallbackDecisionSupport(anomaly);
                const trustedCachedInsight = matchingInsight && isEvidenceBoundRecommendation(matchingInsight.recommended_action, String(anomaly.input_snapshot?.metric || "") as any) ? matchingInsight : null;
                return <AiAnomalyCard key={anomaly.id} {...anomaly} aiRecommendation={fallback?.recommended_actions?.[0]?.action_description || trustedCachedInsight?.recommended_action || null} decisionSupport={fallback || (trustedCachedInsight?.input_snapshot?.decision_support as AiDecisionSupport | undefined)} showRecommendationUnavailable={!fallback && !trustedCachedInsight} evidenceHref={evidenceHref} evidenceLabel="chart evidence" />;
              })}
              {standalone.map((insight) => <AiRecommendationCard key={insight.id} {...insight} evidenceHref={evidenceHref} evidenceLabel="chart evidence" />)}
            </div>
          </>
        )}
      </div>
    );
  };

  const patternOptions: Array<{ value: AnalyticsPattern; label: string }> = [
    { value: "all", label: "All patterns" },
    { value: "unusual-decline", label: "Unusual visitor decline" },
    { value: "seasonal-peak", label: "Seasonal pattern" },
  ];
  const verifiedChartMonths = new Set(anomalyMarkers.map((item) => String(item.month)));
  const chartData = analysisPattern === "all"
    ? data.seasonalData
    : analysisPattern === "seasonal-peak"
      ? data.seasonalData
    : data.seasonalData.map((item, index) => {
      const month = `${selectedYear}-${String(index + 1).padStart(2, "0")}`;
      return verifiedChartMonths.has(month) ? item : { ...item, visitors: null, guestCheckIns: null };
    });

  return (
    <div className="space-y-6">
      <PageHero
        eyebrow="Tourism intelligence"
        title="Analytics Dashboard"
        description={`Data-driven tourism analytics and decision support for the selected reporting period. Rankings, charts, origins, and performance findings use the active filter.`}
        compact
      >
      </PageHero>

      <div className="grid grid-cols-3 gap-2 sm:gap-4 lg:gap-6" data-analytics-kpi-row="mobile-one-row">
        <div className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm sm:p-5 lg:min-h-[164px] lg:p-6">
          <div className="mb-1.5 flex items-center justify-between gap-1 lg:mb-3">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm lg:text-base">Peak Visitor Month</p>
            <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-600 sm:h-5 sm:w-5" />
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl lg:text-3xl">{data.peakSeason.month || "N/A"}</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-green-600 sm:text-sm lg:mt-2 lg:text-base">
            {data.peakSeason.activity.toLocaleString()} day-tour visitors
          </p>
          <p className="mt-1 hidden truncate text-[10px] leading-tight text-gray-500 sm:block sm:text-xs lg:mt-2 lg:text-sm">
            {data.peakSeason.visitors.toLocaleString()} day-tour visitors · {data.peakSeason.guestCheckIns.toLocaleString()} guest check-ins
          </p>
        </div>
        <div className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm sm:p-5 lg:min-h-[164px] lg:p-6">
          <div className="mb-1.5 flex items-center justify-between gap-1 lg:mb-3">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm lg:text-base">Top Origin</p>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-purple-600 sm:h-5 sm:w-5" />
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl lg:text-3xl">{data.topOrigin.location || "N/A"}</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-purple-600 sm:text-sm lg:mt-2 lg:text-base">{data.topOrigin.percentage}% visitors</p>
        </div>
        <div className="flex min-h-0 flex-col rounded-lg border border-gray-200 bg-white p-2.5 shadow-sm sm:p-5 lg:min-h-[164px] lg:p-6">
          <div className="mb-1.5 flex items-center justify-between gap-1 lg:mb-3">
            <p className="text-[10px] font-medium leading-tight text-gray-600 sm:text-sm lg:text-base">Latest Growth</p>
            {data.growthRate === null ? null : data.growthRate >= 0 ? (
              <TrendingUp className="h-3.5 w-3.5 shrink-0 text-green-600 sm:h-5 sm:w-5" />
            ) : (
              <TrendingDown className="h-3.5 w-3.5 shrink-0 text-red-600 sm:h-5 sm:w-5" />
            )}
          </div>
          <p className="truncate text-base font-bold leading-tight text-gray-900 sm:text-2xl lg:text-3xl">{data.growthRate === null ? "N/A" : `${data.growthRate.toFixed(1)}%`}</p>
          <p className="mt-1 truncate text-[10px] leading-tight text-orange-600 sm:text-sm lg:mt-2 lg:text-base">{data.growthRate === null ? "Not enough monthly data" : "Month over month"}</p>
        </div>
      </div>

      <div id="analytics-trends" className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-3 border-b border-gray-200 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-base font-semibold text-gray-900 sm:text-lg">Tourism Trends and Seasonal Patterns ({getAnalyticsYearRange(selectedYear).label})</h3>
            {anomalyMarkers.length > 0 && <p className="mt-1 text-xs font-medium text-red-700">Red markers identify periods with verified unusual declines. Review the related finding below for the evidence.</p>}
          </div>
          {panelFilter("Filter this chart")}
        </div>
        <div className="mt-3 rounded-2xl bg-slate-50 p-3" aria-label="Tourism pattern chart filter">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-500">Show pattern on this chart</p>
            <button type="button" onClick={() => setAnalysisPattern("all")} className="text-xs font-semibold text-[#193364] underline underline-offset-2">Reset chart filter</button>
          </div>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Tourism pattern filter">
            {patternOptions.map((option) => <button key={option.value} type="button" aria-pressed={analysisPattern === option.value} onClick={() => setAnalysisPattern(option.value)} className={`rounded-full px-3 py-2 text-xs font-semibold transition ${analysisPattern === option.value ? "bg-[#6C63FF] text-white shadow-inner" : "bg-white text-slate-700 shadow-sm"}`}>{option.label}</button>)}
          </div>
        </div>
        {chartData.length > 0 ? (
          <div className="-mx-2 sm:mx-0">
            <ResponsiveContainer width="100%" height={350}>
              <AreaChart data={chartData} margin={{ top: 8, right: 4, left: 4, bottom: 8 }}>
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
              {(analysisPattern === "all" || analysisPattern === "unusual-decline") && anomalyMarkers.filter((item) => item.metric === "dayTourVisitors").map((item) => (
                <ReferenceDot key={`day-tour-${item.anomaly.id}`} x={monthLabel(`${String(item.month)}-01`)} y={item.value} r={7} fill="#B42318" stroke="#fff" strokeWidth={2} isFront label={{ value: "Drop", position: "top", offset: 14, fill: "#B42318", fontSize: 11, fontWeight: 700 }} />
              ))}
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
              {(analysisPattern === "all" || analysisPattern === "unusual-decline") && anomalyMarkers.filter((item) => item.metric === "overnightGuestCheckIns").map((item) => (
                <ReferenceDot key={`overnight-${item.anomaly.id}`} x={monthLabel(`${String(item.month)}-01`)} y={item.value} r={7} fill="#B42318" stroke="#fff" strokeWidth={2} isFront label={{ value: "Drop", position: "top", offset: 14, fill: "#B42318", fontSize: 11, fontWeight: 700 }} />
              ))}
              {seasonalPeak && (analysisPattern === "all" || analysisPattern === "seasonal-peak") && <>
                <ReferenceDot x={seasonalPeak.month} y={seasonalPeak.visitors} r={7} fill="#193364" stroke="#fff" strokeWidth={2} isFront label={{ value: "Peak", position: "bottom", offset: 12, fill: "#193364", fontSize: 11, fontWeight: 700 }} />
                <ReferenceDot x={seasonalPeak.month} y={seasonalPeak.guestCheckIns} r={7} fill="#D69A3A" stroke="#fff" strokeWidth={2} isFront />
              </>}
            </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-500">No seasonal data available</div>
        )}
        {renderRelatedAiFindings(["dayTourVisitors", "overnightGuestCheckIns", "seasonality"])}
      </div>

      <div id="analytics-origins" className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-gray-200 p-6 sm:flex-row sm:items-start sm:justify-between">
          <h3 className="text-lg font-semibold text-gray-900">Visitor Origins & Actual Growth</h3>
          {panelFilter("Filter this table")}
        </div>
        <div ref={originsTableRef} className="max-h-[20rem] overflow-auto overscroll-contain touch-none [-webkit-overflow-scrolling:touch]" aria-label="Visitor origins table; scroll to view more than five locations">
          <table className="w-full min-w-[23rem] table-fixed sm:min-w-0">
                      <colgroup>
                        <col className="w-[6rem] sm:w-1/4" />
                        <col className="w-[5rem] sm:w-1/4" />
                        <col className="w-[6rem] sm:w-1/4" />
                        <col className="w-[6rem] sm:w-1/4" />
            </colgroup>
            <thead className="sticky top-0 z-10 bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="sticky left-0 z-20 bg-gray-50 px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-700 shadow-[2px_0_4px_rgba(148,163,184,0.24)] sm:px-6 sm:py-3 sm:text-xs">Location</th>
                <th className="px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Visitors</th>
                <th className="px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Growth Rate</th>
                <th className="px-2 py-1.5 text-left text-[9px] font-semibold uppercase tracking-wider text-gray-700 sm:px-6 sm:py-3 sm:text-xs">Trend</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {data.visitorOrigins.length > 0 ? (
                data.visitorOrigins.map((origin, index) => (
                  <tr key={index} className="group hover:bg-gray-50">
                    <td className="sticky left-0 z-10 bg-white px-2 py-1.5 text-[10px] font-medium text-gray-900 shadow-[2px_0_4px_rgba(148,163,184,0.18)] group-hover:bg-gray-50 sm:px-6 sm:py-4 sm:text-sm">{origin.location}</td>
                    <td className="px-2 py-1.5 text-[10px] text-gray-900 sm:px-6 sm:py-4 sm:text-sm">{origin.visitors.toLocaleString()}</td>
                    <td className="px-2 py-1.5 sm:px-6 sm:py-4">
                      <span className={`text-[10px] font-medium sm:text-sm ${origin.growth === null ? "text-gray-500" : origin.growth >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {origin.growth === null ? "N/A" : `${origin.growth >= 0 ? "+" : ""}${origin.growth.toFixed(1)}%`}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 text-[10px] sm:px-6 sm:py-4 sm:text-sm">
                      <div className={`flex items-center gap-1 ${origin.growth === null ? "text-gray-500" : origin.growth >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {origin.growth === null ? null : origin.growth >= 0 ? <TrendingUp className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> : <TrendingDown className="h-3.5 w-3.5 sm:h-4 sm:w-4" />}
                        <span className="text-[10px] font-medium sm:text-sm">{origin.growth === null ? "No prior-period data" : origin.growth >= 0 ? "Growing" : "Declining"}</span>
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
        {renderRelatedAiFindings(["visitorOrigins"])}
      </div>

      <div id="analytics-performance">
        <EstablishmentPerformanceDashboard periods={data.performancePeriods} year={selectedYear} aiFindings={renderRelatedAiFindings(["establishmentPerformance"])} />
      </div>

    </div>
  );
}