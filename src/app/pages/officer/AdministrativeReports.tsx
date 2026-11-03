import { useEffect, useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, CheckCircle2, Clock3, Download, FileText, RefreshCw, Search, Sparkles, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "../../../lib/supabase";
import { PageHero } from "../../components/vista/PolishedShell";
import { exportAdministrativeReportDocx, exportAdministrativeReportPdf } from "../../../lib/administrativeReportExport";

 type PeriodType = "week" | "month" | "quarter" | "year";
 type TrendRow = { period: string; dayTourVisits: number; guestCheckIns: number };
 type PerformanceRow = { establishmentId: string; establishmentName: string; type: "daytour" | "accommodation"; currentActivity: number; submittedRecords: number; reportingMode: string };
 type Source = {
   dateRange: { startDate: string; endDate: string };
   periodType: PeriodType;
   visitorTotal: number;
   guestCheckInTotal: number;
   visitorRecordCount: number;
   accommodationRecordCount: number;
   establishmentCount: number;
   activeEstablishmentCount: number;
   daily: TrendRow[];
   monthly: TrendRow[];
   performance: PerformanceRow[];
   previousPerformance: PerformanceRow[];
   comparison: { dateRange: { start: string; end: string }; dayTourVisits: Change; guestCheckIns: Change; yearAgo: { dateRange: { start: string; end: string }; visitorTotal: number; guestCheckInTotal: number } | null };
   completeness: { expectedDayTour: number; submittedDayTour: number; missingDayTour: number; expectedAccommodation: number; submittedAccommodation: number; missingAccommodation: number; expectedTotal: number; submittedTotal: number; percentage: number | null; basis: string };
   dataQuality: { isPartialPeriod: boolean; periodCompleteThrough: string; notes: string[] };
 };
 type Change = { current: number; previous: number; absolute: number; percentage: number | null; label: string };
 type Narrative = { status: "generated" | "fallback"; model: string; executiveSummary: string; dayTourAnalysis: string; accommodationAnalysis: string; recommendations: string[] };
 type Report = { title: string; periodLabel: string; status: "Draft" | "For Review" | "Revision Required" | "Approved"; generatedBy: string; source: Source; narrative: Narrative; recommendations: string[]; edits: { executiveSummary?: string; recommendations?: string[] } | null; approvalHistory: { action: string; actor: string; at: string }[] };
 type HistoryItem = { id: string; periodKey: string; generatedAt: string; report: Report };

const pad = (value: number) => String(value).padStart(2, "0");
const formatDate = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const currentYear = new Date().getFullYear();
const daysInMonth = (year: number, month: number) => new Date(year, month, 0).getDate();
const getIsoWeek = (year: number, week: number) => {
  const januaryFourth = new Date(year, 0, 4);
  const day = januaryFourth.getDay() || 7;
  const monday = new Date(januaryFourth);
  monday.setDate(januaryFourth.getDate() - day + 1 + (week - 1) * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: formatDate(monday), end: formatDate(sunday) };
};
const getRange = (type: PeriodType, year: number, month: number, quarter: number, week: number) => {
  if (type === "week") return getIsoWeek(year, week);
  if (type === "month") return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(daysInMonth(year, month))}` };
  if (type === "quarter") return { start: `${year}-${pad((quarter - 1) * 3 + 1)}-01`, end: `${year}-${pad(quarter * 3)}-${pad(daysInMonth(year, quarter * 3))}` };
  return { start: `${year}-01-01`, end: `${year}-12-31` };
};
const periodLabel = (type: PeriodType, year: number, month: number, quarter: number, week: number, range: { start: string; end: string }) => type === "week" ? `Weekly Report · Week ${week}, ${year}` : type === "month" ? `Monthly Report · ${monthNames[month - 1]} ${year}` : type === "quarter" ? `Quarterly Report · Q${quarter} ${year}` : `Annual Report · ${year}`;
const numberFormat = (value: number) => value.toLocaleString("en-US");
const percentLabel = (value: number | null) => value === null ? "N/A" : `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;

const apiRequest = async (body: Record<string, unknown>) => {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.access_token) throw new Error("Your officer session has expired. Please sign in again.");
  const response = await fetch("/api/administrative-report", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` }, body: JSON.stringify(body) });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "Administrative report request failed.");
  return result;
};

const Section = ({ title, eyebrow, children, action }: { title: string; eyebrow?: string; children: React.ReactNode; action?: React.ReactNode }) => <section className="rounded-3xl border border-[#AFB3B5]/70 bg-[#E0E5EC] p-4 shadow-[8px_8px_16px_rgba(163,177,198,.48),-8px_-8px_16px_rgba(255,255,255,.58)] sm:p-6"><div className="mb-5 flex flex-col gap-3 border-b border-[#c7ced8]/70 pb-4 sm:flex-row sm:items-start sm:justify-between"> <div>{eyebrow && <p className="text-[10px] font-bold uppercase tracking-[.16em] text-[#0E5A72]">{eyebrow}</p>}<h2 className="mt-1 text-xl font-bold tracking-[-.02em] text-[#193364]">{title}</h2></div>{action}</div>{children}</section>;
const Kpi = ({ title, value, helper, change, icon: Icon }: { title: string; value: string; helper: string; change?: Change; icon: typeof TrendingUp }) => <div className="rounded-2xl bg-[#E0E5EC] p-4 shadow-[inset_4px_4px_8px_rgba(163,177,198,.4),inset_-4px_-4px_8px_rgba(255,255,255,.7)]"><div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold uppercase tracking-wide text-[#64748b]">{title}</p><Icon className="h-4 w-4 text-[#0E5A72]" /></div><p className="mt-3 text-2xl font-black tabular-nums text-[#193364]">{value}</p><p className="mt-1 text-xs leading-5 text-[#64748b]">{helper}</p>{change && <p className={`mt-2 text-xs font-bold ${change.percentage !== null && change.percentage < 0 ? "text-rose-700" : "text-emerald-700"}`}>{percentLabel(change.percentage)} vs previous period</p>}</div>;

export default function AdministrativeReports() {
  const [periodType, setPeriodType] = useState<PeriodType>("month");
  const [year, setYear] = useState(currentYear);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [quarter, setQuarter] = useState(Math.floor(new Date().getMonth() / 3) + 1);
  const [week, setWeek] = useState(1);
  const [source, setSource] = useState<Source | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [performanceTab, setPerformanceTab] = useState<"daytour" | "accommodation">("daytour");
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState(false);
  const [editSummary, setEditSummary] = useState("");
  const [editRecommendations, setEditRecommendations] = useState("");
  const range = useMemo(() => getRange(periodType, year, month, quarter, week), [periodType, year, month, quarter, week]);
  const key = `${periodType}:${year}:${month}:${quarter}:${week}`;
  const label = periodLabel(periodType, year, month, quarter, week, range);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const result = await apiRequest({ action: "data", periodType, startDate: range.start, endDate: range.end });
      setSource(result.source);
      const saved = await apiRequest({ action: "get", periodKey: key });
      setReport(saved.saved?.report || null);
      const historyResult = await apiRequest({ action: "history" });
      setHistory(historyResult.history || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to load administrative report data."); }
    finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [key]);

  const generate = async (forceRegenerate = false) => {
    setGenerating(true); setError("");
    try {
      const result = await apiRequest({ action: "generate", forceRegenerate, periodKey: key, periodType, startDate: range.start, endDate: range.end, periodLabel: label, title: `${periodType === "year" ? "Annual" : periodType[0].toUpperCase() + periodType.slice(1)} Tourism Performance and Administrative Report` });
      setReport(result.report); setEditing(false);
      const historyResult = await apiRequest({ action: "history" }); setHistory(historyResult.history || []);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to generate the administrative report."); }
    finally { setGenerating(false); }
  };
  const transition = async (action: "save_edit" | "submit_review" | "request_revision" | "approve") => {
    if (!report) return;
    setGenerating(true);
    try {
      const result = await apiRequest({ action, periodKey: key, executiveSummary: editSummary, recommendations: editRecommendations.split("\n").map((item) => item.trim()).filter(Boolean) });
      setReport(result.report); setEditing(false);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Unable to update the report."); }
    finally { setGenerating(false); }
  };

  const chart = source ? (periodType === "week" || periodType === "month" ? source.daily : source.monthly) : [];
  const performance = source?.performance.filter((row) => row.type === performanceTab && row.establishmentName.toLowerCase().includes(search.toLowerCase().trim())) || [];
  const previousByKey = new Map((source?.previousPerformance || []).map((row) => [`${row.establishmentId}:${row.type}`, row.currentActivity]));
  const narrativeSummary = report?.edits?.executiveSummary || report?.narrative.executiveSummary || "Generate an evidence-based narrative after reviewing the verified source totals.";

  return <div className="space-y-6 pb-10">
    <PageHero eyebrow="Municipal Tourism Office" title="AI Administrative Reports" description="Analyze tourism performance, monitor establishment activity, and generate comprehensive administrative reports using validated tourism data." compact />
    <Section title="Report filters" eyebrow="Section 1 — Dashboard controls" action={<button type="button" onClick={() => void load()} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#E0E5EC] px-4 py-2 text-sm font-bold text-[#193364] shadow-[5px_5px_10px_rgba(163,177,198,.52),-5px_-5px_10px_rgba(255,255,255,.65)]"><RefreshCw className="h-4 w-4" />Refresh data</button>}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4"><button type="button" onClick={() => setPeriodType("week")} className={`rounded-xl px-3 py-2 text-sm font-bold ${periodType === "week" ? "bg-[#193364] text-white" : "bg-[#E5E8E1] text-[#193364]"}`}>Weekly</button><button type="button" onClick={() => setPeriodType("month")} className={`rounded-xl px-3 py-2 text-sm font-bold ${periodType === "month" ? "bg-[#193364] text-white" : "bg-[#E5E8E1] text-[#193364]"}`}>Monthly</button><button type="button" onClick={() => setPeriodType("quarter")} className={`rounded-xl px-3 py-2 text-sm font-bold ${periodType === "quarter" ? "bg-[#193364] text-white" : "bg-[#E5E8E1] text-[#193364]"}`}>Quarterly</button><button type="button" onClick={() => setPeriodType("year")} className={`rounded-xl px-3 py-2 text-sm font-bold ${periodType === "year" ? "bg-[#193364] text-white" : "bg-[#E5E8E1] text-[#193364]"}`}>Yearly</button></div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><label className="text-xs font-bold text-[#64748b]">Year<select value={year} onChange={(event) => setYear(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-[#AFB3B5] bg-[#F5F8FF] px-3 py-2 text-sm text-[#193364]"><option>{currentYear - 2}</option><option>{currentYear - 1}</option><option>{currentYear}</option><option>{currentYear + 1}</option></select></label>{periodType === "month" && <label className="text-xs font-bold text-[#64748b]">Month<select value={month} onChange={(event) => setMonth(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-[#AFB3B5] bg-[#F5F8FF] px-3 py-2 text-sm text-[#193364]">{monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>}{periodType === "quarter" && <label className="text-xs font-bold text-[#64748b]">Quarter<select value={quarter} onChange={(event) => setQuarter(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-[#AFB3B5] bg-[#F5F8FF] px-3 py-2 text-sm text-[#193364]"><option value="1">Q1</option><option value="2">Q2</option><option value="3">Q3</option><option value="4">Q4</option></select></label>}{periodType === "week" && <label className="text-xs font-bold text-[#64748b]">ISO week<select value={week} onChange={(event) => setWeek(Number(event.target.value))} className="mt-1 w-full rounded-xl border border-[#AFB3B5] bg-[#F5F8FF] px-3 py-2 text-sm text-[#193364]">{Array.from({ length: 53 }, (_, index) => <option key={index + 1} value={index + 1}>Week {index + 1}</option>)}</select></label>}</div>
      <p className="mt-4 rounded-xl bg-[#F5F8FF] px-4 py-3 text-sm font-semibold text-[#193364]">{label} · Inclusive coverage: {range.start} to {range.end} · Asia/Manila administrative dates</p>
    </Section>
    {error && <div className="rounded-2xl border border-rose-300 bg-rose-50 p-4 text-sm font-semibold text-rose-800">{error}</div>}
    {loading ? <div className="rounded-3xl bg-[#E0E5EC] p-12 text-center text-sm font-semibold text-[#64748b]">Loading verified source data…</div> : source && <>
      <Section title="Tourism performance overview" eyebrow="Section 2 — Verified KPIs"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-6"><Kpi title="Day-tour visits" value={numberFormat(source.visitorTotal)} helper={`${numberFormat(source.visitorRecordCount)} submitted source records`} change={source.comparison.dayTourVisits} icon={source.comparison.dayTourVisits.percentage !== null && source.comparison.dayTourVisits.percentage < 0 ? TrendingDown : TrendingUp} /><Kpi title="Guest arrivals" value={numberFormat(source.guestCheckInTotal)} helper={`${numberFormat(source.accommodationRecordCount)} accommodation records`} change={source.comparison.guestCheckIns} icon={source.comparison.guestCheckIns.percentage !== null && source.comparison.guestCheckIns.percentage < 0 ? TrendingDown : TrendingUp} /><Kpi title="Reporting establishments" value={`${source.establishmentCount}/${source.activeEstablishmentCount}`} helper="Unique establishments with submitted data" icon={CheckCircle2} /><Kpi title="Completeness" value={source.completeness.percentage === null ? "N/A" : `${source.completeness.percentage.toFixed(1)}%`} helper="Estimated daily reporting coverage" icon={CheckCircle2} /><Kpi title="Day-tour growth" value={percentLabel(source.comparison.dayTourVisits.percentage)} helper="Compared with previous period" icon={TrendingUp} /><Kpi title="Accommodation growth" value={percentLabel(source.comparison.guestCheckIns.percentage)} helper="Compared with previous period" icon={TrendingUp} /></div></Section>
      <Section title="Tourism activity and statistical trends" eyebrow="Section 3 — Actual dated records"><div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="period" tick={{ fontSize: 11 }} /><YAxis allowDecimals={false} /><Tooltip /><Legend /><Area type="monotone" dataKey="dayTourVisits" name="Day-tour visits" stroke="#193364" fill="#193364" fillOpacity={.18} /><Area type="monotone" dataKey="guestCheckIns" name="Accommodation guest arrivals" stroke="#D69A3A" fill="#D69A3A" fillOpacity={.18} /></AreaChart></ResponsiveContainer></div>{chart.length === 0 && <p className="mt-3 text-sm text-[#64748b]">No submitted source records are available for this period. No daily distribution has been invented.</p>}</Section>
      <div className="grid gap-6 xl:grid-cols-2"><Section title="AI Executive Insights" eyebrow="Section 4 — On-demand interpretation" action={<button type="button" disabled={generating} onClick={() => void generate(Boolean(report))} className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#193364] px-4 py-2 text-sm font-bold text-white disabled:opacity-60"><Sparkles className="h-4 w-4" />{generating ? "Generating…" : report ? "Regenerate" : "Generate report"}</button>}><div className="rounded-2xl bg-[#F5F8FF] p-4 text-sm leading-6 text-[#334155]"><p>{narrativeSummary}</p>{report && <><p className="mt-3">{report.edits?.executiveSummary ? "Edited by an authorized officer." : report.narrative.dayTourAnalysis}</p><p className="mt-3">{report.narrative.accommodationAnalysis}</p><p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#64748b]">{report.narrative.status === "generated" ? `AI-assisted · ${report.narrative.model}` : "Deterministic fallback"}</p></>}</div></Section><Section title="Reporting completeness and data quality" eyebrow="Section 6 — Limitations"><div className="grid grid-cols-2 gap-3"><div className="rounded-2xl bg-[#F5F8FF] p-4"><p className="text-xs font-bold text-[#64748b]">Day-tour reports</p><p className="mt-2 text-xl font-black text-[#193364]">{source.completeness.submittedDayTour}/{source.completeness.expectedDayTour}</p><p className="text-xs text-[#64748b]">{source.completeness.missingDayTour} estimated missing</p></div><div className="rounded-2xl bg-[#F5F8FF] p-4"><p className="text-xs font-bold text-[#64748b]">Accommodation reports</p><p className="mt-2 text-xl font-black text-[#193364]">{source.completeness.submittedAccommodation}/{source.completeness.expectedAccommodation}</p><p className="text-xs text-[#64748b]">{source.completeness.missingAccommodation} estimated missing</p></div></div><p className="mt-4 text-xs leading-5 text-[#64748b]">{source.completeness.basis}</p>{source.dataQuality.notes.length > 0 && <div className="mt-4 space-y-2">{source.dataQuality.notes.map((note) => <p key={note} className="flex gap-2 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{note}</p>)}</div>}</Section></div>
      <Section title="Establishment performance overview" eyebrow="Section 5 — Separate report types"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="grid grid-cols-2 rounded-xl bg-[#E5E8E1] p-1"><button type="button" onClick={() => setPerformanceTab("daytour")} className={`rounded-lg px-3 py-2 text-xs font-bold ${performanceTab === "daytour" ? "bg-white text-[#193364] shadow-sm" : "text-[#64748b]"}`}>Day-tour establishments</button><button type="button" onClick={() => setPerformanceTab("accommodation")} className={`rounded-lg px-3 py-2 text-xs font-bold ${performanceTab === "accommodation" ? "bg-white text-[#193364] shadow-sm" : "text-[#64748b]"}`}>Accommodation establishments</button></div><label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-[#64748b]" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search establishment" className="w-full rounded-xl border border-[#AFB3B5] bg-[#F5F8FF] py-2 pl-9 pr-3 text-sm sm:w-64" /></label></div><div className="mt-4 overflow-x-auto rounded-2xl border border-[#c7ced8]/70"><table className="min-w-[44rem] w-full text-left text-xs"><thead className="bg-[#F5F8FF] text-[#64748b]"><tr><th className="px-3 py-3 font-bold">Establishment</th><th className="px-3 py-3 font-bold">Current activity</th><th className="px-3 py-3 font-bold">Previous</th><th className="px-3 py-3 font-bold">Change</th><th className="px-3 py-3 font-bold">Trend</th></tr></thead><tbody>{performance.map((row) => { const previous = previousByKey.get(`${row.establishmentId}:${row.type}`); const delta = previous === undefined ? null : percentLabel(previous > 0 ? ((row.currentActivity - previous) / previous) * 100 : null); return <tr key={`${row.establishmentId}:${row.type}`} className="border-t border-[#c7ced8]/60"><td className="px-3 py-3 font-semibold text-[#193364]">{row.establishmentName}</td><td className="px-3 py-3">{numberFormat(row.currentActivity)}</td><td className="px-3 py-3">{previous === undefined ? "No comparison" : numberFormat(previous)}</td><td className="px-3 py-3">{delta || "Insufficient data"}</td><td className="px-3 py-3">{delta?.startsWith("-") ? "Decreasing activity" : delta ? "Increasing activity" : "Insufficient comparison"}</td></tr>})}</tbody></table>{performance.length === 0 && <p className="p-5 text-sm text-[#64748b]">No establishments with submitted {performanceTab === "daytour" ? "day-tour" : "accommodation"} records in this period.</p>}</div></Section>
      <Section title="AI administrative recommendations" eyebrow="Section 7 — Evidence-linked actions"><div className="space-y-3">{(report?.recommendations || ["Generate the report after reviewing verified totals to create evidence-linked recommendations."]).map((recommendation) => <div key={recommendation} className="rounded-2xl bg-[#F5F8FF] p-4 text-sm leading-6 text-[#334155]"><p className="font-bold text-[#193364]">Recommended administrative action</p><p className="mt-1">{recommendation}</p></div>)}</div></Section>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_minmax(20rem,.7fr)]"><Section title="Administrative report preview" eyebrow="Sections 8–10" action={report && <div className="flex flex-wrap gap-2"><button type="button" onClick={() => exportAdministrativeReportPdf(report)} className="inline-flex items-center gap-2 rounded-xl bg-[#E0E5EC] px-3 py-2 text-xs font-bold text-[#193364] shadow-sm"><Download className="h-4 w-4" />PDF</button><button type="button" onClick={() => void exportAdministrativeReportDocx(report)} className="inline-flex items-center gap-2 rounded-xl bg-[#E0E5EC] px-3 py-2 text-xs font-bold text-[#193364] shadow-sm"><Download className="h-4 w-4" />DOCX</button><button type="button" onClick={() => { setEditing(!editing); setEditSummary(narrativeSummary); setEditRecommendations((report?.recommendations || []).join("\n")); }} className="rounded-xl bg-[#E0E5EC] px-3 py-2 text-xs font-bold text-[#193364] shadow-sm">{editing ? "Cancel edit" : "Edit draft"}</button></div>}>
        {!report ? <p className="text-sm leading-6 text-[#64748b]">Generate a report to create a saved draft. The verified statistics above remain available without AI.</p> : <div className="space-y-4 text-sm leading-6 text-[#334155]"><p className="font-black uppercase tracking-wide text-[#193364]">Republic of the Philippines · Province of Batangas · Municipality of Balayan · Municipal Tourism Office</p><p className="font-bold">{report.title}</p><p>Reporting period: {report.periodLabel}<br />Report status: {report.status}<br />Prepared through: VistaBalayan Tourism Data Analytics and Decision Support System</p>{editing ? <><textarea aria-label="Edit executive summary" value={editSummary} onChange={(event) => setEditSummary(event.target.value)} className="min-h-32 w-full rounded-xl border border-[#AFB3B5] bg-white p-3" /><textarea aria-label="Edit recommendations" value={editRecommendations} onChange={(event) => setEditRecommendations(event.target.value)} placeholder="One recommendation per line" className="min-h-24 w-full rounded-xl border border-[#AFB3B5] bg-white p-3" /></> : <p>{narrativeSummary}</p>}<div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-[#F5F8FF] p-3"><span className="text-xs text-[#64748b]">Day-tour visits</span><strong className="block text-lg text-[#193364]">{numberFormat(source.visitorTotal)}</strong></div><div className="rounded-xl bg-[#F5F8FF] p-3"><span className="text-xs text-[#64748b]">Guest arrivals</span><strong className="block text-lg text-[#193364]">{numberFormat(source.guestCheckInTotal)}</strong></div></div>{editing && <button type="button" onClick={() => void transition("save_edit")} className="rounded-xl bg-[#193364] px-4 py-2 text-sm font-bold text-white">Save narrative edit</button>}</div>}
      </Section><Section title="Report history and approval" eyebrow="Section 9 — Saved snapshots"><div className="space-y-3">{report && <div className="rounded-2xl bg-[#F5F8FF] p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-bold text-[#193364]">Current report</p><p className="mt-1 text-xs text-[#64748b]">{report.status} · {report.periodLabel}</p></div><FileText className="h-5 w-5 text-[#0E5A72]" /></div><div className="mt-3 flex flex-wrap gap-2">{report.status === "Draft" || report.status === "Revision Required" ? <button type="button" onClick={() => void transition("submit_review")} className="rounded-lg bg-[#193364] px-3 py-2 text-xs font-bold text-white">Submit for review</button> : null}{report.status === "For Review" && <button type="button" onClick={() => void transition("approve")} className="rounded-lg bg-emerald-700 px-3 py-2 text-xs font-bold text-white">Approve</button>}{report.status === "For Review" && <button type="button" onClick={() => void transition("request_revision")} className="rounded-lg bg-amber-600 px-3 py-2 text-xs font-bold text-white">Request revision</button>}</div></div>}{history.map((item) => <button type="button" key={item.id} onClick={() => { setReport(item.report); setSource(item.report.source); }} className="w-full rounded-xl border border-[#c7ced8]/70 bg-[#E0E5EC] p-3 text-left hover:bg-[#F5F8FF]"><p className="text-sm font-bold text-[#193364]">{item.report.periodLabel}</p><p className="mt-1 text-xs text-[#64748b]">{item.report.status} · {new Date(item.generatedAt).toLocaleString()}</p></button>)}{history.length === 0 && !report && <p className="text-sm text-[#64748b]">No saved report snapshots yet.</p>}</div></Section></div>
    </>}
  </div>;
}
