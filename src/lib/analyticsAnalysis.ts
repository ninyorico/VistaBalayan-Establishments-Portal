export type AnalyticsPattern =
  | "all"
  | "unusual-decline"
  | "unusual-increase"
  | "sustained-decline"
  | "sustained-growth"
  | "seasonal-peak"
  | "seasonal-low"
  | "seasonal-shift"
  | "zero-activity"
  | "multiple-establishment-decline";

export type AnalyticsCategory = "daytour" | "overnight";
export type CoverageFilter = "all" | "complete" | "incomplete" | "none" | "below-25" | "25-50" | "50-80" | "80-100" | "100";
export type AnomalySeverity = "low" | "medium" | "high" | "critical";

export interface PeriodEvidence {
  startDate: string;
  endDate: string;
  value: number | null;
  submittedReports: number;
  expectedReports: number | null;
  coveragePercent: number | null;
}

export interface AnalysisEstablishment {
  id: string;
  name: string;
  reportingMode: "visitor" | "accommodation" | "both" | null;
  current: Record<AnalyticsCategory, PeriodEvidence>;
  previous: Record<AnalyticsCategory, PeriodEvidence>;
}

export interface AnalyticsFinding {
  id: string;
  pattern: Exclude<AnalyticsPattern, "all">;
  category: AnalyticsCategory;
  establishmentId?: string;
  establishmentName?: string;
  current: PeriodEvidence;
  previous: PeriodEvidence;
  absoluteChange: number | null;
  percentChange: number | null;
  severity: AnomalySeverity;
  evidenceStatus: "complete" | "incomplete" | "no-reports" | "not-applicable";
  explanation: string;
}

export interface MultipleDeclineSummary {
  eligibleEstablishments: number;
  affectedEstablishments: number;
  stableEstablishments: number;
  increasingEstablishments: number;
  insufficientEstablishments: number;
  affectedPercentage: number | null;
  combinedDecrease: number;
}

export interface AnalyticsAnalysisResult {
  findings: AnalyticsFinding[];
  multipleDecline: Record<AnalyticsCategory, MultipleDeclineSummary>;
}

const numberOrNull = (value: number | null | undefined) => Number.isFinite(value) ? Number(value) : null;

export const classifyCoverage = (evidence: PeriodEvidence): AnalyticsFinding["evidenceStatus"] => {
  if (evidence.expectedReports === null) return "not-applicable";
  if (evidence.submittedReports === 0) return "no-reports";
  if (evidence.coveragePercent === 100) return "complete";
  return "incomplete";
};

export const matchesCoverageFilter = (evidence: PeriodEvidence, filter: CoverageFilter) => {
  const coverage = evidence.coveragePercent;
  if (filter === "all") return true;
  if (coverage === null) return false;
  if (filter === "complete" || filter === "100") return coverage === 100;
  if (filter === "incomplete") return coverage > 0 && coverage < 100;
  if (filter === "none") return coverage === 0;
  if (filter === "below-25") return coverage > 0 && coverage < 25;
  if (filter === "25-50") return coverage >= 25 && coverage < 50;
  if (filter === "50-80") return coverage >= 50 && coverage < 80;
  return coverage >= 80 && coverage < 100;
};

const severityFor = (percentChange: number | null, absoluteChange: number | null, current: PeriodEvidence, previous: PeriodEvidence): AnomalySeverity => {
  if (percentChange === null || absoluteChange === null || previous.value === null) return "low";
  const incomplete = (current.coveragePercent !== null && current.coveragePercent < 100) || (previous.coveragePercent !== null && previous.coveragePercent < 100);
  const magnitude = Math.abs(percentChange);
  const absoluteMagnitude = Math.abs(absoluteChange);
  if (incomplete) return magnitude >= 60 && absoluteMagnitude >= 500 ? "medium" : "low";
  if (magnitude >= 80 && absoluteMagnitude >= 1000) return "critical";
  if (magnitude >= 60 && absoluteMagnitude >= 500) return "high";
  if (magnitude >= 40 && absoluteMagnitude >= 250) return "medium";
  return "low";
};

const supportsCategory = (mode: AnalysisEstablishment["reportingMode"], category: AnalyticsCategory) => mode === "both" || mode === (category === "daytour" ? "visitor" : "accommodation");

const hasComparableEvidence = (current: PeriodEvidence, previous: PeriodEvidence, category: AnalyticsCategory) => {
  const minimum = category === "daytour" ? 100 : 20;
  return current.submittedReports > 0 && previous.submittedReports > 0 && current.value !== null && previous.value !== null && previous.value >= minimum;
};

