import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { AlertCircle, ArrowRight, Bed, Calendar, FileUp, History, Moon, Percent, UsersRound } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy, groupStaffSubmissions } from "../../../lib/reportMetrics";
import { canSubmitAccommodationReport, canSubmitVisitorReport, getEstablishmentReportingMode, getPrimaryReportFormLabel } from "../../../lib/establishmentReportForms";
import { average, isOfficialReport, toNumber, type AccommodationReport, type VisitorReport } from "../../../lib/staffAnalytics";
import { EmptyState, LoadingState, MetricCard, PageHero, PanelCard } from "../../components/vista/PolishedShell";
import DataState from "../../components/DataState";

const statusStyles = { submitted: "bg-emerald-50 text-emerald-700 ring-emerald-200" };

type DashboardMetric = { title: string; value: string; subtitle: string; icon: typeof UsersRound; tone: string };

export default function StaffDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [establishment, setEstablishment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<{ kind: "error" | "session-expired"; message: string } | null>(null);
  const [dashboardMetrics, setDashboardMetrics] = useState({
    visitorCount: 0,
    averageTouristArrival: 0,
    totalVisitorReports: 0,
    totalMale: 0,
    totalFemale: 0,
    averageGuestNight: 0,
    averageOccupancyRate: 0,
    averageGuestPerRoom: 0,
    totalAccommodationReports: 0,
    totalCheckIns: 0,
    totalGuestNights: 0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);

  useEffect(() => { loadUserAndData(); }, []);

  const loadUserAndData = async () => {
    setLoading(true);
    setLoadError(null);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      setLoadError({ kind: "session-expired", message: "Your staff session has expired. Sign in again to continue." });
      setLoading(false);
      return;
    }

    const { data: profileData, error: profileError } = await supabase.from("profiles").select("*").eq("id", user.id).maybeSingle();
    if (profileError) {
      console.error("Error fetching staff profile:", profileError);
      setLoadError({ kind: "error", message: "The dashboard service returned an error. Please retry." });
      setLoading(false);
      return;
    }
    setProfile(profileData);

    if (!profileData?.establishment_id) {
      setLoading(false);
      return;
    }

    const { data: establishmentData, error: establishmentError } = await supabase
      .from("establishments")
      .select("name,type,total_rooms,reporting_mode")
      .eq("id", profileData.establishment_id)
      .maybeSingle();
    if (establishmentError) {
      console.error("Error fetching establishment:", establishmentError);
      setLoadError({ kind: "error", message: "The dashboard service returned an error. Please retry." });
      setLoading(false);
      return;
    }
    setEstablishment(establishmentData);

    const [visitorResult, accommodationResult] = await Promise.all([
      supabase.from("visitor_reports").select("id, report_date, created_at, status, total_guests, total_male, total_female").eq("establishment_id", profileData.establishment_id).order("report_date", { ascending: false }),
      supabase.from("accommodation_reports").select("id, report_date, created_at, status, total_rooms, total_occupied_rooms, total_check_ins, total_guest_nights").eq("establishment_id", profileData.establishment_id).order("report_date", { ascending: false }),
    ]);
    if (visitorResult.error || accommodationResult.error) {
      console.error("Error fetching staff dashboard reports:", visitorResult.error || accommodationResult.error);
      setLoadError({ kind: "error", message: "The dashboard service returned an error. Please retry." });
      setLoading(false);
      return;
    }

    const visitorReports = ((visitorResult.data || []) as VisitorReport[]).filter(isOfficialReport);
    const accommodationReports = ((accommodationResult.data || []) as AccommodationReport[]).filter(isOfficialReport);
    const totalCheckIns = accommodationReports.reduce((sum, report) => sum + toNumber(report.total_check_ins), 0);
    const totalGuestNights = accommodationReports.reduce((sum, report) => sum + toNumber(report.total_guest_nights), 0);
    const totalOccupiedRooms = accommodationReports.reduce((sum, report) => sum + toNumber(report.total_occupied_rooms), 0);
    const occupancyRates = accommodationReports.map((report) => calculateAccommodationOccupancy(report.total_occupied_rooms, report.total_rooms, report.report_date));

    setDashboardMetrics({
      visitorCount: visitorReports.reduce((sum, report) => sum + toNumber(report.total_guests), 0),
      averageTouristArrival: visitorReports.length > 0 ? visitorReports.reduce((sum, report) => sum + toNumber(report.total_guests), 0) / visitorReports.length : 0,
      totalVisitorReports: visitorReports.length,
      totalMale: visitorReports.reduce((sum, report) => sum + toNumber(report.total_male), 0),
      totalFemale: visitorReports.reduce((sum, report) => sum + toNumber(report.total_female), 0),
      averageGuestNight: totalCheckIns > 0 ? totalGuestNights / totalCheckIns : 0,
      averageOccupancyRate: average(occupancyRates),
      averageGuestPerRoom: totalOccupiedRooms > 0 ? totalGuestNights / totalOccupiedRooms : 0,
      totalAccommodationReports: accommodationReports.length,
      totalCheckIns,
      totalGuestNights,
    });
    setRecentSubmissions(groupStaffSubmissions(visitorReports, accommodationReports).slice(0, 5));
    setLoading(false);
  };

  const showVisitorForm = canSubmitVisitorReport(establishment);
  const showAccommodationForm = canSubmitAccommodationReport(establishment);
  const mode = getEstablishmentReportingMode(establishment);
  const reportFormLabel = getPrimaryReportFormLabel(establishment);
  const demographicTotal = dashboardMetrics.totalMale + dashboardMetrics.totalFemale;
  const demographicValue = demographicTotal > 0
    ? `${dashboardMetrics.totalMale.toLocaleString()} Male / ${dashboardMetrics.totalFemale.toLocaleString()} Female`
    : "No data";
  const demographicSubtitle = `${dashboardMetrics.totalMale.toLocaleString()} male · ${dashboardMetrics.totalFemale.toLocaleString()} female`;

  const visitorMetrics: DashboardMetric[] = [
    { title: "Total Visitor Count", value: dashboardMetrics.visitorCount.toLocaleString(), subtitle: "day-tour visitors", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { title: "Average Tourist Arrival", value: dashboardMetrics.averageTouristArrival.toFixed(2), subtitle: "visitors per report", icon: Calendar, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { title: "Total Submitted Reports", value: dashboardMetrics.totalVisitorReports.toLocaleString(), subtitle: "day-tour reports", icon: FileUp, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { title: "Demographics", value: demographicValue, subtitle: demographicSubtitle, icon: UsersRound, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
  ];
  const accommodationMetrics: DashboardMetric[] = [
    { title: "Average Guest Night", value: dashboardMetrics.averageGuestNight.toFixed(2), subtitle: "nights per check-in", icon: Moon, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
    { title: "Average Occupancy Rate", value: `${dashboardMetrics.averageOccupancyRate.toFixed(2)}%`, subtitle: "all submitted hotel reports", icon: Percent, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { title: "Average Guest Per Room", value: dashboardMetrics.averageGuestPerRoom.toFixed(2), subtitle: "guests per occupied room", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { title: "Total Submitted Reports", value: dashboardMetrics.totalAccommodationReports.toLocaleString(), subtitle: "overnight reports", icon: FileUp, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { title: "Total Check-ins", value: dashboardMetrics.totalCheckIns.toLocaleString(), subtitle: "all submitted reports", icon: UsersRound, tone: "bg-cyan-50 text-cyan-700 ring-cyan-100" },
    { title: "Total Guest Nights", value: dashboardMetrics.totalGuestNights.toLocaleString(), subtitle: "all submitted reports", icon: Moon, tone: "bg-indigo-50 text-indigo-700 ring-indigo-100" },
  ];
  const combinedMetrics: DashboardMetric[] = [
    { title: "Total Day-tour Visitors", value: dashboardMetrics.visitorCount.toLocaleString(), subtitle: "submitted visitor reports", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { title: "Total Guest Check-ins", value: dashboardMetrics.totalCheckIns.toLocaleString(), subtitle: "submitted hotel reports", icon: UsersRound, tone: "bg-cyan-50 text-cyan-700 ring-cyan-100" },
    { title: "Average Daily Day-tour Arrivals", value: dashboardMetrics.averageTouristArrival.toFixed(2), subtitle: "visitors per report", icon: Calendar, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { title: "Average Daily Guest Check-ins", value: (dashboardMetrics.totalAccommodationReports > 0 ? dashboardMetrics.totalCheckIns / dashboardMetrics.totalAccommodationReports : 0).toFixed(2), subtitle: "check-ins per report", icon: Bed, tone: "bg-indigo-50 text-indigo-700 ring-indigo-100" },
    { title: "Total Submitted Reports", value: (dashboardMetrics.totalVisitorReports + dashboardMetrics.totalAccommodationReports).toLocaleString(), subtitle: "day-tour and overnight", icon: FileUp, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { title: "Visitor Demographics", value: demographicValue, subtitle: demographicSubtitle, icon: UsersRound, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
    { title: "Average Occupancy Rate", value: `${dashboardMetrics.averageOccupancyRate.toFixed(2)}%`, subtitle: "all submitted hotel reports", icon: Percent, tone: "bg-purple-50 text-purple-700 ring-purple-100" },
    { title: "Average Guests per Room", value: dashboardMetrics.averageGuestPerRoom.toFixed(2), subtitle: "guests per occupied room", icon: Bed, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
    { title: "Total Guest Nights", value: dashboardMetrics.totalGuestNights.toLocaleString(), subtitle: "all submitted hotel reports", icon: Moon, tone: "bg-teal-50 text-teal-700 ring-teal-100" },
  ];

  if (loading) return <LoadingState label="Loading establishment dashboard" />;
  if (loadError) return <DataState state={loadError.kind} message={loadError.message} onRetry={loadUserAndData} />;
  if (!profile) return <DataState state="empty" message="No active establishment profile is assigned to this account." />;

  const metrics = mode === "visitor" ? visitorMetrics : mode === "accommodation" ? accommodationMetrics : combinedMetrics;
  const metricsTitle = mode === "visitor" ? "Day-tour performance" : mode === "accommodation" ? "Overnight performance" : "Day-tour and overnight performance";

  return (
    <div className="space-y-7">
      <PageHero eyebrow="Establishment portal" title={`Submit your assigned ${reportFormLabel.toLowerCase()} for Balayan tourism monitoring.`} description="Keep reports, listing updates, and performance signals in one calm workspace." actionLabel="View history" onAction={() => navigate("/staff/submission-history")} compact />

      <section className={`grid grid-cols-1 gap-4 ${showVisitorForm && showAccommodationForm ? "md:grid-cols-2" : ""}`}>
        {showVisitorForm && <button type="button" onClick={() => navigate("/staff/submit-visitor-report")} className="group min-h-32 rounded-3xl border border-[#d7e5e2] bg-white/90 p-7 text-left shadow-tourism backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[#0E5A72]/30 hover:shadow-tourism-hover active:scale-[0.99] lg:min-h-40 lg:p-10"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0E5A72] text-white shadow-lg shadow-cyan-950/15"><FileUp className="h-7 w-7" /></div><div><h3 className="text-lg font-bold text-[#0B2530]">Resort</h3><p className="mt-1 text-sm leading-5 text-[#5D6F73]">Submit resort visitor arrivals by origin and count.</p></div></div><ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#0E5A72]" /></div></button>}
        {showAccommodationForm && <button type="button" onClick={() => navigate("/staff/submit-accommodation-report")} className="group min-h-32 rounded-3xl border border-[#d7e5e2] bg-white/90 p-7 text-left shadow-tourism backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[#0E5A72]/30 hover:shadow-tourism-hover active:scale-[0.99] lg:min-h-40 lg:p-10"><div className="flex items-start justify-between gap-4"><div className="flex items-center gap-4"><div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-950/15"><Bed className="h-7 w-7" /></div><div><h3 className="text-lg font-bold text-[#0B2530]">Hotels</h3><p className="mt-1 text-sm leading-5 text-[#5D6F73]">Submit hotel room occupancy, check-ins, and guest nights.</p></div></div><ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#0E5A72]" /></div></button>}
        {!showVisitorForm && !showAccommodationForm && <EmptyState>No report form is assigned to this establishment yet. Please ask the municipal tourism officer to update the establishment type or room count.</EmptyState>}
      </section>

      <PanelCard title={metricsTitle} description="Overall totals calculated from all official reports submitted for this establishment." className="p-0">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 sm:gap-4">{metrics.map((stat) => <MetricCard key={stat.title} label={stat.title} value={stat.value} helper={stat.subtitle} icon={stat.icon} tone={stat.tone} compact className="bg-[#f8fbf8] shadow-none" />)}</div>
      </PanelCard>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-[#AFB3B5]/45 bg-[#F5F8FF]/88 p-6 shadow-tourism backdrop-blur-xl"><div className="flex items-center justify-between gap-4"><div><h3 className="text-lg font-bold text-[#0B2530]">Recent submissions</h3><p className="mt-1 text-sm text-[#5D6F73]">Grouped by actual submitted report.</p></div><History className="h-5 w-5 text-slate-400" /></div><div className="mt-5 space-y-3">{recentSubmissions.length > 0 ? recentSubmissions.map((submission) => <div key={submission.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[#AFB3B5]/45 bg-[#E5E8E1]/70 p-4"><div><p className="font-semibold text-[#0B2530]">{submission.type}</p><p className="mt-1 text-sm text-[#5D6F73]">{submission.dataSummary}</p></div><div className="text-right"><span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${statusStyles[submission.status as keyof typeof statusStyles] || "bg-slate-50 text-slate-700 ring-slate-200"}`}>{submission.status}</span><p className="mt-1 text-xs text-[#5D6F73]">{submission.submittedDate}</p></div></div>) : <div className="rounded-2xl border border-dashed border-[#AFB3B5] bg-[#E5E8E1]/70 p-8 text-center text-sm text-[#5D6F73]">No submissions yet. Start by submitting a resort or hotel report.</div>}</div></div>
        <div className="rounded-3xl border border-[#AFB3B5]/45 bg-[#F5F8FF]/88 p-6 shadow-tourism backdrop-blur-xl"><h3 className="text-lg font-bold text-[#0B2530]">Reporting reminder</h3><div className="mt-5 rounded-2xl bg-cyan-50 p-4 ring-1 ring-cyan-100"><div className="flex items-start gap-3"><Calendar className="mt-0.5 h-5 w-5 text-[#0E5A72]" /><div><p className="font-semibold text-[#0B2530]">Daily reports keep analytics reliable</p><p className="mt-1 text-sm leading-6 text-[#5D6F73]">Submit resort and hotel data after business close. The tourism office uses submitted records for reports, analytics, and AI insights.</p></div></div></div><div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" /><p className="text-sm leading-6 text-slate-700">Occupied rooms cannot be higher than your configured room inventory. The form validates this before submission.</p></div></div></div>
      </section>
    </div>
  );
}
