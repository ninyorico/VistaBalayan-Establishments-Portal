export type PerformanceClassification = "HIGH" | "MODERATE" | "LOW" | "INSUFFICIENT_DATA";

export type PerformanceInput = {
  id: string;
  name: string;
  visitorCount: number | null;
};

export type PerformanceRow = PerformanceInput & {
  classification: PerformanceClassification;
};

export type PerformanceThresholds = {
  p25: number | null;
  p75: number | null;
};

export type PerformanceResult = {
  rows: PerformanceRow[];
  thresholds: PerformanceThresholds;
  validSampleSize: number;
};

export const inclusivePercentile = (values: number[], percentile: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
};

export const classifyPerformance = (
  inputs: PerformanceInput[],
  minimumSampleSize = 5,
): PerformanceResult => {
  const validValues = inputs
    .map((input) => input.visitorCount)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0);
  const p25 = inclusivePercentile(validValues, 0.25);
  const p75 = inclusivePercentile(validValues, 0.75);
  const enoughData = validValues.length >= minimumSampleSize && p25 !== null && p75 !== null;

  return {
    thresholds: { p25: enoughData ? p25 : null, p75: enoughData ? p75 : null },
    validSampleSize: validValues.length,
    rows: inputs.map((input) => {
      let classification: PerformanceClassification = "INSUFFICIENT_DATA";
      if (enoughData && input.visitorCount !== null) {
        if (input.visitorCount > (p75 as number)) classification = "HIGH";
        else if (input.visitorCount < (p25 as number)) classification = "LOW";
        else classification = "MODERATE";
      }
      return { ...input, classification };
    }),
  };
};
