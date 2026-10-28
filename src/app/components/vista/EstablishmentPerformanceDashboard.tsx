import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { BarChart3, ChevronRight, Search, X } from "lucide-react";
import { classifyPerformance, type PerformanceClassification, type PerformanceInput } from "../../../lib/performanceClassification";
import type { ReportingMode } from "../../../lib/establishmentReportForms";

type Category = "daytour" | "overnight";

export type PerformanceInputWithMode = PerformanceInput & {
  serviceType: ReportingMode;
  category: Category;
};

type Props = {
  periods: Record<string, PerformanceInputWithMode[]>;
  year: string;
};

const categoryLabels: Record<Category, string> = { daytour: "Day-Tour Performance", overnight: "Overnight Performance" };
const classificationLabels: Record<PerformanceClassification, string> = {
  HIGH: "High Volume",
  MODERATE: "Moderate Volume",
  LOW: "Low Volume",
  INSUFFICIENT_DATA: "Insufficient Data",
};
const colors: Record<PerformanceClassification, string> = {
  HIGH: "#2E8B70",
  MODERATE: "#D69A3A",
  LOW: "#B86B78",
  INSUFFICIENT_DATA: "#94A3B8",
};
const serviceLabels: Record<ReportingMode, string> = { visitor: "Day-Tour Only", accommodation: "Overnight Only", both: "Both" };
const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleString("default", { month: "long", year: "numeric" });
const fullYearKey = (year: string) => `${year}-FULL_YEAR`;
const periodLabel = (key: string) => key.endsWith("-FULL_YEAR") ? `Full Year ${key.slice(0, 4)}` : monthLabel(key);

