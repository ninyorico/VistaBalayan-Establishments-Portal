-- Officer-controlled permit verification.
-- A non-empty permit number is the authoritative "has permit" signal.
alter table public.establishments
  add column if not exists business_permit_number text;

comment on column public.establishments.business_permit_number is
  'Business permit number entered and maintained only by municipal tourism officers.';

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
       or NEW.featured is distinct from OLD.featured
       or NEW.business_permit_number is distinct from OLD.business_permit_number) then
      raise exception 'Staff cannot change establishment administrative fields';
    end if;
  end if;
  return NEW;
end;
$$;

notify pgrst, 'reload schema';
