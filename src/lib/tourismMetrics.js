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

/**
 * Aggregate submitted visitor and accommodation rows by calendar month.
 * Visitor rows may be one row per residence/category, so coverage uses
 * distinct establishment/date pairs rather than raw row count.
 */
export const aggregateMonthlyMetrics = (visitorRows = [], accommodationRows = [], eligibleVisitorEstablishments = 0) => {
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
        accommodationSubmissionDays: new Set(),
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
    if (row.establishment_id && row.report_date) item.visitorSubmissionDays.add(`${row.establishment_id}|${row.report_date}`)
  }

  for (const row of accommodationRows) {
    const key = monthKey(row.report_date)
    if (!key) continue
    const item = ensure(key)
    item.guestCheckIns += numberOrZero(row.total_check_ins ?? row.guest_check_ins)
    item.accommodationRowCount += 1
    if (row.establishment_id && row.report_date) item.accommodationSubmissionDays.add(`${row.establishment_id}|${row.report_date}`)
  }

  return [...byMonth.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((item) => {
      const expectedVisitorReports = eligibleVisitorEstablishments > 0
        ? eligibleVisitorEstablishments * daysInMonth(item.month)
        : null
      const submittedVisitorReports = item.visitorSubmissionDays.size
      const coveragePercent = expectedVisitorReports
        ? Math.min(100, (submittedVisitorReports / expectedVisitorReports) * 100)
        : null
      return {
        month: item.month,
        dayTourVisitors: item.dayTourVisitors,
        guestCheckIns: item.guestCheckIns,
        combinedActivity: item.dayTourVisitors + item.guestCheckIns,
        visitorRowCount: item.visitorRowCount,
        accommodationRowCount: item.accommodationRowCount,
        submittedVisitorReports,
        submittedAccommodationReports: item.accommodationSubmissionDays.size,
        expectedVisitorReports,
        coveragePercent,
      }
    })
}

export const percentChange = (current, previous) => {
  if (!(previous > 0)) return null
  return ((current - previous) / previous) * 100
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
  const thresholdPercent = options.thresholdPercent ?? 30
  const rows = []

  for (let index = 1; index < monthlyMetrics.length; index += 1) {
    const previous = monthlyMetrics[index - 1]
    const current = monthlyMetrics[index]
    if (previousCalendarMonth(current.month) !== previous.month) continue
    const changePercent = percentChange(current.dayTourVisitors, previous.dayTourVisitors)
    if (changePercent === null || previous.dayTourVisitors < minimumPreviousVisitors || changePercent > -thresholdPercent) continue

    const dropPercent = Math.abs(changePercent)
    const severity = dropPercent >= 50 ? 'high' : 'medium'
    const anomalyKey = `day-tour-visitors:${current.month}`
    const coverageNote = current.coveragePercent === null
      ? 'Reporting coverage is unavailable.'
      : `Reporting coverage was ${current.coveragePercent.toFixed(1)}%.`
    rows.push({
      type: 'Day-tour visitor decline',
      severity,
      description: `Submitted day-tour visitors decreased from ${previous.dayTourVisitors.toLocaleString()} in ${previous.month} to ${current.dayTourVisitors.toLocaleString()} in ${current.month} (${dropPercent.toFixed(1)}% decrease). ${coverageNote}`,
      recommendation: 'Review the affected submissions and confirm whether the decline reflects activity or incomplete reporting.',
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
        current_coverage_percent: current.coveragePercent === null ? null : Number(current.coveragePercent.toFixed(2)),
        previous_submitted_reports: previous.submittedVisitorReports,
        previous_expected_reports: previous.expectedVisitorReports,
        previous_coverage_percent: previous.coveragePercent === null ? null : Number(previous.coveragePercent.toFixed(2)),
        rule_version: 'day-tour-monthly-drop-v1',
      },
    })
  }

  return rows
}
