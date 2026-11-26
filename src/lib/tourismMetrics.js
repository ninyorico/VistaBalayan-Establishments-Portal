const numberOrZero = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}

const monthKey = (date) => String(date || '').slice(0, 7)

const daysInMonth = (key) => {
  const [year, month] = key.split('-').map(Number)
  if (!year || !month) return 0
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export const deriveReportEvidence = (submittedReports, expectedReports) => {
  const submitted = Number(submittedReports)
  const expected = Number(expectedReports)
  if (!Number.isFinite(submitted) || !Number.isFinite(expected) || expected <= 0) {
    return { missingReports: null, coveragePercent: null }
  }
  return {
    missingReports: Math.max(0, expected - submitted),
    coveragePercent: Math.min(100, (submitted / expected) * 100),
  }
}

export const hasConsistentAnomalyEvidence = (evidence = {}) => {
  for (const prefix of ['current', 'previous']) {
    const submitted = evidence[`${prefix}_submitted_reports`]
    const expected = evidence[`${prefix}_expected_reports`]
    const missing = evidence[`${prefix}_missing_reports`]
    const coverage = evidence[`${prefix}_coverage_percent`]
    if (expected == null) {
      if (missing != null || coverage != null) return false
      continue
    }
    const derived = deriveReportEvidence(submitted, expected)
    if (derived.missingReports === null || derived.coveragePercent === null) return false
    if (Number(missing) !== derived.missingReports) return false
    if (Math.abs(Number(coverage) - derived.coveragePercent) > 0.01) return false
  }
  return true
}

/**
 * Aggregate submitted visitor and accommodation rows by calendar month.
 * Visitor rows may be one row per residence/category, so coverage uses
 * distinct establishment/date pairs rather than raw row count.
 */
export const aggregateMonthlyMetrics = (visitorRows = [], accommodationRows = [], eligibleVisitorEstablishments = 0, eligibleAccommodationEstablishments = 0) => {
  const byMonth = new Map()
  const ensure = (key) => {
    if (!byMonth.has(key)) {
      byMonth.set(key, {
        month: key,
        dayTourVisitors: 0,
        guestCheckIns: 0,
        combinedActivity: 0,
        visitorRowCount: 0,
        accommodationRowCount: 0,
        visitorSubmissionDays: new Set(),
        lateVisitorSubmissionDays: new Set(),
        accommodationSubmissionDays: new Set(),
        lateAccommodationSubmissionDays: new Set(),
      })
    }
    return byMonth.get(key)
  }

  for (const row of visitorRows) {
    const key = monthKey(row.report_date)
    if (!key) continue
    const item = ensure(key)
    item.dayTourVisitors += numberOrZero(row.total_visitors ?? row.total_guests)
    item.visitorRowCount += 1
    if (row.establishment_id && row.report_date) {
      const submissionKey = `${row.establishment_id}|${row.report_date}`
      item.visitorSubmissionDays.add(submissionKey)
      if (String(row.created_at || '').slice(0, 10) > String(row.report_date).slice(0, 10)) {
        item.lateVisitorSubmissionDays.add(submissionKey)
      }
    }
  }

  for (const row of accommodationRows) {
    const key = monthKey(row.report_date)
    if (!key) continue
    const item = ensure(key)
    item.guestCheckIns += numberOrZero(row.total_check_ins ?? row.guest_check_ins)
    item.accommodationRowCount += 1
    if (row.establishment_id && row.report_date) {
      const submissionKey = `${row.establishment_id}|${row.report_date}`
      item.accommodationSubmissionDays.add(submissionKey)
      if (String(row.created_at || '').slice(0, 10) > String(row.report_date).slice(0, 10)) {
        item.lateAccommodationSubmissionDays.add(submissionKey)
      }
    }
  }

  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => {
      const expectedVisitorReports = eligibleVisitorEstablishments > 0
        ? eligibleVisitorEstablishments * daysInMonth(item.month)
        : null
      const submittedVisitorReports = item.visitorSubmissionDays.size
      const lateVisitorReports = item.lateVisitorSubmissionDays.size
      const visitorEvidence = deriveReportEvidence(submittedVisitorReports, expectedVisitorReports)
      const coveragePercent = visitorEvidence.coveragePercent
      const missingVisitorReports = visitorEvidence.missingReports
      const expectedAccommodationReports = eligibleAccommodationEstablishments > 0
        ? eligibleAccommodationEstablishments * daysInMonth(item.month)
        : null
      const submittedAccommodationReports = item.accommodationSubmissionDays.size
      const lateAccommodationReports = item.lateAccommodationSubmissionDays.size
      const accommodationEvidence = deriveReportEvidence(submittedAccommodationReports, expectedAccommodationReports)
      const accommodationCoveragePercent = accommodationEvidence.coveragePercent
      const missingAccommodationReports = accommodationEvidence.missingReports
      return {
        month: item.month,
        dayTourVisitors: item.dayTourVisitors,
        guestCheckIns: item.guestCheckIns,
        combinedActivity: item.dayTourVisitors + item.guestCheckIns,
        visitorRowCount: item.visitorRowCount,
        accommodationRowCount: item.accommodationRowCount,
        submittedVisitorReports,
        lateVisitorReports,
        missingVisitorReports,
        submittedAccommodationReports,
        lateAccommodationReports,
        missingAccommodationReports,
        expectedAccommodationReports,
        accommodationCoveragePercent,
        expectedVisitorReports,
        coveragePercent,
      }
    })
}

