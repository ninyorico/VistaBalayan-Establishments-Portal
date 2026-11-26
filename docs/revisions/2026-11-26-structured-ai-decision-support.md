# Structured AI decision-support actions

## Implemented

- Expanded Gemini output from one flat recommendation to 2–4 structured recommended actions per insight.
- Added structured metadata stored in the existing `input_snapshot` JSON field to preserve database compatibility:
  - insight category
  - priority
  - analysis period
  - geographic scope
  - data confidence
  - data limitations
  - decision implication
  - action title and description
  - responsible entity
  - suggested timeframe
  - prerequisites
  - success indicators
  - validation requirement
  - related evidence identifiers
- Kept the existing `recommended_action` column populated with the first normalized action for backward compatibility.
- Updated chart-linked AI cards to display the full action plan, owner, timeframe, confidence, decision implication, expected outcome, success indicators, and limitations.
- Kept actions tied to metric-specific evidence and existing one-to-one recommendation assignment.
- Preserved human review: the generated responsible entity and timeframe are suggestions, not approved municipal commitments.

## Decision-support rules

- Recommendations must identify a concrete next action, not merely say to review, investigate, compare, monitor, validate, study, or check.
- Recommendations must be supported by the supplied reporting evidence and must not invent causes, establishments, events, marketing results, capacity, pricing, or other unavailable information.
- Coverage thresholds in the generation prompt are internal decision-support parameters, not official Department of Tourism standards.
- Unsupported or structurally incomplete AI actions are not assigned to chart findings.

## Compatibility and limitation

- No existing reports, accounts, AI rows, or historical data were deleted or rewritten.
- Existing flat AI rows continue to render through the backward-compatible path.
- New structured action plans appear after a successful AI refresh; cached legacy rows do not gain fabricated metadata.
- Action-plan approval, assignment, progress tracking, and outcome recording remain future work because they require an authorized workflow and audit model.
