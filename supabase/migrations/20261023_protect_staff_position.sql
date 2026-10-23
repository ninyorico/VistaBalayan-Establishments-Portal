-- Prevent establishment staff from changing the position field directly.
-- Municipal officers retain their existing profile-management behavior.

create or replace function public.prevent_staff_position_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() = old.id
     and old.role = 'establishment_staff'
     and new.position is distinct from old.position then
    raise exception 'Establishment staff cannot change their position';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_staff_position_change on public.profiles;
create trigger prevent_staff_position_change
before update of position on public.profiles
for each row
execute function public.prevent_staff_position_change();

revoke all on function public.prevent_staff_position_change() from public;
