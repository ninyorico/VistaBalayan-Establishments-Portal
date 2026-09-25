import { useEffect, useState } from "react";
import {
  Users,
  TrendingUp,
  Bed,
  AlertTriangle,
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

import { Button } from "../../components/ui/button";
import { EmptyState, LoadingState } from "../../components/vista/PolishedShell";

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

const MAX_VISIBLE_DEMOGRAPHICS = 4;

const getDemographicColor = (name: string, index: number) => {
  const normalized = name.toLowerCase();

  if (normalized.includes("within") || normalized.includes("batangas resident")) return "#0E7490";
  if (normalized.includes("outside")) return "#7C3AED";
  if (normalized.includes("other")) return "#F97316";
  if (normalized.includes("unknown")) return "#64748B";

  return DEMOGRAPHIC_COLORS[index % DEMOGRAPHIC_COLORS.length];
};

const buildDemographicChartData = (distribution: Record<string, number>, total: number): Demographic[] => {
  const sortedEntries = Object.entries(distribution)
    .filter(([, value]) => value > 0)
    .sort(([, firstValue], [, secondValue]) => secondValue - firstValue);
  const visibleEntries = sortedEntries.slice(0, MAX_VISIBLE_DEMOGRAPHICS);
  const otherVisitors = sortedEntries
    .slice(MAX_VISIBLE_DEMOGRAPHICS)
    .reduce((sum, [, value]) => sum + value, 0);

  const chartData = visibleEntries.map(([name, value], index) => ({
    name,
    value: total > 0 ? Math.round((value / total) * 100) : 0,
    color: getDemographicColor(name, index),
  }));

  if (otherVisitors > 0) {
    chartData.push({
      name: "Others",
      value: total > 0 ? Math.round((otherVisitors / total) * 100) : 0,
      color: getDemographicColor("Others", MAX_VISIBLE_DEMOGRAPHICS),
    });
  }

  return chartData;
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
      
      // Supabase returns at most 1,000 rows by default. Page through the
      // complete history so dashboard totals do not silently stop at 1,000.
      const pageSize = 1000;
      const fetchVisitorRows = async () => {
        const rows: any[] = [];
        for (let page = 0; ; page += 1) {
          const { data, error } = await supabase
            .from('visitor_reports')
            .select('report_date, total_guests, residence_type, place_of_residence, establishment_id, establishments(name)')
            .eq('status', 'submitted')
            .order('report_date', { ascending: true })
            .range(page * pageSize, page * pageSize + pageSize - 1);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < pageSize) break;
        }
        return rows;
      };
      const fetchAccommodationRows = async () => {
        const rows: any[] = [];
        for (let page = 0; ; page += 1) {
          const { data, error } = await supabase
            .from('accommodation_reports')
            .select('total_rooms, total_occupied_rooms, report_date')
            .eq('status', 'submitted')
            .order('report_date', { ascending: true })
            .range(page * pageSize, page * pageSize + pageSize - 1);
          if (error) throw error;
          rows.push(...(data || []));
          if (!data || data.length < pageSize) break;
        }
        return rows;
      };
      const [visitorData, accommodationData] = await Promise.all([
        fetchVisitorRows(),
        fetchAccommodationRows(),
      ]);

      console.log('Visitor data count:', visitorData.length);
      
      // Calculate total visitors
      const total = visitorData?.reduce((sum, v) => sum + Number(v.total_guests || 0), 0) || 0;
      setTotalVisitors(total);
      console.log('Total visitors set to:', total);

      // Calculate monthly trends
      const monthly: Record<string, number> = {};
      visitorData?.forEach((v) => {
        const date = new Date(v.report_date);
        const month = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        monthly[month] = (monthly[month] || 0) + Number(v.total_guests || 0);
      });
      const trends = Object.entries(monthly).map(([month, visitors]) => ({
        month: new Date(`${month}-01T00:00:00`).toLocaleString('default', { month: 'short', year: 'numeric' }),
        visitors,
      }));
      setVisitorTrends(trends);
      console.log('Monthly trends:', trends);

// Calculate monthly arrivals (current month from data)
if (visitorData && visitorData.length > 0) {
  // Get the most recent month with data
  const sortedDates = visitorData
    .map(v => new Date(v.report_date))
    .sort((a: Date, b: Date) => b.getTime() - a.getTime());  // ← Fixed: use getTime()
  
  const latestDate = sortedDates[0];
  const currentMonthStr = `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, '0')}`;
  const currentMonthVisitors = monthly[currentMonthStr] || 0;
  setMonthlyArrivals(currentMonthVisitors);
  console.log('Monthly arrivals (current month) set to:', currentMonthVisitors);
}

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

      // 4. Calculate demographics from the same complete visitor dataset used
      // for the total, preventing the cards from disagreeing with each other.
      if (visitorData.length > 0) {
        const dist: Record<string, number> = {};
        visitorData.forEach((item) => {
          const type = item.residence_type || "Unknown";
          dist[type] = (dist[type] || 0) + Number(item.total_guests || 0);
        });
        const totalDemo = Object.values(dist).reduce((a, b) => a + b, 0);
        const chartData = buildDemographicChartData(dist, totalDemo);
        setDemographics(chartData);
        console.log('Demographics set:', chartData);
      }

      // 5. Calculate top establishments from the same complete visitor data.
      if (visitorData.length > 0) {
        const stats: Record<string, { name: string; visitors: number }> = {};
        visitorData.forEach((item: any) => {
          const id = item.establishment_id;
          const name = item.establishments?.name;
          if (id && name) {
            if (!stats[id]) stats[id] = { name, visitors: 0 };
            stats[id].visitors += Number(item.total_guests || 0);
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

  const visitorTrendMax = Math.max(1, ...visitorTrends.map((item) => Number(item.visitors) || 0));
  const visitorTrendTicks = Array.from({ length: 5 }, (_, index) =>
    Math.round((visitorTrendMax * (4 - index)) / 4)
  );

  return (
    <div className="space-y-8">
      <section className="vb-dashboard-header relative overflow-hidden p-6 sm:p-8">
        <div className="absolute -right-10 -top-16 h-48 w-48 rounded-full border-[18px] border-black/10" aria-hidden="true" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs font-black uppercase tracking-[0.22em]">Municipal Tourism Officer</p>
            <h1 className="mt-3 max-w-2xl text-4xl font-black uppercase leading-[0.9] tracking-[-0.06em] sm:text-6xl">
              Tourism<br /><span className="bg-[#FFD93D] px-2">command center</span>
            </h1>
            <p className="mt-5 max-w-2xl text-sm font-medium leading-6 sm:text-base">Monitor real submitted visitor records, accommodation performance, establishment activity, and active alerts from one structured workspace.</p>
          </div>
          <div className="w-full border-3 border-black bg-white p-4 shadow-[5px_5px_0_#000] sm:max-w-xs">
            <p className="text-xs font-black uppercase tracking-widest">Average occupancy</p>
            <p className="mt-2 text-4xl font-black tabular-nums">{occupancyRate.toFixed(1)}%</p>
            <p className="mt-1 text-xs font-bold uppercase">From submitted accommodation reports</p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" data-officer-dashboard-uniform-kpis="true">
        {[
          { label: "Total visitors", value: totalVisitors.toLocaleString(), helper: "Submitted visitor records", icon: Users, tone: "bg-[#FF6B6B] text-black" },
          { label: "Monthly arrivals", value: monthlyArrivals.toLocaleString(), helper: "Latest reporting month", icon: TrendingUp, tone: "bg-[#FFD93D] text-black" },
          { label: "Occupancy rate", value: `${occupancyRate.toFixed(1)}%`, helper: "Average hotel occupancy", icon: Bed, tone: "bg-[#C4B5FD] text-black" },
          { label: "Establishments", value: totalEstablishments.toString(), helper: "Tourism records", icon: Building2, tone: "bg-white text-black" },
        ].map((metric) => (
          <div key={metric.label} className="vb-dashboard-kpi bg-white p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[11px] font-black uppercase leading-4 tracking-widest">{metric.label}</p>
                <p className="mt-3 text-3xl font-black tabular-nums sm:text-4xl">{metric.value}</p>
                <p className="mt-2 text-xs font-bold leading-4 text-slate-700">{metric.helper}</p>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center border-2 border-black ${metric.tone}`}><metric.icon className="h-5 w-5" /></div>
            </div>
          </div>
        ))}
      </section>

      <section className="grid grid-cols-1 gap-7 xl:grid-cols-[1.45fr_0.8fr]">
        <div className="vb-dashboard-panel overflow-hidden">
          <div className="border-b-3 border-black bg-[#FFD93D] px-5 py-4 sm:px-6">
            <p className="text-xs font-black uppercase tracking-widest">Visitor movement</p>
            <h2 className="mt-1 text-xl font-black uppercase sm:text-2xl">Monthly visitor trends</h2>
            <p className="mt-1 text-sm font-medium">Aggregated visitor counts by report month.</p>
          </div>
          <div className="p-4 sm:p-6">
            {visitorTrends.length > 0 ? (
              <div className="flex min-w-0 pb-2">
                <div className="relative h-[300px] w-16 shrink-0 border-r-2 border-black bg-white pr-1 text-right text-[11px] font-bold text-black">
                  <div className="absolute inset-x-0 top-1 bottom-[75px] flex flex-col justify-between">
                    {visitorTrendTicks.map((tick, index) => <span key={`${tick}-${index}`} className="relative pr-2">{tick.toLocaleString()}<span className="absolute right-[-4px] top-1/2 h-0.5 w-1 bg-black" aria-hidden="true" /></span>)}
                  </div>
                </div>
                <div className="min-w-0 flex-1 overflow-x-auto"><div className="min-w-[620px]">
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={visitorTrends} margin={{ top: 5, right: 8, bottom: 0, left: 16 }}>
                      <defs><linearGradient id="visitorFill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#FF6B6B" stopOpacity={0.45} /><stop offset="95%" stopColor="#FF6B6B" stopOpacity={0.04} /></linearGradient></defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" />
                      <XAxis dataKey="month" stroke="#000" interval={0} angle={-35} textAnchor="end" height={75} tickMargin={8} />
                      <YAxis hide domain={[0, visitorTrendMax]} ticks={visitorTrendTicks} />
                      <Tooltip contentStyle={{ border: "3px solid #000", borderRadius: 0, boxShadow: "4px 4px 0 #000" }} />
                      <Legend />
                      <Area type="monotone" dataKey="visitors" stroke="#000" fill="url(#visitorFill)" strokeWidth={3} name="Visitors" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div></div>
              </div>
            ) : <EmptyState>No visitor data available</EmptyState>}
          </div>
        </div>

        <div className="vb-dashboard-panel overflow-hidden">
          <div className="border-b-3 border-black bg-[#C4B5FD] px-5 py-4 sm:px-6">
            <p className="text-xs font-black uppercase tracking-widest">Visitor profile</p>
            <h2 className="mt-1 text-xl font-black uppercase sm:text-2xl">Demographics</h2>
            <p className="mt-1 text-sm font-medium">Share by residence category.</p>
          </div>
          <div className="p-4 sm:p-6">
            {demographics.length > 0 && demographics.some((d) => d.value > 0) ? (
              <div className="space-y-4">
                <div className="h-56 w-full sm:h-64"><ResponsiveContainer width="100%" height="100%"><PieChart margin={{ top: 8, right: 8, bottom: 8, left: 8 }}><Pie data={demographics} cx="50%" cy="50%" innerRadius="52%" outerRadius="82%" paddingAngle={2} dataKey="value" nameKey="name" label={false} labelLine={false}>{demographics.map((entry, idx) => <Cell key={idx} fill={entry.color} />)}</Pie><Tooltip formatter={(value: number, name: string) => [`${value}%`, name]} contentStyle={{ border: "3px solid #000", borderRadius: 0 }} /></PieChart></ResponsiveContainer></div>
                <div className="grid gap-2 text-sm font-bold sm:grid-cols-2">{demographics.map((entry) => <div key={entry.name} className="flex items-center justify-between gap-3 border-2 border-black bg-[#FFFDF5] px-3 py-2"><span className="flex min-w-0 items-center gap-2"><span className="h-3 w-3 shrink-0 border border-black" style={{ backgroundColor: entry.color }} /><span className="truncate">{entry.name}</span></span><span className="shrink-0">{entry.value}%</span></div>)}</div>
              </div>
            ) : <EmptyState>No demographic data available</EmptyState>}
          </div>
        </div>
      </section>

      <div className="vb-dashboard-panel overflow-hidden">
        <div className="border-b-3 border-black bg-[#FF6B6B] px-5 py-4 sm:px-6"><p className="text-xs font-black uppercase tracking-widest">Performance board</p><h2 className="mt-1 text-xl font-black uppercase sm:text-2xl">Top performing establishments</h2><p className="mt-1 text-sm font-medium">Ranked by submitted visitor volume.</p></div>
        <div className="p-4 sm:p-6">{topEstablishments.length > 0 ? <ResponsiveContainer width="100%" height={320}><BarChart data={topEstablishments}><CartesianGrid strokeDasharray="3 3" stroke="#d4d4d4" /><XAxis dataKey="name" angle={-35} textAnchor="end" height={105} interval={0} tickMargin={8} stroke="#000" /><YAxis stroke="#000" /><Tooltip contentStyle={{ border: "3px solid #000", borderRadius: 0 }} /><Legend /><Bar dataKey="visitors" fill="#C4B5FD" stroke="#000" strokeWidth={2} radius={[0, 0, 0, 0]} name="Visitors" /></BarChart></ResponsiveContainer> : <EmptyState>No establishment data available</EmptyState>}</div>
      </div>

      <section className="grid grid-cols-1 gap-7 xl:grid-cols-2">
        <div className="vb-dashboard-panel overflow-hidden"><div className="border-b-3 border-black bg-white px-5 py-4 sm:px-6"><p className="text-xs font-black uppercase tracking-widest">Latest records</p><h2 className="mt-1 text-xl font-black uppercase">Recent submissions</h2></div><div className="space-y-3 p-4 sm:p-6">{recentSubmissions.length > 0 ? recentSubmissions.map((sub) => <div key={sub.id} className="vb-dashboard-table-row flex items-center justify-between gap-4 p-4"><div><p className="font-black">{sub.establishment_name}</p><p className="mt-1 text-sm font-medium text-slate-700">{sub.type}</p></div><div className="text-right"><span className={`inline-flex border-2 border-black px-2 py-1 text-xs font-black uppercase ${sub.status === "submitted" ? "bg-[#22C55E]" : "bg-[#FFD93D]"}`}>{sub.status}</span><p className="mt-2 text-xs font-bold">{sub.date}</p></div></div>) : <EmptyState>No submissions yet</EmptyState>}</div></div>
        <div className="vb-dashboard-panel overflow-hidden"><div className="border-b-3 border-black bg-[#FFD93D] px-5 py-4 sm:px-6"><p className="text-xs font-black uppercase tracking-widest">Decision support</p><h2 className="mt-1 text-xl font-black uppercase">Operational challenges</h2></div><div className="space-y-3 p-4 sm:p-6">{anomalies.length > 0 ? anomalies.map((anomaly) => <div key={anomaly.id} className={`flex items-start gap-3 border-2 border-black p-4 ${anomaly.severity === "high" ? "bg-[#FF6B6B]" : "bg-[#FFD93D]"}`}><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" /><div className="flex-1"><div className="flex justify-between gap-3"><p className="font-black uppercase">{anomaly.anomaly_type}</p><span className="border-2 border-black bg-white px-2 py-0.5 text-xs font-black uppercase">{anomaly.severity}</span></div><p className="mt-2 text-sm font-medium leading-6">{anomaly.description}</p></div></div>) : <EmptyState>No service gaps or operational challenges detected</EmptyState>}</div></div>
      </section>
    </div>
  );
}