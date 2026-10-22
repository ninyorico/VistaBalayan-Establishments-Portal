-- Keep establishment and establishment-staff activation state synchronized.
-- Inactive staff or inactive establishments must not retain staff access through
-- an existing session or direct Supabase/API requests.

create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select p.role::text
  from public.profiles p
  left join public.establishments e on e.id = p.establishment_id
  where p.id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
    and (
      p.role = 'municipal_officer'
      or (p.role = 'establishment_staff' and coalesce(e.status, 'active') = 'active')
    )
$$;

create or replace function public.current_establishment_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.establishment_id
  from public.profiles p
  join public.establishments e on e.id = p.establishment_id
  where p.id = auth.uid()
    and p.role = 'establishment_staff'
    and coalesce(p.status, 'active') = 'active'
    and coalesce(e.status, 'active') = 'active'
$$;

create or replace function public.sync_staff_establishment_status()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_municipal_officer() and auth.uid() is not null then
    raise exception 'Only municipal officers can synchronize staff and establishment status';
  end if;

  if tg_table_name = 'establishments' then
    if new.status is distinct from old.status and new.status in ('active', 'inactive') then
      update public.profiles
         set status = new.status,
             updated_at = now()
       where establishment_id = new.id
         and role = 'establishment_staff'
         and status is distinct from new.status;
    end if;
  elsif tg_table_name = 'profiles' then
    if new.role = 'establishment_staff'
       and new.establishment_id is not null
       and new.status in ('active', 'inactive') then
      if tg_op = 'INSERT' then
        update public.establishments
           set status = new.status,
               updated_at = now()
         where id = new.establishment_id
           and coalesce(status, 'active') is distinct from new.status;

        update public.profiles
           set status = new.status,
               updated_at = now()
         where establishment_id = new.establishment_id
           and role = 'establishment_staff'
           and status is distinct from new.status;
      elsif new.status is distinct from old.status
         or new.establishment_id is distinct from old.establishment_id
         or new.role is distinct from old.role then
        update public.establishments
           set status = new.status,
               updated_at = now()
         where id = new.establishment_id
           and coalesce(status, 'active') is distinct from new.status;

        update public.profiles
           set status = new.status,
               updated_at = now()
         where establishment_id = new.establishment_id
           and role = 'establishment_staff'
           and status is distinct from new.status;
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_staff_establishment_status() from public;

drop trigger if exists sync_establishment_status_to_staff on public.establishments;
create trigger sync_establishment_status_to_staff
after update of status on public.establishments
for each row execute function public.sync_staff_establishment_status();

drop trigger if exists sync_staff_status_to_establishment on public.profiles;
create trigger sync_staff_status_to_establishment
after insert or update on public.profiles
for each row execute function public.sync_staff_establishment_status();

-- Inactive staff must not read or write establishment-scoped AI data. The
-- current_establishment_id() helper returns NULL for inactive staff or inactive
-- establishments, so these policies enforce the same rule at the database edge.
do $$
begin
  if to_regclass('public.ai_recommendations') is not null then
    drop policy if exists "AI recommendations scoped by role" on public.ai_recommendations;
    create policy "AI recommendations scoped by role"
      on public.ai_recommendations for select
      to authenticated
      using (public.is_municipal_officer() or establishment_id = public.current_establishment_id());

    drop policy if exists "Authenticated users create AI recommendations" on public.ai_recommendations;
    create policy "Authenticated users create AI recommendations"
      on public.ai_recommendations for insert
      to authenticated
      with check (public.is_municipal_officer() or establishment_id = public.current_establishment_id());
  end if;

  if to_regclass('public.ai_anomalies_cache') is not null then
    drop policy if exists "AI anomalies scoped by role" on public.ai_anomalies_cache;
    create policy "AI anomalies scoped by role"
      on public.ai_anomalies_cache for select
      to authenticated
      using (public.is_municipal_officer() or establishment_id = public.current_establishment_id());

    drop policy if exists "Authenticated users create AI anomalies" on public.ai_anomalies_cache;
    create policy "Authenticated users create AI anomalies"
      on public.ai_anomalies_cache for insert
      to authenticated
      with check (public.is_municipal_officer() or establishment_id = public.current_establishment_id());
  end if;

  if to_regclass('public.ai_insights_cache') is not null then
    drop policy if exists "Authenticated users read AI insights cache" on public.ai_insights_cache;
    create policy "Authenticated users read AI insights cache"
      on public.ai_insights_cache for select
      to authenticated
      using (public.is_municipal_officer() or establishment_id = public.current_establishment_id());

    drop policy if exists "Authenticated users write AI insights cache" on public.ai_insights_cache;
    create policy "Authenticated users write AI insights cache"
      on public.ai_insights_cache for insert
      to authenticated
      with check (public.is_municipal_officer() or establishment_id = public.current_establishment_id());
  end if;
end;
$$;

notify pgrst, 'reload schema';
