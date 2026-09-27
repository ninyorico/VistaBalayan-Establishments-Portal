import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, Calendar, LineChart as LineChartIcon, Moon, Percent, PieChart, TrendingUp, UsersRound } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../../../lib/supabase";
import { canSubmitAccommodationReport, canSubmitVisitorReport, getEstablishmentReportingMode } from "../../../lib/establishmentReportForms";
import { currentMonthKey, currentYear, buildAccommodationMonthlySeries, buildVisitorMonthlySeries, isOfficialReport, residenceTotals, toNumber, type AccommodationReport, type VisitorReport } from "../../../lib/staffAnalytics";
import { LoadingState, MetricCard } from "../../components/vista/PolishedShell";
import DataState from "../../components/DataState";

const panelClass = "rounded-3xl border border-[#C3CBD7] bg-[#E0E5EC] p-5 shadow-[8px_8px_15px_rgba(163,177,198,.48),-8px_-8px_15px_rgba(255,255,255,.48)] sm:p-6";
const chartClass = "rounded-3xl border border-[#AFB3B5]/45 bg-[#F5F8FF]/88 p-4 shadow-tourism sm:p-6";

type AnalyticsMetric = { label: string; value: string; helper: string; icon: typeof UsersRound; tone: string };

const MetricGrid = ({ metrics }: { metrics: AnalyticsMetric[] }) => (
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
    {metrics.map((metric) => <MetricCard key={metric.label} label={metric.label} value={metric.value} helper={metric.helper} icon={metric.icon} tone={metric.tone} compact className="bg-[#f8fbf8] shadow-none" />)}
  </div>
);

