import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { BarChart3, Search } from "lucide-react";
import type { PerformanceClassification } from "../../../lib/performanceClassification";
import { classifyPerformance } from "../../../lib/performanceClassification";
import type { PerformanceScoreRow } from "../../../lib/establishmentPerformanceScores";
import type { ReportingMode } from "../../../lib/establishmentReportForms";
import { useDominantAxisTableScroll } from "../../../hooks/useDominantAxisTableScroll";

type Category = "daytour" | "overnight";
export type PerformanceInputWithMode = {
  id: string;
  name: string;
  serviceType: ReportingMode;
  category: Category;
  visitorCount: number | null;
  volumeClass?: PerformanceClassification;
};

type Props = {
  periods: Record<string, PerformanceInputWithMode[]>;
  activePeriodKey: string;
  activePeriodLabel: string;
  performanceScores?: PerformanceScoreRow[];
  aiFindings?: ReactNode;
};

const categoryLabels: Record<Category, string> = { daytour: "Day Tour", overnight: "Accommodation" };
const classificationLabels: Record<PerformanceClassification, string> = {
  HIGH: "High Volume", MODERATE: "Moderate Volume", LOW: "Low Volume", INSUFFICIENT_DATA: "Insufficient Data",
};
const segmentColors = ["#527CB0", "#9580B9", "#29846C", "#D49B42"];

