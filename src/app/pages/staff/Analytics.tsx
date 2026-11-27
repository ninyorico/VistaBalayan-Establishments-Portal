import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, BedDouble, Calendar, LineChart as LineChartIcon, Moon, PieChart, RefreshCw, TrendingUp, UsersRound } from "lucide-react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Legend, PieChart as RechartsPieChart, Pie as RechartsPie, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../../lib/supabase";
import { canSubmitAccommodationReport, canSubmitVisitorReport, getEstablishmentReportingMode } from "../../../lib/establishmentReportForms";
import { currentMonthKey, currentYear, buildAccommodationMonthlySeries, buildVisitorMonthlySeries, isOfficialReport, residenceTotals, toNumber, type AccommodationReport, type VisitorReport } from "../../../lib/staffAnalytics";
import { LoadingState, MetricCard, PageHero } from "../../components/vista/PolishedShell";
import DataState from "../../components/DataState";
import { AiAnomalyCard, AiRecommendationCard } from "../../components/vista/AiInsightsDesign";
import { MAX_AI_ITEMS } from "../../../lib/aiInsights";
import { geminiService } from "../../../services/geminiService";
import { selectTourismRecommendationStrategies } from "../../../lib/tourismRecommendationStrategies.js";

const AI_RULE_VERSION = "decision-support-v12";

const chartClass = "rounded-3xl border border-[#AFB3B5]/45 bg-[#F5F8FF]/88 p-4 shadow-tourism sm:p-6";

type AnalyticsMetric = { label: string; value: ReactNode; helper: string; icon: typeof UsersRound; tone: string };

const MetricGrid = ({ metrics }: { metrics: AnalyticsMetric[] }) => {
  const alignValues = metrics.length >= 6;
  const desktopColumns = metrics.length >= 7 ? "lg:grid-cols-7" : metrics.length === 6 ? "lg:grid-cols-6" : metrics.length === 5 ? "lg:grid-cols-5" : "lg:grid-cols-4";

  return (
    <div className={`grid grid-cols-2 gap-3 ${desktopColumns}`}>
      {metrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} icon={metric.icon} tone={metric.tone} compact alignValue={alignValues} className="bg-[#f8fbf8] shadow-none" />)}
    </div>
  );
};

const ChartTitle = ({ icon: Icon, children }: { icon: typeof BarChart3; children: ReactNode }) => (
  <div className="mb-4 flex items-center gap-2"><Icon className="h-5 w-5 text-[#193364]" /><h3 className="text-lg font-semibold text-[#0B2530]">{children}</h3></div>
);

const residenceChartColors = ["#193364", "#D69A3A", "#6C9772", "#E9C98A", "#6C63FF", "#E65355", "#8B7AA8", "#C08A5A"];