const ChartTitle = ({ icon: Icon, children }: { icon: typeof BarChart3; children: ReactNode }) => (
  <div className="mb-4 flex items-center gap-2"><Icon className="h-5 w-5 text-[#6474A5]" /><h3 className="text-lg font-semibold text-[#0B2530]">{children}</h3></div>
);

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ kind: "error" | "session-expired"; message: string } | null>(null);
  const [establishment, setEstablishment] = useState<any>(null);
  const [visitorReports, setVisitorReports] = useState<VisitorReport[]>([]);
  const [accommodationReports, setAccommodationReports] = useState<AccommodationReport[]>([]);

  useEffect(() => { loadAnalytics(); }, []);

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

    const { data: establishmentData, error: establishmentError } = await supabase.from("establishments").select("name,type,total_rooms,reporting_mode").eq("id", profile.establishment_id).maybeSingle();
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
    setLoading(false);
  };

  const mode = getEstablishmentReportingMode(establishment);
  const showVisitorAnalytics = canSubmitVisitorReport(establishment);
  const showAccommodationAnalytics = canSubmitAccommodationReport(establishment);
  const year = currentYear();
  const monthKey = currentMonthKey();
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
  const demographicValue = currentMonthDemographicTotal > 0
    ? `${currentMonthMale.toLocaleString()} Male / ${currentMonthFemale.toLocaleString()} Female`
    : "No data";
  const demographicHelper = "current month";

  if (loading) return <LoadingState label="Loading establishment analytics" />;
  if (loadError) return <DataState state={loadError.kind} message={loadError.message} onRetry={loadAnalytics} />;
  if (!establishment) return <DataState state="empty" message="No active establishment profile is assigned to this account." />;

  const visitorMetrics: AnalyticsMetric[] = [
    { label: "Monthly Day-tour Count", value: currentMonthVisitorTotal.toLocaleString(), helper: "current month visitors", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { label: "Monthly Male Visitors", value: currentMonthMale.toLocaleString(), helper: `current month · ${year}`, icon: UsersRound, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { label: "Monthly Female Visitors", value: currentMonthFemale.toLocaleString(), helper: `current month · ${year}`, icon: UsersRound, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
    { label: "Monthly Demographics", value: demographicValue, helper: demographicHelper, icon: PieChart, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  ];
  const accommodationMetrics: AnalyticsMetric[] = [
    { label: "Monthly Average Occupancy Rate", value: `${(currentAccommodationMonth?.occupancyRate || 0).toFixed(2)}%`, helper: "current month", icon: Percent, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { label: "Monthly Average Guest Per Room", value: (currentAccommodationMonth?.guestsPerRoom || 0).toFixed(2), helper: "current month", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { label: "Monthly Total Check-ins", value: currentMonthCheckIns.toLocaleString(), helper: "current month", icon: UsersRound, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { label: "Monthly Average Guest Night", value: (currentAccommodationMonth?.guestNightAverage || 0).toFixed(2), helper: "nights per check-in", icon: Moon, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
  ];
  const combinedMetrics: AnalyticsMetric[] = [
    { label: "Monthly Day-tour Arrivals", value: currentMonthVisitorTotal.toLocaleString(), helper: "current month", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { label: "Monthly Total Check-ins", value: currentMonthCheckIns.toLocaleString(), helper: "current month", icon: UsersRound, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { label: "Monthly Average Arrivals", value: (combinedReportCount > 0 ? currentMonthCombined / combinedReportCount : 0).toFixed(2), helper: "day-tour + check-ins per report", icon: Calendar, tone: "bg-cyan-50 text-cyan-700 ring-cyan-100" },
    { label: "Monthly Demographics", value: demographicValue, helper: demographicHelper, icon: PieChart, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { label: "Monthly Average Occupancy Rate", value: `${(currentAccommodationMonth?.occupancyRate || 0).toFixed(2)}%`, helper: "current month", icon: Percent, tone: "bg-purple-50 text-purple-700 ring-purple-100" },
    { label: "Monthly Average Guests per Room", value: (currentAccommodationMonth?.guestsPerRoom || 0).toFixed(2), helper: "current month", icon: UsersRound, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
  ];

  return (
    <div className="space-y-6" data-staff-analytics-mode={mode}>
      <div><h1 className="text-3xl font-bold text-[#0B2530]">Establishment Analytics</h1><p className="mt-1 text-[#5D6F73]">Current-year and current-month performance for {establishment.name || "your establishment"}.</p></div>

      {mode === "visitor" && showVisitorAnalytics && <>
        <MetricGrid metrics={visitorMetrics} />
        <div className={chartClass}><ChartTitle icon={LineChartIcon}>Visitor Count Trends ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><LineChart data={visitorMonths}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="visitors" stroke="#6474A5" strokeWidth={2} name="Visitors" /><Line type="monotone" dataKey="male" stroke="#6C63FF" strokeWidth={2} name="Male" /><Line type="monotone" dataKey="female" stroke="#B86B78" strokeWidth={2} name="Female" /></LineChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={BarChart3}>Visitor Demographics by Residence ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><BarChart data={currentResidenceData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="residence" interval={0} angle={-30} textAnchor="end" height={80} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="visitors" fill="#6474A5" name="Visitors" /></BarChart></ResponsiveContainer></div>
        <div className={panelClass}><h3 className="font-semibold text-[#0B2530]">Best Performing Month</h3><p className="mt-2 text-3xl font-bold text-[#0B2530]">{visitorBestMonth.month}</p><p className="mt-1 text-sm text-[#6474A5]">{visitorBestMonth.visitors.toLocaleString()} visitors · {visitorBestMonth.male.toLocaleString()} male · {visitorBestMonth.female.toLocaleString()} female</p></div>
      </>}

      {mode === "accommodation" && showAccommodationAnalytics && <>
        <MetricGrid metrics={accommodationMetrics} />
        <div className={chartClass}><ChartTitle icon={BarChart3}>Monthly Performance Overview ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><BarChart data={accommodationMonths}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="checkIns" fill="#6474A5" name="Check-ins" /><Bar dataKey="guestNights" fill="#6C63FF" name="Guest Nights" /></BarChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={TrendingUp}>Occupancy Rate and Guests per Room Trend ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><LineChart data={accommodationMonths}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="occupancyRate" stroke="#6C63FF" strokeWidth={2} name="Occupancy Rate %" /><Line type="monotone" dataKey="guestsPerRoom" stroke="#38B2AC" strokeWidth={2} name="Guests per Room" /></LineChart></ResponsiveContainer></div>
        <div className={panelClass}><h3 className="font-semibold text-[#0B2530]">Best Performing Month</h3><p className="mt-2 text-3xl font-bold text-[#0B2530]">{accommodationBestMonth.month}</p><p className="mt-1 text-sm text-[#6474A5]">{accommodationBestMonth.checkIns.toLocaleString()} check-ins · {accommodationBestMonth.guestNights.toLocaleString()} guest nights</p></div>
      </>}

      {mode === "both" && showVisitorAnalytics && showAccommodationAnalytics && <>
        <MetricGrid metrics={combinedMetrics} />
        <div className={chartClass}><ChartTitle icon={LineChartIcon}>Arrival & Visitor Trends ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><LineChart data={visitorMonths.map((month, index) => ({ ...month, checkIns: accommodationMonths[index]?.checkIns || 0 }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="visitors" stroke="#6474A5" strokeWidth={2} name="Day-tour Visitors" /><Line type="monotone" dataKey="checkIns" stroke="#38B2AC" strokeWidth={2} name="Guest Check-ins" /></LineChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={PieChart}>Visitor Demographics ({year})</ChartTitle><ResponsiveContainer width="100%" height={300}><BarChart data={[{ group: "Visitors", male: currentYearMale, female: currentYearFemale }]}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="group" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="male" fill="#6C63FF" name="Male" /><Bar dataKey="female" fill="#B86B78" name="Female" /></BarChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={BarChart3}>Visitor Demographics by Residence ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><BarChart data={currentResidenceData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="residence" interval={0} angle={-30} textAnchor="end" height={80} /><YAxis allowDecimals={false} /><Tooltip /><Bar dataKey="visitors" fill="#6474A5" name="Visitors" /></BarChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={BarChart3}>Monthly Performance Overview ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><BarChart data={visitorMonths.map((month, index) => ({ month: month.month, dayTour: month.visitors, checkIns: accommodationMonths[index]?.checkIns || 0, guestNights: accommodationMonths[index]?.guestNights || 0 }))}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Bar dataKey="dayTour" fill="#6474A5" name="Day-tour Visitors" /><Bar dataKey="checkIns" fill="#38B2AC" name="Guest Check-ins" /><Bar dataKey="guestNights" fill="#6C63FF" name="Guest Nights" /></BarChart></ResponsiveContainer></div>
        <div className={chartClass}><ChartTitle icon={TrendingUp}>Occupancy Rate and Guests per Room Trend ({year})</ChartTitle><ResponsiveContainer width="100%" height={340}><LineChart data={accommodationMonths}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Line type="monotone" dataKey="occupancyRate" stroke="#6C63FF" strokeWidth={2} name="Occupancy Rate %" /><Line type="monotone" dataKey="guestsPerRoom" stroke="#38B2AC" strokeWidth={2} name="Guests per Room" /></LineChart></ResponsiveContainer></div>
        <div className={panelClass}><h3 className="font-semibold text-[#0B2530]">Best Performing Month</h3><p className="mt-2 text-3xl font-bold text-[#0B2530]">{visitorBestMonth.month}</p><p className="mt-1 text-sm text-[#6474A5]">{visitorBestMonth.visitors.toLocaleString()} day-tour visitors · {accommodationMonths.find((month) => month.monthKey === visitorBestMonth.monthKey)?.checkIns.toLocaleString() || "0"} check-ins</p></div>
      </>}
    </div>
  );
}
