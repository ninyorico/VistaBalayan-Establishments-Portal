import { describe, expect, it } from 'vitest';
import { selectTourismRecommendationStrategies } from './tourismRecommendationStrategies.js';

describe('selectTourismRecommendationStrategies', () => {
  it('does not make missing reports the primary action for a complete substantial decline', () => {
    const result = selectTourismRecommendationStrategies({
      metric: 'dayTourVisitors', current_coverage_percent: 100, current_missing_reports: 0,
      previous_value: 3000, current_value: 248, drop_percent: 91.7,
      current_month: '2026-10', previous_month: '2026-09',
    }, { scope: 'establishment', establishmentName: 'Fixture Resort' });
    expect(result.actions.map((action) => action.primary_objective)).toEqual([
      'Diagnostic Assessment', 'Strategic Intervention', 'Outcome Evaluation',
    ]);
    expect(result.actions.some((action) => action.action_category === 'Reporting Compliance')).toBe(false);
    expect(result.decisionImplication).toContain('100% reporting coverage');
  });

  it('keeps validation as supporting context when coverage is high but incomplete', () => {
    const result = selectTourismRecommendationStrategies({
      metric: 'dayTourVisitors', current_coverage_percent: 90, current_missing_reports: 3,
      previous_value: 3100, current_value: 270, drop_percent: 91.3,
      current_month: '2026-11', previous_month: '2026-10',
    }, { scope: 'establishment', establishmentName: 'Fixture Resort' });
    expect(result.actions[0].primary_objective).toBe('Diagnostic Assessment');
    expect(result.actions.some((action) => action.primary_objective === 'Reporting Compliance')).toBe(false);
    expect(result.actions.some((action) => action.primary_objective === 'Strategic Intervention')).toBe(true);
  });

  it('prioritizes validation under very low coverage without selecting an unsupported promotion', () => {
    const result = selectTourismRecommendationStrategies({
      metric: 'dayTourVisitors', current_coverage_percent: 20, current_missing_reports: 50,
      previous_value: 1500, current_value: 800, drop_percent: 46.7,
    }, { scope: 'municipality' });
    expect(result.actions[0].primary_objective).toBe('Data Validation');
    expect(result.actions.some((action) => action.primary_objective === 'Strategic Intervention')).toBe(false);
  });

  it('selects service improvement only when eligible feedback concerns are available', () => {
    const result = selectTourismRecommendationStrategies({
      metric: 'dayTourVisitors', current_coverage_percent: 100, current_missing_reports: 0,
      previous_value: 2000, current_value: 900, drop_percent: 55,
      eligible_feedback_count: 8, customer_satisfaction_score: 58,
      feedback_themes: ['service'],
    }, { scope: 'establishment', establishmentName: 'Fixture Resort' });
    expect(result.actions[1].action_category).toBe('Customer Experience');
    expect(result.actions[1].action_description).toContain('eligible published feedback');
  });

  it('selects a broader response only when comparable establishments also decline', () => {
    const result = selectTourismRecommendationStrategies({
      metric: 'dayTourVisitors', current_coverage_percent: 100, current_missing_reports: 0,
      previous_value: 5000, current_value: 3000, drop_percent: 40,
      comparable_establishments_declining: true,
    }, { scope: 'municipality' });
    expect(result.actions[1].action_category).toBe('Tourism Promotion');
    expect(result.actions[1].action_description).toContain('multiple comparable establishments');
  });

  it('does not recommend a missing-report action when there are no missing reports', () => {
    const result = selectTourismRecommendationStrategies({
      metric: 'dayTourVisitors', current_coverage_percent: 100, current_missing_reports: 0,
      previous_value: 120, current_value: 110, drop_percent: 8.3,
    }, { scope: 'establishment' });
    expect(result.actions.every((action) => !/missing report/i.test(`${action.action_title} ${action.action_description}`))).toBe(true);
  });

  it('uses a visitor-origin-specific action instead of a demand-decline template', () => {
    const result = selectTourismRecommendationStrategies({
      metric: 'visitorOrigins', origin: 'Batangas', current_value: 10800, growth_percent: 10.7,
      current_month: '2026-06',
    }, { scope: 'municipality' });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action_title).toContain('Batangas');
    expect(result.actions[0].action_category).toBe('Visitor Origin Monitoring');
  });

  it('uses a feedback-specific action when feedback evidence is the finding', () => {
    const result = selectTourismRecommendationStrategies({
      metric: 'customerFeedback', feedback_count: 12, low_satisfaction_count: 3,
    }, { scope: 'municipality' });
    expect(result.actions).toHaveLength(1);
    expect(result.actions[0].action_title).toContain('3 low-satisfaction indicators');
    expect(result.actions[0].action_category).toBe('Customer Experience');
  });
});
