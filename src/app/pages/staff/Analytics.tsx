import { useEffect, useMemo, useState } from "react";
import { BarChart3, TrendingUp, UsersRound, Calendar, PieChart, Percent } from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { supabase } from "../../../lib/supabase";
import { calculateAccommodationOccupancy, calculateAverageAccommodationOccupancy } from "../../../lib/reportMetrics";
import { canSubmitAccommodationReport, canSubmitVisitorReport } from "../../../lib/establishmentReportForms";
import { LoadingState, MetricCard } from "../../components/vista/PolishedShell";

type VisitorReport = {
  id: string;
  report_date: string | null;
  created_at?: string | null;
  total_guests?: number | null;
  total_male?: number | null;
  total_female?: number | null;
  residence_type?: string | null;
  status?: string | null;
};

type AccommodationReport = {
  id: string;
  report_date: string | null;
  total_rooms?: number | null;
  total_occupied_rooms?: number | null;
  total_check_ins?: number | null;
  total_guest_nights?: number | null;
  status?: string | null;
};

const monthLabel = (dateValue?: string | null) => {
  if (!dateValue) return "No date";
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return dateValue.slice(0, 7);
  return date.toLocaleString("default", { month: "long" });
};

const toNumber = (value?: number | null) => Number(value || 0);

