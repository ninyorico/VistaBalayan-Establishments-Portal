-- DOT establishment classification (safe, additive migration)
--
-- This migration deliberately preserves establishments.type. The existing type
-- contains business labels and historical values; dot_classification is the
-- controlled classification used for new records and future reporting.
--
-- Apply this migration through the linked Supabase project before using
-- dot_classification as a required application field.

alter table public.establishments
  add column if not exists dot_classification text;

comment on column public.establishments.dot_classification is
  'Philippine Department of Tourism accommodation classification. Existing type is preserved separately.';

-- Backfill only mappings that are unambiguous under the DOT accommodation
-- classifications. Existing non-null classifications are never overwritten.
update public.establishments
set dot_classification = case
  when lower(trim(type)) = 'hotel' then 'Hotel'
  when lower(trim(type)) = 'resort' then 'Resort'
  when lower(trim(type)) = 'apartment hotel' then 'Apartment Hotel'
  when lower(trim(type)) = 'homestay' then 'Homestay'
  when lower(trim(type)) in ('lodge', 'inn', 'tourist inn', 'motel', 'pension house', 'bed and breakfast', 'bed & breakfast', 'hostel', 'guest house')
    then 'Mabuhay Accommodation'
  else null
end
where dot_classification is null;

-- NOT VALID allows historical rows to remain unresolved while enforcing the
-- allowed values for every new or updated row. Validate later after review.
alter table public.establishments
drop constraint if exists establishments_dot_classification_check;

alter table public.establishments
  add constraint establishments_dot_classification_check
  check (dot_classification is null or dot_classification in (
    'Hotel',
    'Resort',
    'Apartment Hotel',
    'Mabuhay Accommodation',
    'Homestay'
  )) not valid;

create index if not exists establishments_dot_classification_idx
  on public.establishments (dot_classification);

-- Review queue for records that need a human classification decision. This is
-- a view only; it does not modify data.
create or replace view public.establishments_missing_dot_classification as
select id, name, type, reporting_mode, status
from public.establishments
where dot_classification is null;

comment on view public.establishments_missing_dot_classification is
  'Establishments requiring manual DOT classification review; no source data is changed by this view.';
