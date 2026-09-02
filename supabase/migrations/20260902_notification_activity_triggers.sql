-- Persist notifications for live VistaBalayan activity.
-- Keeps the bell useful when reports need review, establishments are registered,
-- public reviews arrive, and officer decisions are made.

alter table if exists public.notifications
  add column if not exists read_at timestamptz,
  add column if not exists action_path text;

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

create or replace function public.notify_report_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment_name text := 'Unknown establishment';
  v_report_label text := 'report';
begin
  if TG_TABLE_NAME = 'visitor_reports' then
    v_report_label := 'visitor report';
  elsif TG_TABLE_NAME = 'accommodation_reports' then
    v_report_label := 'accommodation report';
  end if;

  select coalesce(name, 'Unknown establishment') into v_establishment_name
  from public.establishments
  where id = NEW.establishment_id;

  if TG_OP = 'INSERT' and coalesce(NEW.status, 'pending') in ('pending', 'under_review') then
    perform public.notify_municipal_officers(
      'Pending review',
      v_establishment_name || ' submitted a ' || v_report_label || ' awaiting review.',
      'warning',
      '/officer/report-monitoring'
    );
  elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
    if NEW.status in ('pending', 'under_review') then
      perform public.notify_municipal_officers(
        'Pending review',
        v_establishment_name || ' has a ' || v_report_label || ' awaiting review.',
        'warning',
        '/officer/report-monitoring'
      );
    elsif NEW.status = 'on_hold' then
      perform public.notify_establishment_staff(
        NEW.establishment_id,
        'Report needs attention',
        'Your ' || v_report_label || ' was placed on hold for verification.',
        'warning',
        '/staff/submission-history'
      );
    elsif NEW.status = 'approved' then
      perform public.notify_establishment_staff(
        NEW.establishment_id,
        'Report approved',
        'Your ' || v_report_label || ' was approved by the tourism office.',
        'success',
        '/staff/submission-history'
      );
    elsif NEW.status = 'rejected' then
      perform public.notify_establishment_staff(
        NEW.establishment_id,
        'Report rejected',
        'Your ' || v_report_label || ' was rejected. Please review the submission notes.',
        'warning',
        '/staff/submission-history'
      );
    end if;
  end if;

  return NEW;
end;
$$;

create or replace function public.notify_establishment_registered()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.notify_municipal_officers(
    case when coalesce(NEW.status, 'active') = 'pending' then 'Establishment needs review' else 'New establishment registered' end,
    coalesce(NEW.name, 'A new establishment') || ' has been added to VistaBalayan.',
    case when coalesce(NEW.status, 'active') = 'pending' then 'warning' else 'info' end,
    '/officer/establishments'
  );
  return NEW;
end;
$$;

create or replace function public.notify_public_review_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment_name text := 'an establishment';
begin
  select coalesce(name, 'an establishment') into v_establishment_name
  from public.establishments
  where id = NEW.establishment_id;

  perform public.notify_municipal_officers(
    'New visitor review',
    'A visitor posted a ' || NEW.rating::text || '-star review for ' || v_establishment_name || '.',
    'info',
    '/officer/establishments'
  );
  return NEW;
end;
$$;

drop trigger if exists notify_visitor_report_activity on public.visitor_reports;
create trigger notify_visitor_report_activity
after insert or update of status on public.visitor_reports
for each row execute function public.notify_report_activity();

drop trigger if exists notify_accommodation_report_activity on public.accommodation_reports;
create trigger notify_accommodation_report_activity
after insert or update of status on public.accommodation_reports
for each row execute function public.notify_report_activity();

drop trigger if exists notify_establishment_registered on public.establishments;
create trigger notify_establishment_registered
after insert on public.establishments
for each row execute function public.notify_establishment_registered();

do $$
begin
  if to_regclass('public.establishment_ratings') is not null then
    execute 'drop trigger if exists notify_public_review_created on public.establishment_ratings';
    execute 'create trigger notify_public_review_created after insert on public.establishment_ratings for each row execute function public.notify_public_review_created()';
  end if;
end $$;
