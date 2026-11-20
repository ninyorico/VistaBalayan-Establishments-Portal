export type TourismMonthlyMetric = {
  month: string;
  dayTourVisitors: number;
  guestCheckIns: number;
  combinedActivity: number;
  visitorRowCount: number;
  accommodationRowCount: number;
  submittedVisitorReports: number;
  lateVisitorReports: number;
  missingVisitorReports: number | null;
  submittedAccommodationReports: number;
  lateAccommodationReports: number;
  missingAccommodationReports: number | null;
  expectedAccommodationReports: number | null;
  accommodationCoveragePercent: number | null;
  expectedVisitorReports: number | null;
  coveragePercent: number | null;
};

export type DeterministicAnomaly = {
  type: string;
  severity: 'high' | 'medium';
  description: string;
  recommendation: string;
  evidence: Record<string, unknown>;
};

export function aggregateMonthlyMetrics(
  visitorRows?: Array<Record<string, unknown>>,
  accommodationRows?: Array<Record<string, unknown>>,
  eligibleVisitorEstablishments?: number,
  eligibleAccommodationEstablishments?: number,
): TourismMonthlyMetric[];

export function percentChange(current: number, previous: number): number | null;

export function buildDeterministicAnomalies(
  monthlyMetrics?: TourismMonthlyMetric[],
  options?: { minimumPreviousVisitors?: number; minimumPreviousOvernightCheckIns?: number; thresholdPercent?: number },
): DeterministicAnomaly[];
