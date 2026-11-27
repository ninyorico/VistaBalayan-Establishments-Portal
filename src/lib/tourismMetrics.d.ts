export type TourismMonthlyMetric = {
  month: string;
  dayTourVisitors: number;
  guestCheckIns: number;
  combinedActivity: number;
  visitorRowCount: number;
  accommodationRowCount: number;
  submittedVisitorReports: number;
  enteredAfterReportDateVisitorReports: number;
  lateVisitorReports: number;
  missingVisitorReports: number | null;
  submittedAccommodationReports: number;
  enteredAfterReportDateAccommodationReports: number;
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
  evidence: Record<string, unknown>;
};

export function aggregateMonthlyMetrics(
  visitorRows?: Array<Record<string, unknown>>,
  accommodationRows?: Array<Record<string, unknown>>,
  eligibleVisitorEstablishments?: number,
  eligibleAccommodationEstablishments?: number,
  period?: { startDate?: string; endDate?: string } | null,
  asOfDate?: string | null,
): TourismMonthlyMetric[];

export function deriveReportEvidence(
  submittedReports: number,
  expectedReports: number | null,
): { missingReports: number | null; coveragePercent: number | null };

export function coverageConfidence(coveragePercent: number | null): 'Very Low' | 'Low' | 'Moderate' | 'High' | null;

export function hasConsistentAnomalyEvidence(evidence?: Record<string, unknown>): boolean;

export function percentChange(current: number, previous: number): number | null;


export function buildDeterministicAnomalies(
  monthlyMetrics?: TourismMonthlyMetric[],
  options?: { minimumPreviousVisitors?: number; minimumPreviousOvernightCheckIns?: number; thresholdPercent?: number },
): DeterministicAnomaly[];
