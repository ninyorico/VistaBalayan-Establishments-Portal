-- Fixes the establishment delete RPC when public rating views exist.
-- establishment_rating_reviews and establishment_rating_summaries are views;
-- the writable source is establishment_ratings.

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

  if to_regclass('public.room_occupancy_details') is not null
     and to_regclass('public.accommodation_reports') is not null then
    delete from public.room_occupancy_details
     where accommodation_report_id in (
       select id from public.accommodation_reports where establishment_id = p_establishment_id
     );
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('room_occupancy_details', v_count);
  end if;

  -- These public rating objects are views, so delete their source rows.
  if to_regclass('public.establishment_ratings') is not null then
    delete from public.establishment_ratings where establishment_id = p_establishment_id;
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('establishment_ratings', v_count);
  end if;

  if to_regclass('public.ai_recommendations') is not null then
    delete from public.ai_recommendations where establishment_id = p_establishment_id;
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('ai_recommendations', v_count);
  end if;

  if to_regclass('public.ai_anomalies_cache') is not null then
    delete from public.ai_anomalies_cache where establishment_id = p_establishment_id;
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('ai_anomalies_cache', v_count);
  end if;

  if to_regclass('public.ai_insights_cache') is not null then
    delete from public.ai_insights_cache where establishment_id = p_establishment_id;
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('ai_insights_cache', v_count);
  end if;

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
