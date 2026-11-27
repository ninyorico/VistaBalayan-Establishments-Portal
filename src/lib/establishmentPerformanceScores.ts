export type PerformanceScoreInput = {
  id: string;
  name: string;
  category: "daytour" | "overnight";
  currentVisitors: number | null;
  previousVisitors: number | null;
  averageRating: number | null;
  ratingCount: number;
  feedbackEligible: boolean;
  submittedReports: number;
  expectedReports: number | null;
};

export type PerformanceScoreRow = PerformanceScoreInput & {
  volumeScore: number | null;
  growthScore: number | null;
  satisfactionScore: number | null;
  completenessScore: number | null;
  score: number | null;
  rank: number | null;
  eligible: boolean;
  eligibilityReason: string;
};

const numberOrNull = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : null;
const clamp = (value: number, minimum = 0, maximum = 100) => Math.min(maximum, Math.max(minimum, value));

export function buildPerformanceScores(inputs: PerformanceScoreInput[], minimumRatings = 5): PerformanceScoreRow[] {
  const comparableVolumes = inputs
    .map((input) => numberOrNull(input.currentVisitors))
    .filter((value): value is number => value !== null && value >= 0);
  const maximumVolume = comparableVolumes.length ? Math.max(...comparableVolumes) : 0;

  const rows = inputs.map((input) => {
    const current = numberOrNull(input.currentVisitors);
    const previous = numberOrNull(input.previousVisitors);
    const rating = numberOrNull(input.averageRating);
    const volumeScore = current !== null && maximumVolume > 0 ? (current / maximumVolume) * 100 : current === 0 && maximumVolume > 0 ? 0 : null;
    const growthPercent = current !== null && previous !== null && previous > 0 ? ((current - previous) / previous) * 100 : null;
    const growthScore = growthPercent !== null ? clamp(50 + growthPercent) : null;
    const satisfactionScore = input.feedbackEligible && input.ratingCount >= minimumRatings && rating !== null ? clamp(((rating - 1) / 4) * 100) : null;
    const completenessScore = input.expectedReports !== null && input.expectedReports > 0 ? clamp((input.submittedReports / input.expectedReports) * 100) : null;
    const missing: string[] = [];
    if (volumeScore === null) missing.push("visitor volume");
    if (growthScore === null) missing.push("comparable growth");
    if (satisfactionScore === null) missing.push("eligible rating sample");
    if (completenessScore === null) missing.push("reporting completeness");
    const eligible = missing.length === 0;
    const score = eligible
      ? (volumeScore! * 0.30) + (growthScore! * 0.20) + (satisfactionScore! * 0.35) + (completenessScore! * 0.15)
      : null;
    return {
      ...input,
      volumeScore,
      growthScore,
      satisfactionScore,
      completenessScore,
      score,
      rank: null,
      eligible,
      eligibilityReason: eligible ? "All four indicators are available." : `Insufficient data: ${missing.join(", ")}.`,
    };
  });

  const eligibleSorted = rows.filter((row) => row.score !== null).sort((a, b) => (b.score! - a.score!) || a.name.localeCompare(b.name));
  const ranks = new Map(eligibleSorted.map((row, index) => [row.id, index + 1]));
  return rows.map((row) => ({ ...row, rank: ranks.get(row.id) ?? null }));
}
