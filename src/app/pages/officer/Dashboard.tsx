import { useEffect, useState } from "react";
import {
  Users,
  TrendingUp,
  Bed,
  AlertTriangle,
  CheckCircle,
  Clock,
  Building2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy } from "../../../lib/reportMetrics";
import { calculateAverageResolutionHours, normalizeReportStatus } from "../../../lib/governance";
import { Button } from "../../components/ui/button";
import { EmptyState, LoadingState, MetricCard, PageHero, PanelCard } from "../../components/vista/PolishedShell";

interface RecentSubmission {
  id: string;
  establishment_name: string;
  type: string;
  status: string;
  date: string;
  created_at: string;
}

interface TopEstablishment {
  name: string;
  visitors: number;
}

interface Demographic {
  name: string;
  value: number;
  color: string;
}

const DEMOGRAPHIC_COLORS = ["#0E7490", "#7C3AED", "#F97316", "#16A34A", "#DC2626", "#2563EB"];

const getDemographicColor = (name: string, index: number) => {
  const normalized = name.toLowerCase();

  if (normalized.includes("within") || normalized.includes("batangas resident")) return "#0E7490";
  if (normalized.includes("outside")) return "#7C3AED";
  if (normalized.includes("other")) return "#F97316";
  if (normalized.includes("unknown")) return "#64748B";

  return DEMOGRAPHIC_COLORS[index % DEMOGRAPHIC_COLORS.length];
};

