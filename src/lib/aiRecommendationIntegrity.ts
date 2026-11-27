export type RecommendationMetric = "dayTourVisitors" | "overnightGuestCheckIns" | "seasonality" | "visitorOrigins" | "establishmentPerformance" | "customerFeedback";

export type RecommendationCandidate = {
  id: string;
  recommended_action?: string | null;
  input_snapshot?: Record<string, unknown> | null;
};

export type RecommendationAnomaly = {
  id: string;
  metric?: unknown;
  currentMonth?: unknown;
};

const normalizeAction = (value?: string | null) => String(value || "")
  .toLowerCase()
  .replace(/^recommendation:\s*/i, "")
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const metricOf = (candidate: RecommendationCandidate) => String(candidate.input_snapshot?.metric || "");
const monthOf = (candidate: RecommendationCandidate) => String(candidate.input_snapshot?.current_month || "");

const GENERIC_ACTION_KEYS = new Set([
  "review this trend and take one focused action",
  "review this record manually",
]);

const isGenericAction = (actionKey: string) => GENERIC_ACTION_KEYS.has(actionKey);

export const recommendationActionKey = (candidate: RecommendationCandidate) => normalizeAction(candidate.recommended_action);

export const recommendationSupportsMetric = (candidate: RecommendationCandidate, metric: RecommendationMetric) => {
  const candidateMetric = metricOf(candidate);
  return candidateMetric === metric;
};

export const recommendationSupportsPeriod = (candidate: RecommendationCandidate, currentMonth?: unknown) => {
  const candidateMonth = monthOf(candidate);
  if (!currentMonth) return true;
  if (candidateMonth && candidateMonth !== String(currentMonth)) return false;
  const analysisPeriod = candidate.input_snapshot?.analysis_period;
  if (!analysisPeriod || typeof analysisPeriod !== "object") return true;
  const period = analysisPeriod as Record<string, unknown>;
  const start = String(period.selectedStartDate || period.queryStart || "");
  const end = String(period.selectedEndDate || period.queryEnd || "");
  const month = String(currentMonth);
  return !start || !end || `${month}-01` <= end && `${month}-31` >= start;
};

export const isEvidenceBoundRecommendation = (action: string | null | undefined, metric: RecommendationMetric) => {
  const normalized = normalizeAction(action);
  if (!normalized || normalized === "review this trend and take one focused action" || normalized === "review this record manually") return false;
  if (/because of|caused by|due to|weather|festival|event|motivation|guarantee|will increase|will recover/.test(normalized)) return false;
  if (/promotion|campaign|marketing|capacity|demand|occupancy|amenity|room|lodging/.test(normalized)) return false;
  if (!/(contact|assign|set|establish|schedule|coordinate|escalate|prepare|preserve|repeat|adopt|implement|follow up|deadline|reporting follow-up)/.test(normalized)) return false;
  if (metric === "dayTourVisitors" || metric === "overnightGuestCheckIns") {
    if (/planning benchmark|generic|take one focused action|adjust municipal planning/.test(normalized)) return false;
  }
  if (metric === "visitorOrigins" && !/origin|visitor|growth|location|residence|data|classification|distribution|category/.test(normalized)) return false;
  if (metric === "customerFeedback" && !/feedback|review|rating|satisfaction|customer|comment|theme|service|clean|value|amenity/.test(normalized)) return false;
  const evidenceTerms = /report|reporting|missing|late|submitted|coverage|declin|decreas|check in|check-in|visitor|day tour|overnight guest|guest check|origin|growth|volume|establishment|classification|percentile|feedback|review|rating|satisfaction|customer|comment|theme/;
  if (!evidenceTerms.test(normalized)) return false;
  const metricTerms = metric === "overnightGuestCheckIns"
    ? /overnight|accommodation|guest check|report|reporting|missing|late|submitted|coverage/
    : metric === "seasonality"
      ? /season|seasonal|month|peak|visitor|check in|check-in|guest/
      : metric === "visitorOrigins"
        ? /origin|visitor|growth|location|residence/
        : metric === "establishmentPerformance"
          ? /establishment|visitor|volume|classification|percentile|high|low|moderate/
          : metric === "customerFeedback"
            ? /feedback|review|rating|satisfaction|customer|comment|theme|service|clean|value|amenity/
          : /day tour|visitor|tourism|arrival|report|reporting|missing|late|submitted|coverage|origin/;
  return metricTerms.test(normalized);
};

export const assignRecommendationsToAnomalies = <T extends RecommendationCandidate>(
  anomalies: RecommendationAnomaly[],
  candidates: T[],
) => {
  const usedCandidateIds = new Set<string>();
  const usedActionKeys = new Set<string>();
  const assignments = new Map<string, T>();

  for (const anomaly of anomalies) {
    const metric = String(anomaly.metric || "") as RecommendationMetric;
    if (metric !== "dayTourVisitors" && metric !== "overnightGuestCheckIns" && metric !== "seasonality" && metric !== "visitorOrigins" && metric !== "establishmentPerformance" && metric !== "customerFeedback") continue;
    const candidate = candidates.find((item) => {
      const actionKey = recommendationActionKey(item);
      return !usedCandidateIds.has(item.id)
        && (!actionKey || !usedActionKeys.has(actionKey))
        && !isGenericAction(actionKey)
        && recommendationSupportsMetric(item, metric)
        && recommendationSupportsPeriod(item, anomaly.currentMonth)
        && isEvidenceBoundRecommendation(item.recommended_action, metric);
    });
    if (!candidate) continue;
    assignments.set(anomaly.id, candidate);
    usedCandidateIds.add(candidate.id);
    const actionKey = recommendationActionKey(candidate);
    if (actionKey) usedActionKeys.add(actionKey);
  }

  return { assignments, usedCandidateIds, usedActionKeys };
};

export const deduplicateStandaloneRecommendations = <T extends RecommendationCandidate>(
  candidates: T[],
  usedCandidateIds: Set<string>,
  usedActionKeys: Set<string>,
) => {
  const seen = new Set<string>(usedActionKeys);
  return candidates.filter((candidate) => {
    if (usedCandidateIds.has(candidate.id)) return false;
    const actionKey = recommendationActionKey(candidate);
    if (!actionKey || seen.has(actionKey) || isGenericAction(actionKey)) return false;
    seen.add(actionKey);
    return true;
  });
};
