-- Allow establishment staff to edit the visitor-count fields of their own submitted reports.
-- Identity, ownership, report date, workflow status, and review fields remain protected.

grant update (
  guest_name,
  guest_group_name,
  total_male,
  total_female,
  total_guests,
  male_visitors,
  female_visitors,
  total_visitors,
  residence_type,
  residence_category,
  place_of_residence,
  municipality,
  province,
  country
) on public.visitor_reports to authenticated;

-- Keep the existing scoped policy explicit for the staff edit path.
drop policy if exists "Staff update visitor reports for own establishment" on public.visitor_reports;
create policy "Staff update visitor reports for own establishment"
  on public.visitor_reports for update
  to authenticated
  using (
    public.is_municipal_officer()
    or establishment_id = public.current_establishment_id()
  )
  with check (
    public.is_municipal_officer()
    or establishment_id = public.current_establishment_id()
  );

create or replace function public.guard_staff_visitor_report_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if public.current_profile_role() = 'establishment_staff' then
    if NEW.establishment_id is distinct from OLD.establishment_id
       or NEW.submitted_by is distinct from OLD.submitted_by
       or NEW.report_date is distinct from OLD.report_date
       or NEW.status is distinct from OLD.status
       or NEW.reviewed_by is distinct from OLD.reviewed_by
       or NEW.reviewed_at is distinct from OLD.reviewed_at
       or NEW.notes is distinct from OLD.notes then
      raise exception 'Staff can edit visitor counts only';
    end if;
  end if;
  return NEW;
end;
$$;

drop trigger if exists guard_staff_visitor_report_update on public.visitor_reports;
create trigger guard_staff_visitor_report_update
before update on public.visitor_reports
for each row execute function public.guard_staff_visitor_report_update();

notify pgrst, 'reload schema';
