-- Make staff-user removal use the same hard-delete path as establishment removal.
-- If the staff profile is linked to an establishment, deleting the user also
-- deletes that establishment, its linked staff profiles, and dependent records.
-- Accounts without an establishment retain the profile-only removal behavior.

create or replace function public.remove_officer_user(
  p_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile public.profiles%rowtype;
  v_establishment_result jsonb;
  v_profiles_removed integer := 0;
  v_auth_users_deleted integer := 0;
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers can remove users';
  end if;

  if p_user_id is null then
    raise exception 'User id is required';
  end if;

  select *
    into v_profile
    from public.profiles
   where id = p_user_id;

  if not found then
    raise exception 'User profile was not found';
  end if;

  if v_profile.role = 'municipal_officer' then
    raise exception 'Municipal officer accounts cannot be removed from this screen';
  end if;

  if v_profile.role <> 'establishment_staff' then
    raise exception 'Only establishment staff users can be removed from this screen';
  end if;

  if v_profile.establishment_id is not null then
    -- This is the same verified, officer-only hard-delete path used by the
    -- Delete Establishment action. It removes all staff linked to the
    -- establishment, dependent reports/caches, and the establishment itself.
    v_establishment_result := public.delete_officer_establishment_with_staff(v_profile.establishment_id);

    return jsonb_build_object(
      'profiles_removed', coalesce((v_establishment_result ->> 'staff_profiles_deleted')::integer, 0),
      'auth_users_deleted', coalesce((v_establishment_result ->> 'auth_users_deleted')::integer, 0),
      'establishment_deleted', coalesce((v_establishment_result ->> 'establishment_deleted')::integer, 0),
      'related_deleted', coalesce(v_establishment_result -> 'related_deleted', '{}'::jsonb)
    );
  end if;

  -- The profile references auth.users(id), so remove the profile first.
  delete from public.profiles
   where id = p_user_id
     and role = 'establishment_staff';
  get diagnostics v_profiles_removed = row_count;

  if v_profiles_removed <> 1 then
    raise exception 'Failed to remove user profile';
  end if;

  if to_regclass('auth.users') is not null then
    delete from auth.users where id = p_user_id;
    get diagnostics v_auth_users_deleted = row_count;
  end if;

  return jsonb_build_object(
    'profiles_removed', v_profiles_removed,
    'auth_users_deleted', v_auth_users_deleted,
    'establishment_deleted', 0,
    'related_deleted', '{}'::jsonb
  );
end;
$$;

grant execute on function public.remove_officer_user(uuid) to authenticated;
