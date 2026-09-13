create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text
  from public.profiles
  where id = auth.uid()
    and coalesce(status, 'active') = 'active'
$$;

create or replace function public.current_establishment_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select establishment_id
  from public.profiles
  where id = auth.uid()
    and coalesce(status, 'active') = 'active'
$$;
revoke update on public.profiles from authenticated;
grant update (full_name, contact_number, position, updated_at)
  on public.profiles to authenticated;

drop policy if exists "Users can update own basic profile" on public.profiles;
create policy "Users can update own safe profile fields"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Officers use this security-definer RPC for role, status, and assignment changes.
create or replace function public.officer_update_user_profile(
  p_user_id uuid,
  p_full_name text,
  p_role text,
  p_establishment_id uuid,
  p_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers can update user profiles';
  end if;

  if p_user_id is null or nullif(trim(p_full_name), '') is null then
    raise exception 'User id and full name are required';
  end if;

  if p_role is null or p_status is null then
    raise exception 'Role and status are required';
  end if;

  if p_role not in ('municipal_officer', 'establishment_staff') then
    raise exception 'Invalid profile role';
  end if;

  if p_status not in ('active', 'inactive', 'deleted') then
    raise exception 'Invalid profile status';
  end if;

  if p_role = 'establishment_staff' and p_establishment_id is null then
    raise exception 'Establishment staff must be assigned to an establishment';
  end if;

  if p_role = 'establishment_staff' and not exists (
    select 1
      from public.establishments
     where id = p_establishment_id
       and coalesce(status, 'active') <> 'deleted'
  ) then
    raise exception 'Assigned establishment was not found or is deleted';
  end if;

  if not exists (select 1 from public.profiles where id = p_user_id) then
    raise exception 'User profile was not found';
  end if;

  update public.profiles
     set full_name = trim(p_full_name),
         role = p_role,
         establishment_id = case when p_role = 'municipal_officer' then null else p_establishment_id end,
         status = p_status,
         updated_at = now()
   where id = p_user_id;
end;
$$;

revoke all on function public.officer_update_user_profile(uuid, text, text, uuid, text) from public;
grant execute on function public.officer_update_user_profile(uuid, text, text, uuid, text) to authenticated;

create or replace function public.officer_sync_linked_staff_status(
  p_establishment_id uuid,
  p_status text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated integer;
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers can synchronize staff status';
  end if;

  if p_establishment_id is null or p_status not in ('active', 'inactive') then
    raise exception 'Establishment and valid status are required';
  end if;

  update public.profiles
     set status = p_status,
         updated_at = now()
   where establishment_id = p_establishment_id
     and role = 'establishment_staff';

  get diagnostics v_updated = row_count;
  return v_updated;
end;
$$;

revoke all on function public.officer_sync_linked_staff_status(uuid, text) from public;
grant execute on function public.officer_sync_linked_staff_status(uuid, text) to authenticated;

create or replace function public.staff_update_room_configuration(
  p_establishment_id uuid,
  p_amenities text,
  p_total_rooms integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() <> 'establishment_staff'
     or public.current_establishment_id() is distinct from p_establishment_id then
    raise exception 'Only the assigned establishment staff can update room configuration';
  end if;

  if p_total_rooms is null or p_total_rooms < 0 or nullif(trim(p_amenities), '') is null then
    raise exception 'Valid room configuration is required';
  end if;

  perform set_config('vistabalayan.staff_room_update', 'on', true);
  update public.establishments
     set amenities = p_amenities,
         total_rooms = p_total_rooms,
         updated_at = now()
   where id = p_establishment_id;
end;
$$;

revoke all on function public.staff_update_room_configuration(uuid, text, integer) from public;
grant execute on function public.staff_update_room_configuration(uuid, text, integer) to authenticated;

create or replace function public.guard_staff_establishment_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() = 'establishment_staff' then
    if coalesce(current_setting('vistabalayan.staff_room_update', true), '') <> 'on'
       and (NEW.status is distinct from OLD.status
       or NEW.reporting_mode is distinct from OLD.reporting_mode
       or NEW.total_rooms is distinct from OLD.total_rooms
       or NEW.dot_classification is distinct from OLD.dot_classification
       or NEW.ae_id is distinct from OLD.ae_id
       or NEW.attraction_code is distinct from OLD.attraction_code
       or NEW.type is distinct from OLD.type
       or NEW.featured is distinct from OLD.featured) then
      raise exception 'Staff cannot change establishment administrative fields';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_staff_establishment_update on public.establishments;
create trigger guard_staff_establishment_update
before update on public.establishments
for each row execute function public.guard_staff_establishment_update();

create or replace function public.guard_staff_report_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() = 'establishment_staff' then
    if NEW.submitted_by is distinct from auth.uid()
       or NEW.status is distinct from 'submitted'
       or NEW.reviewed_by is not null
       or NEW.reviewed_at is not null
       or NEW.notes is not null then
      raise exception 'Staff reports must be submitted for officer review';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_staff_visitor_report_insert on public.visitor_reports;
create trigger guard_staff_visitor_report_insert
before insert on public.visitor_reports
for each row execute function public.guard_staff_report_insert();

drop trigger if exists guard_staff_accommodation_report_insert on public.accommodation_reports;
create trigger guard_staff_accommodation_report_insert
before insert on public.accommodation_reports
for each row execute function public.guard_staff_report_insert();

-- Staff do not update submitted reports directly. Officers retain their review path.
drop policy if exists "Staff update own pending visitor reports" on public.visitor_reports;
drop policy if exists "Staff update own accommodation reports" on public.accommodation_reports;

revoke update on public.visitor_reports from authenticated;
grant update (status, reviewed_by, reviewed_at, notes)
  on public.visitor_reports to authenticated;

revoke update on public.accommodation_reports from authenticated;
grant update (status, reviewed_by, reviewed_at, notes)
  on public.accommodation_reports to authenticated;

-- Explicitly recreate officer-only review policies after removing staff updates.
drop policy if exists "Officers review visitor reports" on public.visitor_reports;
create policy "Officers review visitor reports"
  on public.visitor_reports for update
  to authenticated
  using (public.is_municipal_officer())
  with check (public.is_municipal_officer());

drop policy if exists "Officers review accommodation reports" on public.accommodation_reports;
create policy "Officers review accommodation reports"
  on public.accommodation_reports for update
  to authenticated
  using (public.is_municipal_officer())
  with check (public.is_municipal_officer());

notify pgrst, 'reload schema';
