import type { ElementType, ReactNode } from "react";
import { ArrowRight, Loader2 } from "lucide-react";

import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";
import { cn } from "../ui/utils";

interface PageHeroProps {
  eyebrow: string;
  title: ReactNode;
  description?: string;
  metricLabel?: string;
  metricValue?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function PageHero({
  eyebrow,
  title,
  description,
  metricLabel,
  metricValue,
  actionLabel,
  onAction,
  compact = false,
}: PageHeroProps & { compact?: boolean }) {
  return (
    <section className={cn("overflow-hidden rounded-[2rem] border border-white/20 tourism-panel-dark shadow-[0_28px_90px_rgba(7,59,76,0.22)]", compact && "rounded-3xl")}>
      <div className={cn("relative", compact ? "p-4 sm:p-6 lg:p-8" : "p-6 sm:p-8 lg:p-10")}>
        <div className="absolute right-0 top-0 h-56 w-56 rounded-full bg-cyan-300/16 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-44 w-72 rounded-full bg-white/8 blur-3xl" />
        <div className={cn("relative flex flex-col lg:flex-row lg:items-end lg:justify-between", compact ? "gap-4" : "gap-6")}>
          <div className="max-w-3xl">
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-cyan-100">{eyebrow}</p>
            <h1 className={cn("font-semibold tracking-[-0.04em] text-white text-balance", compact ? "mt-2 text-xl leading-tight sm:text-3xl lg:text-4xl" : "mt-3 text-3xl sm:text-4xl lg:text-5xl")}>
              {title}
            </h1>
            {description && (
              <p className={cn("max-w-2xl text-slate-200", compact ? "mt-2 text-xs leading-5 sm:text-base sm:leading-6" : "mt-4 text-sm leading-6 sm:text-base")}>
                {description}
              </p>
            )}
          </div>

          {(metricLabel && metricValue) || (actionLabel && onAction) ? (
            <div className="flex flex-col gap-3 sm:flex-row lg:flex-col lg:items-stretch">
              {metricLabel && metricValue && (
                <div className="rounded-2xl border border-white/12 bg-white/10 p-4 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.12)] backdrop-blur-xl">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-300">{metricLabel}</p>
                  <p className="mt-2 text-3xl font-semibold tracking-[-0.03em]">{metricValue}</p>
                </div>
              )}
              {actionLabel && onAction && (
                <Button
                  type="button"
                  onClick={onAction}
                  className="h-10 rounded-2xl bg-white px-4 text-sm text-[#0B2530] shadow-none hover:bg-cyan-50 active:translate-y-[1px] sm:h-12 sm:px-5"
                >
                  {actionLabel}
                  <ArrowRight className="h-4 w-4" strokeWidth={1.8} />
                </Button>
              )}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}

interface MetricCardProps {
  label: string;
  value: ReactNode;
  helper?: string;
  icon: ElementType;
  tone?: string;
  className?: string;
  compact?: boolean;
}

export function MetricCard({ label, value, helper, icon: Icon, tone = "bg-cyan-50 text-[#0E5A72] ring-cyan-100", className, compact = false }: MetricCardProps) {
  return (
    <Card className={cn("tourism-card h-full gap-0 rounded-3xl p-0 transition duration-200 hover:-translate-y-0.5 hover:shadow-tourism-hover", className)}>
      <CardContent className={cn("h-full", compact ? "p-3 sm:p-4 lg:p-5" : "p-5")}>
        <div className={cn("flex h-full items-start justify-between", compact ? "flex-row gap-3 sm:gap-4" : "gap-4")}>
          <div className="flex min-w-0 flex-1 flex-col">
            <p className={cn("min-h-8 font-medium leading-4 text-[#5D6F73]", compact ? "text-[11px] sm:text-sm" : "text-sm")}>{label}</p>
            <p className={cn("mt-2 flex h-16 items-start break-words font-semibold leading-tight tracking-[-0.035em] text-[#0B2530] tabular-nums", compact ? "text-2xl sm:text-3xl" : "text-3xl")}>{value}</p>
            {helper && <p className={cn("mt-1 leading-5 text-[#5D6F73]", compact ? "text-[10px] sm:text-xs" : "text-xs")}>{helper}</p>}
          </div>
          <div className={cn("dashboard-neu-icon flex shrink-0 items-center justify-center rounded-2xl ring-1", compact ? "h-9 w-9 sm:h-11 sm:w-11" : "h-11 w-11", tone)}>
            <Icon className={cn(compact ? "h-4 w-4 sm:h-5 sm:w-5" : "h-5 w-5")} strokeWidth={1.8} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

interface PanelCardProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function PanelCard({ title, description, children, className }: PanelCardProps) {
  return (
    <Card className={cn("tourism-card gap-0 rounded-3xl p-0", className)}>
      <CardHeader className="px-6 pt-6">
        <CardTitle className="text-lg font-semibold tracking-[-0.02em] text-[#0B2530]">{title}</CardTitle>
        {description && <p className="mt-1 text-sm leading-6 text-[#5D6F73]">{description}</p>}
      </CardHeader>
      <CardContent className="px-6 pb-6 pt-5">{children}</CardContent>
    </Card>
  );
}

export function EmptyState({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("rounded-2xl border border-dashed border-[#b8d2cf] bg-[#f8fbf8] px-5 py-10 text-center text-sm leading-6 text-[#5D6F73]", className)}>
      {children}
    </div>
  );
}

export function PageSkeleton({ label = "Loading page" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" aria-label={label} className="min-h-[70dvh] space-y-6 rounded-[2rem] bg-[#E0E5EC] p-5 sm:p-8 motion-reduce:animate-none">
      <span className="sr-only">{label}</span>
      <div className="h-8 w-2/3 animate-pulse rounded-xl bg-white/60 motion-reduce:animate-none sm:h-10 sm:w-1/2" />
      <div className="h-4 w-full max-w-xl animate-pulse rounded-lg bg-white/45 motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-32 animate-pulse rounded-3xl bg-white/55 shadow-[6px_6px_14px_rgba(163,177,198,0.35),-6px_-6px_14px_rgba(255,255,255,0.55)] motion-reduce:animate-none" />
        ))}
      </div>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.35fr_1fr]">
        <div className="h-72 animate-pulse rounded-3xl bg-white/50 motion-reduce:animate-none" />
        <div className="h-72 animate-pulse rounded-3xl bg-white/50 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

export function LoadingState({ label }: { label: string }) {
  return <PageSkeleton label={label} />;
}
