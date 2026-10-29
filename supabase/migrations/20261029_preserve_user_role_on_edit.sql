-- Preserve profile roles during officer user edits.
-- The p_role argument remains for RPC compatibility with existing clients,
-- but the stored role is always taken from the target profile.

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
declare
  existing_role text;
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers can update user profiles';
  end if;

  if p_user_id is null or nullif(trim(p_full_name), '') is null then
    raise exception 'User id and full name are required';
  end if;

  if p_status not in ('active', 'inactive', 'deleted') then
    raise exception 'Invalid profile status';
  end if;

  select role
    into existing_role
    from public.profiles
   where id = p_user_id
   for update;

  if not found then
    raise exception 'User profile was not found';
  end if;

  if existing_role not in ('municipal_officer', 'establishment_staff') then
    raise exception 'Invalid existing profile role';
  end if;

  if existing_role = 'establishment_staff' and p_establishment_id is null then
    raise exception 'Establishment staff must be assigned to an establishment';
  end if;

  if existing_role = 'establishment_staff' and not exists (
    select 1
      from public.establishments
     where id = p_establishment_id
       and coalesce(status, 'active') <> 'deleted'
  ) then
    raise exception 'Assigned establishment was not found or is deleted';
  end if;

  update public.profiles
     set full_name = trim(p_full_name),
         role = existing_role,
         establishment_id = case when existing_role = 'municipal_officer' then null else p_establishment_id end,
         status = p_status,
         updated_at = now()
   where id = p_user_id;
end;
$$;

revoke all on function public.officer_update_user_profile(uuid, text, text, uuid, text) from public;
grant execute on function public.officer_update_user_profile(uuid, text, text, uuid, text) to authenticated;
