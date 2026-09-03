import type { ReactNode } from "react";
import { AlertTriangle, Brain, CheckCircle2, Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";

import { cleanAiText, formatConfidence, splitAiRecommendation } from "../../../lib/aiText";
import { AiFormattedText } from "../AiFormattedText";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/utils";

interface AiInsightShellProps {
  title?: string;
  subtitle: string;
  lastUpdated?: string | null;
  refreshing: boolean;
  onRefresh: () => void;
  children: ReactNode;
}

interface AiAnomalyCardProps {
  id: string;
  anomaly_type: string;
  severity: string;
  description: string;
  recommendation?: string | null;
  detected_at: string;
  establishments?: { name: string } | null;
}

interface AiRecommendationCardProps {
  id: string;
  title: string;
  description: string;
  impact: string;
  category: string;
  recommended_action?: string | null;
  confidence_score?: number | null;
}

const severityTone = (severity?: string) => {
  if (severity === "high") {
    return {
      rail: "from-red-500 via-rose-400 to-red-300",
      badge: "border-red-200 bg-red-50 text-red-700",
      icon: "text-red-600",
      soft: "bg-red-50/70",
    };
  }

  if (severity === "medium") {
    return {
      rail: "from-amber-500 via-yellow-400 to-amber-200",
      badge: "border-amber-200 bg-amber-50 text-amber-700",
      icon: "text-amber-600",
      soft: "bg-amber-50/70",
    };
  }

  return {
    rail: "from-sky-500 via-cyan-400 to-sky-200",
    badge: "border-sky-200 bg-sky-50 text-sky-700",
    icon: "text-sky-600",
    soft: "bg-sky-50/70",
  };
};

export function AiInsightsShell({
  title = "AI Insights",
  subtitle,
  lastUpdated,
  refreshing,
  onRefresh,
  children,
}: AiInsightShellProps) {
  return (
    <main className="w-full max-w-full overflow-x-hidden" data-ai-insights-redesign="shadcn-taste-editorial">
      <div className="space-y-5 sm:space-y-7">
        <section className="relative overflow-hidden rounded-[1.75rem] border border-slate-200/80 bg-[radial-gradient(circle_at_top_left,rgba(28,167,201,0.16),transparent_34%),linear-gradient(135deg,#ffffff_0%,#f8fbfc_52%,#eef8fa_100%)] p-4 shadow-sm sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-cyan-200/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-slate-200/50 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium tracking-[0.18em] text-slate-500 shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#1CA7C9]" />
                GEMINI OPERATIONS DESK
              </div>
              <h1 className="max-w-5xl text-[clamp(2.35rem,7vw,4.75rem)] font-black leading-[0.92] tracking-[-0.06em] text-slate-950">
                {title}
              </h1>
              <p className="mt-3 max-w-2xl text-base leading-7 text-slate-600 sm:text-lg">
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
              disabled={refreshing}
              className="h-12 rounded-2xl bg-[#0F4C75] px-5 text-white shadow-lg shadow-cyan-900/10 hover:bg-[#123f5e] sm:h-11"
            >
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {refreshing ? "Refreshing" : "Refresh Analysis"}
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-3 lg:grid-cols-[1.15fr_0.85fr]" data-ai-bento-grid="dense-2x2-no-empty-cells">
          <Card className="group relative overflow-hidden rounded-[1.5rem] border-slate-200 bg-slate-950 text-white shadow-sm transition-transform duration-500 hover:-translate-y-0.5">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,rgba(28,167,201,0.42),transparent_32%),radial-gradient(circle_at_90%_10%,rgba(148,163,184,0.24),transparent_28%)]" />
            <CardContent className="relative grid gap-4 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
              <div className="flex size-14 items-center justify-center rounded-2xl bg-white/10 ring-1 ring-white/15 transition-transform duration-500 group-hover:scale-105">
                <Brain className="size-7 text-cyan-100" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.22em] text-cyan-100/80">Analysis active</p>
                <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] sm:text-3xl">Signal, not noise.</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-slate-300 sm:text-base">
                  Insights are organized into operational risk, recommended action, and confidence so the team can scan fast without reading a wall of generated text.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.5rem] border-slate-200 bg-white/90 shadow-sm backdrop-blur">
            <CardContent className="grid grid-cols-3 gap-2 p-4 sm:p-5">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">Style</p>
                <p className="mt-2 text-sm font-bold text-slate-900">Editorial cards</p>
              </div>
              <div className="rounded-2xl bg-cyan-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-cyan-700/60">Model</p>
                <p className="mt-2 text-sm font-bold text-cyan-950">Gemini</p>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-700/60">Mode</p>
                <p className="mt-2 text-sm font-bold text-amber-950">Review-ready</p>
              </div>
            </CardContent>
          </Card>
        </section>

        {children}
      </div>
    </main>
  );
}

