/**
 * Deterministic, evidence-aware recommendation strategy selection.
 * This is advisory logic; it never asserts an unverified cause.
 */
const numberOrNull = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

const formatNumber = (value) => numberOrNull(value)?.toLocaleString() ?? "the verified";
const metricLabel = (metric) => metric === "overnightGuestCheckIns" ? "overnight guest check-in" : "day-tour visitor";

const action = (values) => ({
  action_priority: "Medium",
  validation_required: true,
  ...values,
});

export function selectTourismRecommendationStrategies(evidence = {}, options = {}) {
  const metric = String(evidence.metric || options.metric || "dayTourVisitors");
  const label = metricLabel(metric);
  const coverage = numberOrNull(evidence.current_coverage_percent ?? evidence.coveragePercent);
  const missing = numberOrNull(evidence.current_missing_reports ?? evidence.missingReports);
  const current = numberOrNull(evidence.current_value ?? evidence.currentValue);
  const previous = numberOrNull(evidence.previous_value ?? evidence.previousValue);
  const dropPercent = numberOrNull(evidence.drop_percent ?? evidence.dropPercent);
  const absoluteDecline = previous != null && current != null ? previous - current : null;
  const substantial = dropPercent != null && dropPercent >= 30 && absoluteDecline != null && absoluteDecline > 0 && (previous >= 100 || absoluteDecline >= 100);
  const highCoverage = coverage != null && coverage >= 80;
  const establishmentScope = options.scope === "establishment" || Boolean(options.establishmentId || evidence.establishment_id);
  const establishmentName = options.establishmentName || evidence.establishment_name || "the affected establishment";
  const period = options.periodLabel || evidence.current_month || "the selected reporting period";
  const comparison = evidence.previous_month || "the comparable reporting period";
  const feedbackCount = numberOrNull(evidence.eligible_feedback_count ?? evidence.feedback_count) || 0;
  const recurringComplaints = evidence.recurring_customer_complaints === true || (Array.isArray(evidence.feedback_themes) && evidence.feedback_themes.length > 0 && evidence.customer_satisfaction_score != null && Number(evidence.customer_satisfaction_score) < 70);
  const temporaryClosure = evidence.temporary_closure_verified === true;
  const comparableDecline = evidence.comparable_establishments_declining === true || Number(evidence.comparable_decline_count || 0) >= 2;
  const recurringSeasonalDecline = evidence.recurring_seasonal_decline === true;
  const actions = [];
  const dataLimitations = [];

  if (coverage != null && coverage > 0 && coverage < 100 && missing > 0) {
    dataLimitations.push(`${missing} expected ${label} report${missing === 1 ? '' : 's'} remain outstanding; the aggregate comparison may change after the missing records are resolved.`);
  }

  if (metric === "visitorOrigins") {
    const origin = String(evidence.origin || "the leading visitor origin");
    const growth = numberOrNull(evidence.growth_percent);
    const visitors = numberOrNull(evidence.current_value);
    const isGrowing = growth != null && growth > 0;
    actions.push(action({
      action_title: isGrowing ? `Monitor ${origin} origin growth` : `Review ${origin} origin change`,
      action_description: isGrowing
        ? `Track the reported ${origin} visitor segment at ${formatNumber(visitors)} visitors and ${growth.toFixed(1)}% growth for ${period}; compare its next-period volume before expanding outreach.`
        : `Review the reported ${origin} visitor segment at ${formatNumber(visitors)} visitors for ${period}; compare its next-period volume before changing outreach.` ,
      action_category: "Visitor Origin Monitoring",
      primary_objective: "Evidence Review",
      responsible_entity: establishmentScope ? "Establishment operator and Tourism Office" : "Municipal Tourism Officer",
      suggested_timeframe: "During the next reporting period",
      success_indicators: [`The ${origin} segment is compared with the next equivalent reporting period using the same origin definition.`],
    }));
    return { actions, dataLimitations, decisionImplication: `The reported visitor-origin distribution identifies ${origin} as a segment to monitor; it does not establish visitor motivation or cause.` };
  }

  if (metric === "seasonality") {
    const peak = String(evidence.peak_month || period);
    actions.push(action({
      action_title: `Prepare ${peak} seasonal monitoring`,
      action_description: `Prepare a monitoring checklist for the verified ${peak} activity peak and compare the next equivalent period using reported visitor and check-in values.`,
      action_category: "Seasonal Monitoring",
      primary_objective: "Seasonal Planning",
      responsible_entity: establishmentScope ? "Establishment operator and Tourism Office" : "Municipal Tourism Officer",
      suggested_timeframe: "Before the next equivalent period",
      success_indicators: [`The ${peak} seasonal baseline and next equivalent-period results are recorded.`],
    }));
    return { actions, dataLimitations, decisionImplication: `The selected data shows a ${peak} activity pattern; recurrence and cause require equivalent historical periods.` };
  }

  if (metric === "establishmentPerformance") {
    const recordCount = numberOrNull(evidence.current_value) || 0;
    actions.push(action({
      action_title: `Review ${recordCount.toLocaleString()} establishment service records`,
      action_description: `Review the selected-year establishment-volume distribution across ${recordCount.toLocaleString()} reported service records and assign follow-up only to groups supported by the displayed volume evidence.`,
      action_category: "Establishment Performance Review",
      primary_objective: "Evidence Review",
      responsible_entity: "Municipal Tourism Officer",
      suggested_timeframe: "During the next planning cycle",
      success_indicators: ["Volume groups and evidence-supported follow-ups are documented for the selected year."],
    }));
    return { actions, dataLimitations, decisionImplication: "Reported volume distribution supports prioritization review only; it does not establish quality, profitability, or cause." };
  }

  if (metric === "customerFeedback") {
    const feedbackCount = numberOrNull(evidence.feedback_count) || 0;
    const lowSatisfactionCount = numberOrNull(evidence.low_satisfaction_count) || 0;
    const actionTitle = lowSatisfactionCount > 0 ? `Review ${lowSatisfactionCount} low-satisfaction indicators` : `Monitor ${feedbackCount} eligible feedback records`;
    actions.push(action({
      action_title: actionTitle,
      action_description: lowSatisfactionCount > 0
        ? `Review the published feedback themes associated with ${lowSatisfactionCount} low-satisfaction indicator${lowSatisfactionCount === 1 ? "" : "s"} among ${feedbackCount} eligible records, then document an establishment follow-up.`
        : `Monitor the ${feedbackCount} eligible feedback records and compare the next period before making a service recommendation.`,
      action_category: "Customer Experience",
      primary_objective: "Feedback Review",
      responsible_entity: establishmentScope ? "Establishment operator and Tourism Office" : "Municipal Tourism Officer",
      suggested_timeframe: "Within 30 days",
      success_indicators: ["The feedback count, themes, and documented follow-up are reviewed without treating feedback as proof of cause."],
    }));
    return { actions, dataLimitations, decisionImplication: "Published feedback is advisory evidence; it does not prove visitor volume, reviewer identity, or cause." };
  }

  if (coverage != null && coverage < 60) {
    if (missing != null && missing > 0) {
      actions.push(action({
        action_title: `Validate ${missing} missing reports`,
        action_description: `Complete or document the ${missing} missing ${label} reports for ${period} before approving a demand intervention.`,
        action_category: "Reporting Compliance",
        primary_objective: "Data Validation",
        responsible_entity: establishmentScope ? "Establishment operator and Tourism Office" : "Tourism Operations Assistant",
        suggested_timeframe: "Within 7 days",
        success_indicators: [`Missing-report count for ${period} is reduced or each unavailable report has a documented reason.`, `The ${label} comparison is recalculated after validation.`],
      }));
    }
    return { actions, dataLimitations, decisionImplication: `Incomplete reporting limits the reliability of the ${label} comparison; restore usable reporting evidence before allocating decline-specific recovery resources.` };
  }

  if (coverage != null && coverage >= 60 && coverage < 80 && substantial) {
    if (missing != null && missing > 0) {
      actions.push(action({
        action_title: `Coordinate submission assistance for ${missing} missing reports`,
        action_description: `Provide targeted submission assistance for the ${missing} missing ${label} reports for ${period}, then recalculate the comparison before approving decline-specific spending.`,
        action_category: "Data Reliability",
        primary_objective: "Data Validation",
        responsible_entity: establishmentScope ? "Establishment operator with Tourism Office" : "Tourism Operations Assistant",
        suggested_timeframe: "Within 14 days",
        success_indicators: [`The ${missing} missing ${label} reports are submitted or documented as unavailable and the comparison is recalculated.`],
      }));
    }
    actions.push(action({
      action_title: "Keep public listings current during validation",
      action_description: `Keep the affected establishments' public listings accurate and join existing low-cost municipal promotions while the comparison is being validated; defer costly decline-specific commitments.`,
      action_category: "Visitor Acquisition",
      primary_objective: "Visitor Acquisition",
      responsible_entity: "Municipal Tourism Office with participating establishments",
      suggested_timeframe: "During the validation period",
      prerequisites: ["Use only existing approved channels and verified establishment information."],
      success_indicators: ["Public listing accuracy is checked and any low-cost promotion participation is documented without claiming a causal effect."],
    }));
    return { actions: actions.slice(0, 2), dataLimitations, decisionImplication: `Reporting completeness is insufficient for an unqualified aggregate decline; restore evidence while limiting intervention to low-risk development activity.` };
  }

  if (coverage != null && coverage >= 80 && substantial) {
    if (temporaryClosure) {
      actions.push(action({ action_title: "Prepare a verified reopening plan", action_description: `Confirm the operating status of ${establishmentName}, then prepare reopening communications and a staged visitor offer only after service readiness is verified.`, action_category: "Operational Recovery", primary_objective: "Operational Recovery", action_priority: "High", responsible_entity: "Establishment operator with Municipal Tourism Office", suggested_timeframe: "After operating status is confirmed", prerequisites: ["Confirm closure dates, available services, and reopening readiness."], success_indicators: ["A verified reopening plan is approved and later comparable visitor activity is evaluated."], }));
    } else if (recurringComplaints && feedbackCount > 0) {
      actions.push(action({ action_title: "Implement a feedback-led service improvement", action_description: `Use the ${feedbackCount} eligible published feedback record${feedbackCount === 1 ? "" : "s"} to implement one documented service improvement at ${establishmentName}, without treating feedback as proof of cause.`, action_category: "Customer Experience", primary_objective: "Customer Experience", action_priority: "High", responsible_entity: "Establishment operator", suggested_timeframe: "Within 30 days", prerequisites: ["Use only eligible published feedback themes."], success_indicators: ["The selected service improvement is completed and later eligible feedback and visitor activity are compared."], }));
    } else if (comparableDecline) {
      actions.push(action({ action_title: "Coordinate one shared recovery campaign", action_description: `Coordinate one time-limited regional campaign and cross-promotion plan for the affected comparable establishments; participating operators must approve the offer and available capacity.`, action_category: "Tourism Promotion", primary_objective: "Collective Tourism Development", action_priority: "High", responsible_entity: "Municipal Tourism Officer with participating establishments", suggested_timeframe: "Within 30 days", prerequisites: ["Confirm the shared decline across comparable establishments and equivalent periods."], success_indicators: ["Participating establishments use one approved shared intervention and the next comparable group visitor counts are evaluated."], }));
    } else if (recurringSeasonalDecline) {
      actions.push(action({ action_title: "Launch a targeted off-peak visitor program", action_description: `For the verified recurring low-demand period, coordinate suitable off-peak recreation or overnight offers with participating establishments before the next comparable season.`, action_category: "Seasonal Preparedness", primary_objective: "Seasonal Preparedness", action_priority: "High", responsible_entity: "Municipal Tourism Officer with participating establishments", suggested_timeframe: "Before the next comparable low-demand period", prerequisites: ["Confirm the recurring seasonal pattern and available services/capacity."], success_indicators: ["An approved off-peak program has participating establishments and comparable low-season activity is evaluated."], }));
    } else if (coverage != null && coverage < 100) {
      actions.push(action({ action_title: "Coordinate a time-limited visitor recovery campaign", action_description: `Coordinate one time-limited recovery campaign for ${establishmentName} using suitable recreation offers and public-portal exposure; participating operators must approve the offer and available capacity.`, action_category: "Tourism Promotion", primary_objective: "Visitor Acquisition", action_priority: "High", responsible_entity: "Establishment operator with Municipal Tourism Office", suggested_timeframe: "Within 30 days", prerequisites: ["Confirm the selected offer, public listing accuracy, and available capacity before launch."], success_indicators: ["The approved campaign is implemented and the next comparable visitor count is evaluated without attributing causation solely to the campaign."], }));
      actions.push(action({ action_title: "Use low-demand time for operational improvement", action_description: `Where the operator identifies available low-demand days, schedule preventive maintenance or staff development while preserving required safety and service quality.`, action_category: "Operational Efficiency", primary_objective: "Operational Efficiency", responsible_entity: "Establishment operator", suggested_timeframe: "During the lower-demand operating period", prerequisites: ["Confirm the period is operationally suitable and does not reduce required visitor services."], success_indicators: ["Planned maintenance or staff-development work is completed and the next comparable visitor period is evaluated."], }));
    } else {
      actions.push(action({ action_title: "Run a targeted visitor acquisition pilot", action_description: `Implement one time-limited visitor acquisition pilot for ${establishmentName}, using updated public listings, suitable digital content, and an operator-approved offer appropriate to available capacity.`, action_category: "Visitor Acquisition", primary_objective: "Visitor Acquisition", action_priority: "High", responsible_entity: establishmentScope ? "Establishment operator with Municipal Tourism Office" : "Municipal Tourism Office with participating establishments", suggested_timeframe: "Within 30 days", prerequisites: ["Confirm the selected offer, public listing accuracy, and available capacity before launch."], success_indicators: ["The pilot is approved and participating, and the next comparable visitor count is evaluated without attributing causation solely to the pilot."], }));
      actions.push(action({ action_title: "Introduce a repeat-visit or referral offer", action_description: `Introduce one operator-approved repeat-visit or referral offer for ${establishmentName}, subject to capacity, pricing approval, and any required consent for direct follow-up.`, action_category: "Visitor Retention", primary_objective: "Visitor Retention", responsible_entity: "Establishment operator", suggested_timeframe: "Within 30 days", prerequisites: ["Confirm capacity, pricing, and consent requirements before implementation."], success_indicators: ["Offer participation and the next comparable visitor count are recorded."], }));
    }
    return { actions: actions.slice(0, 2), dataLimitations, decisionImplication: `The substantial ${label} decline for ${period} is supported by ${coverage}% reporting coverage; proportionate, reversible improvement action can proceed without asserting a cause.` };
  }

  if (highCoverage && missing === 0 && dropPercent != null && dropPercent > 0) {
    actions.push(action({ action_title: `Assess the ${label} change`, action_description: `Compare ${period} with ${comparison} and relevant historical periods to determine whether the reported change is material before selecting an intervention.`, action_category: "Diagnostic Assessment", primary_objective: "Diagnostic Assessment", responsible_entity: establishmentScope ? "Establishment operator with Municipal Tourism Officer" : "Municipal Tourism Officer", suggested_timeframe: "Within 14 days", success_indicators: ["A comparable-period assessment records whether the change is material and what evidence should be reviewed next." ] }));
    return { actions, dataLimitations, decisionImplication: `Complete reporting improves the reliability of the ${label} comparison, allowing the Tourism Office to distinguish a material demand issue from ordinary variation before intervening.` };
  }

  if (recurringComplaints && feedbackCount > 0) {
    actions.push(action({ action_title: "Assess recurring visitor concerns", action_description: `Review eligible published feedback themes with ${establishmentName} and assess service-improvement opportunities.`, action_category: "Customer Experience", primary_objective: "Strategic Intervention", responsible_entity: "Establishment operator with Municipal Tourism Officer", suggested_timeframe: "Within 30 days", success_indicators: ["A feedback-based service assessment is completed and later satisfaction indicators are compared." ] }));
  }
  return { actions, dataLimitations, decisionImplication: `The verified ${label} evidence supports a scoped diagnostic assessment; no specific cause or intervention is asserted without additional evidence.` };
}

export default selectTourismRecommendationStrategies;
