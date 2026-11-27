# Verified Public Feedback Contract

Status: implemented in the repository and applied to the linked Supabase database on 2026-11-27. This document describes the current implementation; it is not legal advice.

## Data flow

1. An unauthenticated visitor can browse public establishments and published review summaries.
2. A public account is created through Supabase Auth using email/password or Google OAuth.
3. Email accounts must have `email_confirmed_at`; Google accounts must have a provider-confirmed identity before review submission.
4. Review creation, update, and deletion use authenticated RPCs. The RPC derives the account from `auth.uid()` and does not trust a client-supplied reviewer identity.
5. Published summaries are exposed through `establishment_rating_summaries` and exclude non-published or otherwise ineligible records.
6. Officer Analytics reads the summary view and displays customer-feedback indicators separately from tourism-reporting volume classifications.

## Database protections

The migration is `supabase/migrations/202611270002_verified_public_reviews.sql`.

Verified read-back confirmed:

- `public_user_profiles`, `public_user_account_deletion_requests`, `establishment_ratings`, `review_moderation_audit`, and `establishment_rating_reports` exist with RLS enabled where applicable.
- `establishment_rating_reviews` and `establishment_rating_summaries` exist as public-facing views.
- `establishment_ratings_one_active_user_establishment_idx` exists as the database-level one-active-review constraint.
- `submit_establishment_rating`, `update_establishment_rating`, `delete_establishment_rating`, `get_public_user_reviews`, `moderate_establishment_rating`, and `request_public_account_deletion` exist.
- Profile and account-deletion-request policies restrict reads/writes to the authenticated owner.
- The legacy five-argument submit function remains for compatibility. The six-argument function is the authenticated photo-aware path and returns the created review ID.

## Metrics

For eligible published ratings `r` in the 1–5 range:

- Average rating: `sum(r) / count(r)`.
- Positive-rating percentage: `count(r >= 4) / count(r) * 100`.
- Customer satisfaction score: `((average_rating - 1) / 4) * 100`.
- Distribution: counts for each rating from 1 through 5.

No ratings is distinct from insufficient feedback. Neither state is converted to a zero-star score. Legacy anonymous/token reviews are retained for compatibility but are not automatically included in verified customer-satisfaction calculations.

## Officer Analytics and AI

Officer Analytics exposes average rating, positive percentage, satisfaction score, review count, eligibility state, and sorting by satisfaction, rating, positive percentage, or review count. The existing volume-based performance classification remains separate.

When eligible customer feedback exists, Analytics creates a chart-local, evidence-bound finding. Recommendations are advisory, identify the Municipal Tourism Officer as the responsible role, provide a timeframe and measurable outcome, and explicitly state that account verification does not prove that a reviewer visited the establishment. No causal claim is inferred from rating data alone.

The server endpoint `api/generate-insights.js` loads the official rating-summary view and paginates the base review table through the service role only for server-side aggregation. It filters to authenticated, verified, published, non-suspicious, non-deleted reviews, then sends only rating summaries, eligible-comment counts, and theme counts to the model. Raw review text, reviewer names, emails, and account IDs are never included in the AI payload. Feedback evidence IDs are included in the source fingerprint so cached AI results are invalidated when feedback aggregates change. Customer-feedback insights remain advisory and must not treat verification as proof of physical visitation or keyword themes as sentiment, causation, or truth.

The officer Analytics establishment selector applies the selected establishment to reports, feedback summaries, feedback pagination, cached AI records, and AI refresh generation. The refresh endpoint accepts an establishment ID only for officers, verifies that the target exists and is active, and ignores override IDs for establishment staff so staff remain bound to their profile establishment. Municipality scope remains the default when no establishment is selected.

## Recurring themes