export default function OfficerDashboard() {
  const [totalVisitors, setTotalVisitors] = useState(0);
  const [monthlyArrivals, setMonthlyArrivals] = useState(0);
  const [occupancyRate, setOccupancyRate] = useState(0);
  const [totalEstablishments, setTotalEstablishments] = useState(0);
  const [visitorTrends, setVisitorTrends] = useState<any[]>([]);
  const [recentSubmissions, setRecentSubmissions] = useState<RecentSubmission[]>([]);
  const [demographics, setDemographics] = useState<Demographic[]>([]);
  const [topEstablishments, setTopEstablishments] = useState<TopEstablishment[]>([]);
  const [anomalies, setAnomalies] = useState<any[]>([]);
  const [workflowMetrics, setWorkflowMetrics] = useState({
    activeReports: 0,
    pendingReports: 0,
    onHoldReports: 0,
    resolvedReports: 0,
    averageResolutionHours: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchAllDashboardData();
  }, []);

  const fetchAllDashboardData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      console.log('=== FETCHING DASHBOARD DATA ===');
      
      // 1. Fetch all approved visitor reports
      const { data: visitorData, error: visitorError } = await supabase
        .from('visitor_reports')
        .select('report_date, total_guests')
        .in('status', ['pending', 'approved'])
        .order('report_date', { ascending: true });

      if (visitorError) {
        console.error('Visitor data error:', visitorError);
        setError('Failed to load visitor data');
        setLoading(false);
        return;
      }

      console.log('Visitor data count:', visitorData?.length || 0);
      
      // Calculate total visitors
      const total = visitorData?.reduce((sum, v) => sum + (v.total_guests || 0), 0) || 0;
      setTotalVisitors(total);
      console.log('Total visitors set to:', total);

      // Calculate monthly trends
      const monthly: Record<string, number> = {};
      visitorData?.forEach((v) => {
        const month = new Date(v.report_date).toLocaleString('default', { month: 'short' });
        monthly[month] = (monthly[month] || 0) + (v.total_guests || 0);
      });
      const trends = Object.entries(monthly).map(([month, visitors]) => ({ month, visitors }));
      setVisitorTrends(trends);
      console.log('Monthly trends:', trends);

// Calculate monthly arrivals (current month from data)
if (visitorData && visitorData.length > 0) {
  // Get the most recent month with data
  const sortedDates = visitorData
    .map(v => new Date(v.report_date))
    .sort((a: Date, b: Date) => b.getTime() - a.getTime());  // ← Fixed: use getTime()
  
  const latestDate = sortedDates[0];
  const currentMonthStr = latestDate.toLocaleString('default', { month: 'short' });
  const currentMonthVisitors = monthly[currentMonthStr] || 0;
  setMonthlyArrivals(currentMonthVisitors);
  console.log('Monthly arrivals (current month) set to:', currentMonthVisitors);
}

      // 2. Fetch accommodation reports
// Get the number of days in the month for each report
// If your reports are monthly, you need to know which month each report is for

// Option 1: If you have report_date in accommodation_reports
const { data: accommodationData } = await supabase
  .from('accommodation_reports')
  .select('total_rooms, total_occupied_rooms, report_date')
  .in('status', ['pending', 'approved']);

let weightedOccupancySum = 0;
let occupancyReportCount = 0;

accommodationData?.forEach((report) => {
  const reportOccupancy = calculateAccommodationOccupancy(
    report.total_occupied_rooms,
    report.total_rooms,
    report.report_date
  );
  weightedOccupancySum += reportOccupancy;
  occupancyReportCount += 1;
});

const occupancyRate = occupancyReportCount > 0 ? weightedOccupancySum / occupancyReportCount : 0;
setOccupancyRate(occupancyRate);

      // 3. Fetch establishments count
      const { count: establishmentsCount, error: estError } = await supabase
        .from('establishments')
        .select('*', { count: 'exact', head: true });

      if (!estError) {
        setTotalEstablishments(establishmentsCount || 0);
        console.log('Total establishments set to:', establishmentsCount);
      }

      // 4. Fetch demographics
      const { data: demoData } = await supabase
        .from('visitor_reports')
        .select('residence_type, total_guests')
        .in('status', ['pending', 'approved']);

      if (demoData && demoData.length > 0) {
        const dist: Record<string, number> = {};
        demoData.forEach((item) => {
          const type = item.residence_type || "Unknown";
          dist[type] = (dist[type] || 0) + (item.total_guests || 0);
        });
        const totalDemo = Object.values(dist).reduce((a, b) => a + b, 0);
        const chartData = Object.entries(dist).map(([name, value], index) => ({
          name,
          value: totalDemo > 0 ? Math.round((value / totalDemo) * 100) : 0,
          color: getDemographicColor(name, index),
        }));
        setDemographics(chartData);
        console.log('Demographics set:', chartData);
      }

      // 5. Fetch top establishments
      const { data: topData } = await supabase
        .from('visitor_reports')
        .select(`establishment_id, total_guests, establishments(name)`)
        .in('status', ['pending', 'approved']);

      if (topData && topData.length > 0) {
        const stats: Record<string, { name: string; visitors: number }> = {};
        topData.forEach((item: any) => {
          const id = item.establishment_id;
          const name = item.establishments?.name;
          if (id && name) {
            if (!stats[id]) stats[id] = { name, visitors: 0 };
            stats[id].visitors += item.total_guests || 0;
          }
        });
        const sorted = Object.values(stats).sort((a, b) => b.visitors - a.visitors).slice(0, 5);
        setTopEstablishments(sorted);
        console.log('Top establishments:', sorted);
      }

      // 6. Fetch recent submissions
      const { data: visitorRecent } = await supabase
        .from('visitor_reports')
        .select(`id, report_date, status, created_at, reviewed_at, establishments(name)`)
        .order('created_at', { ascending: false })
        .limit(25);

      const { data: accommodationRecent } = await supabase
        .from('accommodation_reports')
        .select(`id, report_date, status, created_at, reviewed_at, establishments(name)`)
        .order('created_at', { ascending: false })
        .limit(25);

      const combined = [
        ...(visitorRecent || []).map((v: any) => ({
          id: v.id,
          establishment_name: v.establishments?.name || "Unknown",
          type: "Resort Report",
          status: v.status,
          date: v.report_date,
          created_at: v.created_at,
          reviewed_at: v.reviewed_at,
        })),
        ...(accommodationRecent || []).map((a: any) => ({
          id: a.id,
          establishment_name: a.establishments?.name || "Unknown",
          type: "Hotel Report",
          status: a.status,
          date: a.report_date,
          created_at: a.created_at,
          reviewed_at: a.reviewed_at,
        })),
      ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      setWorkflowMetrics({
        activeReports: combined.filter((report) => ["pending", "under_review", "on_hold"].includes(normalizeReportStatus(report.status))).length,
        pendingReports: combined.filter((report) => normalizeReportStatus(report.status) === "pending").length,
        onHoldReports: combined.filter((report) => normalizeReportStatus(report.status) === "on_hold").length,
        resolvedReports: combined.filter((report) => ["approved", "rejected"].includes(normalizeReportStatus(report.status))).length,
        averageResolutionHours: calculateAverageResolutionHours(combined),
      });

      setRecentSubmissions(combined.slice(0, 5));

      // 7. Fetch anomalies
      const { data: anomalyData } = await supabase
        .from('ai_anomalies_cache')
        .select('*')
        .eq('status', 'active')
        .order('detected_at', { ascending: false })
        .limit(5);
      setAnomalies(anomalyData || []);

      console.log('=== DASHBOARD DATA LOAD COMPLETE ===');
      
    } catch (err) {
      console.error('Unexpected error:', err);
      setError('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <LoadingState label="Loading tourism dashboard" />;
  }

  if (error) {
    return (
      <EmptyState className="mx-auto max-w-md border-rose-200 bg-rose-50 text-rose-700">
        <p>{error}</p>
        <Button type="button" onClick={fetchAllDashboardData} className="mt-4 rounded-2xl bg-[#0E5A72] text-white hover:bg-[#073B4C]">
          Retry
        </Button>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-7">
      <PageHero
        eyebrow="Officer workspace"
        title="Tourism activity, submissions, and AI alerts in one workspace."
        description="Monitor records, inspect establishment performance, and act on anomalies before report generation."
        metricLabel="Current occupancy"
        metricValue={`${occupancyRate.toFixed(1)}%`}
      />

      <section className="grid grid-cols-3 gap-2 sm:gap-3 lg:gap-4" data-officer-dashboard-uniform-kpis="true">
        {[
          { label: "Total visitors", value: totalVisitors.toLocaleString(), helper: "Approved and pending guests", icon: Users, tone: "bg-cyan-50 text-[#0E5A72] ring-cyan-100" },
          { label: "Monthly arrivals", value: monthlyArrivals.toLocaleString(), helper: "Latest reporting month", icon: TrendingUp, tone: "bg-slate-50 text-[#0B2530] ring-slate-200" },
          { label: "Occupancy rate", value: `${occupancyRate.toFixed(1)}%`, helper: "Average hotel occupancy", icon: Bed, tone: "bg-[#EAF2F1] text-[#0E5A72] ring-[#b8d2cf]" },
          { label: "Establishments", value: totalEstablishments.toString(), helper: "Tourism records", icon: Building2, tone: "bg-emerald-50 text-[#2F5F55] ring-emerald-100" },
          { label: "Active reports", value: workflowMetrics.activeReports, helper: "Pending, review, or hold", icon: AlertTriangle, tone: "bg-amber-50 text-amber-700 ring-amber-100" },
          { label: "Pending reports", value: workflowMetrics.pendingReports, helper: "Waiting for officer review", icon: Clock, tone: "bg-[#EAF2F1] text-[#0E5A72] ring-[#b8d2cf]" },
          { label: "On hold", value: workflowMetrics.onHoldReports, helper: "Needs manual verification", icon: AlertTriangle, tone: "bg-rose-50 text-rose-700 ring-rose-100" },
          { label: "Resolved reports", value: workflowMetrics.resolvedReports, helper: "Approved or rejected", icon: CheckCircle, tone: "bg-emerald-50 text-[#2F5F55] ring-emerald-100" },
          { label: "Avg. resolution", value: `${workflowMetrics.averageResolutionHours.toFixed(1)}h`, helper: "Submit to decision", icon: TrendingUp, tone: "bg-slate-50 text-[#0B2530] ring-slate-200" },
        ].map((metric) => (
          <MetricCard key={metric.label} {...metric} compact className="h-full min-h-[118px] sm:min-h-[132px]" />
        ))}
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PanelCard title="Monthly visitor trends" description="Aggregated visitor counts by report month.">
          {visitorTrends.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={visitorTrends}>
                <defs>
                  <linearGradient id="visitorFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0E5A72" stopOpacity={0.32} />
                    <stop offset="95%" stopColor="#0E5A72" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="month" stroke="#64748b" />
                <YAxis stroke="#64748b" />
                <Tooltip />
                <Area type="monotone" dataKey="visitors" stroke="#0E5A72" fill="url(#visitorFill)" strokeWidth={3} name="Visitors" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState>No visitor data available</EmptyState>
          )}
        </PanelCard>

        <PanelCard title="Visitor demographics" description="Share of visitors by residence category.">
          {demographics.length > 0 && demographics.some((d) => d.value > 0) ? (
            <div className="space-y-4">
              <div className="h-56 w-full sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}>
                    <Pie
                      data={demographics}
                      cx="50%"
                      cy="50%"
                      innerRadius="52%"
                      outerRadius="82%"
                      paddingAngle={2}
                      dataKey="value"
                      nameKey="name"
                      label={false}
                      labelLine={false}
                    >
                      {demographics.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}
                    </Pie>
                    <Tooltip formatter={(value: number, name: string) => [`${value}%`, name]} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="grid gap-2 text-sm text-[#0B2530] sm:grid-cols-2">
                {demographics.map((entry) => (
                  <div key={entry.name} className="flex items-center justify-between gap-3 rounded-xl border border-[#d7e5e2]/70 bg-white/80 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: entry.color }} />
                      <span className="truncate">{entry.name}</span>
                    </span>
                    <span className="shrink-0 font-semibold text-[#0E5A72]">{entry.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState>No demographic data available</EmptyState>
          )}
        </PanelCard>
      </section>

      <PanelCard title="Top performing establishments" description="Ranked by submitted visitor volume.">
        {topEstablishments.length > 0 ? (
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={topEstablishments}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="name" angle={-35} textAnchor="end" height={90} stroke="#64748b" />
              <YAxis stroke="#64748b" />
              <Tooltip />
              <Bar dataKey="visitors" fill="#0E5A72" radius={[10, 10, 0, 0]} name="Visitors" />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <EmptyState>No establishment data available</EmptyState>
        )}
      </PanelCard>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <PanelCard title="Recent submissions">
          <div className="space-y-3">
            {recentSubmissions.length > 0 ? (
              recentSubmissions.map((sub) => (
                <div key={sub.id} className="flex items-center justify-between gap-4 rounded-2xl border border-[#d7e5e2]/70 bg-[#f8fbf8] p-4">
                  <div>
                    <p className="font-semibold text-[#0B2530]">{sub.establishment_name}</p>
                    <p className="mt-1 text-sm text-[#5D6F73]">{sub.type}</p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold capitalize ring-1 ${
                      sub.status === "approved" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
                      sub.status === "pending" ? "bg-amber-50 text-amber-700 ring-amber-200" : "bg-rose-50 text-rose-700 ring-rose-200"
                    }`}>
                      {sub.status === "approved" && <CheckCircle className="h-3 w-3" />}
                      {sub.status === "pending" && <Clock className="h-3 w-3" />}
                      {sub.status}
                    </span>
                    <p className="mt-1 text-xs text-[#5D6F73]">{sub.date}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>No submissions yet</EmptyState>
            )}
          </div>
        </PanelCard>

        <PanelCard title="Service gaps or operational challenges">
          <div className="space-y-3">
            {anomalies.length > 0 ? (
              anomalies.map((anomaly) => (
                <div key={anomaly.id} className={`flex items-start gap-3 rounded-2xl border p-4 ${
                  anomaly.severity === "high" ? "border-rose-200 bg-rose-50" : "border-amber-200 bg-amber-50"
                }`}>
                  <AlertTriangle className={`mt-0.5 h-5 w-5 ${
                    anomaly.severity === "high" ? "text-rose-700" : "text-amber-700"
                  }`} />
                  <div className="flex-1">
                    <div className="flex justify-between gap-3">
                      <p className="font-semibold text-[#0B2530]">{anomaly.anomaly_type}</p>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${
                        anomaly.severity === "high" ? "bg-rose-100 text-rose-700" : "bg-amber-100 text-amber-700"
                      }`}>{anomaly.severity}</span>
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-700">{anomaly.description}</p>
                  </div>
                </div>
              ))
            ) : (
              <EmptyState>No service gaps or operational challenges detected</EmptyState>
            )}
          </div>
        </PanelCard>
      </section>
    </div>
  );
}