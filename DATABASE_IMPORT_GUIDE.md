# VistaBalayan Database and Historical Report Import Guide

**Purpose:** Explain the current Supabase schema and define how historical tourism reports extracted from Google Drive should be mapped before any database import.

**Important:** This guide describes the live PostgREST schema and the application code currently in the portal. It is an engineering/data-mapping guide, not legal advice. Historical imports should be reviewed before execution. Do not import data directly into production until the source-to-field mapping, identity matching, dates, status policy, and submitter identity have been confirmed.

---

## 1. System model

VistaBalayan separates the system into four data groups:

1. **Identity and ownership**
   - Supabase Auth users (`auth.users`, managed by Supabase Auth)
   - `public.profiles`
   - `public.staff`

2. **Tourism establishments**
   - `public.establishments`

3. **Tourism source reports**
   - `public.accommodation_reports`
   - `public.room_occupancy_details`
   - `public.visitor_reports`

4. **Supporting application data**
   - ratings and rating summaries
   - notifications
   - AI/anomaly caches
   - audit logs
   - email OTP records

The tourism source-report tables are the system of record. DAE and VAR reports are generated from those source records; they should not be imported as replacement aggregate rows unless a separate approved design is created.

---

## 2. Identity and account rules

### `auth.users` — Supabase-managed authentication table

This table is outside the public application schema. It contains login identities, passwords, email verification state, sessions, and other authentication data.

**Do not import or edit passwords, encrypted passwords, access tokens, refresh tokens, or session data.** Do not insert directly into `auth.users` with ordinary SQL for a historical report import. If a new account is genuinely required, use the approved Supabase Auth/Admin workflow and then create the corresponding profile.

Historical reports normally do **not** require creating new users. They do require a valid `submitted_by` UUID. If the original submitter cannot be identified, stop and obtain an explicit policy decision; do not fabricate a user ID.

### `public.profiles`

One application profile normally corresponds to one authenticated user.

| Field | Meaning | Import guidance |
|---|---|---|
| `id` UUID | Same identity UUID as `auth.users.id` | Required. Never invent for an existing user. |
| `email` text | Login email | Must match the intended Auth user. Do not import passwords. |
| `full_name` text | Display name | Required. Use source evidence. |
| `role` text | Application role, principally `municipal_officer` or `establishment_staff` | Required. Do not guess. |
| `establishment_id` UUID | Establishment owned by staff account | Required for establishment staff; normally null for municipal officers. |
| `contact_number` text | Contact number | Optional. Preserve as text. |
| `position` text | Job position | Optional. |
| `status` text | Account status; default is `active` | Optional only when confirmed. |
| `created_at` timestamp | Profile creation timestamp | Usually system-generated. Preserve only when there is a reliable source. |
| `updated_at` timestamp | Last profile update | Usually system-generated. |
| `dashboard_role` text | Optional dashboard-specific role label | Do not populate unless the application/account design requires it. |

### `public.staff`

This is a staff directory/legacy support table. It is not the primary authentication table used by the current report workflow.

| Field | Meaning |
|---|---|
| `id` UUID | Staff row identifier |
| `email` | Staff email |
| `full_name` | Staff name |
| `role` | Staff role |
| `establishment_id` | Related establishment |
| `contact_number` | Contact number |
| `position` | Position |
| `status` | Staff status |
| `created_at`, `updated_at` | Timestamps |
| `establishment_name` | Denormalized display name; can become stale |
| `total_rooms` | Denormalized room count; do not use as the reporting source of truth |

Do not create duplicate staff/profile rows merely because a report spreadsheet contains a name.

---

## 3. Establishments

### `public.establishments`

One row represents one tourism establishment or visitor attraction.

