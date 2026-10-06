-- Notify municipal officers when an establishment submits an official report.
-- Current workflow uses status = 'submitted'; no approval step is required.
-- This migration changes future notification behavior only and does not alter reports.

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

  select coalesce(name, 'Unknown establishment')
    into v_establishment_name
    from public.establishments
   where id = NEW.establishment_id;

  -- The current workflow has no approval state. Notify officers when the
  -- establishment creates or changes a report into the official submitted state.
  if TG_OP = 'INSERT' and coalesce(NEW.status, '') = 'submitted' then
    perform public.notify_municipal_officers(
      'New report submitted',
      v_establishment_name || ' submitted a ' || v_report_label || '.',
      'report',
      '/officer/report-monitoring'
    );
  elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
    if NEW.status = 'submitted' then
      perform public.notify_municipal_officers(
        'New report submitted',
        v_establishment_name || ' submitted a ' || v_report_label || '.',
        'report',
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
    elsif NEW.status = 'rejected' then
      perform public.notify_establishment_staff(
        NEW.establishment_id,
        'Report requires correction',
        'Your ' || v_report_label || ' requires correction. Please review the submission notes.',
        'warning',
        '/staff/submission-history'
      );
    end if;
  end if;

  return NEW;
end;
$$;

-- Ensure the current trigger names point to the corrected function even if
-- earlier migration history is incomplete in the linked project.
drop trigger if exists notify_visitor_report_activity on public.visitor_reports;
create trigger notify_visitor_report_activity
after insert or update of status on public.visitor_reports
for each row execute function public.notify_report_activity();

drop trigger if exists notify_accommodation_report_activity on public.accommodation_reports;
create trigger notify_accommodation_report_activity
after insert or update of status on public.accommodation_reports
for each row execute function public.notify_report_activity();