export default function EstablishmentPerformanceDashboard({ periods, year }: Props) {
  const monthlyPeriods = Object.keys(periods).filter((period) => period.startsWith(`${year}-`) && !period.endsWith("-FULL_YEAR")).sort();
  const periodOptions = [...monthlyPeriods, fullYearKey(year)];
  const [category, setCategory] = useState<Category>("daytour");
  const [period, setPeriod] = useState(monthlyPeriods[monthlyPeriods.length - 1] || fullYearKey(year));
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<PerformanceClassification | "ALL">("ALL");
  const [sortDescending, setSortDescending] = useState(true);
  const [selected, setSelected] = useState<ReturnType<typeof classifyPerformance>["rows"][number] | null>(null);

  const selectedPeriod = periodOptions.includes(period) ? period : monthlyPeriods[monthlyPeriods.length - 1] || fullYearKey(year);
  const categoryRows = (periods[selectedPeriod] || []).filter((row) => row.category === category);
  const result = useMemo(() => classifyPerformance(categoryRows), [categoryRows]);
  const visibleRows = result.rows
    .filter((row) => row.name.toLowerCase().includes(query.toLowerCase().trim()))
    .filter((row) => filter === "ALL" || row.classification === filter)
    .sort((a, b) => sortDescending ? (b.visitorCount ?? -1) - (a.visitorCount ?? -1) : (a.visitorCount ?? -1) - (b.visitorCount ?? -1));
  const counts = result.rows.reduce<Record<PerformanceClassification, number>>((acc, row) => {
    acc[row.classification] += 1;
    return acc;
  }, { HIGH: 0, MODERATE: 0, LOW: 0, INSUFFICIENT_DATA: 0 });
  const chartData = (Object.keys(counts) as PerformanceClassification[]).map((key) => ({ name: classificationLabels[key], count: counts[key], fill: colors[key] }));

  return (
    <section className="space-y-5 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm sm:p-6" aria-labelledby="establishment-performance-title">
      <div className="border-b border-gray-200 pb-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0E5A72]">Establishment Performance</p>
            <h3 id="establishment-performance-title" className="mt-1 text-xl font-semibold text-gray-900">Tourism Establishment Performance Dashboard</h3>
            <p className="mt-1 max-w-3xl text-sm text-gray-600">Compare reported visitor volume by service category using relative percentile-based analysis for Balayan, Batangas.</p>
          </div>
          <label className="text-xs font-semibold text-gray-600">
            Reporting period
            <select value={selectedPeriod} onChange={(event) => setPeriod(event.target.value)} className="mt-1 block min-w-48 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-900 focus:border-[#0E5A72] focus:outline-none focus:ring-2 focus:ring-[#0E5A72]/20">
              {periodOptions.map((item) => <option key={item} value={item}>{periodLabel(item)}</option>)}
            </select>
          </label>
        </div>
        <div className="mt-5 inline-flex w-full rounded-xl bg-gray-100 p-1 sm:w-auto" role="tablist" aria-label="Visitor category">
          {(Object.keys(categoryLabels) as Category[]).map((item) => (
            <button key={item} type="button" role="tab" aria-selected={category === item} onClick={() => setCategory(item)} className={`flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition sm:flex-none ${category === item ? "bg-white text-[#0E5A72] shadow-sm" : "text-gray-600 hover:text-gray-900"}`}>
              {categoryLabels[item]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {(["TOTAL", "HIGH", "MODERATE", "LOW"] as const).map((key) => {
          const value = key === "TOTAL" ? result.rows.length : counts[key];
          const title = key === "TOTAL" ? "Total Establishments Monitored" : `${classificationLabels[key]} Establishments`;
          const tone = key === "TOTAL" ? "#193364" : colors[key];
          return <div key={key} className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm sm:p-4"><p className="text-xs font-medium leading-4 text-gray-600">{title}</p><p className="mt-2 text-2xl font-bold" style={{ color: tone }}>{value}</p><p className="mt-1 text-xs text-gray-500">{categoryLabels[category]} · {periodLabel(selectedPeriod)}</p></div>;
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.1fr)_minmax(20rem,0.9fr)]">
        <div className="overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
            <div><h4 className="font-semibold text-gray-900">Establishment Performance Rankings</h4><p className="text-xs text-gray-500">{result.rows.length} eligible establishments in this comparison group</p></div>
            <div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search establishment" className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm sm:w-52" aria-label="Search establishments" /></label><select value={filter} onChange={(event) => setFilter(event.target.value as PerformanceClassification | "ALL")} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" aria-label="Filter classification"><option value="ALL">All classifications</option>{(Object.keys(classificationLabels) as PerformanceClassification[]).map((key) => <option key={key} value={key}>{classificationLabels[key]}</option>)}</select></div>
          </div>
          <div className="h-[18rem] max-h-[18rem] overflow-auto"><table className="w-full min-w-[42rem] table-fixed md:min-w-0"><colgroup><col className="w-[8%]" /><col className="w-[28%]" /><col className="w-[19%]" /><col className="w-[14%]" /><col className="w-[23%]" /><col className="w-[8%]" /></colgroup><thead className="sticky top-0 z-10 bg-gray-50"><tr><th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 sm:px-4">Rank</th><th className="sticky left-0 z-20 bg-gray-50 px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 shadow-[2px_0_4px_rgba(148,163,184,0.24)] sm:px-4">Establishment</th><th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 sm:px-4">Service Type</th><th className="cursor-pointer px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 sm:px-4" onClick={() => setSortDescending((value) => !value)}>Visitors {sortDescending ? "↓" : "↑"}</th><th className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600 sm:px-4">Classification</th><th className="px-3 py-3 sm:px-4" /></tr></thead><tbody className="divide-y divide-gray-100">{visibleRows.map((row, index) => { const source = categoryRows.find((item) => item.id === row.id); return <tr key={`${row.id}-${category}`} className="cursor-pointer hover:bg-gray-50" onClick={() => setSelected(row)}><td className="px-3 py-3 text-sm text-gray-500 sm:px-4">{index + 1}</td><td className="sticky left-0 z-10 break-words bg-white px-3 py-3 text-sm font-semibold leading-5 text-gray-900 shadow-[2px_0_4px_rgba(148,163,184,0.18)] sm:px-4">{row.name}</td><td className="break-words px-3 py-3 text-sm leading-5 text-gray-600 sm:px-4">{source ? serviceLabels[source.serviceType] : "—"}</td><td className="whitespace-nowrap px-3 py-3 text-sm text-gray-900 sm:px-4">{row.visitorCount === null ? "No report" : row.visitorCount.toLocaleString()}</td><td className="px-3 py-3 sm:px-4"><span className="inline-flex max-w-full whitespace-normal break-words rounded-full px-2.5 py-1 text-xs font-semibold leading-4" style={{ color: colors[row.classification], backgroundColor: `${colors[row.classification]}18` }}>{classificationLabels[row.classification]}</span></td><td className="px-3 py-3 text-right sm:px-4"><ChevronRight className="ml-auto h-4 w-4 text-gray-400" /></td></tr>; })}</tbody></table>{visibleRows.length === 0 && <p className="p-8 text-center text-sm text-gray-500">No establishments match the selected filters.</p>}</div>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#0E5A72]" /><h4 className="font-semibold text-gray-900">Performance Distribution</h4></div><div className="mt-4 h-56"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 12 }}><CartesianGrid strokeDasharray="3 3" horizontal={false} /><XAxis type="number" allowDecimals={false} /><YAxis type="category" dataKey="name" width={96} tick={{ fontSize: 11 }} /><Tooltip /><Bar dataKey="count" name="Establishments">{chartData.map((entry) => <Cell key={entry.name} fill={entry.fill} />)}</Bar></BarChart></ResponsiveContainer></div><div className="mt-2 space-y-1">{chartData.map((entry) => <div key={entry.name} className="flex justify-between text-xs text-gray-600"><span>{entry.name}</span><strong>{entry.count} ({result.rows.length ? Math.round((entry.count / result.rows.length) * 100) : 0}%)</strong></div>)}</div></div>
      </div>

      {selected && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelected(null); }}><section className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="performance-detail-title"><div className="flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{categoryLabels[category]} · {periodLabel(selectedPeriod)}</p><h4 id="performance-detail-title" className="mt-1 text-xl font-bold text-gray-900">{selected.name}</h4></div><button type="button" className="rounded-full p-2 text-gray-500 hover:bg-gray-100" onClick={() => setSelected(null)} aria-label="Close details"><X className="h-5 w-5" /></button></div><div className="mt-5 grid grid-cols-2 gap-3"><div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Reported visitors</p><p className="mt-1 text-lg font-bold text-gray-900">{selected.visitorCount === null ? "No report submitted" : selected.visitorCount.toLocaleString()}</p></div><div className="rounded-lg bg-gray-50 p-3"><p className="text-xs text-gray-500">Classification</p><p className="mt-1 font-bold" style={{ color: colors[selected.classification] }}>{classificationLabels[selected.classification]}</p></div></div><div className="mt-4 rounded-lg border border-gray-200 p-4 text-sm text-gray-600"><p className="font-semibold text-gray-800">Why this rating?</p><p className="mt-2">{selected.classification === "INSUFFICIENT_DATA" ? "This establishment cannot receive a supported classification because the comparison group has fewer than five valid submitted establishments or this establishment has no valid report for the selected period." : `Its reported visitor count is compared with the eligible ${categoryLabels[category].toLowerCase()} group using inclusive P25 and P75 percentile thresholds.`}</p>{result.thresholds.p25 !== null && <p className="mt-2">P25: {result.thresholds.p25.toLocaleString()} visitors · P75: {result.thresholds.p75?.toLocaleString()} visitors</p>}</div></section></div>}
    </section>
  );
}
