import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";

import { cleanAiText, splitAiRecommendation } from "../../../lib/aiText";
import { AiFormattedText } from "../AiFormattedText";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/utils";

interface AiInsightShellProps {
  title?: string;
  subtitle: string;
  lastUpdated?: string | null;
  refreshing: boolean;
  canRefresh?: boolean;
  onRefresh: () => void;
  children: ReactNode;
}

export interface AiDecisionSupport {
  insight_category?: string;
  priority?: string;
  analysis_period?: string;
  geographic_scope?: string;
  data_confidence?: string;
  data_limitations?: string[];
  decision_implication?: string;
  recommended_actions?: Array<{
    action_title?: string;
    action_description?: string;
    action_priority?: string;
    action_category?: string;
    responsible_entity?: string;
    suggested_timeframe?: string;
    prerequisites?: string[];
    success_indicators?: string[];
    validation_required?: boolean;
  }>;
  responsible_entities?: string[];
  suggested_timeframe?: string;
  expected_outcome?: string;
  success_indicators?: string[];
  validation_required?: boolean;
}

interface AiAnomalyCardProps {
  id: string;
  anomaly_type: string;
  severity: string;
  description: string;
  recommendation?: string | null;
  detected_at: string;
  establishments?: { name: string } | null;
  input_snapshot?: Record<string, unknown> | null;
  aiRecommendation?: string | null;
  decisionSupport?: AiDecisionSupport | null;
  showRecommendationUnavailable?: boolean;
  evidenceHref?: string;
  evidenceLabel?: string;
  className?: string;
}

interface AiRecommendationCardProps {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: string;
  recommended_action?: string | null;
  input_snapshot?: Record<string, unknown> | null;
  evidenceHref?: string;
  evidenceLabel?: string;
}

const severityTone = (severity?: string) => {
  if (severity === "high") {
    return {
      badge: "border-red-400 bg-red-100 text-red-900 font-bold",
      icon: "text-red-700",
      soft: "bg-red-100/90 border border-red-300",
    };
  }

  if (severity === "medium") {
    return {
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      icon: "text-amber-600",
      soft: "bg-amber-50/70",
    };
  }

  return {
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    icon: "text-sky-600",
    soft: "bg-sky-50/70",
  };
};

const deriveSnapshotEvidence = (snapshot: Record<string, unknown>, prefix: "current" | "previous" = "current") => {
  const submittedValue = snapshot[`${prefix}_submitted_reports`];
  const expectedValue = snapshot[`${prefix}_expected_reports`];
  const submitted = Number(submittedValue);
  const expected = Number(expectedValue);
  if (submittedValue != null && expectedValue != null && Number.isFinite(submitted) && Number.isFinite(expected) && expected > 0) {
    return {
      submitted,
      expected,
      missing: Math.max(0, expected - submitted),
      coverage: Math.min(100, (submitted / expected) * 100),
    };
  }
  return {
    submitted: submittedValue == null ? null : Number(submittedValue),
    expected: expectedValue == null ? null : Number(expectedValue),
    missing: snapshot[`${prefix}_missing_reports`] == null ? null : Number(snapshot[`${prefix}_missing_reports`]),
    coverage: snapshot[`${prefix}_coverage_percent`] == null ? null : Number(snapshot[`${prefix}_coverage_percent`]),
  };
};

const formatEvidence = (snapshot?: Record<string, unknown> | null) => {
  if (!snapshot || !["dayTourVisitors", "overnightGuestCheckIns"].includes(String(snapshot.metric))) return null;
  const current = deriveSnapshotEvidence(snapshot);
  const currentValue = Number(snapshot.current_value || 0).toLocaleString();
  const previousValue = Number(snapshot.previous_value || 0).toLocaleString();
  const previousMonth = formatMonthLabel(snapshot.previous_month);
  const currentMonth = formatMonthLabel(snapshot.current_month);
  const metricLabel = snapshot.metric === "overnightGuestCheckIns" ? "guest check-ins" : "visitors";
  const missing = current.missing == null ? "missing reports unavailable" : `${current.missing.toLocaleString()} missing reports`;
  const enteredAfterReportDate = snapshot["current_entered_after_report_date"] == null ? 0 : Number(snapshot["current_entered_after_report_date"]);
  const timing = enteredAfterReportDate > 0 ? `${enteredAfterReportDate.toLocaleString()} entered after report date; timing requires verification` : "submission timing requires verification";
  return `${previousMonth}: ${previousValue} → ${currentMonth}: ${currentValue} ${metricLabel}; ${missing}; ${timing}.`;
};

