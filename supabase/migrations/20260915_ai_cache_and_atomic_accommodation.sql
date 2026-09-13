-- AI cache scoping and atomic accommodation submission.
-- No existing records are rewritten by this migration.

alter table public.ai_insights_cache
  add column if not exists establishment_id uuid references public.establishments(id) on delete cascade;

create index if not exists idx_ai_insights_cache_establishment_generated
  on public.ai_insights_cache(establishment_id, generated_at desc);

-- Cache writes are server-controlled. The Vercel endpoint uses the service role
-- only after verifying the caller's Supabase session and profile scope.
revoke all on public.ai_insights_cache from anon, authenticated;
grant select on public.ai_insights_cache to authenticated;
revoke insert, update, delete on public.ai_recommendations from anon, authenticated;
revoke insert, update, delete on public.ai_anomalies_cache from anon, authenticated;

drop policy if exists "Authenticated users read AI insights cache" on public.ai_insights_cache;
drop policy if exists "Authenticated users write AI insights cache" on public.ai_insights_cache;
create policy "AI insights cache scoped by role"
  on public.ai_insights_cache for select
  to authenticated
  using (
    public.is_municipal_officer()
    or (
      establishment_id is not null
      and establishment_id = public.current_establishment_id()
    )
  );

drop policy if exists "AI recommendations scoped by role" on public.ai_recommendations;
create policy "AI recommendations scoped by role"
  on public.ai_recommendations for select
  to authenticated
  using (
    public.is_municipal_officer()
    or (
      establishment_id is not null
      and establishment_id = public.current_establishment_id()
    )
  );

drop policy if exists "Authenticated users create AI recommendations" on public.ai_recommendations;
drop policy if exists "AI anomalies scoped by role" on public.ai_anomalies_cache;
create policy "AI anomalies scoped by role"
  on public.ai_anomalies_cache for select
  to authenticated
  using (
    public.is_municipal_officer()
    or (
      establishment_id is not null
      and establishment_id = public.current_establishment_id()
    )
  );

drop policy if exists "Authenticated users create AI anomalies" on public.ai_anomalies_cache;

alter table public.accommodation_reports
  add column if not exists submission_idempotency_key text;

create unique index if not exists uq_accommodation_reports_submission_key
  on public.accommodation_reports(establishment_id, submission_idempotency_key)
  where submission_idempotency_key is not null;

create or replace function public.staff_submit_accommodation_report(
  p_establishment_id uuid,
  p_report_date date,
  p_total_rooms integer,
  p_total_occupied_rooms integer,
  p_total_check_ins integer,
  p_total_guest_nights integer,
  p_rooms_occupied integer,
  p_guest_check_ins integer,
  p_guest_nights integer,
  p_room_details jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_report_id uuid;
  v_existing_id uuid;
begin
  if public.current_profile_role() <> 'establishment_staff'
     or public.current_establishment_id() is distinct from p_establishment_id then
    raise exception 'Only staff may submit reports for their own establishment';
  end if;

  if p_report_date is null
     or p_idempotency_key is null
     or length(trim(p_idempotency_key)) < 16
     or p_total_rooms is null or p_total_rooms <= 0
     or p_total_occupied_rooms is null or p_total_occupied_rooms < 0
     or p_total_check_ins is null or p_total_check_ins < 0
     or p_total_guest_nights is null or p_total_guest_nights < p_total_check_ins
     or p_rooms_occupied is null or p_rooms_occupied < 0
     or p_guest_check_ins is null or p_guest_check_ins < 0
     or p_guest_nights is null or p_guest_nights < p_guest_check_ins
     or jsonb_typeof(p_room_details) <> 'array'
     or jsonb_array_length(p_room_details) = 0 then
    raise exception 'Invalid accommodation report submission';
  end if;

  if p_total_occupied_rooms > p_total_rooms or p_rooms_occupied > p_total_rooms then
    raise exception 'Occupied rooms cannot exceed total rooms';
  end if;

  select id into v_existing_id
  from public.accommodation_reports
  where establishment_id = p_establishment_id
    and submission_idempotency_key = trim(p_idempotency_key)
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  insert into public.accommodation_reports (
    establishment_id,
    submitted_by,
    report_date,
    total_rooms,
    total_occupied_rooms,
    total_check_ins,
    total_guest_nights,
    rooms_occupied,
    guest_check_ins,
    guest_nights,
    submission_idempotency_key,
    status
  ) values (
    p_establishment_id,
    auth.uid(),
    p_report_date,
    p_total_rooms,
    p_total_occupied_rooms,
    p_total_check_ins,
    p_total_guest_nights,
    p_rooms_occupied,
    p_guest_check_ins,
    p_guest_nights,
    trim(p_idempotency_key),
    'submitted'
  ) returning id into v_report_id;

  insert into public.room_occupancy_details (
    accommodation_report_id,
    room_type,
    room_code,
    number_of_rooms,
    occupied_rooms,
    check_ins,
    guest_nights,
    is_rent_mode
  )
  select
    v_report_id,
    details.room_type,
    details.room_code,
    details.number_of_rooms,
    details.occupied_rooms,
    details.check_ins,
    details.guest_nights,
    coalesce(details.is_rent_mode, false)
  from jsonb_to_recordset(p_room_details) as details(
    room_type text,
    room_code text,
    number_of_rooms integer,
    occupied_rooms integer,
    check_ins integer,
    guest_nights integer,
    is_rent_mode boolean
  );

  if not found then
    raise exception 'At least one room detail is required';
  end if;

  return v_report_id;
exception
  when unique_violation then
    select id into v_existing_id
    from public.accommodation_reports
    where establishment_id = p_establishment_id
      and submission_idempotency_key = trim(p_idempotency_key)
    limit 1;
    if v_existing_id is not null then return v_existing_id; end if;
    raise;
end;
$$;

revoke all on function public.staff_submit_accommodation_report(
  uuid, date, integer, integer, integer, integer, integer, integer, integer, jsonb, text
) from public, anon, authenticated;
grant execute on function public.staff_submit_accommodation_report(
  uuid, date, integer, integer, integer, integer, integer, integer, integer, jsonb, text
) to authenticated;

notify pgrst, 'reload schema';
