-- Allow inactive authenticated users to retain read-only access to their existing
-- scope while requiring active accounts for all staff mutations.

create or replace function public.current_establishment_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select establishment_id
  from public.profiles
  where id = auth.uid()
    and coalesce(status, 'active') <> 'deleted'
$$;

create or replace function public.current_active_establishment_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select profiles.establishment_id
  from public.profiles
  join public.establishments on establishments.id = profiles.establishment_id
  where profiles.id = auth.uid()
    and profiles.role = 'establishment_staff'
    and coalesce(profiles.status, 'active') = 'active'
    and coalesce(establishments.status, 'active') = 'active'
$$;

create or replace function public.is_municipal_officer_reader()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid()
      and role = 'municipal_officer'
      and coalesce(status, 'active') <> 'deleted'
  )
$$;

create or replace function public.is_active_municipal_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_municipal_officer()
$$;

-- Remove broad policies that expose inactive or out-of-scope records.
drop policy if exists "Allow authenticated users to read establishments" on public.establishments;
drop policy if exists "Anyone can view establishments" on public.establishments;

drop policy if exists "Authenticated users read AI insights cache" on public.ai_insights_cache;
drop policy if exists "Authenticated users write AI insights cache" on public.ai_insights_cache;
drop policy if exists "AI insights cache scoped by role" on public.ai_insights_cache;

-- Profiles: inactive users may read their own profile, but only active users may update it.
drop policy if exists "Users can read own profile and officers can read all" on public.profiles;
create policy "Users can read own profile and officers can read all"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_municipal_officer_reader());

drop policy if exists "Users can update own safe profile fields" on public.profiles;
create policy "Users can update own safe profile fields"
  on public.profiles for update
  to authenticated
  using (
    id = auth.uid()
    and (
      public.is_active_municipal_officer()
      or public.current_active_establishment_id() is not null
    )
  )
  with check (id = auth.uid());

-- Establishments: inactive staff can read only their linked establishment; updates
-- require an active staff profile and active linked establishment.
drop policy if exists "Authenticated users can read establishments" on public.establishments;
create policy "Authenticated users can read establishments"
  on public.establishments for select
  to authenticated
  using (public.is_municipal_officer_reader() or id = public.current_establishment_id());

drop policy if exists "Staff can read own establishment" on public.establishments;
create policy "Staff can read own establishment"
  on public.establishments for select
  to authenticated
  using (id = public.current_establishment_id());

drop policy if exists "Staff can update own establishment listing" on public.establishments;
create policy "Staff can update own establishment listing"
  on public.establishments for update
  to authenticated
  using (id = public.current_active_establishment_id())
  with check (id = public.current_active_establishment_id());

-- Reports: inactive staff retain scoped SELECT access but cannot insert or update.
drop policy if exists "Visitor reports scoped by role" on public.visitor_reports;
create policy "Visitor reports scoped by role"
  on public.visitor_reports for select
  to authenticated
  using (public.is_municipal_officer_reader() or establishment_id = public.current_establishment_id());

drop policy if exists "Staff create visitor reports for own establishment" on public.visitor_reports;
create policy "Staff create visitor reports for own establishment"
  on public.visitor_reports for insert
  to authenticated
  with check (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id());

drop policy if exists "Staff update own pending visitor reports" on public.visitor_reports;
create policy "Staff update own pending visitor reports"
  on public.visitor_reports for update
  to authenticated
  using (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id())
  with check (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id());

drop policy if exists "Officers review visitor reports" on public.visitor_reports;
create policy "Officers review visitor reports"
  on public.visitor_reports for update
  to authenticated
  using (public.is_active_municipal_officer())
  with check (public.is_active_municipal_officer());

drop policy if exists "Accommodation reports scoped by role" on public.accommodation_reports;
create policy "Accommodation reports scoped by role"
  on public.accommodation_reports for select
  to authenticated
  using (public.is_municipal_officer_reader() or establishment_id = public.current_establishment_id());

drop policy if exists "Staff create accommodation reports for own establishment" on public.accommodation_reports;
create policy "Staff create accommodation reports for own establishment"
  on public.accommodation_reports for insert
  to authenticated
  with check (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id());