export const buildAnalyticsAnalysis = (rows: AnalysisEstablishment[], options: { seasonalValues?: Record<AnalyticsCategory, number[]> } = {}): AnalyticsAnalysisResult => {
  const findings: AnalyticsFinding[] = [];
  const multipleDecline: AnalyticsAnalysisResult["multipleDecline"] = {
    daytour: { eligibleEstablishments: 0, affectedEstablishments: 0, stableEstablishments: 0, increasingEstablishments: 0, insufficientEstablishments: 0, affectedPercentage: null, combinedDecrease: 0 },
    overnight: { eligibleEstablishments: 0, affectedEstablishments: 0, stableEstablishments: 0, increasingEstablishments: 0, insufficientEstablishments: 0, affectedPercentage: null, combinedDecrease: 0 },
  };

  for (const row of rows) {
    for (const category of ["daytour", "overnight"] as const) {
      if (!supportsCategory(row.reportingMode, category)) continue;
      const current = row.current[category];
      const previous = row.previous[category];
      const evidenceStatus = classifyCoverage(current);
      const absoluteChange = current.value !== null && previous.value !== null ? current.value - previous.value : null;
      const percentChange = current.value !== null && previous.value !== null && previous.value > 0 ? (absoluteChange! / previous.value) * 100 : null;
      const comparable = hasComparableEvidence(current, previous, category);
      const summary = multipleDecline[category];
      summary.eligibleEstablishments += comparable ? 1 : 0;

      if (!comparable) {
        summary.insufficientEstablishments += 1;
      } else if (percentChange !== null && percentChange <= -30) {
        summary.affectedEstablishments += 1;
        summary.combinedDecrease += Math.abs(absoluteChange || 0);
      } else if (percentChange !== null && percentChange >= 10) {
        summary.increasingEstablishments += 1;
      } else {
        summary.stableEstablishments += 1;
      }

      if (comparable && percentChange !== null && percentChange <= -30) {
        findings.push({
          id: `unusual-decline-${category}-${row.id}`,
          pattern: "unusual-decline",
          category,
          establishmentId: row.id,
          establishmentName: row.name,
          current,
          previous,
          absoluteChange,
          percentChange,
          severity: severityFor(percentChange, absoluteChange, current, previous),
          evidenceStatus,
          explanation: evidenceStatus === "complete"
            ? "The decline is supported by complete reporting in both comparable periods."
            : "The reported decline may be affected by incomplete reporting and should not be treated as confirmed municipality-wide demand loss.",
        });
      }
      if (comparable && percentChange !== null && percentChange >= 30) {
        findings.push({ id: `unusual-increase-${category}-${row.id}`, pattern: "unusual-increase", category, establishmentId: row.id, establishmentName: row.name, current, previous, absoluteChange, percentChange, severity: severityFor(percentChange, absoluteChange, current, previous), evidenceStatus, explanation: "The increase is based on a comparable prior-period baseline and verified submitted reports." });
      }
      if (comparable && percentChange !== null && percentChange <= -10) {
        findings.push({ id: `sustained-decline-${category}-${row.id}`, pattern: "sustained-decline", category, establishmentId: row.id, establishmentName: row.name, current, previous, absoluteChange, percentChange, severity: severityFor(percentChange, absoluteChange, current, previous), evidenceStatus, explanation: "The current period is below the comparable prior period; persistence requires additional periods before a sustained trend is confirmed." });
      }
      if (comparable && percentChange !== null && percentChange >= 10) {
        findings.push({ id: `sustained-growth-${category}-${row.id}`, pattern: "sustained-growth", category, establishmentId: row.id, establishmentName: row.name, current, previous, absoluteChange, percentChange, severity: severityFor(percentChange, absoluteChange, current, previous), evidenceStatus, explanation: "The current period is above the comparable prior period; persistence requires additional periods before a sustained trend is confirmed." });
      }
      if (current.value === 0 && current.submittedReports > 0) {
        findings.push({ id: `zero-activity-${category}-${row.id}`, pattern: "zero-activity", category, establishmentId: row.id, establishmentName: row.name, current, previous, absoluteChange, percentChange, severity: evidenceStatus === "complete" ? "medium" : "low", evidenceStatus, explanation: "Zero visitor activity is shown only because valid reports were submitted; missing reports are not converted to zero." });
      }
    }
  }

  for (const category of ["daytour", "overnight"] as const) {
    const summary = multipleDecline[category];
    summary.affectedPercentage = summary.eligibleEstablishments > 0 ? (summary.affectedEstablishments / summary.eligibleEstablishments) * 100 : null;
    if (summary.affectedEstablishments >= 2 && (summary.affectedPercentage || 0) >= 50) {
      const first = findings.find((item) => item.category === category && item.pattern === "unusual-decline");
      if (first) findings.push({ ...first, id: `multiple-establishment-decline-${category}`, pattern: "multiple-establishment-decline", establishmentId: undefined, establishmentName: undefined, explanation: `${summary.affectedEstablishments} of ${summary.eligibleEstablishments} comparable establishments recorded qualifying declines (${summary.affectedPercentage!.toFixed(1)}%). This indicates a shared pattern for investigation, not proof of a common cause.` });
    }
  }

  const seasonalValues = options.seasonalValues;
  if (seasonalValues) {
    for (const category of ["daytour", "overnight"] as const) {
      const values = seasonalValues[category] || [];
      const positive = values.filter((value) => value > 0);
      if (positive.length < 3) continue;
      const peak = Math.max(...positive);
      const low = Math.min(...positive);
      const period = rows[0]?.current[category];
      if (period) {
        findings.push({ id: `seasonal-peak-${category}`, pattern: "seasonal-peak", category, current: { ...period, value: peak }, previous: period, absoluteChange: null, percentChange: null, severity: "low", evidenceStatus: classifyCoverage(period), explanation: "Observed peak in the selected comparison set; recurring seasonality requires sufficient equivalent historical periods." });
        findings.push({ id: `seasonal-low-${category}`, pattern: "seasonal-low", category, current: { ...period, value: low }, previous: period, absoluteChange: null, percentChange: null, severity: "low", evidenceStatus: classifyCoverage(period), explanation: "Observed low in the selected comparison set; no unsupported cause is inferred." });
      }
    }
  }
  return { findings, multipleDecline };
};

export const filterAnalyticsFindings = (findings: AnalyticsFinding[], pattern: AnalyticsPattern, coverage: CoverageFilter, severity: AnomalySeverity | "all") => findings.filter((finding) => (pattern === "all" || finding.pattern === pattern) && matchesCoverageFilter(finding.current, coverage) && (severity === "all" || finding.severity === severity));

export const formatCoverage = (value: number | null) => value === null ? "Not applicable" : `${value.toFixed(1)}%`;
