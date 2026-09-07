-- Deletes an establishment and its establishment staff profiles in one verified
-- security-definer operation. The regular client-side delete could report
-- success even when RLS/dependent rows prevented the establishment from
-- disappearing from the officer list.

create or replace function public.delete_officer_establishment_with_staff(
  p_establishment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_user_ids uuid[] := '{}';
  v_establishment_deleted integer := 0;
  v_staff_profiles_deleted integer := 0;
  v_auth_users_deleted integer := 0;
  v_related_deleted jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_optional_table text;
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers can delete establishments';
  end if;

  if p_establishment_id is null then
    raise exception 'Establishment id is required';
  end if;

  if not exists (select 1 from public.establishments where id = p_establishment_id) then
    raise exception 'Establishment was not found or is already deleted';
  end if;

  select coalesce(array_agg(id), '{}')
    into v_staff_user_ids
    from public.profiles
   where establishment_id = p_establishment_id
     and role = 'establishment_staff';

  -- Delete dependent data first so FK constraints cannot leave the establishment
  -- row behind while the UI reports a successful delete.
  if to_regclass('public.room_occupancy_details') is not null
     and to_regclass('public.accommodation_reports') is not null then
    delete from public.room_occupancy_details
     where accommodation_report_id in (
       select id from public.accommodation_reports where establishment_id = p_establishment_id
     );
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('room_occupancy_details', v_count);
  end if;

  -- Public ratings and AI caches can differ between deployments. Only touch
  -- actual tables that expose establishment_id; views or older schemas are
  -- skipped safely.
  for v_optional_table in
    select unnest(array[
      'establishment_ratings',
      'ai_recommendations',
      'ai_anomalies_cache',
      'ai_insights_cache'
    ])
  loop
    if exists (
      select 1
      from information_schema.tables t
      join information_schema.columns c
        on c.table_schema = t.table_schema
       and c.table_name = t.table_name
      where t.table_schema = 'public'
        and t.table_name = v_optional_table
        and t.table_type = 'BASE TABLE'
        and c.column_name = 'establishment_id'
    ) then
      execute format('delete from public.%I where establishment_id = $1', v_optional_table)
        using p_establishment_id;
      get diagnostics v_count = row_count;
      v_related_deleted := v_related_deleted || jsonb_build_object(v_optional_table, v_count);
    end if;
  end loop;

  if to_regclass('public.visitor_reports') is not null then
    delete from public.visitor_reports where establishment_id = p_establishment_id;
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('visitor_reports', v_count);
  end if;

  if to_regclass('public.accommodation_reports') is not null then
    delete from public.accommodation_reports where establishment_id = p_establishment_id;
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('accommodation_reports', v_count);
  end if;

  delete from public.profiles
   where establishment_id = p_establishment_id
     and role = 'establishment_staff';
  get diagnostics v_staff_profiles_deleted = row_count;

  delete from public.establishments where id = p_establishment_id;
  get diagnostics v_establishment_deleted = row_count;

  if v_establishment_deleted <> 1 then
    raise exception 'Failed to delete establishment';
  end if;

  if array_length(v_staff_user_ids, 1) is not null and to_regclass('auth.users') is not null then
    delete from auth.users where id = any(v_staff_user_ids);
    get diagnostics v_auth_users_deleted = row_count;
  end if;

  return jsonb_build_object(
    'establishment_deleted', v_establishment_deleted,
    'staff_profiles_deleted', v_staff_profiles_deleted,
    'auth_users_deleted', v_auth_users_deleted,
    'related_deleted', v_related_deleted
  );
end;
$$;

grant execute on function public.delete_officer_establishment_with_staff(uuid) to authenticated;