| Field | Meaning | Required/default | Import guidance |
|---|---|---|---|
| `id` UUID | Stable establishment identifier | Required; normally generated | Match existing rows by confirmed identity. Do not match by name alone. |
| `name` text | Official establishment name | Required | Preserve the official name; keep an alias mapping separately during import. |
| `type` text | Business/category label such as Hotel, Resort, Inn, Lodge, attraction, etc. | Required | This is descriptive classification, not form eligibility. |
| `address` text | Physical address | Required | Use source evidence. |
| `contact_number` text | Public/contact number | Optional | Preserve formatting as text. |
| `total_rooms` integer | Registered/configured accommodation room count | Default `0` | Use only for establishments with accommodation. `0` does not mean visitor count is zero. |
| `status` text | Listing/account status | Default `active` | Common values include `active` and closed/inactive values used by the existing data. Confirm before importing. |
| `created_at` timestamp | Establishment creation time | Default `now()` | Do not replace with report date. |
| `description` text | Public description | Optional | Not needed for tourism report import. |
| `images` text[] | Image URLs/paths | Optional | Do not put spreadsheet text here. |
| `opening_hours` text | Public operating hours | Optional | Not a report period. |
| `website_url` text | Website | Optional | Validate URLs. |
| `email` text | Establishment contact email | Optional | Do not assume it is a login email. |
| `amenities` text | Public amenities representation | Optional | Existing schema is text; preserve the current format. |
| `featured` boolean | Public featured-listing flag | Default `false` | Do not change during report import. |
| `updated_at` timestamp | Last listing update | Default `now()` | System-managed where possible. |
| `reporting_mode` text | Forms allowed for this establishment | Default `visitor`; required | Values: `accommodation`, `visitor`, `both`. This is independent of `type`. |
| `ae_id` text | Accommodation establishment identifier for DAE exports | Optional | Required for reliable official accommodation exports if assigned. |
| `attraction_code` text | Visitor-attraction identifier for VAR exports | Optional | Required for reliable visitor exports if assigned. |

### Reporting mode rules

- `accommodation`: import/use accommodation reports only.
- `visitor`: import/use visitor reports only.
- `both`: import/use both report families.

Do not infer `reporting_mode` from the word `Resort`, `Hotel`, or `Inn` in `type`. Use the user-confirmed establishment classification or reliable report evidence.

---

## 4. Accommodation source reports

### `public.accommodation_reports`

One row represents one establishment’s accommodation report for one reporting date. The current system enforces an active daily uniqueness rule for `(establishment_id, report_date)`; rejected and archived historical duplicates are treated differently.

| Field | Meaning | Required/default | Import guidance |
|---|---|---|---|
| `id` UUID | Report identifier | Required; normally generated | Keep source ID in an import mapping file if available. |
| `establishment_id` UUID | Reporting establishment | Required | Must reference the correct establishment. |
| `submitted_by` UUID | Profile/user who submitted or is assigned provenance | Required | Must reference a real profile. Do not fabricate. Decide how historical reports without a submitter are represented before import. |
| `report_date` date | Reporting day/date | Required | Use the actual report period date, not upload date. ISO format: `YYYY-MM-DD`. |
| `total_rooms` integer | Room capacity reported for that record | Required | This is the source-period capacity used in generated summaries. Do not replace it blindly with the current establishment value. |
| `total_occupied_rooms` integer | Legacy aggregate occupied-room value | Default `0` | Populate for compatibility when source provides it. |
| `total_check_ins` integer | Legacy aggregate guest check-in value | Default `0` | Populate for compatibility when source provides it. |
| `total_guest_nights` integer | Legacy aggregate guest-night value | Default `0` | Populate for compatibility when source provides it. |
| `status` text | Workflow state | Default `pending` | Recommended imported historical state is `approved` only when source evidence confirms final approval. Otherwise use the agreed review state. |
| `reviewed_by` UUID | Officer who reviewed/approved | Optional | Only use a real officer profile and verified review evidence. |
| `reviewed_at` timestamp | Review time | Optional | Do not use file extraction time as review time. |
| `notes` text | Review/import notes | Optional | Record source filename, sheet, row, and mapping warnings; do not put secrets here. |
| `created_at` timestamp | Record creation time | Default `now()` | Source submission timestamp if reliable; otherwise leave system-generated or use a documented import timestamp. |
| `guest_check_ins` integer | **Canonical** guest check-ins | Optional in current metadata | Preferred field used by the reporting helper. Populate from the source. |
| `guest_nights` integer | **Canonical** guest nights | Optional in current metadata | Preferred field used by the reporting helper. |
| `rooms_occupied` integer | **Canonical** occupied rooms | Optional in current metadata | Preferred field used by the reporting helper. |
| `foreign_guest_check_ins` integer | Foreign guest check-ins | Default `0` | Must not exceed total guest check-ins. |
| `foreign_guest_nights` integer | Foreign guest nights | Default `0` | Must not exceed total guest nights. |

### Canonical versus legacy accommodation columns

The application writes both sets for compatibility:

- `guest_check_ins` ↔ `total_check_ins`
- `guest_nights` ↔ `total_guest_nights`
- `rooms_occupied` ↔ `total_occupied_rooms`

For a new import, populate **both** pairs with the same confirmed source values. If the source has only one naming convention, map it to both. If the source does not contain a value, use `NULL` only when the import policy allows an unknown; do not silently turn unknown into a meaningful zero.

