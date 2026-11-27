export type OriginClassification = "Dominant" | "Growing" | "Declining" | "Stable" | "Emerging" | "Insufficient Data";
export type OriginScope = "Domestic" | "International" | "Unknown";

export type OriginMetricInput = {
  origin: string;
  scope: Exclude<OriginScope, "Unknown">;
  currentVisitors: number;
  previousVisitors: number;
};

export type VisitorOriginMetric = OriginMetricInput & {
  absoluteChange: number;
  growthRate: number | null;
  marketShare: number;
  previousMarketShare: number | null;
  classification: OriginClassification;
};

export type OriginMetricResult = {
  rows: VisitorOriginMetric[];
  currentTotalVisitors: number;
  previousTotalVisitors: number;
  currentKnownVisitors: number;
  previousKnownVisitors: number;
  currentUnknownVisitors: number;
  previousUnknownVisitors: number;
  currentOriginCoverage: number | null;
  previousOriginCoverage: number | null;
};

const finite = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function classifyOriginMetric(input: {
  currentVisitors: number;
  previousVisitors: number;
  marketShare: number;
  minimumAbsoluteChange?: number;
}): OriginClassification {
  const current = finite(input.currentVisitors);
  const previous = finite(input.previousVisitors);
  const share = finite(input.marketShare);
  const absoluteChange = current - previous;
  const minimumChange = input.minimumAbsoluteChange ?? 100;
  const growth = previous > 0 ? (absoluteChange / previous) * 100 : null;

  if (share >= 30) return "Dominant";
  if (previous === 0 && current >= minimumChange) return "Emerging";
  if (growth !== null && growth >= 20 && absoluteChange >= minimumChange) return "Growing";
  if (growth !== null && growth <= -20 && Math.abs(absoluteChange) >= minimumChange) return "Declining";
  if (growth !== null && Math.abs(growth) <= 5) return "Stable";
  return previous === 0 || growth === null ? "Insufficient Data" : "Stable";
}

export function buildVisitorOriginMetrics(inputs: OriginMetricInput[], totals: {
  currentTotalVisitors: number;
  previousTotalVisitors: number;
  currentUnknownVisitors?: number;
  previousUnknownVisitors?: number;
}): OriginMetricResult {
  const currentTotalVisitors = Math.max(0, finite(totals.currentTotalVisitors));
  const previousTotalVisitors = Math.max(0, finite(totals.previousTotalVisitors));
  const currentUnknownVisitors = Math.max(0, finite(totals.currentUnknownVisitors));
  const previousUnknownVisitors = Math.max(0, finite(totals.previousUnknownVisitors));
  const currentKnownVisitors = Math.max(0, currentTotalVisitors - currentUnknownVisitors);
  const previousKnownVisitors = Math.max(0, previousTotalVisitors - previousUnknownVisitors);

  const rows = inputs
    .map((input) => {
      const currentVisitors = Math.max(0, finite(input.currentVisitors));
      const previousVisitors = Math.max(0, finite(input.previousVisitors));
      const absoluteChange = currentVisitors - previousVisitors;
      const growthRate = previousVisitors > 0 ? (absoluteChange / previousVisitors) * 100 : null;
      const marketShare = currentKnownVisitors > 0 ? (currentVisitors / currentKnownVisitors) * 100 : 0;
      const previousMarketShare = previousKnownVisitors > 0 ? (previousVisitors / previousKnownVisitors) * 100 : null;
      return {
        ...input,
        currentVisitors,
        previousVisitors,
        absoluteChange,
        growthRate,
        marketShare,
        previousMarketShare,
        classification: classifyOriginMetric({ currentVisitors, previousVisitors, marketShare }),
      };
    })
    .sort((a, b) => b.currentVisitors - a.currentVisitors || a.origin.localeCompare(b.origin));

  return {
    rows,
    currentTotalVisitors,
    previousTotalVisitors,
    currentKnownVisitors,
    previousKnownVisitors,
    currentUnknownVisitors,
    previousUnknownVisitors,
    currentOriginCoverage: currentTotalVisitors > 0 ? (currentKnownVisitors / currentTotalVisitors) * 100 : null,
    previousOriginCoverage: previousTotalVisitors > 0 ? (previousKnownVisitors / previousTotalVisitors) * 100 : null,
  };
}