export const percentChange = (current, previous) => {
  if (!(previous > 0)) return null
  return ((current - previous) / previous) * 100
}

const monthLabel = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}$/.test(value)) return value
  const [year, month] = value.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { month: 'long' }).format(new Date(Date.UTC(year, month - 1, 1)))
}

const previousCalendarMonth = (month) => {
  const [year, monthNumber] = month.split('-').map(Number)
  if (!year || !monthNumber) return null
  const date = new Date(Date.UTC(year, monthNumber - 2, 1))
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`
}

/**
 * Deterministic monthly anomaly rule for day-tour visitors.
 * Only drops of at least 30% with a meaningful previous-month baseline are emitted.
 */
export const buildDeterministicAnomalies = (monthlyMetrics = [], options = {}) => {
  const minimumPreviousVisitors = options.minimumPreviousVisitors ?? 100
  const minimumPreviousOvernightCheckIns = options.minimumPreviousOvernightCheckIns ?? 20
  const thresholdPercent = options.thresholdPercent ?? 30
  const rows = []

  for (let index = 1; index < monthlyMetrics.length; index += 1) {
    const previous = monthlyMetrics[index - 1]
    const current = monthlyMetrics[index]
    if (previousCalendarMonth(current.month) !== previous.month) continue
    const changePercent = percentChange(current.dayTourVisitors, previous.dayTourVisitors)
    const dayTourEligible = changePercent !== null && previous.dayTourVisitors >= minimumPreviousVisitors && changePercent <= -thresholdPercent

    if (dayTourEligible) {
      const dropPercent = Math.abs(changePercent)
      const severity = dropPercent >= 50 ? 'high' : 'medium'
      const anomalyKey = `day-tour-visitors:${current.month}`
      const coverageNote = current.coveragePercent === null
        ? 'Reporting coverage is unavailable.'
        : `Reporting coverage was ${current.coveragePercent.toFixed(1)}%.`
      const missingNote = current.missingVisitorReports === null
        ? 'Missing report count is unavailable.'
        : `${current.missingVisitorReports} expected report${current.missingVisitorReports === 1 ? '' : 's'} ${current.missingVisitorReports === 1 ? 'is' : 'are'} missing.`
      const lateNote = current.lateVisitorReports > 0
        ? `${current.lateVisitorReports} submitted report${current.lateVisitorReports === 1 ? '' : 's'} ${current.lateVisitorReports === 1 ? 'was' : 'were'} entered after the report date.`
        : 'No submitted reports were identified as late.'
      rows.push({
        type: 'Day-tour visitor decline',
        severity,
        description: `Reported day-tour visitors decreased ${dropPercent.toFixed(1)}% from ${monthLabel(previous.month)} to ${monthLabel(current.month)} ${current.month.slice(0, 4)}, with ${current.coveragePercent === null ? 'unavailable' : `${current.coveragePercent.toFixed(1)}%`} reporting coverage. ${current.missingVisitorReports === null ? 'Missing day-tour report count is unavailable.' : `${current.missingVisitorReports} expected day-tour reports are missing.`} ${current.lateVisitorReports > 0 ? `${current.lateVisitorReports} submitted day-tour report${current.lateVisitorReports === 1 ? '' : 's'} ${current.lateVisitorReports === 1 ? 'was' : 'were'} entered after the report date.` : 'No submitted day-tour reports were identified as late.'}`,
        evidence: {
          anomaly_key: anomalyKey,
          metric: 'dayTourVisitors',
          current_month: current.month,
          current_value: current.dayTourVisitors,
          previous_month: previous.month,
          previous_value: previous.dayTourVisitors,
          change_percent: Number(changePercent.toFixed(2)),
          drop_percent: Number(dropPercent.toFixed(2)),
          threshold_percent: thresholdPercent,
          minimum_previous_visitors: minimumPreviousVisitors,
          current_submitted_reports: current.submittedVisitorReports,
          current_expected_reports: current.expectedVisitorReports,
          current_missing_reports: current.missingVisitorReports,
          current_late_reports: current.lateVisitorReports,
          current_coverage_percent: current.coveragePercent === null ? null : Number(current.coveragePercent.toFixed(2)),
          previous_submitted_reports: previous.submittedVisitorReports,
          previous_expected_reports: previous.expectedVisitorReports,
          previous_missing_reports: previous.missingVisitorReports,
          previous_late_reports: previous.lateVisitorReports,
          previous_coverage_percent: previous.coveragePercent === null ? null : Number(previous.coveragePercent.toFixed(2)),
          rule_version: 'day-tour-monthly-drop-v2',
        },
      })
    }

    const overnightChangePercent = percentChange(current.guestCheckIns, previous.guestCheckIns)
    if (overnightChangePercent !== null && previous.guestCheckIns >= minimumPreviousOvernightCheckIns && overnightChangePercent <= -thresholdPercent) {
      const overnightDropPercent = Math.abs(overnightChangePercent)
      const overnightCoverageNote = current.accommodationCoveragePercent === null
        ? 'Accommodation reporting coverage was unavailable.'
        : `Accommodation reporting coverage was ${current.accommodationCoveragePercent.toFixed(1)}%.`
      const overnightMissingNote = current.missingAccommodationReports === null
        ? 'Missing accommodation report count is unavailable.'
        : `${current.missingAccommodationReports} expected accommodation report${current.missingAccommodationReports === 1 ? '' : 's'} ${current.missingAccommodationReports === 1 ? 'is' : 'are'} missing.`
      const overnightLateNote = current.lateAccommodationReports > 0
        ? `${current.lateAccommodationReports} submitted accommodation report${current.lateAccommodationReports === 1 ? '' : 's'} ${current.lateAccommodationReports === 1 ? 'was' : 'were'} entered after the report date.`
        : 'No submitted accommodation reports were identified as late.'
      rows.push({
        type: 'Overnight guest check-in decline',
        severity: overnightDropPercent >= 50 ? 'high' : 'medium',
        description: `Reported overnight guest check-ins decreased ${overnightDropPercent.toFixed(1)}% from ${monthLabel(previous.month)} to ${monthLabel(current.month)} ${current.month.slice(0, 4)}, with ${current.accommodationCoveragePercent === null ? 'unavailable' : `${current.accommodationCoveragePercent.toFixed(1)}%`} accommodation reporting coverage. ${current.missingAccommodationReports === null ? 'Missing accommodation report count is unavailable.' : `${current.missingAccommodationReports} expected accommodation reports are missing.`} ${current.lateAccommodationReports > 0 ? `${current.lateAccommodationReports} submitted accommodation report${current.lateAccommodationReports === 1 ? '' : 's'} ${current.lateAccommodationReports === 1 ? 'was' : 'were'} entered after the report date.` : 'No submitted accommodation reports were identified as late.'}`,
        evidence: {
          anomaly_key: `overnight-guest-check-ins:${current.month}`,
          metric: 'overnightGuestCheckIns',
          current_month: current.month,
          current_value: current.guestCheckIns,
          previous_month: previous.month,
          previous_value: previous.guestCheckIns,
          change_percent: Number(overnightChangePercent.toFixed(2)),
          drop_percent: Number(overnightDropPercent.toFixed(2)),
          threshold_percent: thresholdPercent,
          minimum_previous_guest_check_ins: minimumPreviousOvernightCheckIns,
          current_submitted_reports: current.submittedAccommodationReports,
          current_expected_reports: current.expectedAccommodationReports,
          current_missing_reports: current.missingAccommodationReports,
          current_late_reports: current.lateAccommodationReports,
          current_coverage_percent: current.accommodationCoveragePercent === null ? null : Number(current.accommodationCoveragePercent.toFixed(2)),
          previous_submitted_reports: previous.submittedAccommodationReports,
          previous_expected_reports: previous.expectedAccommodationReports,
          previous_missing_reports: previous.missingAccommodationReports,
          previous_late_reports: previous.lateAccommodationReports,
          previous_coverage_percent: previous.accommodationCoveragePercent === null ? null : Number(previous.accommodationCoveragePercent.toFixed(2)),
          rule_version: 'overnight-monthly-drop-v1',
        },
      })
    }
  }

  return rows
}
