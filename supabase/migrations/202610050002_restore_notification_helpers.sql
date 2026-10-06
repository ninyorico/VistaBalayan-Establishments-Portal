-- Restore the notification helper functions required by the submitted-report trigger.
-- This fixes report submission failures caused by a missing deployed helper.
-- No existing report or account data is modified.

create or replace function public.notify_municipal_officers(
  p_title text,
  p_message text,
  p_type text default 'info',
  p_action_path text default '/officer/report-monitoring'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  insert into public.notifications (id, user_id, title, message, type, is_read, action_path, created_at)
  select gen_random_uuid(), profiles.id, p_title, p_message, p_type, false, p_action_path, now()
    from public.profiles
   where profiles.role = 'municipal_officer'
     and coalesce(profiles.status, 'active') <> 'inactive';
end;
$$;

create or replace function public.notify_establishment_staff(
  p_establishment_id uuid,
  p_title text,
  p_message text,
  p_type text default 'info',
  p_action_path text default '/staff/submission-history'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if to_regclass('public.notifications') is null then
    return;
  end if;

  insert into public.notifications (id, user_id, title, message, type, is_read, action_path, created_at)
  select gen_random_uuid(), profiles.id, p_title, p_message, p_type, false, p_action_path, now()
    from public.profiles
   where profiles.role = 'establishment_staff'
     and profiles.establishment_id = p_establishment_id
     and coalesce(profiles.status, 'active') <> 'inactive';
end;
$$;