export default function Analytics() {
  const [loading, setLoading] = useState(true);
  const [establishment, setEstablishment] = useState<any>(null);
  const [visitorReports, setVisitorReports] = useState<VisitorReport[]>([]);
  const [accommodationReports, setAccommodationReports] = useState<AccommodationReport[]>([]);

  useEffect(() => {
    loadAnalytics();
  }, []);

  const loadAnalytics = async () => {
    setLoading(true);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      window.location.href = "/";
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("id, establishment_id")
      .eq("id", user.id)
      .maybeSingle();

    if (!profile?.establishment_id) {
      setLoading(false);
      return;
    }

    const { data: establishmentData } = await supabase
      .from("establishments")
      .select("name,type,total_rooms")
      .eq("id", profile.establishment_id)
      .maybeSingle();

    setEstablishment(establishmentData);

    const [visitorResult, accommodationResult] = await Promise.all([
      supabase
        .from("visitor_reports")
        .select("id, report_date, created_at, total_guests, total_male, total_female, residence_type, status")
        .eq("establishment_id", profile.establishment_id)
        .order("report_date", { ascending: true }),
      supabase
        .from("accommodation_reports")
        .select("id, report_date, total_rooms, total_occupied_rooms, total_check_ins, total_guest_nights, status")
        .eq("establishment_id", profile.establishment_id)
        .order("report_date", { ascending: true }),
    ]);

    setVisitorReports(visitorResult.data || []);
    setAccommodationReports(accommodationResult.data || []);
    setLoading(false);
  };

  const showVisitorAnalytics = canSubmitVisitorReport(establishment);
  const showAccommodationAnalytics = canSubmitAccommodationReport(establishment);
  const approvedVisitorReports = visitorReports.filter((report) => (report.status || "pending") === "approved");
  const approvedAccommodationReports = accommodationReports.filter((report) => (report.status || "pending") === "approved");

  const currentMonthKey = new Date().toISOString().slice(0, 7);
  const totalVisitors = approvedVisitorReports.reduce((sum, report) => sum + toNumber(report.total_guests), 0);
  const currentMonthVisitors = approvedVisitorReports
    .filter((report) => (report.report_date || report.created_at || "").startsWith(currentMonthKey))
    .reduce((sum, report) => sum + toNumber(report.total_guests), 0);
  const totalMale = approvedVisitorReports.reduce((sum, report) => sum + toNumber(report.total_male), 0);
  const totalFemale = approvedVisitorReports.reduce((sum, report) => sum + toNumber(report.total_female), 0);
  const totalDemographics = totalMale + totalFemale;
  const demographicKpi =
    totalDemographics === 0
      ? "No data"
      : totalFemale >= totalMale
        ? `${Math.round((totalFemale / totalDemographics) * 100)}% Female`
        : `${Math.round((totalMale / totalDemographics) * 100)}% Male`;

  const visitorTrendData = useMemo(() => {
    const monthMap = new Map<string, { month: string; visitors: number; male: number; female: number }>();

    approvedVisitorReports.forEach((report) => {
      const key = (report.report_date || report.created_at || "No date").slice(0, 7);
      const current = monthMap.get(key) || { month: monthLabel(report.report_date || report.created_at), visitors: 0, male: 0, female: 0 };
      current.visitors += toNumber(report.total_guests);
      current.male += toNumber(report.total_male);
      current.female += toNumber(report.total_female);
      monthMap.set(key, current);
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([, value]) => value);
  }, [approvedVisitorReports]);

  const residenceData = useMemo(() => {
    const residenceMap = new Map<string, number>();

    approvedVisitorReports.forEach((report) => {
      const label = report.residence_type || "Unspecified";
      residenceMap.set(label, (residenceMap.get(label) || 0) + toNumber(report.total_guests));
    });

    return Array.from(residenceMap.entries()).map(([residence, visitors]) => ({ residence, visitors }));
  }, [approvedVisitorReports]);

  const bestVisitorMonth = visitorTrendData.reduce(
    (best, current) => (current.visitors > best.visitors ? current : best),
    { month: "No data", visitors: 0, male: 0, female: 0 }
  );

  const currentMonthAccommodationReports = approvedAccommodationReports.filter((report) =>
    (report.report_date || "").startsWith(currentMonthKey)
  );
  const monthlyAverageOccupancy = calculateAverageAccommodationOccupancy(currentMonthAccommodationReports);
  const totalCheckIns = approvedAccommodationReports.reduce((sum, report) => sum + toNumber(report.total_check_ins), 0);
  const totalGuestNights = approvedAccommodationReports.reduce((sum, report) => sum + toNumber(report.total_guest_nights), 0);

  const accommodationTrendData = useMemo(() => {
    const monthMap = new Map<string, { month: string; checkIns: number; guestNights: number; occupancyRates: number[] }>();

    approvedAccommodationReports.forEach((report) => {
      const key = (report.report_date || "No date").slice(0, 7);
      const current = monthMap.get(key) || { month: monthLabel(report.report_date), checkIns: 0, guestNights: 0, occupancyRates: [] };
      current.checkIns += toNumber(report.total_check_ins);
      current.guestNights += toNumber(report.total_guest_nights);
      current.occupancyRates.push(
        calculateAccommodationOccupancy(report.total_occupied_rooms, report.total_rooms, report.report_date)
      );
      monthMap.set(key, current);
    });

    return Array.from(monthMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-6)
      .map(([, value]) => ({
        month: value.month,
        checkIns: value.checkIns,
        guestNights: value.guestNights,
        occupancyRate: value.occupancyRates.length > 0
          ? Number((value.occupancyRates.reduce((sum, rate) => sum + rate, 0) / value.occupancyRates.length).toFixed(1))
          : 0,
      }));
  }, [approvedAccommodationReports]);

  const bestAccommodationMonth = accommodationTrendData.reduce(
    (best, current) => (current.checkIns > best.checkIns ? current : best),
    { month: "No data", checkIns: 0, guestNights: 0 }
  );

  if (loading) {
    return <LoadingState label="Loading establishment analytics" />;
  }

  return (
    <div className="space-y-6" data-staff-analytics-scope="resort-visitors-hotel-occupancy">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Establishment Analytics</h1>
        <p className="mt-1 text-gray-600">
          Track {establishment?.name || "your establishment"} performance from approved submitted reports.
        </p>
      </div>

      {showVisitorAnalytics && (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MetricCard label="Visitor Count" value={totalVisitors.toLocaleString()} helper="approved visitor reports" icon={UsersRound} tone="bg-emerald-50 text-emerald-700 ring-emerald-100" />
            <MetricCard label="Monthly Arrivals" value={currentMonthVisitors.toLocaleString()} helper="current month visitors" icon={Calendar} tone="bg-sky-50 text-sky-700 ring-sky-100" />
            <MetricCard label="Demographics" value={demographicKpi} helper={`${totalMale.toLocaleString()} male · ${totalFemale.toLocaleString()} female`} icon={PieChart} tone="bg-violet-50 text-violet-700 ring-violet-100" />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-[#0E5A72]" />
              <h3 className="text-lg font-semibold text-gray-900">Visitor Count Trends</h3>
            </div>
            <ResponsiveContainer width="100%" height={350}>
              <LineChart data={visitorTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="visitors" stroke="#0E5A72" strokeWidth={2} name="Visitors" />
                <Line type="monotone" dataKey="male" stroke="#38bdf8" strokeWidth={2} name="Male" />
                <Line type="monotone" dataKey="female" stroke="#a78bfa" strokeWidth={2} name="Female" />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Monthly Guest Overview</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={visitorTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="visitors" fill="#0E5A72" name="Total Visitors" />
                <Bar dataKey="male" fill="#38bdf8" name="Male" />
                <Bar dataKey="female" fill="#a78bfa" name="Female" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Visitor Demographics by Residence</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={residenceData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="residence" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="visitors" fill="#0E5A72" name="Visitors" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-[#0E5A72]/20 bg-gradient-to-br from-cyan-50 to-emerald-50 p-6" data-resort-best-performing-month="visitor-demographics">
            <h4 className="mb-2 font-semibold text-[#0B2530]">Best Performing Month</h4>
            <p className="mb-1 text-3xl font-bold text-[#0B2530]">{bestVisitorMonth.month}</p>
            <p className="text-sm text-[#0E5A72]">
              {bestVisitorMonth.visitors.toLocaleString()} visitors · {bestVisitorMonth.male.toLocaleString()} male · {bestVisitorMonth.female.toLocaleString()} female
            </p>
          </div>
        </>
      )}

      {showAccommodationAnalytics && (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <MetricCard label="Monthly Average Occupancy Rate" value={`${monthlyAverageOccupancy.toFixed(1)}%`} helper="current month approved hotel reports" icon={Percent} tone="bg-violet-50 text-violet-700 ring-violet-100" />
            <MetricCard label="Total Check-ins" value={totalCheckIns.toLocaleString()} helper="approved accommodation reports" icon={UsersRound} tone="bg-emerald-50 text-emerald-700 ring-emerald-100" />
            <MetricCard label="Guest Nights" value={totalGuestNights.toLocaleString()} helper="approved accommodation reports" icon={TrendingUp} tone="bg-sky-50 text-sky-700 ring-sky-100" />
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">Monthly Hotel Occupancy Overview</h3>
            <ResponsiveContainer width="100%" height={350}>
              <BarChart data={accommodationTrendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis allowDecimals={false} />
                <Tooltip />
                <Legend />
                <Bar dataKey="occupancyRate" fill="#7c3aed" name="Avg Occupancy %" />
                <Bar dataKey="checkIns" fill="#0E5A72" name="Check-ins" />
                <Bar dataKey="guestNights" fill="#8b5cf6" name="Guest Nights" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-lg border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100 p-6">
            <h4 className="mb-2 font-semibold text-blue-900">Best Performing Month</h4>
            <p className="mb-1 text-3xl font-bold text-blue-900">{bestAccommodationMonth.month}</p>
            <p className="text-sm text-blue-700">
              {bestAccommodationMonth.checkIns.toLocaleString()} check-ins · {bestAccommodationMonth.guestNights.toLocaleString()} guest nights
            </p>
          </div>
        </>
      )}
    </div>
  );
}
