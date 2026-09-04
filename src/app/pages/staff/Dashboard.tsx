import { useState, useEffect } from "react";
import { useNavigate } from "react-router";
import {
  FileUp,
  Bed,
  CheckCircle,
  Clock,
  AlertCircle,
  Calendar,
  TrendingUp,
  ArrowRight,
  History,
  Moon,
  Percent,
  UsersRound,
} from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy, groupStaffSubmissions } from "../../../lib/reportMetrics";
import { canSubmitAccommodationReport, canSubmitVisitorReport, getPrimaryReportFormLabel } from "../../../lib/establishmentReportForms";
import { EmptyState, LoadingState, MetricCard, PageHero, PanelCard } from "../../components/vista/PolishedShell";

const statusStyles = {
  approved: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  pending: "bg-amber-50 text-amber-700 ring-amber-200",
  rejected: "bg-rose-50 text-rose-700 ring-rose-200",
};

export default function StaffDashboard() {
  const navigate = useNavigate();
  const [profile, setProfile] = useState<any>(null);
  const [establishment, setEstablishment] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
  });
  const [hotelMetrics, setHotelMetrics] = useState({
    averageGuestNight: "0.00",
    monthlyOccupancyRate: "0.00",
    averageGuestPerRoom: "0.00",
  });
  const [visitorMetrics, setVisitorMetrics] = useState({
    visitorCount: 0,
    monthlyArrivals: 0,
    totalMale: 0,
    totalFemale: 0,
  });
  const [recentSubmissions, setRecentSubmissions] = useState<any[]>([]);

  useEffect(() => {
    loadUserAndData();
  }, []);

  const loadUserAndData = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      window.location.href = "/";
      return;
    }

    const { data: profileData } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user.id)
      .maybeSingle();

    setProfile(profileData);

    if (profileData) {
      if (profileData.establishment_id) {
        const { data: establishmentData } = await supabase
          .from("establishments")
          .select("name,type,total_rooms")
          .eq("id", profileData.establishment_id)
          .maybeSingle();
        setEstablishment(establishmentData);
      }

      const { data: visitorData } = await supabase
        .from("visitor_reports")
        .select("id, report_date, created_at, status, total_guests, total_male, total_female")
        .eq("submitted_by", profileData.id);

      const { data: accommodationData } = await supabase
        .from("accommodation_reports")
        .select("id, report_date, created_at, status, total_rooms, total_occupied_rooms, total_check_ins, total_guest_nights")
        .eq("submitted_by", profileData.id);

      const submissions = groupStaffSubmissions(visitorData || [], accommodationData || []);

      const now = new Date();
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      const visitorReports = visitorData || [];
      const totalVisitorCount = visitorReports.reduce((sum, report) => sum + Number(report.total_guests || 0), 0);
      const totalMale = visitorReports.reduce((sum, report) => sum + Number(report.total_male || 0), 0);
      const totalFemale = visitorReports.reduce((sum, report) => sum + Number(report.total_female || 0), 0);
      const monthlyArrivals = visitorReports
        .filter((report) => (report.report_date || report.created_at || "").startsWith(currentMonthKey))
        .reduce((sum, report) => sum + Number(report.total_guests || 0), 0);
      const hotelReports = accommodationData || [];
      const currentMonthHotelReports = hotelReports.filter((report) =>
        (report.report_date || "").startsWith(currentMonthKey)
      );
      const totalCheckIns = hotelReports.reduce((sum, report) => sum + Number(report.total_check_ins || 0), 0);
      const totalGuestNights = hotelReports.reduce((sum, report) => sum + Number(report.total_guest_nights || 0), 0);
      const totalOccupiedRooms = hotelReports.reduce((sum, report) => sum + Number(report.total_occupied_rooms || 0), 0);
      const monthlyOccupancyRates = currentMonthHotelReports.map((report) =>
        calculateAccommodationOccupancy(report.total_occupied_rooms, report.total_rooms, report.report_date)
      );

      setHotelMetrics({
        averageGuestNight: totalCheckIns > 0 ? (totalGuestNights / totalCheckIns).toFixed(2) : "0.00",
        monthlyOccupancyRate:
          monthlyOccupancyRates.length > 0
            ? (monthlyOccupancyRates.reduce((sum, rate) => sum + rate, 0) / monthlyOccupancyRates.length).toFixed(2)
            : "0.00",
        averageGuestPerRoom: totalOccupiedRooms > 0 ? (totalGuestNights / totalOccupiedRooms).toFixed(2) : "0.00",
      });

      setVisitorMetrics({
        visitorCount: totalVisitorCount,
        monthlyArrivals,
        totalMale,
        totalFemale,
      });

      setStats({
        total: submissions.length,
        pending: submissions.filter((r) => r.status === "pending").length,
        approved: submissions.filter((r) => r.status === "approved").length,
        rejected: submissions.filter((r) => r.status === "rejected").length,
      });

      setRecentSubmissions(submissions.slice(0, 5));
    }

    setLoading(false);
  };

  const approvalRate = stats.total > 0 ? Math.round((stats.approved / stats.total) * 100) : 0;
  const showVisitorForm = canSubmitVisitorReport(establishment);
  const showAccommodationForm = canSubmitAccommodationReport(establishment);
  const reportFormLabel = getPrimaryReportFormLabel(establishment);

  const submissionStats = [
    { title: "Total submissions", value: stats.total.toString(), icon: CheckCircle, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { title: "Pending review", value: stats.pending.toString(), icon: Clock, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
    { title: "Rejected", value: stats.rejected.toString(), icon: AlertCircle, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
    { title: "Approval rate", value: `${approvalRate}%`, icon: TrendingUp, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  ];

  const hotelPerformanceStats = [
    { title: "Average Guest Night", value: hotelMetrics.averageGuestNight, subtitle: "nights per guest", icon: Moon, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { title: "Monthly Average Occupancy Rate", value: `${hotelMetrics.monthlyOccupancyRate}%`, subtitle: "current month average", icon: Percent, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
    { title: "Average Guest Per Room", value: hotelMetrics.averageGuestPerRoom, subtitle: "guests per room", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
  ];

  const totalDemographicCount = visitorMetrics.totalMale + visitorMetrics.totalFemale;
  const dominantDemographic =
    totalDemographicCount === 0
      ? "No data"
      : visitorMetrics.totalFemale >= visitorMetrics.totalMale
        ? `${Math.round((visitorMetrics.totalFemale / totalDemographicCount) * 100)}% Female`
        : `${Math.round((visitorMetrics.totalMale / totalDemographicCount) * 100)}% Male`;

  const visitorPerformanceStats = [
    { title: "Visitor Count", value: visitorMetrics.visitorCount.toLocaleString(), subtitle: "total submitted visitors", icon: UsersRound, tone: "bg-emerald-50 text-emerald-700 ring-emerald-100" },
    { title: "Monthly Arrivals", value: visitorMetrics.monthlyArrivals.toLocaleString(), subtitle: "current month visitors", icon: Calendar, tone: "bg-sky-50 text-sky-700 ring-sky-100" },
    { title: "Demographics", value: dominantDemographic, subtitle: `${visitorMetrics.totalMale.toLocaleString()} male · ${visitorMetrics.totalFemale.toLocaleString()} female`, icon: UsersRound, tone: "bg-violet-50 text-violet-700 ring-violet-100" },
  ];

  if (loading) {
    return <LoadingState label="Loading establishment dashboard" />;
  }

  return (
    <div className="space-y-7">
      <PageHero
        eyebrow="Establishment portal"
        title={`Submit your assigned ${reportFormLabel.toLowerCase()} for Balayan tourism monitoring.`}
        description="Keep reports, listing updates, and performance signals in one calm workspace."
        actionLabel="View history"
        onAction={() => navigate("/staff/submission-history")}
      />

      <section className={`grid grid-cols-1 gap-4 ${showVisitorForm && showAccommodationForm ? "md:grid-cols-2" : ""}`}>
        {showVisitorForm && (
          <button
            onClick={() => navigate("/staff/submit-visitor-report")}
            className="group min-h-32 rounded-3xl border border-[#d7e5e2] bg-white/90 p-7 text-left shadow-tourism backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[#0E5A72]/30 hover:shadow-tourism-hover active:scale-[0.99] lg:min-h-40 lg:p-10"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#0E5A72] text-white shadow-lg shadow-cyan-950/15">
                  <FileUp className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#0B2530]">Resort</h3>
                  <p className="mt-1 text-sm leading-5 text-[#5D6F73]">Submit resort visitor arrivals by origin and count.</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#0E5A72]" />
            </div>
          </button>
        )}

        {showAccommodationForm && (
          <button
            onClick={() => navigate("/staff/submit-accommodation-report")}
            className="group min-h-32 rounded-3xl border border-[#d7e5e2] bg-white/90 p-7 text-left shadow-tourism backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-[#0E5A72]/30 hover:shadow-tourism-hover active:scale-[0.99] lg:min-h-40 lg:p-10"
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-lg shadow-slate-950/15">
                  <Bed className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[#0B2530]">Hotels</h3>
                  <p className="mt-1 text-sm leading-5 text-[#5D6F73]">Submit hotel room occupancy, check-ins, and guest nights.</p>
                </div>
              </div>
              <ArrowRight className="h-5 w-5 text-slate-400 transition group-hover:translate-x-1 group-hover:text-[#0E5A72]" />
            </div>
          </button>
        )}

        {!showVisitorForm && !showAccommodationForm && (
          <EmptyState>No report form is assigned to this establishment yet. Please ask the municipal tourism officer to update the establishment type or room count.</EmptyState>
        )}
      </section>

      <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {submissionStats.map((stat) => (
          <MetricCard key={stat.title} label={stat.title} value={stat.value} icon={stat.icon} tone={stat.tone} compact />
        ))}
      </section>

      {showVisitorForm && (
        <PanelCard title="Resort visitor analytics" description="Visitor totals computed from your submitted resort reports." className="p-0">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3" data-resort-dashboard-visitors="visitor-count-monthly-arrivals-demographics">
            {visitorPerformanceStats.map((stat) => (
              <MetricCard key={stat.title} label={stat.title} value={stat.value} helper={stat.subtitle} icon={stat.icon} tone={stat.tone} className="bg-[#f8fbf8] shadow-none" />
            ))}
          </div>
        </PanelCard>
      )}

      {showAccommodationForm && (
        <PanelCard title="Hotel analytics" description="Computed from your submitted hotel accommodation reports." className="p-0">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {hotelPerformanceStats.map((stat) => (
              <MetricCard key={stat.title} label={stat.title} value={stat.value} helper={stat.subtitle} icon={stat.icon} tone={stat.tone} className="bg-[#f8fbf8] shadow-none" />
            ))}
          </div>
        </PanelCard>
      )}

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-3xl border border-[#d7e5e2] bg-white/88 p-6 shadow-tourism backdrop-blur-xl">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-[#0B2530]">Recent submissions</h3>
              <p className="mt-1 text-sm text-[#5D6F73]">Grouped by actual submitted report.</p>
            </div>
            <History className="h-5 w-5 text-slate-400" />
          </div>
          <div className="mt-5 space-y-3">
            {recentSubmissions.length > 0 ? (
              recentSubmissions.map((submission) => (
                <div key={submission.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[#d7e5e2]/70 bg-[#f8fbf8] p-4">
                  <div>
                    <p className="font-semibold text-[#0B2530]">{submission.type}</p>
                    <p className="mt-1 text-sm text-[#5D6F73]">{submission.dataSummary}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${statusStyles[submission.status as keyof typeof statusStyles] || statusStyles.pending}`}>
                      {submission.status}
                    </span>
                    <p className="mt-1 text-xs text-[#5D6F73]">{submission.submittedDate}</p>
                  </div>
                </div>
              ))
            ) : (
              <div className="rounded-2xl border border-dashed border-[#b8d2cf] bg-[#f8fbf8] p-8 text-center text-sm text-[#5D6F73]">
                No submissions yet. Start by submitting a resort or hotel report.
              </div>
            )}
          </div>
        </div>

        <div className="rounded-3xl border border-[#d7e5e2] bg-white/88 p-6 shadow-tourism backdrop-blur-xl">
          <h3 className="text-lg font-bold text-[#0B2530]">Reporting reminder</h3>
          <div className="mt-5 rounded-2xl bg-cyan-50 p-4 ring-1 ring-cyan-100">
            <div className="flex items-start gap-3">
              <Calendar className="mt-0.5 h-5 w-5 text-[#0E5A72]" />
              <div>
                <p className="font-semibold text-[#0B2530]">Daily reports keep analytics reliable</p>
                <p className="mt-1 text-sm leading-6 text-[#5D6F73]">
                  Submit resort and hotel data after business close. The tourism office uses approved records for reports, analytics, and AI insights.
                </p>
              </div>
            </div>
          </div>
          <div className="mt-4 rounded-2xl bg-amber-50 p-4 ring-1 ring-amber-100">
            <div className="flex items-start gap-3">
              <AlertCircle className="mt-0.5 h-5 w-5 text-amber-700" />
              <p className="text-sm leading-6 text-slate-700">
                Occupied rooms cannot be higher than your configured room inventory. The form now validates this before submission.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