export function AiSectionCard({
  title,
  countLabel,
  icon,
  children,
}: {
  title: string;
  countLabel?: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card className="overflow-hidden rounded-[1.5rem] border-slate-200 bg-white shadow-sm">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70 px-4 py-4 sm:px-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <CardTitle className="flex min-w-0 items-center gap-2 text-lg font-black tracking-[-0.025em] text-slate-950 sm:text-xl">
            {icon}
            <span className="min-w-0">{title}</span>
          </CardTitle>
          {countLabel && (
            <Badge variant="outline" className="rounded-full border-slate-200 bg-white px-3 py-1 text-slate-700 shadow-sm">
              {countLabel}
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="px-4 py-4 sm:px-6 sm:py-5">{children}</CardContent>
    </Card>
  );
}

export function AiAnomalyCard(anomaly: AiAnomalyCardProps) {
  const tone = severityTone(anomaly.severity);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(15,23,42,0.08)]" data-ai-card-layout="shadcn-anomaly-editorial">
      <div className={cn("absolute inset-y-0 left-0 w-1.5 bg-gradient-to-b", tone.rail)} />
      <div className="p-4 pl-5 sm:p-5 sm:pl-6">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", tone.soft)}>
              <AlertTriangle className={cn("size-4", tone.icon)} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-black leading-snug tracking-[-0.025em] text-slate-950 sm:text-lg">
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

        <div className="mt-4 space-y-3 text-sm leading-6 text-slate-700">
          <p className="text-justify hyphens-auto indent-5" data-ai-text-spacing="editorial-justified-indent">
            <AiFormattedText text={anomaly.description} />
          </p>
          {anomaly.recommendation && (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-justify leading-6 hyphens-auto" data-ai-action-note="editorial-shadcn">
              <span className="font-bold text-slate-950">Recommendation:</span>{" "}
              <AiFormattedText text={anomaly.recommendation} tone="action" />
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

export function AiRecommendationCard(insight: AiRecommendationCardProps) {
  const { summary, action } = splitAiRecommendation(insight.description, insight.recommended_action || undefined);
  const confidence = formatConfidence(insight.confidence_score || undefined);
  const isHighImpact = insight.impact === "high";

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-5" data-ai-card-layout="shadcn-recommendation-editorial">
      <div className="pointer-events-none absolute -right-12 -top-12 h-28 w-28 rounded-full bg-cyan-100/70 blur-2xl transition-transform duration-700 group-hover:scale-125" />
      <div className="relative">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-[#0F4C75]">
              <TrendingUp className="size-4" />
            </div>
            <h3 className="min-w-0 text-base font-black leading-snug tracking-[-0.025em] text-slate-950 sm:text-lg">
              {cleanAiText(insight.title)}
            </h3>
          </div>
          <Badge
            variant="outline"
            className={cn(
              "rounded-full px-2.5 py-1 capitalize",
              isHighImpact ? "border-purple-200 bg-purple-50 text-purple-700" : "border-cyan-200 bg-cyan-50 text-cyan-700"
            )}
          >
            {insight.impact || "measured"} impact
          </Badge>
        </div>

        <p className="text-justify text-sm leading-6 text-slate-700 hyphens-auto indent-5" data-ai-text-spacing="editorial-justified-indent">
          <AiFormattedText text={summary} />
        </p>
        {action && (
          <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-justify text-sm leading-6 text-slate-800 hyphens-auto" data-ai-action-note="editorial-shadcn">
            <span className="font-bold text-slate-950">Action:</span>{" "}
            <AiFormattedText text={action} tone="action" />
          </div>
        )}
        <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
          <span className="min-w-0 truncate text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
            {cleanAiText(insight.category)}
          </span>
          {confidence && <span className="shrink-0 text-xs font-medium text-slate-500">{confidence}</span>}
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
        className="rounded-full border-slate-200 bg-white px-5 text-slate-700 shadow-sm hover:bg-slate-50"
      >
        {children}
      </Button>
    </div>
  );
}