drop policy if exists "Staff update own accommodation reports" on public.accommodation_reports;
create policy "Staff update own accommodation reports"
  on public.accommodation_reports for update
  to authenticated
  using (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id())
  with check (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id());

drop policy if exists "Officers review accommodation reports" on public.accommodation_reports;
create policy "Officers review accommodation reports"
  on public.accommodation_reports for update
  to authenticated
  using (public.is_active_municipal_officer())
  with check (public.is_active_municipal_officer());

-- Room details follow the same read/write split through their parent report.
drop policy if exists "Room details scoped through accommodation reports" on public.room_occupancy_details;
create policy "Room details scoped through accommodation reports"
  on public.room_occupancy_details for select
  to authenticated
  using (
    exists (
      select 1
      from public.accommodation_reports reports
      where reports.id = room_occupancy_details.accommodation_report_id
        and (
          public.is_municipal_officer_reader()
          or reports.establishment_id = public.current_establishment_id()
        )
    )
  );

drop policy if exists "Staff create room details for own reports" on public.room_occupancy_details;
create policy "Staff create room details for own reports"
  on public.room_occupancy_details for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.accommodation_reports reports
      where reports.id = room_occupancy_details.accommodation_report_id
        and (
          public.is_active_municipal_officer()
          or reports.establishment_id = public.current_active_establishment_id()
        )
    )
  );

-- AI: inactive staff may read cached records scoped to their establishment, but
-- cannot generate or write new AI data.
drop policy if exists "AI recommendations scoped by role" on public.ai_recommendations;
create policy "AI recommendations scoped by role"
  on public.ai_recommendations for select
  to authenticated
  using (public.is_municipal_officer_reader() or establishment_id = public.current_establishment_id());

drop policy if exists "Authenticated users create AI recommendations" on public.ai_recommendations;
create policy "Authenticated users create AI recommendations"
  on public.ai_recommendations for insert
  to authenticated
  with check (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id());

drop policy if exists "AI anomalies scoped by role" on public.ai_anomalies_cache;
create policy "AI anomalies scoped by role"
  on public.ai_anomalies_cache for select
  to authenticated
  using (public.is_municipal_officer_reader() or establishment_id = public.current_establishment_id());

drop policy if exists "Authenticated users create AI anomalies" on public.ai_anomalies_cache;
create policy "Authenticated users create AI anomalies"
  on public.ai_anomalies_cache for insert
  to authenticated
  with check (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id());

create policy "AI insights cache scoped by role"
  on public.ai_insights_cache for select
  to authenticated
  using (public.is_municipal_officer_reader() or establishment_id = public.current_establishment_id());

create policy "Active users write AI insights cache"
  on public.ai_insights_cache for insert
  to authenticated
  with check (public.is_active_municipal_officer() or establishment_id = public.current_active_establishment_id());

-- Inactive users may read their notifications but cannot mark them read/unread.
drop policy if exists "Notifications scoped to recipient or officers" on public.notifications;
create policy "Notifications scoped to recipient or officers"
  on public.notifications for select
  to authenticated
  using (public.is_municipal_officer_reader() or user_id = auth.uid());

drop policy if exists "Recipients update own notifications" on public.notifications;
create policy "Recipients update own notifications"
  on public.notifications for update
  to authenticated
  using (public.is_active_municipal_officer() or (user_id = auth.uid() and public.current_active_establishment_id() is not null))
  with check (public.is_active_municipal_officer() or (user_id = auth.uid() and public.current_active_establishment_id() is not null));

-- Audit writes are also active-account-only.
drop policy if exists "Authenticated users can create audit logs" on public.audit_logs;
create policy "Authenticated users can create audit logs"
  on public.audit_logs for insert
  to authenticated
  with check (
    public.is_active_municipal_officer()
    or (public.current_active_establishment_id() is not null and (actor_id is null or actor_id = auth.uid()))
  );

drop policy if exists "Municipal officers can read audit logs" on public.audit_logs;
create policy "Municipal officers can read audit logs"
  on public.audit_logs for select
  to authenticated
  using (public.is_municipal_officer_reader());

notify pgrst, 'reload schema';
