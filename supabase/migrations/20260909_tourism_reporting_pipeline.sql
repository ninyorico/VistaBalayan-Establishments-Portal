-- VistaBalayan tourism reporting pipeline.
-- Source tables remain the system of record; government reports are generated views/exports.

alter table public.establishments
  add column if not exists reporting_mode text,
  add column if not exists ae_id text,
  add column if not exists attraction_code text;

update public.establishments
set reporting_mode = case when coalesce(total_rooms, 0) > 0 then 'accommodation' else 'visitor' end
where reporting_mode is null;

alter table public.establishments
  alter column reporting_mode set default 'visitor',
  alter column reporting_mode set not null;

alter table public.establishments
  drop constraint if exists establishments_reporting_mode_check;
alter table public.establishments
  add constraint establishments_reporting_mode_check
  check (reporting_mode in ('accommodation', 'visitor', 'both'));

-- Preserve older duplicate submissions as archived history before enforcing the
-- one-active-accommodation-record-per-establishment/day invariant.
with ranked as (
  select id,
         row_number() over (partition by establishment_id, report_date order by created_at desc nulls last, id desc) as row_number
  from public.accommodation_reports
  where status not in ('rejected', 'archived')
)
update public.accommodation_reports as reports
set status = 'archived'
from ranked
where reports.id = ranked.id and ranked.row_number > 1;

alter table public.accommodation_reports
  add column if not exists guest_check_ins integer,
  add column if not exists guest_nights integer,
  add column if not exists rooms_occupied integer,
  add column if not exists foreign_guest_check_ins integer not null default 0,
  add column if not exists foreign_guest_nights integer not null default 0;

update public.accommodation_reports
set guest_check_ins = coalesce(guest_check_ins, total_check_ins, 0),
    guest_nights = coalesce(guest_nights, total_guest_nights, 0),
    rooms_occupied = coalesce(rooms_occupied, total_occupied_rooms, 0)
where guest_check_ins is null or guest_nights is null or rooms_occupied is null;

alter table public.visitor_reports
  add column if not exists guest_group_name text,
  add column if not exists male_visitors integer,
  add column if not exists female_visitors integer,
  add column if not exists total_visitors integer,
  add column if not exists residence_category text,
  add column if not exists municipality text,
  add column if not exists province text,
  add column if not exists country text;

update public.visitor_reports
set guest_group_name = coalesce(guest_group_name, guest_name),
    male_visitors = coalesce(male_visitors, total_male, 0),
    female_visitors = coalesce(female_visitors, total_female, 0),
    total_visitors = coalesce(total_visitors, total_guests, coalesce(total_male, 0) + coalesce(total_female, 0)),
    residence_category = coalesce(
      residence_category,
      case
        when lower(coalesce(residence_type, '')) like '%foreign%' then 'FOREIGN'
        when lower(coalesce(residence_type, '')) like '%outside%' or lower(coalesce(residence_type, '')) like '%other%' then 'OTHER_PROVINCE'
        when lower(coalesce(residence_type, '')) like '%batangas%' or lower(coalesce(residence_type, '')) like '%within%' then 'THIS_PROVINCE'
        else null
      end
    ),
    municipality = coalesce(municipality, case when lower(coalesce(residence_type, '')) like '%batangas%' then place_of_residence end),
    province = coalesce(province, case when lower(coalesce(residence_type, '')) not like '%foreign%' then 'Batangas' end),
    country = coalesce(country, case when lower(coalesce(residence_type, '')) like '%foreign%' then place_of_residence end)
where male_visitors is null or female_visitors is null or total_visitors is null or residence_category is null;

alter table public.accommodation_reports
  drop constraint if exists accommodation_reports_nonnegative_check;
alter table public.accommodation_reports
  add constraint accommodation_reports_nonnegative_check check (
    coalesce(total_rooms, 0) >= 0 and coalesce(guest_check_ins, total_check_ins, 0) >= 0 and
    coalesce(guest_nights, total_guest_nights, 0) >= 0 and coalesce(rooms_occupied, total_occupied_rooms, 0) >= 0 and
    coalesce(foreign_guest_check_ins, 0) >= 0 and coalesce(foreign_guest_nights, 0) >= 0 and
    coalesce(guest_nights, total_guest_nights, 0) >= coalesce(guest_check_ins, total_check_ins, 0) and
    coalesce(rooms_occupied, total_occupied_rooms, 0) <= coalesce(total_rooms, 0) and
    coalesce(foreign_guest_check_ins, 0) <= coalesce(guest_check_ins, total_check_ins, 0) and
    coalesce(foreign_guest_nights, 0) <= coalesce(guest_nights, total_guest_nights, 0)
  ) not valid;

alter table public.visitor_reports
  drop constraint if exists visitor_reports_counts_check;
alter table public.visitor_reports
  add constraint visitor_reports_counts_check check (
    coalesce(male_visitors, total_male, 0) >= 0 and coalesce(female_visitors, total_female, 0) >= 0 and
    coalesce(total_visitors, total_guests, 0) = coalesce(male_visitors, total_male, 0) + coalesce(female_visitors, total_female, 0)
  ) not valid;

alter table public.visitor_reports
  drop constraint if exists visitor_reports_residence_category_check;
alter table public.visitor_reports
  add constraint visitor_reports_residence_category_check check (residence_category is null or residence_category in ('THIS_PROVINCE', 'OTHER_PROVINCE', 'FOREIGN'));

create index if not exists idx_establishments_reporting_mode on public.establishments(reporting_mode);
create index if not exists idx_accommodation_reports_period_status on public.accommodation_reports(report_date, status, establishment_id);
create index if not exists idx_visitor_reports_period_status on public.visitor_reports(report_date, status, establishment_id);

-- Prevent duplicate active accommodation daily source records while preserving rejected/archived history.
create unique index if not exists uq_accommodation_daily_active
  on public.accommodation_reports(establishment_id, report_date)
  where status not in ('rejected', 'archived');

comment on column public.establishments.reporting_mode is 'Reporting pipeline: accommodation, visitor, or both; independent of business type.';
comment on column public.establishments.ae_id is 'Accommodation establishment identifier used in DAE exports.';
comment on column public.establishments.attraction_code is 'Attraction identifier used in VAR exports.';
comment on column public.visitor_reports.guest_group_name is 'Optional source detail; never included in government aggregate exports.';

-- Enforce the two-form architecture and audit provenance at the database boundary.
drop policy if exists "Staff create visitor reports for own establishment" on public.visitor_reports;
create policy "Staff create visitor reports for own establishment"
  on public.visitor_reports for insert to authenticated
  with check (
    public.is_municipal_officer()
    or (
      establishment_id = public.current_establishment_id()
      and submitted_by = auth.uid()
      and exists (
        select 1 from public.establishments e
        where e.id = establishment_id and e.reporting_mode in ('visitor', 'both')
      )
    )
  );

drop policy if exists "Staff create accommodation reports for own establishment" on public.accommodation_reports;
create policy "Staff create accommodation reports for own establishment"
  on public.accommodation_reports for insert to authenticated
  with check (
    public.is_municipal_officer()
    or (
      establishment_id = public.current_establishment_id()
      and submitted_by = auth.uid()
      and exists (
        select 1 from public.establishments e
        where e.id = establishment_id and e.reporting_mode in ('accommodation', 'both')
      )
    )
  );