const formatMonthLabel = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return String(value || "the period");
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long" }).format(new Date(Date.UTC(year, month - 1, 1)));
};

const formatMonthYearLabel = (value: unknown) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) return String(value || "the period");
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(new Date(Date.UTC(year, month - 1, 1)));
};

const formatAnomalyDescription = (anomaly: AiAnomalyCardProps) => {
  const snapshot = anomaly.input_snapshot;
  if (!snapshot || !["dayTourVisitors", "overnightGuestCheckIns"].includes(String(snapshot.metric))) return anomaly.description;

  const drop = Number(snapshot.drop_percent ?? snapshot.change_percent ?? 0).toFixed(1);
  const previousMonth = formatMonthLabel(snapshot.previous_month);
  const currentMonth = formatMonthYearLabel(snapshot.current_month);
  const isOvernight = snapshot.metric === "overnightGuestCheckIns";
  const metricLabel = isOvernight ? "overnight guest check-ins" : "day-tour visitors";
  const evidence = deriveSnapshotEvidence(snapshot);
  const coverage = evidence.coverage == null
    ? `${isOvernight ? "Accommodation reporting" : "Reporting"} coverage was unavailable.`
    : `with ${evidence.coverage.toFixed(1)}% ${isOvernight ? "accommodation reporting" : "reporting"} coverage.`;
  const missing = evidence.missing == null
    ? `${isOvernight ? "Missing accommodation report" : "Missing day-tour report"} count is unavailable.`
    : `${evidence.missing.toLocaleString()} expected ${isOvernight ? "accommodation" : "day-tour"} reports are missing.`;
  const lateCount = Number(snapshot.current_late_reports || 0);
  const late = lateCount === 0
    ? `No submitted ${isOvernight ? "accommodation" : "day-tour"} reports were identified as late.`
    : `${lateCount.toLocaleString()} submitted ${isOvernight ? "accommodation" : "day-tour"} report${lateCount === 1 ? "" : "s"} ${lateCount === 1 ? "was" : "were"} entered after the report date.`;

  return `Reported ${metricLabel} decreased ${drop}% from ${previousMonth} to ${currentMonth}, ${coverage} ${missing} ${late}`;
};