export default function EstablishmentPerformanceDashboard({ periods, activePeriodKey, activePeriodLabel, performanceScores = [], aiFindings }: Props) {
  const [category, setCategory] = useState<Category>("daytour");
  const [query, setQuery] = useState("");
  const [eligibilityFilter, setEligibilityFilter] = useState<"ALL" | "ELIGIBLE" | "WITHHELD">("ALL");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { horizontalRef } = useDominantAxisTableScroll();
  const categoryRows = (periods[activePeriodKey] || []).filter((row) => row.category === category);
  const scoreRows = performanceScores.filter((row) => row.category === category);
  const scoreById = new Map(scoreRows.map((row) => [row.id, row]));
  const result = useMemo(() => classifyPerformance(categoryRows), [categoryRows]);
  const rows = result.rows
    .map((row) => ({ ...row, score: scoreById.get(row.id) }))
    .filter((row) => row.name.toLowerCase().includes(query.toLowerCase().trim()))
    .filter((row) => eligibilityFilter === "ALL" || (eligibilityFilter === "ELIGIBLE" ? row.score?.eligible : !row.score?.eligible));
  const rankedRows = [...rows].sort((a, b) => (b.score?.score ?? -1) - (a.score?.score ?? -1) || a.name.localeCompare(b.name));
  const eligibleRows = rankedRows.filter((row) => row.score?.eligible && row.score?.score !== null);
  const averageScore = eligibleRows.length ? eligibleRows.reduce((sum, row) => sum + (row.score?.score || 0), 0) / eligibleRows.length : null;
  const averageRating = eligibleRows.length ? eligibleRows.reduce((sum, row) => sum + (row.score?.averageRating || 0), 0) / eligibleRows.length : null;
  const selected = selectedId ? rankedRows.find((row) => row.id === selectedId) : rankedRows[0];
  const selectedScore = selected?.score;
  const chartRows = eligibleRows.slice(0, 10);

  return (
    <section id="analytics-performance" className="space-y-5 rounded-xl border border-[#E2E8F0] bg-[#F1F5F9] p-4 shadow-sm sm:p-6" aria-labelledby="establishment-performance-title">
      <div className="flex flex-col gap-4 border-b border-[#E2E8F0] pb-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#29846C]">Overall performance</p>
          <h3 id="establishment-performance-title" className="mt-1 text-xl font-semibold text-[#183153]">Tourism Establishment Performance Dashboard</h3>
          <p className="mt-1 max-w-3xl text-sm text-[#64748B]">Multidimensional assessment of tourism establishments in Balayan, Batangas. Scores are internal four-indicator evidence, not an official quality or profitability measure.</p>
          <p className="mt-2 text-xs font-medium text-[#64748B]">Effective period: {activePeriodLabel}. Day-tour and accommodation cohorts are assessed separately.</p>
        </div>
        <div className="inline-flex w-full rounded-lg border border-[#E2E8F0] bg-white p-1 sm:w-auto" role="tablist" aria-label="Performance service cohort">
          {(Object.keys(categoryLabels) as Category[]).map((item) => <button key={item} type="button" role="tab" aria-selected={category === item} onClick={() => setCategory(item)} className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold sm:flex-none ${category === item ? "bg-[#183153] text-white" : "text-[#64748B] hover:text-[#183153]"}`}>{categoryLabels[item]}</button>)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Average eligible score" value={averageScore === null ? "N/A" : averageScore.toFixed(2)} helper={`${eligibleRows.length} eligible`} />
        <Kpi label="Average eligible rating" value={averageRating === null ? "N/A" : `${averageRating.toFixed(2)} / 5`} helper="Establishment mean" />
        <Kpi label="Eligible / assessed" value={`${eligibleRows.length} / ${scoreRows.length}`} helper="Current cohort" />
        <Kpi label="Insufficient data" value={String(scoreRows.filter((row) => !row.eligible).length)} helper="Score withheld" />
      </div>

      <div className="rounded-xl border border-[#E2E8F0] bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-[#E2E8F0] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><h4 className="font-semibold text-[#183153]">Overall Performance Ranking</h4><p className="text-xs text-[#64748B]">Rankings use the unchanged reference cohort; search and pagination do not renormalize scores.</p></div>
          <div className="flex flex-col gap-2 sm:flex-row"><label className="relative"><Search className="absolute left-2 top-2 h-3.5 w-3.5 text-[#64748B]" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search establishment" aria-label="Search establishments" className="w-full rounded-md border border-[#E2E8F0] py-1.5 pl-8 pr-2 text-xs sm:w-44" /></label><select value={eligibilityFilter} onChange={(event) => setEligibilityFilter(event.target.value as typeof eligibilityFilter)} aria-label="Filter performance eligibility" className="rounded-md border border-[#E2E8F0] px-2 py-1.5 text-xs"><option value="ALL">All rows</option><option value="ELIGIBLE">Eligible only</option><option value="WITHHELD">Withheld only</option></select></div>
        </div>
        <div ref={horizontalRef} className="max-h-[28rem] overflow-auto"><table className="w-full min-w-[62rem] text-left text-xs"><thead className="sticky top-0 z-10 border-b border-[#E2E8F0] bg-[#F8FAFC] text-[#64748B]"><tr>{["Rank / Establishment", "Visitors / Growth", "Rating / Reviews", "Reporting", "Score / Details"].map((label) => <th key={label} className="px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody className="divide-y divide-[#E2E8F0]">{rankedRows.map((row) => { const score = row.score; return <tr key={`${row.id}-${category}`} className={`cursor-pointer hover:bg-[#F8FAFC] ${selectedId === row.id ? "bg-[#F0FDFA]" : ""}`} onClick={() => setSelectedId(row.id)}><td className="px-3 py-3"><div className="font-semibold text-[#183153]">{score?.rank ?? "Unranked"} · {row.name}</div><div className="mt-1 text-[#64748B]">{classificationLabels[row.classification]}</div></td><td className="px-3 py-3">{row.visitorCount === null ? "N/A" : row.visitorCount.toLocaleString()} / {score?.growthScore === null || score?.growthScore === undefined ? "N/A" : `${(score.growthScore - 50).toFixed(1)}%`}</td><td className="px-3 py-3">{score?.averageRating == null ? "N/A" : `${score.averageRating.toFixed(2)} / 5`} <span className="text-[#64748B]">({score?.ratingCount ?? 0})</span></td><td className="px-3 py-3">{score?.completenessScore == null ? "N/A" : `${score.completenessScore.toFixed(1)}%`}</td><td className="px-3 py-3"><span className="font-bold text-[#183153]">{score?.score == null ? "Withheld" : score.score.toFixed(2)}</span><div className="mt-1 text-[#64748B]">{score?.eligibilityReason || "No score evidence"}</div></td></tr>; })}</tbody></table>{rankedRows.length === 0 && <p className="p-8 text-center text-sm text-[#64748B]">No establishments match the selected filters.</p>}</div>
      </div>

      {eligibleRows.length > 0 && <div className="grid gap-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(18rem,0.7fr)]"><div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm"><div className="flex items-center gap-2"><BarChart3 className="h-4 w-4 text-[#29846C]" /><h4 className="font-semibold text-[#183153]">Weighted score composition</h4></div><p className="mt-1 text-xs text-[#64748B]">Fixed 0–100 scale; segments are weighted points: volume 30, growth 20, satisfaction 35, reporting 15.</p><div className="mt-4 space-y-3">{chartRows.map((row) => { const score = row.score!; const parts = [score.volumeScore! * .3, score.growthScore! * .2, score.satisfactionScore! * .35, score.completenessScore! * .15]; return <button type="button" key={`bar-${row.id}`} onClick={() => setSelectedId(row.id)} className="block w-full text-left"><div className="mb-1 flex justify-between text-xs font-semibold text-[#334155]"><span>{row.name}</span><span>{score.score!.toFixed(2)}</span></div><div className="flex h-5 overflow-hidden rounded bg-[#E2E8F0]">{parts.map((part, index) => <span key={index} style={{ width: `${part}%`, backgroundColor: segmentColors[index] }} title={`${part.toFixed(2)} weighted points`} />)}</div></button>; })}</div><div className="mt-4 flex flex-wrap gap-3 text-[11px] text-[#64748B]">{["Volume (30)", "Growth (20)", "Satisfaction (35)", "Reporting (15)"].map((label, index) => <span key={label}><i className="mr-1 inline-block h-2 w-2 rounded-full" style={{ backgroundColor: segmentColors[index] }} />{label}</span>)}</div></div><SelectedDetails row={selected} score={selectedScore} periodLabel={activePeriodLabel} /></div>}
      {eligibleRows.length === 0 && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>No eligible composite score is available for this cohort and period.</strong><p className="mt-1">Scores are withheld when volume, comparable growth, eligible ratings, or reporting completeness is missing or unreliable. Individual indicators remain visible in the table.</p></div>}
      {aiFindings}
    </section>
  );
}

function Kpi({ label, value, helper }: { label: string; value: string; helper: string }) { return <div className="rounded-lg border border-[#E2E8F0] bg-white p-3 shadow-sm"><p className="text-xs text-[#64748B]">{label}</p><p className="mt-2 text-xl font-bold text-[#183153]">{value}</p><p className="mt-1 text-[11px] text-[#64748B]">{helper}</p></div>; }
function SelectedDetails({ row, score, periodLabel }: { row?: { name: string; visitorCount: number | null; classification: PerformanceClassification }; score?: PerformanceScoreRow; periodLabel: string }) { return <div className="rounded-xl border border-[#E2E8F0] bg-white p-4 shadow-sm"><h4 className="font-semibold text-[#183153]">Selected establishment breakdown</h4>{row ? <><p className="mt-2 text-lg font-bold text-[#183153]">{row.name}</p><p className="text-xs text-[#64748B]">{periodLabel} · {classificationLabels[row.classification]}</p><dl className="mt-4 space-y-2 text-sm"><div className="flex justify-between gap-3"><dt className="text-[#64748B]">Visitors</dt><dd className="font-semibold">{row.visitorCount === null ? "N/A" : row.visitorCount.toLocaleString()}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#64748B]">Comparable growth</dt><dd className="font-semibold">{score?.growthScore == null ? "N/A" : `${(score.growthScore - 50).toFixed(1)}%`}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#64748B]">Eligible rating</dt><dd className="font-semibold">{score?.averageRating == null ? "N/A" : `${score.averageRating.toFixed(2)} / 5 (${score.ratingCount})`}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#64748B]">Completeness</dt><dd className="font-semibold">{score?.completenessScore == null ? "N/A" : `${score.completenessScore.toFixed(1)}%`}</dd></div><div className="flex justify-between gap-3"><dt className="text-[#64748B]">Score</dt><dd className="font-bold text-[#29846C]">{score?.score == null ? "Withheld" : score.score.toFixed(2)}</dd></div></dl><p className="mt-4 border-t border-[#E2E8F0] pt-3 text-xs text-[#64748B]">Missing evidence is shown as N/A, not converted to zero. This internal score does not measure profitability, legal compliance, or comprehensive quality.</p></> : <p className="mt-3 text-sm text-[#64748B]">Select an eligible establishment from the ranking.</p>}</div>; }