const ResidencePieChart = ({ data }: { data: { residence: string; visitors: number }[] }) => (
  <ResponsiveContainer width="100%" height={340}>
    <RechartsPieChart>
      <Tooltip />
      <Legend />
      <RechartsPie
        data={data}
        dataKey="visitors"
        nameKey="residence"
        cx="50%"
        cy="45%"
        outerRadius="68%"
        paddingAngle={2}
      >
        {data.map((entry, index) => <Cell key={`${entry.residence}-${index}`} fill={residenceChartColors[index % residenceChartColors.length]} />)}
      </RechartsPie>
    </RechartsPieChart>
  </ResponsiveContainer>
);

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ kind: "error" | "session-expired"; message: string } | null>(null);
  const [establishment, setEstablishment] = useState<any>(null);
  const [visitorReports, setVisitorReports] = useState<VisitorReport[]>([]);
  const [accommodationReports, setAccommodationReports] = useState<AccommodationReport[]>([]);
  const [selectedYear, setSelectedYear] = useState(currentYear());
  const [aiAnomalies, setAiAnomalies] = useState<any[]>([]);
  const [aiRecommendations, setAiRecommendations] = useState<any[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadAiFindings = async (establishmentId: string, allowStaleRefresh = true) => {
    setAiLoading(true);
    setAiError(null);
    const [{ data: anomalyData, error: anomalyError }, { data: recommendationData, error: recommendationError }] = await Promise.all([
      supabase.from("ai_anomalies_cache").select("*").eq("establishment_id", establishmentId).eq("status", "active").eq("is_resolved", false).order("detected_at", { ascending: false }).limit(MAX_AI_ITEMS),
      supabase.from("ai_recommendations").select("*").eq("establishment_id", establishmentId).eq("status", "active").order("created_at", { ascending: false }).limit(MAX_AI_ITEMS),
    ]);
    if (!anomalyError && !recommendationError && allowStaleRefresh && ((anomalyData || []).length > 0 || (recommendationData || []).length > 0)) {
      const hasCurrentRule = [...(anomalyData || []), ...(recommendationData || [])].some((row: any) => row.input_snapshot?.rule_version === AI_RULE_VERSION);
      if (!hasCurrentRule) {
        try {
          await geminiService.generateForEstablishment({
            selectedStartDate: `${selectedYear}-01-01`,
            selectedEndDate: `${selectedYear}-12-31`,
            label: `Year ${selectedYear}`,
          });
          return loadAiFindings(establishmentId, false);
        } catch (error) {
          console.error("Error refreshing stale establishment AI findings:", error);
          setAiAnomalies([]);
          setAiRecommendations([]);
          setAiError("Saved AI findings are outdated and could not be refreshed. Retry the analysis.");
          setAiLoading(false);
          return;
        }
      }
    }
    if (anomalyError || recommendationError) {
      console.error("Error loading establishment AI findings:", anomalyError || recommendationError);
      setAiError("AI findings could not be loaded. Retry from this Analytics page.");
    } else {
      const visibleAnomalies = (anomalyData || []).filter((row: any) => {
        const month = String(row.input_snapshot?.current_month || "");
        return !month || month.startsWith(String(selectedYear));
      });
      const visibleRecommendations = (recommendationData || []).filter((row: any) => {
        const snapshot = row.input_snapshot || {};
        const sameFinding = visibleAnomalies.some((anomaly: any) => String(anomaly.input_snapshot?.metric || "") === String(snapshot.metric || "") && String(anomaly.input_snapshot?.current_month || "") === String(snapshot.current_month || ""));
        const title = String(row.title || "").toLowerCase();
        return !sameFinding && !/complete reporting compliance maintained|reporting compliance maintained/.test(title);
      });
      setAiAnomalies(visibleAnomalies);
      setAiRecommendations(visibleRecommendations);
    }
    setAiLoading(false);
  };

  const refreshAiFindings = async () => {
    if (!establishment?.id) return;
    setAiLoading(true);
    setAiError(null);
    try {
      await geminiService.generateForEstablishment({
        selectedStartDate: `${selectedYear}-01-01`,
        selectedEndDate: `${selectedYear}-12-31`,
        label: `Year ${selectedYear}`,
      });
      await loadAiFindings(establishment.id);
    } catch (error) {
      console.error("Error refreshing establishment AI findings:", error);
      setAiError("AI refresh failed. The saved findings remain available.");
      setAiLoading(false);
    }
  };

  const evidenceBoundDecisionSupport = (anomaly: any) => {
    const evidence = anomaly.input_snapshot || {};
    const selected = selectTourismRecommendationStrategies(evidence, {
      scope: "establishment",
      establishmentId: establishment?.id,
      establishmentName: establishment?.name,
      metric: String(evidence.metric || ""),
      periodLabel: String(evidence.current_month || "the selected reporting period"),
    });
    const firstAction = selected.actions[0];
    if (!firstAction) return null;
    return {
      insight_category: firstAction.action_category,
      data_limitations: ["This action uses verified report evidence and does not establish a cause", ...(selected.dataLimitations || [])],
      decision_implication: selected.decisionImplication,
      recommended_actions: selected.actions.slice(0, 2),
      validation_required: selected.actions.slice(0, 2).some((action) => action.validation_required),
    };
  };

  useEffect(() => { loadAnalytics(); }, []);
  useEffect(() => {
    if (establishment?.id) loadAiFindings(establishment.id, false);
  }, [selectedYear, establishment?.id]);

  const loadAnalytics = async () => {
    setLoading(true);
    setLoadError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoadError({ kind: "session-expired", message: "Your staff session has expired. Sign in again to continue." });
      setLoading(false);
      return;
    }
    const { data: profile, error: profileError } = await supabase.from("profiles").select("id, establishment_id").eq("id", user.id).maybeSingle();
    if (profileError) {
      console.error("Error fetching analytics profile:", profileError);
      setLoadError({ kind: "error", message: "The analytics service returned an error. Please retry." });
      setLoading(false);
      return;
    }
    if (!profile?.establishment_id) { setLoading(false); return; }

    const { data: establishmentData, error: establishmentError } = await supabase.from("establishments").select("id,name,type,total_rooms,reporting_mode").eq("id", profile.establishment_id).maybeSingle();
    if (establishmentError) {
      console.error("Error fetching analytics establishment:", establishmentError);
      setLoadError({ kind: "error", message: "The analytics service returned an error. Please retry." });
      setLoading(false);
      return;
    }
    const [visitorResult, accommodationResult] = await Promise.all([
      supabase.from("visitor_reports").select("id, report_date, created_at, total_guests, total_male, total_female, residence_type, status").eq("establishment_id", profile.establishment_id).order("report_date", { ascending: true }),
      supabase.from("accommodation_reports").select("id, report_date, created_at, total_rooms, total_occupied_rooms, total_check_ins, total_guest_nights, status").eq("establishment_id", profile.establishment_id).order("report_date", { ascending: true }),
    ]);
    if (visitorResult.error || accommodationResult.error) {
      console.error("Error fetching analytics reports:", visitorResult.error || accommodationResult.error);
      setLoadError({ kind: "error", message: "The analytics service returned an error. Please retry." });
      setLoading(false);
      return;
    }
    setEstablishment(establishmentData);
    setVisitorReports(((visitorResult.data || []) as VisitorReport[]).filter(isOfficialReport));
    setAccommodationReports(((accommodationResult.data || []) as AccommodationReport[]).filter(isOfficialReport));
    await loadAiFindings(profile.establishment_id);
    setLoading(false);
  };

  const mode = getEstablishmentReportingMode(establishment);
  const showVisitorAnalytics = canSubmitVisitorReport(establishment);
  const showAccommodationAnalytics = canSubmitAccommodationReport(establishment);
  const yearOptions = useMemo(() => {
    const years = [...visitorReports, ...accommodationReports]
      .map((report) => Number((report.report_date || report.created_at || "").slice(0, 4)))
      .filter((value) => Number.isFinite(value) && value > 2000);
    return Array.from(new Set([currentYear(), ...years])).sort((a, b) => b - a);
  }, [visitorReports, accommodationReports]);
  const year = selectedYear;
  const monthKey = `${year}-${currentMonthKey().slice(5)}`;
  const visitorYearReports = visitorReports.filter((report) => (report.report_date || report.created_at || "").startsWith(String(year)));
  const accommodationYearReports = accommodationReports.filter((report) => (report.report_date || report.created_at || "").startsWith(String(year)));
  const visitorMonths = useMemo(() => buildVisitorMonthlySeries(visitorYearReports, year), [visitorYearReports, year]);
  const accommodationMonths = useMemo(() => buildAccommodationMonthlySeries(accommodationYearReports, year), [accommodationYearReports, year]);
  const currentVisitorMonth = visitorMonths.find((month) => month.monthKey === monthKey) || visitorMonths[0];
  const currentAccommodationMonth = accommodationMonths.find((month) => month.monthKey === monthKey) || accommodationMonths[0];
  const currentVisitorReports = visitorYearReports.filter((report) => (report.report_date || report.created_at || "").startsWith(monthKey));
  const currentAccommodationReports = accommodationYearReports.filter((report) => (report.report_date || report.created_at || "").startsWith(monthKey));
  const currentResidenceData = useMemo(() => residenceTotals(visitorYearReports), [visitorYearReports]);
  const currentYearMale = visitorYearReports.reduce((sum, report) => sum + toNumber(report.total_male), 0);
  const currentYearFemale = visitorYearReports.reduce((sum, report) => sum + toNumber(report.total_female), 0);
  const currentMonthMale = currentVisitorMonth?.male || 0;
  const currentMonthFemale = currentVisitorMonth?.female || 0;
  const visitorBestMonth = visitorMonths.reduce((best, month) => month.visitors > best.visitors ? month : best, visitorMonths[0]);
  const accommodationBestMonth = accommodationMonths.reduce((best, month) => month.checkIns > best.checkIns ? month : best, accommodationMonths[0]);
  const visitorTotal = visitorYearReports.reduce((sum, report) => sum + toNumber(report.total_guests), 0);
  const currentMonthVisitorTotal = currentVisitorMonth?.visitors || 0;
  const currentMonthCheckIns = currentAccommodationMonth?.checkIns || 0;
  const currentMonthGuestNights = currentAccommodationMonth?.guestNights || 0;
  const currentMonthCombined = currentMonthVisitorTotal + currentMonthCheckIns;
  const combinedReportCount = currentVisitorReports.length + currentAccommodationReports.length;
  const currentMonthDemographicTotal = currentMonthMale + currentMonthFemale;
  const currentYearDemographicTotal = currentYearMale + currentYearFemale;
  const demographicValue: ReactNode = currentMonthDemographicTotal > 0
    ? <span aria-label={`${currentMonthMale.toLocaleString()} Male / ${currentMonthFemale.toLocaleString()} Female`} className="block whitespace-nowrap">{currentMonthMale.toLocaleString()} M / {currentMonthFemale.toLocaleString()} F</span>
    : "No data";
  const demographicHelper = "current month";

  if (loading) return <LoadingState label="Loading establishment analytics" />;
  if (loadError) return <DataState state={loadError.kind} message={loadError.message} onRetry={loadAnalytics} />;
  if (!establishment) return <DataState state="empty" message="No active establishment profile is assigned to this account." />;

  const visitorMetrics: AnalyticsMetric[] = [
    { label: "Monthly Day-tour Count", value: currentMonthVisitorTotal.toLocaleString(), helper: "current month visitors", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { label: "Monthly Male Visitors", value: currentMonthMale.toLocaleString(), helper: `current month · ${year}`, icon: UsersRound, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { label: "Monthly Female Visitors", value: currentMonthFemale.toLocaleString(), helper: `current month · ${year}`, icon: UsersRound, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
    { label: "Best Performing Month", value: visitorBestMonth?.month || "No data", helper: `${(visitorBestMonth?.visitors || 0).toLocaleString()} visitors · ${year}`, icon: TrendingUp, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  ];
  const accommodationMetrics: AnalyticsMetric[] = [
    { label: "Monthly Average Occupied Rooms", value: (currentAccommodationMonth?.averageOccupiedRooms || 0).toFixed(2), helper: "occupied rooms per report", icon: BedDouble, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { label: "Monthly Average Guest Per Room", value: (currentAccommodationMonth?.guestsPerRoom || 0).toFixed(2), helper: "current month", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { label: "Monthly Total Check-ins", value: currentMonthCheckIns.toLocaleString(), helper: "current month", icon: UsersRound, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { label: "Monthly Average Guest Night", value: (currentAccommodationMonth?.guestNightAverage || 0).toFixed(2), helper: "nights per check-in", icon: Moon, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
    { label: "Best Performing Month", value: accommodationBestMonth?.month || "No data", helper: `${(accommodationBestMonth?.checkIns || 0).toLocaleString()} check-ins · ${(accommodationBestMonth?.guestNights || 0).toLocaleString()} guest nights`, icon: TrendingUp, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  ];
  const combinedMetrics: AnalyticsMetric[] = [
    { label: "Monthly Day-tour Arrivals", value: currentMonthVisitorTotal.toLocaleString(), helper: "current month", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { label: "Monthly Total Check-ins", value: currentMonthCheckIns.toLocaleString(), helper: "current month", icon: UsersRound, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { label: "Monthly Average Arrivals", value: (combinedReportCount > 0 ? currentMonthCombined / combinedReportCount : 0).toFixed(2), helper: "day-tour + check-ins/report", icon: Calendar, tone: "bg-cyan-50 text-cyan-700 ring-cyan-100" },
    { label: "Monthly Demographics", value: demographicValue, helper: demographicHelper, icon: PieChart, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { label: "Monthly Average Occupied Rooms", value: (currentAccommodationMonth?.averageOccupiedRooms || 0).toFixed(2), helper: "occupied rooms per report", icon: BedDouble, tone: "bg-purple-50 text-purple-700 ring-purple-100" },
    { label: "Monthly Average Guests per Room", value: (currentAccommodationMonth?.guestsPerRoom || 0).toFixed(2), helper: "current month", icon: UsersRound, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
    { label: "Best Performing Month", value: accommodationBestMonth?.month || "No data", helper: `${(accommodationBestMonth?.checkIns || 0).toLocaleString()} check-ins · ${(accommodationBestMonth?.guestNights || 0).toLocaleString()} guest nights`, icon: TrendingUp, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  ];

  return (
    <div className="space-y-6" data-staff-analytics-mode={mode}>
      <PageHero
        eyebrow="Establishment portal"
        title="Establishment Analytics"
        description={`Yearly and monthly performance for ${establishment.name || "your establishment"}.`}
        compact
      >
        <select
          value={selectedYear}
          onChange={(event) => setSelectedYear(Number(event.target.value))}
          className="h-10 w-full min-w-[8rem] rounded-2xl border border-white/70 bg-white px-4 text-sm font-bold text-[#0B2530] shadow-[0_6px_14px_rgba(7,59,76,0.16)] outline-none transition focus:ring-2 focus:ring-cyan-200/80 sm:h-12 sm:w-auto"
          aria-label="Filter analytics by reporting year"
        >
          {yearOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </PageHero>

      <section className={chartClass} aria-labelledby="staff-analytics-ai-heading">
        <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 id="staff-analytics-ai-heading" className="text-lg font-semibold text-[#0B2530]">AI findings for this Analytics view</h2>
            <p className="mt-1 text-sm text-slate-600">Evidence-bound findings for {establishment.name || "this establishment"}. AI remains advisory and does not replace officer review.</p>
          </div>
          <button type="button" onClick={refreshAiFindings} disabled={aiLoading} className="inline-flex items-center gap-2 rounded-xl bg-[#193364] px-3 py-2 text-xs font-semibold text-white shadow-sm transition hover:bg-[#0E5A72] disabled:cursor-not-allowed disabled:opacity-60">
            <RefreshCw className={`size-4 ${aiLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            {aiLoading ? "Refreshing…" : "Refresh AI analysis"}
          </button>
        </div>
        {aiError && <p role="alert" className="mb-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{aiError}</p>}
        {!aiError && aiAnomalies.length === 0 && aiRecommendations.length === 0 && <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">No saved AI finding is available for this establishment yet.</p>}
        {(aiAnomalies.length > 0 || aiRecommendations.length > 0) && <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {aiAnomalies.map((anomaly) => {
            const decisionSupport = evidenceBoundDecisionSupport(anomaly);
            return <AiAnomalyCard key={anomaly.id} {...anomaly} establishments={{ name: establishment.name || "This establishment" }} decisionSupport={decisionSupport} aiRecommendation={decisionSupport?.recommended_actions?.[0]?.action_description || null} showRecommendationUnavailable={!decisionSupport} evidenceHref="#staff-analytics-charts" evidenceLabel="analytics charts" />;
          })}
          {aiRecommendations.map((recommendation) => <AiRecommendationCard key={recommendation.id} {...recommendation} evidenceHref="#staff-analytics-charts" evidenceLabel="analytics charts" />)}
        </div>}
      </section>

      <div id="staff-analytics-charts">

      {mode === "visitor" && showVisitorAnalytics && <>
        <MetricGrid metrics={visitorMetrics} />
        <div className={chartClass}><ChartTitle icon={LineChartIcon}>Visitor Count Trends ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><AreaChart data={visitorMonths}><CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Area type="monotone" dataKey="visitors" stroke="#193364" fill="#193364" fillOpacity={0.28} dot={{ r: 3, strokeWidth: 1, fill: "#193364" }} activeDot={{ r: 5 }} strokeWidth={2} name="Visitors" /><Area type="monotone" dataKey="male" stroke="#193364" fill="#193364" fillOpacity={0.2} dot={{ r: 3, strokeWidth: 1, fill: "#193364" }} activeDot={{ r: 5 }} strokeWidth={2} name="Male" /><Area type="monotone" dataKey="female" stroke="#D69A3A" fill="#D69A3A" fillOpacity={0.18} dot={{ r: 3, strokeWidth: 1, fill: "#D69A3A" }} activeDot={{ r: 5 }} strokeWidth={2} name="Female" /></AreaChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={BarChart3}>Visitor Demographics by Residence ({year})</ChartTitle><ResidencePieChart data={currentResidenceData} /></div>
      </>}

      {mode === "accommodation" && showAccommodationAnalytics && <>
        <MetricGrid metrics={accommodationMetrics} />
        <div className={chartClass}><ChartTitle icon={BarChart3}>Monthly Performance Overview ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><BarChart data={accommodationMonths}><CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="checkIns" fill="#193364" name="Check-ins" /><Bar dataKey="guestNights" fill="#D69A3A" name="Guest Nights" /></BarChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={TrendingUp}>Occupancy Rate and Guests per Room Trend ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><AreaChart data={accommodationMonths}><CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Area type="monotone" dataKey="occupancyRate" stroke="#193364" fill="#193364" fillOpacity={0.2} dot={{ r: 3, strokeWidth: 1, fill: "#193364" }} activeDot={{ r: 5 }} strokeWidth={2} name="Occupancy Rate %" /><Area type="monotone" dataKey="guestsPerRoom" stroke="#D69A3A" fill="#D69A3A" fillOpacity={0.2} dot={{ r: 3, strokeWidth: 1, fill: "#D69A3A" }} activeDot={{ r: 5 }} strokeWidth={2} name="Guests per Room" /></AreaChart></ResponsiveContainer></div>
      </>}

      {mode === "both" && showVisitorAnalytics && showAccommodationAnalytics && <>
        <MetricGrid metrics={combinedMetrics} />
        <div className={chartClass}><ChartTitle icon={LineChartIcon}>Arrival & Visitor Trends ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><AreaChart data={visitorMonths.map((month, index) => ({ ...month, checkIns: accommodationMonths[index]?.checkIns || 0 }))}><CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Area type="monotone" dataKey="visitors" stroke="#193364" fill="#193364" fillOpacity={0.28} dot={{ r: 3, strokeWidth: 1, fill: "#193364" }} activeDot={{ r: 5 }} strokeWidth={2} name="Day-tour Visitors" /><Area type="monotone" dataKey="checkIns" stroke="#D69A3A" fill="#D69A3A" fillOpacity={0.2} dot={{ r: 3, strokeWidth: 1, fill: "#D69A3A" }} activeDot={{ r: 5 }} strokeWidth={2} name="Guest Check-ins" /></AreaChart></ResponsiveContainer></div>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className={chartClass}><ChartTitle icon={PieChart}>Visitor Demographics ({year})</ChartTitle><ResponsiveContainer width="100%" height={300}><BarChart data={[{ group: "Visitors", male: currentYearMale, female: currentYearFemale }]}><CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} /><XAxis dataKey="group" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="male" fill="#193364" name="Male" /><Bar dataKey="female" fill="#D69A3A" name="Female" /></BarChart></ResponsiveContainer></div>
          <div className={chartClass}><ChartTitle icon={BarChart3}>Visitor Demographics by Residence ({year})</ChartTitle><ResidencePieChart data={currentResidenceData} /></div>
        </div>
        <div className={chartClass}><ChartTitle icon={BarChart3}>Monthly Performance Overview ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><BarChart data={visitorMonths.map((month, index) => ({ month: month.month, dayTour: month.visitors, checkIns: accommodationMonths[index]?.checkIns || 0, guestNights: accommodationMonths[index]?.guestNights || 0 }))}><CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="dayTour" fill="#193364" name="Day-tour Visitors" /><Bar dataKey="checkIns" fill="#D69A3A" name="Guest Check-ins" /><Bar dataKey="guestNights" fill="#6C9772" name="Guest Nights" /></BarChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={TrendingUp}>Occupancy Rate and Guests per Room Trend ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><AreaChart data={accommodationMonths}><CartesianGrid strokeDasharray="3 3" vertical={true} horizontal={true} /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Area type="monotone" dataKey="occupancyRate" stroke="#193364" fill="#193364" fillOpacity={0.2} dot={{ r: 3, strokeWidth: 1, fill: "#193364" }} activeDot={{ r: 5 }} strokeWidth={2} name="Occupancy Rate %" /><Area type="monotone" dataKey="guestsPerRoom" stroke="#D69A3A" fill="#D69A3A" fillOpacity={0.2} dot={{ r: 3, strokeWidth: 1, fill: "#D69A3A" }} activeDot={{ r: 5 }} strokeWidth={2} name="Guests per Room" /></AreaChart></ResponsiveContainer></div>
      </>}
      </div>
    </div>
  );
}
