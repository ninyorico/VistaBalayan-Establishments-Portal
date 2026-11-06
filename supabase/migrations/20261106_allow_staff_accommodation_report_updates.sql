-- Allow an accommodation establishment to revise its submitted report for the same date.
-- The date is the report's business key for one establishment; replacement is atomic.

create or replace function public.staff_submit_accommodation_report(
  p_establishment_id uuid,
  p_report_date date,
  p_total_rooms integer,
  p_total_occupied_rooms integer,
  p_total_check_ins integer,
  p_short_stay_check_ins integer,
  p_room_usage_count integer,
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
  v_submission_key text := nullif(trim(p_idempotency_key), '');
begin
  if public.current_profile_role() <> 'establishment_staff'
     or public.current_establishment_id() is distinct from p_establishment_id then
    raise exception 'Only staff may submit reports for their own establishment';
  end if;

  if p_report_date is null
     or v_submission_key is null
     or length(v_submission_key) < 16
     or p_total_rooms is null or p_total_rooms <= 0
     or p_total_occupied_rooms is null or p_total_occupied_rooms < 0
     or p_total_check_ins is null or p_total_check_ins < 0
     or p_short_stay_check_ins is null or p_short_stay_check_ins < 0
     or p_room_usage_count is null or p_room_usage_count < 0
     or p_room_usage_count <> p_total_check_ins
     or p_short_stay_check_ins > p_room_usage_count
     or p_total_guest_nights is null or p_total_guest_nights < 0
     or p_rooms_occupied is null or p_rooms_occupied < 0
     or p_guest_check_ins is null or p_guest_check_ins < 0
     or p_guest_nights is null or p_guest_nights < 0
     or jsonb_typeof(p_room_details) <> 'array'
     or jsonb_array_length(p_room_details) = 0 then
    raise exception 'Invalid accommodation report submission';
  end if;

  if p_total_occupied_rooms > p_total_rooms or p_rooms_occupied > p_total_rooms then
    raise exception 'Occupied rooms cannot exceed total rooms';
  end if;

  -- Retry-safe protection for the same request.
  select id into v_existing_id
  from public.accommodation_reports
  where establishment_id = p_establishment_id
    and submission_idempotency_key = v_submission_key
  limit 1;

  if v_existing_id is not null then
    return v_existing_id;
  end if;

  -- One submitted accommodation report per establishment and report date.
  select id into v_existing_id
  from public.accommodation_reports
  where establishment_id = p_establishment_id
    and report_date = p_report_date
    and status = 'submitted'
  order by created_at desc
  limit 1
  for update;

  if v_existing_id is null then
    insert into public.accommodation_reports (
      establishment_id, submitted_by, report_date,
      total_rooms, total_occupied_rooms, total_check_ins,
      short_stay_check_ins, room_usage_count, total_guest_nights,
      rooms_occupied, guest_check_ins, guest_nights,
      submission_idempotency_key, status
    ) values (
      p_establishment_id, auth.uid(), p_report_date,
      p_total_rooms, p_total_occupied_rooms, p_total_check_ins,
      p_short_stay_check_ins, p_room_usage_count, p_total_guest_nights,
      p_rooms_occupied, p_guest_check_ins, p_guest_nights,
      v_submission_key, 'submitted'
    ) returning id into v_report_id;
  else
    v_report_id := v_existing_id;
    update public.accommodation_reports
    set submitted_by = auth.uid(),
        total_rooms = p_total_rooms,
        total_occupied_rooms = p_total_occupied_rooms,
        total_check_ins = p_total_check_ins,
        short_stay_check_ins = p_short_stay_check_ins,
        room_usage_count = p_room_usage_count,
        total_guest_nights = p_total_guest_nights,
        rooms_occupied = p_rooms_occupied,
        guest_check_ins = p_guest_check_ins,
        guest_nights = p_guest_nights,
        submission_idempotency_key = v_submission_key
    where id = v_report_id;

    delete from public.room_occupancy_details
    where accommodation_report_id = v_report_id;
  end if;

  insert into public.room_occupancy_details (
    accommodation_report_id, room_type, room_code, number_of_rooms,
    occupied_rooms, check_ins, short_stay_check_ins, room_usage_count,
    guest_nights, is_rent_mode
  )
  select
    v_report_id, details.room_type, details.room_code, details.number_of_rooms,
    details.occupied_rooms, details.check_ins, details.short_stay_check_ins,
    details.room_usage_count, details.guest_nights,
    coalesce(details.is_rent_mode, false)
  from jsonb_to_recordset(p_room_details) as details(
    room_type text,
    room_code text,
    number_of_rooms integer,
    occupied_rooms integer,
    check_ins integer,
    short_stay_check_ins integer,
    room_usage_count integer,
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
      and submission_idempotency_key = v_submission_key
    limit 1;
    if v_existing_id is not null then return v_existing_id; end if;
    raise;
end;
$$;

revoke all on function public.staff_submit_accommodation_report(
  uuid, date, integer, integer, integer, integer, integer, integer, integer, integer, integer, jsonb, text
) from public, anon, authenticated;
grant execute on function public.staff_submit_accommodation_report(
  uuid, date, integer, integer, integer, integer, integer, integer, integer, integer, integer, jsonb, text
) to authenticated;

notify pgrst, 'reload schema';
