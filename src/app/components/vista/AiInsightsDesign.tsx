import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, Sparkles, TrendingUp } from "lucide-react";

import { cleanAiText, formatConfidence, splitAiRecommendation } from "../../../lib/aiText";
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
      badge: "border-red-200 bg-red-50 text-red-700",
      icon: "text-red-600",
      soft: "bg-red-50/70",
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
        <section className="relative isolate overflow-hidden rounded-[1.75rem] border-0 bg-[#E0E5EC] p-4 shadow-[10px_10px_24px_rgba(163,177,198,0.55),-10px_-10px_24px_rgba(255,255,255,0.72)] sm:p-6 lg:p-7">
          <div className="pointer-events-none absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#C8CED8]/35 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-20 left-1/3 h-44 w-44 rounded-full bg-white/35 blur-3xl" />
          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div className="max-w-3xl">
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-medium tracking-[0.18em] text-slate-500 shadow-sm backdrop-blur">
                <span className="h-1.5 w-1.5 rounded-full bg-[#6C63FF]" />
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
              className="h-12 rounded-2xl bg-[#6C63FF] px-5 text-white shadow-[5px_5px_12px_rgba(163,177,198,0.55),-5px_-5px_12px_rgba(255,255,255,0.65)] hover:bg-[#5B54D6] sm:h-11"
            >
              {refreshing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
              {refreshing ? "Refreshing" : "Refresh Analysis"}
            </Button>
          </div>
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
    <section className="isolate overflow-hidden rounded-[1.5rem] border-0 bg-[#E0E5EC] shadow-[8px_8px_18px_rgba(163,177,198,0.45),-8px_-8px_18px_rgba(255,255,255,0.62)]">
      <CardHeader className="rounded-t-[1.5rem] border-b border-[#D2D8E0] bg-[#E0E5EC]/70 px-4 py-4 sm:px-6">
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
      <CardContent className="rounded-b-[1.5rem] px-4 py-4 sm:px-6 sm:py-5">{children}</CardContent>
    </section>
  );
}

export function AiAnomalyCard(anomaly: AiAnomalyCardProps) {
  const tone = severityTone(anomaly.severity);

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(15,23,42,0.08)]" data-ai-card-layout="shadcn-anomaly-editorial">
      <div className="p-4 sm:p-5">
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
  const tone = severityTone(insight.impact);

  return (
    <article className="group relative isolate overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-[0_14px_40px_rgba(15,23,42,0.05)] transition-all duration-500 hover:-translate-y-0.5 hover:shadow-[0_18px_55px_rgba(15,23,42,0.08)] sm:p-0" data-ai-card-layout="shadcn-recommendation-editorial">
      <div className="relative p-4 sm:p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn("mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl", tone.soft)}>
              <TrendingUp className={cn("size-4", tone.icon)} />
            </div>
            <h3 className="min-w-0 text-base font-black leading-snug tracking-[-0.025em] text-slate-950 sm:text-lg">
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
        className="rounded-full border-[#D2D8E0] bg-[#E0E5EC] px-5 text-slate-700 shadow-[4px_4px_10px_rgba(163,177,198,0.4),-4px_-4px_10px_rgba(255,255,255,0.58)] hover:bg-[#D9DEE6]"
      >
        {children}
      </Button>
    </div>
  );
}