### Accommodation validation rules

Each record should satisfy:

- all numeric values are non-negative;
- `guest_nights >= guest_check_ins`;
- `rooms_occupied <= total_rooms`;
- `foreign_guest_check_ins <= guest_check_ins`;
- `foreign_guest_nights <= guest_nights`.

If a source spreadsheet violates a rule, preserve it for review rather than altering it to make the constraint pass. The generated page will classify such records as `Needs Review`.

---

## 5. Room-level accommodation details

### `public.room_occupancy_details`

This table stores the room breakdown belonging to an accommodation report. It is not a replacement for the report header.

| Field | Meaning | Import guidance |
|---|---|---|
| `id` UUID | Detail row identifier | Normally generated |
| `accommodation_report_id` UUID | Parent accommodation report | Required relationship for useful detail |
| `room_type` text | Room category/type | Use source wording, normalized only with a mapping table |
| `room_code` text | Room code or label | Optional; preserve as text |
| `number_of_rooms` integer | Number of rooms in this category | Must be non-negative |
| `occupied_rooms` integer | Occupied rooms in this category | Must not exceed `number_of_rooms` |
| `check_ins` integer | Check-ins attributed to this category | Must be non-negative |
| `guest_nights` integer | Guest nights attributed to this category | Must be non-negative |
| `is_rent_mode` boolean | Whether the room category uses rent-mode handling | Default `false`; only set true with source evidence |

Only import room details when the source spreadsheet actually contains a room-level breakdown. Do not invent room types or divide aggregate totals arbitrarily. The sum of room details should be reconciled against the parent report before import.

---

## 6. Visitor source reports

### `public.visitor_reports`

One row represents one visitor group/arrival record for one establishment and date.

| Field | Meaning | Required/default | Import guidance |
|---|---|---|---|
| `id` UUID | Visitor report identifier | Required; normally generated | Keep original source ID externally if available. |
| `establishment_id` UUID | Reporting attraction/establishment | Required | Must be identity-matched. |
| `submitted_by` UUID | Submitting/assigned profile | Required | Must be a real profile or approved historical provenance policy. |
| `report_date` date | Visitor reporting date | Required | ISO `YYYY-MM-DD`; do not confuse with upload date. |
| `total_male` integer | Legacy male visitor count | Default `0` | Populate for compatibility. |
| `total_female` integer | Legacy female visitor count | Default `0` | Populate for compatibility. |
| `total_guests` integer | Legacy total visitors | Default `0` | Must equal male + female when those fields are available. |
| `residence_type` text | Legacy residence label | Optional | Preserve original source wording. |
| `place_of_residence` text | Source municipality/province/country text | Optional | Do not infer residence from establishment name. |
| `municipality_province` text | Legacy combined location field | Optional | Preserve only if present in source. |
| `status` text | Workflow state | Default `pending` | Use `approved` only with evidence of final approval. |
| `reviewed_by` UUID | Reviewing officer | Optional | Real profile only. |
| `reviewed_at` timestamp | Review timestamp | Optional | Source review time only. |
| `notes` text | Review/import notes | Optional | Include source location and unresolved classification notes. |
| `created_at` timestamp | Record creation time | Default `now()` | Do not use report date as creation time. |
| `guest_name` text | Legacy group/guest name | Optional | Sensitive/personal data risk; import only when operationally needed. |
| `guest_group_name` text | Canonical optional group name | Optional | Not included in government aggregate exports. |
| `male_visitors` integer | **Canonical** male count | Optional | Preferred field for generated VAR reports. |
| `female_visitors` integer | **Canonical** female count | Optional | Preferred field for generated VAR reports. |
| `total_visitors` integer | **Canonical** total count | Optional | Must equal male + female. |
| `residence_category` text | Canonical residence bucket | Optional but needed for valid VAR aggregation | Values: `THIS_PROVINCE`, `OTHER_PROVINCE`, `FOREIGN`. |
| `municipality` text | Municipality for local residence | Optional | Use source evidence. |
| `province` text | Province for domestic residence | Optional | Use source evidence. |
| `country` text | Country for foreign residence | Optional | Use source evidence. |

### Canonical versus legacy visitor columns

For each imported row, populate both representations when the source supports them:

- `male_visitors` ↔ `total_male`
- `female_visitors` ↔ `total_female`
- `total_visitors` ↔ `total_guests`

The canonical residence category is required for reliable VAR output:

- Batangas/local source evidence → `THIS_PROVINCE`
- Other Philippine province/source evidence → `OTHER_PROVINCE`
- Foreign country/source evidence → `FOREIGN`