export function AiInsightsShell({
  title = "AI Insights",
  subtitle,
  lastUpdated,
  refreshing,
  canRefresh = true,
  onRefresh,
  children,
}: AiInsightShellProps) {
  return (
    <main className="w-full max-w-full overflow-x-hidden" data-ai-insights-redesign="shadcn-taste-editorial">
      <div className="space-y-5 sm:space-y-7">
        <section className="relative isolate overflow-hidden rounded-[1.75rem] border-0 bg-[#E0E5EC] p-4 shadow-[10px_10px_24px_rgba(163,177,198,0.55),-10px_-10px_24px_rgba(255,255,255,0.72)] sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#C8CED8]/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-white/35 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="min-w-0 flex-1 lg:pr-8">
              <div className="mb-3 inline-flex rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium tracking-[0.18em] text-slate-500 shadow-sm backdrop-blur">
                GEMINI OPERATIONS DESK
              </div>
              <h1 className="max-w-5xl text-[clamp(2rem,7vw,3.5rem)] font-semibold leading-tight tracking-[-0.045em] text-slate-800">
                {title}
              </h1>
              <p className="mt-3 max-w-none text-base leading-7 text-slate-600 sm:text-lg">
                {subtitle}
              </p>
              {lastUpdated && (
                <p className="mt-3 text-xs font-medium uppercase tracking-[0.18em] text-slate-400">
                  Last updated: {lastUpdated}
                </p>
              )}
            </div>
            <Button
              type="button"
              onClick={onRefresh}
              disabled={!canRefresh || refreshing}
              className="h-12 rounded-2xl bg-[#6C63FF] px-5 text-white shadow-[5px_5px_12px_rgba(163,177,198,0.55),-5px_-5px_12px_rgba(255,255,255,0.65)] hover:bg-[#5B54D6] sm:h-11"
            >
              {refreshing ? <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Sparkles className="h-4 w-4" aria-hidden="true" />}
              <span>{refreshing ? "Refreshing…" : "Refresh Analysis"}</span>
            </Button>
          </div>
        </section>

        {refreshing && (
          <div role="status" aria-live="polite" className="flex items-center gap-3 rounded-2xl border border-[#C9C3FF] bg-[#F1F0FF] px-4 py-3 text-sm font-semibold text-[#193364] shadow-[inset_3px_3px_7px_rgba(163,177,198,0.3),inset_-3px_-3px_7px_rgba(255,255,255,0.7)]">
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin text-[#6C63FF]" aria-hidden="true" />
            <span>Refreshing insights and checking the latest tourism data…</span>
            <span className="ml-auto h-2 w-20 shrink-0 animate-pulse rounded-full bg-[#6C63FF]/35" aria-hidden="true" />
          </div>
        )}

        {children}
      </div>
    </main>
  );
}

export function AiSectionCard({
  title,
  countLabel,
  icon,
  action,
  children,
}: {
  title: string;
  countLabel?: string;
  icon: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="isolate overflow-hidden rounded-[1.5rem] border-0 bg-[#E0E5EC] shadow-[8px_8px_18px_rgba(163,177,198,0.45),-8px_-8px_18px_rgba(255,255,255,0.62)]">
      <CardHeader className="rounded-t-[1.5rem] border-b border-[#D2D8E0] bg-[#E0E5EC]/70 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 text-lg font-semibold tracking-[-0.02em] text-slate-800 sm:text-xl">
            {icon}
            <span className="min-w-0">{title}</span>
          </CardTitle>
          {countLabel && (
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-sm">
              {countLabel}
            </Badge>
          )}
          {action}
        </div>
      </CardHeader>
      <CardContent className="rounded-b-[1.5rem] px-4 py-4 sm:px-6 sm:py-5">{children}</CardContent>
    </section>
  );
}

export function AiAnomalyCard(anomaly: AiAnomalyCardProps) {
  const tone = severityTone(anomaly.severity);
  const decisionSupport = anomaly.decisionSupport || anomaly.input_snapshot?.decision_support as AiDecisionSupport | undefined;
  const actionPlan = decisionSupport?.recommended_actions?.filter((action) => action.action_description) || [];

  return (
    <article className={cn("group relative h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(15,23,42,0.08)]", anomaly.className)} data-ai-card-layout="shadcn-anomaly-editorial">
      <div className="p-4 sm:p-5">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", tone.soft)}>
              <AlertTriangle className={cn("size-4", tone.icon)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-semibold leading-snug tracking-[-0.015em] text-slate-800 sm:text-lg">
                {cleanAiText(anomaly.anomaly_type)}
              </h3>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={cn("rounded-full px-2.5 py-1 capitalize", tone.badge)}>
                  {anomaly.severity || "notice"}
                </Badge>
                <span className="text-xs font-medium text-slate-500">
                  {anomaly.establishments?.name || "Municipality-wide"}
                </span>
              </div>
            </div>
          </div>
          <time className="shrink-0 rounded-full bg-slate-50 px-2.5 py-1 text-xs font-medium text-slate-500">
            {new Date(anomaly.detected_at).toLocaleDateString()}
          </time>
        </div>

        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-600">
          <p className="text-justify hyphens-auto indent-5" data-ai-text-spacing="editorial-justified-indent">
            <AiFormattedText text={formatAnomalyDescription(anomaly)} />
          </p>
          {formatEvidence(anomaly.input_snapshot) && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-sm leading-6 text-slate-600">
              <span className="font-semibold text-slate-800">Verified Evidence:</span>{" "}
              {formatEvidence(anomaly.input_snapshot)}
            </div>
          )}
          {actionPlan.length > 0 ? (
            <div className="space-y-3" data-ai-action-plan="decision-support">
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-slate-800">Recommended actions</span>
                {decisionSupport?.data_confidence && <Badge variant="outline" className="rounded-full border-slate-300 text-xs text-slate-600">{decisionSupport.data_confidence} confidence</Badge>}
              </div>
              <ol className="space-y-3">
                {actionPlan.map((action, index) => (
                  <li key={`${action.action_title || "action"}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <p className="font-semibold text-slate-800">{index + 1}. {cleanAiText(action.action_title || "Recommended action")}</p>
                      {action.action_priority && <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">{action.action_priority}</span>}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-slate-700"><AiFormattedText text={action.action_description || ""} tone="action" /></p>
                    {(action.responsible_entity || action.suggested_timeframe) && <p className="mt-2 text-xs font-medium text-slate-500">Responsible role/office: {action.responsible_entity || "To be assigned"} · Timeframe: {action.suggested_timeframe || "To be scheduled"}</p>}
                    {action.success_indicators?.length ? <p className="mt-2 text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-700">Success indicator:</span> {action.success_indicators.join("; ")}</p> : null}
                  </li>
                ))}
              </ol>
              {decisionSupport?.decision_implication && <p className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm leading-6 text-blue-900"><span className="font-semibold">Decision implication:</span> {decisionSupport.decision_implication}</p>}
              {decisionSupport?.expected_outcome && <p className="text-sm leading-6 text-slate-600"><span className="font-semibold text-slate-800">Expected outcome:</span> {decisionSupport.expected_outcome}</p>}
              {decisionSupport?.data_limitations?.length ? <p className="text-xs leading-5 text-slate-500"><span className="font-semibold text-slate-700">Limitations:</span> {decisionSupport.data_limitations.join("; ")}</p> : null}
            </div>
          ) : anomaly.aiRecommendation ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-justify leading-6 hyphens-auto" data-ai-action-note="editorial-shadcn">
              <span className="font-semibold text-slate-800">Recommendation:</span>{" "}
              <AiFormattedText text={anomaly.aiRecommendation} tone="action" />
            </div>
          ) : anomaly.showRecommendationUnavailable ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm leading-6 text-amber-900" data-ai-action-note="unavailable">
              No evidence-supported recommendation is available for this finding.
            </div>
          ) : null}
          {anomaly.evidenceHref && (
            <a href={anomaly.evidenceHref} className="inline-flex text-sm font-semibold text-[#0E5A72] underline decoration-[#0E5A72]/35 underline-offset-4 hover:text-[#193364]">
              View related {anomaly.evidenceLabel || "Analytics evidence"}
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export function AiRecommendationCard(insight: AiRecommendationCardProps) {
  const { summary, action } = splitAiRecommendation(insight.description, insight.recommended_action || undefined);
  const tone = severityTone(insight.impact);
  const decisionSupport = insight.input_snapshot?.decision_support as AiDecisionSupport | undefined;
  const actionPlan = decisionSupport?.recommended_actions?.filter((item) => item.action_description) || [];

  return (
    <article className="group relative isolate h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-0" data-ai-card-layout="shadcn-recommendation-editorial">
      <div className="relative flex h-full flex-col p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", tone.soft)}>
              <TrendingUp className={cn("size-4", tone.icon)} />
            </div>
            <h3 className="min-w-0 text-base font-semibold leading-snug tracking-[-0.015em] text-slate-800 sm:text-lg">
              {cleanAiText(insight.title)}
            </h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full px-2.5 py-1 capitalize",
              tone.badge
            )}
          >
            {insight.impact || "measured"} impact
          </Badge>
        </div>

        <p className="text-justify text-sm leading-6 text-slate-600 hyphens-auto indent-5" data-ai-text-spacing="editorial-justified-indent">
          <AiFormattedText text={summary} />
        </p>
        {actionPlan.length > 0 && (
          <div className="mt-3 space-y-3" data-ai-action-plan="establishment-decision-support">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">Recommended actions</span>
              {decisionSupport?.data_confidence && <Badge variant="outline" className="rounded-full border-slate-300 text-xs text-slate-600">{decisionSupport.data_confidence} confidence</Badge>}
            </div>
            <ol className="space-y-3">
              {actionPlan.map((item, index) => <li key={`${item.action_title || "action"}-${index}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                <div className="flex items-start justify-between gap-3"><p className="font-semibold text-slate-800">{index + 1}. {cleanAiText(item.action_title || "Recommended action")}</p>{item.action_priority && <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em] text-amber-700">{item.action_priority}</span>}</div>
                <p className="mt-1 text-sm leading-6 text-slate-700"><AiFormattedText text={item.action_description || ""} tone="action" /></p>
                {(item.responsible_entity || item.suggested_timeframe) && <p className="mt-2 text-xs font-medium text-slate-500">Responsible role/office: {item.responsible_entity || "To be assigned"} · Timeframe: {item.suggested_timeframe || "To be scheduled"}</p>}
                {item.prerequisites?.length ? <p className="mt-2 text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-700">Prerequisites:</span> {item.prerequisites.join("; ")}</p> : null}
                {item.success_indicators?.length ? <p className="mt-2 text-xs leading-5 text-slate-600"><span className="font-semibold text-slate-700">Success indicators:</span> {item.success_indicators.join("; ")}</p> : null}
              </li>)}
            </ol>
            {decisionSupport?.decision_implication && <p className="rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-sm leading-6 text-blue-900"><span className="font-semibold">Decision implication:</span> {decisionSupport.decision_implication}</p>}
            {decisionSupport?.data_limitations?.length ? <p className="text-xs leading-5 text-slate-500"><span className="font-semibold text-slate-700">Limitations:</span> {decisionSupport.data_limitations.join("; ")}</p> : null}
          </div>
        )}
        {!actionPlan.length && action && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-justify text-sm leading-6 text-slate-800 hyphens-auto" data-ai-action-note="editorial-shadcn">
            <span className="font-semibold text-slate-800">Action:</span>{" "}
            <AiFormattedText text={action} tone="action" />
          </div>
        )}
        {insight.evidenceHref && (
          <a href={insight.evidenceHref} className="mt-3 inline-flex text-sm font-semibold text-[#0E5A72] underline decoration-[#0E5A72]/35 underline-offset-4 hover:text-[#193364]">
            View related {insight.evidenceLabel || "Analytics evidence"}
          </a>
        )}
        <div className="mt-auto flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {cleanAiText(insight.category)}
          </span>
        </div>
      </div>
    </article>
  );
}

export function AiEmptyState({ variant }: { variant: "gaps" | "recommendations" }) {
  const isGaps = variant === "gaps";

  return (
    <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/80 p-4 text-sm leading-6 text-emerald-900">
      {isGaps ? <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-600" /> : <Sparkles className="mt-0.5 size-5 shrink-0 text-emerald-600" />}
      <p>
        {isGaps
          ? "No service gaps or operational challenges are active right now."
          : "No recommendations are available yet. Refresh analysis to generate current operational guidance."}
      </p>
    </div>
  );
}

export function AiShowMoreButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <div className="mt-4 flex justify-center">
      <Button
        type="button"
        variant="outline"
        onClick={onClick}
        className="rounded-full border-[#D2D8E0] bg-[#E0E5EC] px-5 text-slate-700 shadow-[4px_4px_10px_rgba(163,177,198,0.4),-4px_-4px_10px_rgba(255,255,255,0.58)] hover:bg-[#D9DEE6]"
      >
        {children}
      </Button>
    </div>
  );
}
