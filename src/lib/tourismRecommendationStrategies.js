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
  const lowCoverage = coverage != null && coverage < 50;
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

  if (lowCoverage) {
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
    actions.push(action({
      action_title: `Assess the reported ${label} decline`,
      action_description: `Compare consistently reporting establishments and equivalent elapsed dates for ${period} versus ${comparison} before selecting a tourism intervention.`,
      action_category: "Diagnostic Assessment",
      primary_objective: "Diagnostic Assessment",
      responsible_entity: establishmentScope ? "Establishment operator and Tourism Office" : "Municipal Tourism Officer",
      suggested_timeframe: "Within 14 days",
      prerequisites: ["Use only verified reports and comparable reporting periods."],
      success_indicators: ["A scoped comparison identifies whether the decline persists after reporting completeness is addressed."],
    }));
    return { actions, decisionImplication: `Incomplete reporting limits the reliability of the ${label} decline; validate comparable activity before selecting a promotional or recovery intervention.` };
  }

  if ((highCoverage && substantial) || (establishmentScope && substantial)) {
    actions.push(action({
      action_title: `Assess ${label} demand change (${dropPercent?.toFixed(1) || "verified"}% decline)`,
      action_description: `Review ${establishmentScope ? establishmentName : "the affected establishments"} for ${period}: ${formatNumber(previous)} to ${formatNumber(current)} ${label}s (${formatNumber(absoluteDecline)} decrease, ${dropPercent?.toFixed(1) || "verified"}%). Consult the operator using comparable periods.`,
      action_category: "Diagnostic Assessment",
      primary_objective: "Diagnostic Assessment",
      action_priority: "High",
      responsible_entity: establishmentScope ? "Establishment operator with Municipal Tourism Officer" : "Municipal Tourism Officer",
      suggested_timeframe: "Within 14 days",
      prerequisites: ["Confirm the reported values and compare equivalent operating periods.", "Do not infer a cause from the decline alone."],
      success_indicators: ["A completed assessment identifies affected establishments, comparable periods, and evidence-supported contributing factors."],
    }));

    let intervention;
    if (temporaryClosure) {
      intervention = action({ action_title: "Assess operational recovery requirements", action_description: `If the temporary closure is confirmed, assess reopening requirements and an appropriate recovery timetable for ${establishmentName}; do not assume the closure caused the decline.`, action_category: "Establishment Development", primary_objective: "Strategic Intervention", responsible_entity: "Establishment operator with Municipal Tourism Office", suggested_timeframe: "Within 30 days", prerequisites: ["Confirm closure dates and operating status."], success_indicators: ["Verified recovery requirements and a reviewable operating-status plan are completed.", `Visitor activity is compared in the next reporting period.`] });
    } else if (recurringComplaints && feedbackCount > 0) {
      intervention = action({ action_title: "Assess recurring visitor concerns", action_description: `Review eligible published feedback themes with ${establishmentName} and assess service-improvement opportunities without treating account verification as proof of visitation or cause.`, action_category: "Customer Experience", primary_objective: "Strategic Intervention", responsible_entity: "Establishment operator with Municipal Tourism Officer", suggested_timeframe: "Within 30 days", prerequisites: ["Use only eligible published, non-suspicious feedback."], success_indicators: [`A service-improvement assessment is completed using the ${feedbackCount} eligible feedback record${feedbackCount === 1 ? "" : "s"}.`, "Later satisfaction and visitor indicators are compared." ] });
    } else if (comparableDecline) {
      intervention = action({ action_title: "Assess a broader tourism response", action_description: `Because multiple comparable establishments show declines, assess a coordinated municipal promotion or group-recreation program after confirming the shared demand pattern.`, action_category: "Tourism Promotion", primary_objective: "Strategic Intervention", responsible_entity: "Municipal Tourism Officer with participating establishments", suggested_timeframe: "Within 30 days", prerequisites: ["Confirm the decline across comparable establishments and equivalent periods."], success_indicators: ["Eligible establishments participate in an approved program, and subsequent comparable visitor counts are evaluated." ] });
    } else if (recurringSeasonalDecline) {
      intervention = action({ action_title: "Assess an off-peak tourism program", action_description: `If equivalent historical periods confirm recurring low demand, assess a targeted off-peak program such as weekend recreation or group tourism packages.`, action_category: "Tourism Promotion", primary_objective: "Strategic Intervention", responsible_entity: "Municipal Tourism Officer with participating establishments", suggested_timeframe: "Before the next comparable low-demand period", prerequisites: ["Confirm the recurring pattern across comparable historical periods."], success_indicators: ["An approved program has participating establishments and later comparable visitor activity is evaluated." ] });
    } else {
      intervention = action({ action_title: `Assess conditional recovery for ${period}`, action_description: `If the ${label} decline from ${formatNumber(previous)} to ${formatNumber(current)} persists after validation, assess one targeted recovery option for ${establishmentName}; do not claim it caused improvement.`, action_category: "Tourism Promotion", primary_objective: "Strategic Intervention", responsible_entity: establishmentScope ? "Establishment operator with Municipal Tourism Officer" : "Municipal Tourism Officer", suggested_timeframe: "Within 30 days", prerequisites: ["Confirm the decline after historical and comparable-establishment assessment.", "Select only an intervention appropriate to available capacity and operator participation."], success_indicators: ["An approved intervention has participating establishments, and subsequent comparable visitor counts are evaluated without attributing causation solely to the intervention." ] });
    }
    actions.push(intervention);
    actions.push(action({ action_title: "Evaluate the next comparable period", action_description: `Compare the next equivalent reporting period with the verified ${formatNumber(current)} ${label} baseline and review visitor growth, performance indicators, and eligible satisfaction metrics where available.`, action_category: "Policy and Program Evaluation", primary_objective: "Outcome Evaluation", action_priority: "Medium", responsible_entity: "Municipal Tourism Officer", suggested_timeframe: "During the next reporting period", prerequisites: ["Use the same scope, metric definition, and comparable reporting coverage."], success_indicators: ["Comparable visitor counts and growth are recorded; available performance and eligible satisfaction indicators are compared." ] }));
    return { actions, decisionImplication: `The substantial ${label} decline for ${period} despite ${coverage}% reporting coverage warrants establishment-level investigation and assessment of an evidence-supported recovery response.` };
  }

  if (highCoverage && missing === 0 && dropPercent != null && dropPercent > 0) {
    actions.push(action({ action_title: `Assess the ${label} change`, action_description: `Compare ${period} with ${comparison} and relevant historical periods to determine whether the reported change is material before selecting an intervention.`, action_category: "Diagnostic Assessment", primary_objective: "Diagnostic Assessment", responsible_entity: establishmentScope ? "Establishment operator with Municipal Tourism Officer" : "Municipal Tourism Officer", suggested_timeframe: "Within 14 days", success_indicators: ["A comparable-period assessment records whether the change is material and what evidence should be reviewed next." ] }));
    return { actions, decisionImplication: `Complete reporting improves the reliability of the ${label} comparison, allowing the Tourism Office to distinguish a material demand issue from ordinary variation before intervening.` };
  }

  if (recurringComplaints && feedbackCount > 0) {
    actions.push(action({ action_title: "Assess recurring visitor concerns", action_description: `Review eligible published feedback themes with ${establishmentName} and assess service-improvement opportunities.`, action_category: "Customer Experience", primary_objective: "Strategic Intervention", responsible_entity: "Establishment operator with Municipal Tourism Officer", suggested_timeframe: "Within 30 days", success_indicators: ["A feedback-based service assessment is completed and later satisfaction indicators are compared." ] }));
  }
  return { actions, decisionImplication: `The verified ${label} evidence supports a scoped diagnostic assessment; no specific cause or intervention is asserted without additional evidence.` };
}

export default selectTourismRecommendationStrategies;