`src/lib/customerFeedbackThemes.ts` classifies only published, verified, non-suspicious comments into descriptive keyword groups: service/staff, cleanliness, location/access, value/price, amenities/facilities, comfort/experience, and other. A comment may contribute to multiple themes. Analytics receives only aggregate label/count/share values from the public review view; raw comments, reviewer names, and account identifiers are not sent to AI or displayed in the theme panel. Analytics now pages through the review and period-summary views in 1,000-row batches until all rows are loaded. Theme keywords are heuristic and do not establish sentiment, causation, or truthfulness.

## Decision-support segments

`src/lib/customerFeedbackDecisionSupport.ts` classifies eligible establishments into five advisory segments: high visitor volume with low satisfaction, low visitor volume with high satisfaction, declining satisfaction, consistently positive feedback, and insufficient feedback. Each segment maps to an evidence-bound action with a responsible role, timeframe, measurable outcome, and advisory limitation. Analytics now compares weighted selected-year and comparison-year satisfaction from `establishment_rating_period_summaries`; both feedback views are fully paginated in 1,000-row batches.


The moderation queue applies deterministic, review-only heuristics to officer-visible review metadata:

- `rating_burst`: at least five reviews in the latest seven-day window and at least twice the preceding comparable window.
- `repetitive_content`: two or more normalized identical comments in the latest window.
- `multiple_account_submissions`: at least three submissions by the same authenticated account in the latest window.
- `average_rating_shift`: a change of at least one star between comparable recent and prior windows, each with at least two reviews.
- `repeated_manipulation_attempt`: at least two recent records already flagged or rejected by moderation.

Every result is labelled as a signal requiring human review. The system does not label a reviewer fraudulent, does not expose account IDs in the UI, and does not infer intent or causation. Small samples, coordinated legitimate campaigns, shared devices, and unusual seasonal activity can produce false positives; officers must inspect the underlying review and report history.


- Google OAuth requires Supabase provider enablement and production redirect URL configuration outside this repository; repository code alone cannot verify provider configuration.
- Account deletion currently records an authenticated deletion request. Retention, identity-provider deletion, and final erasure require a documented operator workflow and privacy review.
- Submission rate limiting: verified public reviews are rejected after five prior verified submissions by the same account within 24 hours.
- Repetitive-content detection: normalized repeated review text by the same verified account within 30 days is flagged and moved from `published` to `flagged` when applicable.
- These controls are implemented by `supabase/migrations/202611270003_review_abuse_controls.sql` and intentionally exclude legacy anonymous/token reviews.
- Establishment-operator self-review blocking depends on reliable account-to-establishment relationships. It is enforced only where that relationship can be identified.
- The score models in `src/lib/customerFeedbackMetrics.ts` are proposed and must be approved before replacing official reporting classifications.
- Review/account policy text requires qualified Philippine privacy counsel review under the Data Privacy Act of 2012.

## Moderation policy

The moderation queue is advisory and human-controlled. Deterministic anomaly signals, repeated-content flags, user reports, or inappropriate-language checks do not by themselves establish fraud or justify removing a legitimate negative review.

Applicable review states are:

- `pending`: awaiting an officer decision;
- `published`: visible through public review views and eligible for official feedback calculations only when the account, verification, and suspicious-content rules also pass;
- `flagged`: retained for officer investigation because a report or automated signal requires review;
- `rejected`: not published because the submitted content failed an applicable moderation or validation rule;
- `hidden`: removed from public display through an auditable officer action while preserving the underlying record.

Authorized officers use the moderation RPC rather than directly updating moderation columns. Removal requires a bounded reason, records the moderator and timestamp in the audit trail, and preserves the review and report history. Restore actions are also auditable. Establishment operators cannot remove or rewrite reviews to improve their rating. A review should remain published when it is a lawful, relevant negative experience and no documented rule violation is established.

## Verification commands

Portal:

```text
npx tsc --noEmit
npm test -- --run
npm run build
git diff --check
```

Public portal:

```text
npm test
npm run build
```

The latest verified results were 12 portal test files / 51 tests passed, public tests 7/7 passed, both production builds passed, and both diff checks passed. Build output contains existing Browserslist, empty-font-file, and chunk-size warnings but no build errors.