If residence is ambiguous, leave the category unresolved according to the approved import policy and record it for review. Do not classify based solely on the establishment’s location or name.

---

## 7. Workflow status values

The current report workflow recognizes these statuses in the broader database:

- `draft`
- `submitted`
- `pending`
- `under_review`
- `needs_review`
- `validated`
- `approved`
- `rejected`
- `archived`
- `on_hold`
- `incomplete` and `missing` are primarily generated summary states, not normal source-row values.

For generated reports:

- `validated`: all source rows for the selected aggregation are final and valid.
- `needs_review`: source rows exist but validation rules fail.
- `incomplete`: source rows exist but at least one is not final.
- `missing`: no source row exists for the selected establishment and period.

Recommended historical import policy:

- Use `approved` only when the Drive document clearly represents an approved/final report.
- Use `submitted` or another agreed non-final state when the document is merely submitted or unreviewed.
- Use `needs_review` only when a known data-quality problem is being intentionally recorded.
- Never mark rows `validated` merely because they imported successfully.

---

## 8. Ratings and public-listing tables

These tables are not tourism report import targets.

### `public.establishment_ratings`

| Field | Meaning |
|---|---|
| `id` | Rating identifier |
| `establishment_id` | Rated establishment |
| `visitor_token_hash` | Anonymous visitor deduplication hash; sensitive security value |
| `rating` | Rating value |
| `comment` | Public comment |
| `created_at`, `updated_at` | Timestamps |
| `reviewer_name` | Optional public reviewer name |

### `public.establishment_rating_reviews`

Contains rating/review display fields: `establishment_id`, `rating`, `reviewer_name`, `comment`, `created_at`. Treat it as a public review surface/view-like reporting object; do not use it for tourism source reports.

### `public.establishment_rating_summaries`

Aggregated public-rating values:

- `establishment_id`
- `average_rating`
- `rating_count`
- `one_star_count` through `five_star_count`
- `comment_count`

Do not calculate or import these manually during a tourism report import unless the rating subsystem specifically requires it.

---

## 9. Notifications, AI, audit, and OTP tables

### `public.notifications`

- `id`: notification identifier
- `user_id`: recipient user/profile identity
- `title`: short title
- `message`: notification body
- `type`: notification category
- `is_read`: read flag, default `false`
- `created_at`: creation timestamp
- `read_at`: read timestamp
- `action_path`: optional application route

Do not create notifications for every historical row unless explicitly requested; that would pollute user accounts.

### `public.ai_anomalies`

Legacy/simple anomaly records:

- `id`
- `type`
- `severity`
- `description`
- `establishment_id`
- `detected_at`
- `status`
- `recommendation`

### `public.ai_anomalies_cache`

Cached anomaly analysis:

- `id`
- `anomaly_type`
- `severity`
- `description`
- `recommendation`
- `establishment_id`
- `detected_at`
- `status`
- `is_resolved`
- `confidence_score` (0–1 when present)
- `model_name`
- `input_snapshot` JSON

Do not import historical tourism spreadsheets into AI tables. AI cache rows should be generated by the AI workflow from source data.

### `public.ai_recommendations`

- `id`
- `title`
- `description`
- `impact`
- `category`
- `status`
- `created_at`
- `expires_at`
- `establishment_id`
- `recommended_action`
- `confidence_score`
- `model_name`
- `input_snapshot`

Do not use this table for report rows.

### `public.ai_insights_cache`

- `id`
- `insight_type`
- `data` JSON
- `period`
- `generated_at`
- `expires_at`
- `is_active`

This is derived/cache data, not a source import destination.

### `public.audit_logs`

- `id`: audit event identifier
- `actor_id`: profile/user performing the action
- `action`: action name
- `entity_type`: affected entity/table concept
- `entity_id`: affected row when applicable
- `previous_values` JSON
- `new_values` JSON
- `notes`: explanation/provenance
- `created_at`: event timestamp

Audit logs should be appended by the import process if an approved import is executed. Do not delete or rewrite existing audit history to make an import look cleaner.

### `public.email_otps`

- `id`
- `email`
- `purpose`
- `otp_hash`
- `metadata` JSON
- `attempts`
- `expires_at`
- `consumed_at`
- `created_at`

This is security-sensitive authentication data. Never import Google Drive report data here and never expose its values.

---

## 10. Relationships and import order

Primary relationships used by the current system:

- `profiles.id` corresponds to `auth.users.id`.
- `profiles.establishment_id` → `establishments.id`.
- `staff.establishment_id` → `establishments.id`.
- `accommodation_reports.establishment_id` → `establishments.id`.
- `visitor_reports.establishment_id` → `establishments.id`.
- `accommodation_reports.submitted_by` → `profiles.id`.
- `visitor_reports.submitted_by` → `profiles.id`.
- `accommodation_reports.reviewed_by` → `profiles.id` when populated.
- `visitor_reports.reviewed_by` → `profiles.id` when populated.
- `room_occupancy_details.accommodation_report_id` → `accommodation_reports.id`.
- AI anomaly/recommendation `establishment_id` values → `establishments.id` when populated.
- rating table `establishment_id` values → `establishments.id`.

Recommended dependency order:

1. Confirm existing Auth users and profiles; do not recreate them.
2. Confirm or create establishments with approved identity mapping.
3. Confirm reporting modes and identifiers (`ae_id`, `attraction_code`).
4. Import accommodation report headers.
5. Import room-level details linked to the inserted report IDs.
6. Import visitor report rows.
7. Reconcile counts and statuses through read-only queries.
8. Generate/report/export derived outputs.
9. Append audit events for the approved import operation.

Do not import child details before their parent report IDs exist.

---

## 11. Google Drive spreadsheet mapping template

Before import, create a mapping workbook or CSV with at least these columns:

```text
source_file
source_sheet
source_row
source_establishment_name
matched_establishment_id
matched_establishment_name
report_family
report_date
source_status
mapped_status
source_total_rooms
source_check_ins
source_guest_nights
source_occupied_rooms
source_male_visitors
source_female_visitors
source_total_visitors
source_residence_text
mapped_residence_category
submitted_by_profile_id
mapping_confidence
review_notes
import_decision
```

Recommended `import_decision` values:

- `READY`
- `NEEDS_IDENTITY_REVIEW`
- `NEEDS_FIELD_REVIEW`
- `NEEDS_RESIDENCE_REVIEW`
- `DO_NOT_IMPORT`

Do not import rows with unresolved identity, date, report family, or submitter provenance until the ambiguity is resolved.

---

## 12. Reconciliation checks before any write

Perform these read-only checks first:

1. Establishment identity match count: every source name maps to zero or one confirmed establishment.
2. Reporting-mode compatibility:
   - accommodation source → mode `accommodation` or `both`;
   - visitor source → mode `visitor` or `both`.
3. Date validity and period coverage.
4. Duplicate check on active accommodation `(establishment_id, report_date)`.
5. Numeric validation for every accommodation row.
6. Male + female = total visitors for every visitor row.
7. Every visitor row has a confirmed residence category or an explicit review decision.
8. Every `submitted_by` and `reviewed_by` value resolves to a real profile.
9. Parent/child room totals reconcile.
10. Expected source row counts equal inserted row counts.
11. No existing row will be overwritten unless a specific update has been explicitly approved.
12. No existing records will be deleted, archived, or status-changed as an automatic side effect.

The current application has RLS enabled on sensitive tables. A client-side import using an establishment account will be restricted to that establishment. A municipal officer can read/manage report rows under the current policies. A privileged import, if later approved, must still use a reviewed, deterministic payload and read-back verification.

---

## 13. What must be confirmed before importing historical Drive data

These items are not safe to infer:

- Which existing establishment row each spreadsheet name represents.
- Whether a report date is a reporting date, month-end date, or upload date.
- Whether a spreadsheet is accommodation, visitor, or both.
- Whether `approved` means approved by the municipality or merely completed by the establishment.
- Which real profile should be stored in `submitted_by` for historical records.
- Whether blank numeric cells mean zero, not applicable, or unknown.
- Residence category when the source location is incomplete or ambiguous.
- Whether duplicate rows are corrections, multiple source documents, or accidental duplicates.
- Whether closed establishments should retain historical reports while being excluded from current listings.

If any of these are unknown, preserve the source evidence and mark the row for review rather than guessing.

---

## 14. Practical import rule

The safest process is:

1. Extract Google Drive files to local CSV/JSON inside the approved workspace.
2. Normalize dates, numbers, names, and report-family labels without writing to Supabase.
3. Produce a mapping/reconciliation report.
4. Review ambiguous rows.
5. Obtain explicit approval for the exact write scope.
6. Import only approved rows in dependency order.
7. Read back exact inserted IDs and counts.
8. Verify Report Monitoring and Generated Reports for the affected years/months.
9. Record the import source and decisions in audit notes without storing secrets.

Until those steps are approved, all database access should remain read-only.
