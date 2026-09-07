-- Apply this in Supabase SQL Editor for VistaBalayan live project.
-- It enables officer RLS policies and the RPCs used by Add User / Delete User.


-- ===== 20260813_governance_hardening.sql =====

-- VistaBalayan governance hardening: RBAC helpers, report workflow, AI traceability, dashboard indexes, audit logs.
-- Apply in Supabase SQL editor or with `supabase db push` after linking the project.

create extension if not exists pgcrypto;

-- 1) Role-based access helpers
create or replace function public.current_profile_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role::text from public.profiles where id = auth.uid()
$$;

create or replace function public.current_establishment_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select establishment_id from public.profiles where id = auth.uid()
$$;

create or replace function public.is_municipal_officer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_profile_role() = 'municipal_officer', false)
$$;

-- 2) Clear workflow states and AI traceability fields
alter table public.visitor_reports
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists notes text;

alter table public.accommodation_reports
  add column if not exists reviewed_by uuid references public.profiles(id),
  add column if not exists reviewed_at timestamptz,
  add column if not exists notes text;

alter table public.ai_recommendations
  add column if not exists recommended_action text,
  add column if not exists confidence_score numeric(3,2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  add column if not exists model_name text,
  add column if not exists input_snapshot jsonb;

alter table public.ai_anomalies_cache
  add column if not exists confidence_score numeric(3,2) check (confidence_score is null or (confidence_score >= 0 and confidence_score <= 1)),
  add column if not exists model_name text,
  add column if not exists input_snapshot jsonb;

-- 3) Audit logs for human and automated review actions
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references public.profiles(id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  previous_values jsonb,
  new_values jsonb,
  notes text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

drop policy if exists "Municipal officers can read audit logs" on public.audit_logs;
create policy "Municipal officers can read audit logs"
  on public.audit_logs for select
  to authenticated
  using (public.is_municipal_officer());

drop policy if exists "Authenticated users can create audit logs" on public.audit_logs;
create policy "Authenticated users can create audit logs"
  on public.audit_logs for insert
  to authenticated
  with check (actor_id is null or actor_id = auth.uid() or public.is_municipal_officer());

-- 4) RLS guardrails. These policies are intentionally idempotent and scoped by role.
alter table public.profiles enable row level security;
alter table public.establishments enable row level security;
alter table public.visitor_reports enable row level security;
alter table public.accommodation_reports enable row level security;
alter table public.ai_recommendations enable row level security;
alter table public.ai_anomalies_cache enable row level security;

drop policy if exists "Users can read own profile and officers can read all" on public.profiles;
create policy "Users can read own profile and officers can read all"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_municipal_officer());

drop policy if exists "Officers manage profiles" on public.profiles;
create policy "Officers manage profiles"
  on public.profiles for all
  to authenticated
  using (public.is_municipal_officer())
  with check (public.is_municipal_officer());

drop policy if exists "Authenticated users can read establishments" on public.establishments;
create policy "Authenticated users can read establishments"
  on public.establishments for select
  to authenticated
  using (public.is_municipal_officer() or id = public.current_establishment_id());

drop policy if exists "Officers manage establishments" on public.establishments;
create policy "Officers manage establishments"
  on public.establishments for all
  to authenticated
  using (public.is_municipal_officer())
  with check (public.is_municipal_officer());

drop policy if exists "Visitor reports scoped by role" on public.visitor_reports;
create policy "Visitor reports scoped by role"
  on public.visitor_reports for select
  to authenticated
  using (public.is_municipal_officer() or establishment_id = public.current_establishment_id());

drop policy if exists "Staff create visitor reports for own establishment" on public.visitor_reports;
create policy "Staff create visitor reports for own establishment"
  on public.visitor_reports for insert
  to authenticated
  with check (public.is_municipal_officer() or establishment_id = public.current_establishment_id());

drop policy if exists "Officers review visitor reports" on public.visitor_reports;
create policy "Officers review visitor reports"
  on public.visitor_reports for update
  to authenticated
  using (public.is_municipal_officer())
  with check (public.is_municipal_officer());

drop policy if exists "Accommodation reports scoped by role" on public.accommodation_reports;
create policy "Accommodation reports scoped by role"
  on public.accommodation_reports for select
  to authenticated
  using (public.is_municipal_officer() or establishment_id = public.current_establishment_id());

drop policy if exists "Staff create accommodation reports for own establishment" on public.accommodation_reports;
create policy "Staff create accommodation reports for own establishment"
  on public.accommodation_reports for insert
  to authenticated
  with check (public.is_municipal_officer() or establishment_id = public.current_establishment_id());

drop policy if exists "Officers review accommodation reports" on public.accommodation_reports;
create policy "Officers review accommodation reports"
  on public.accommodation_reports for update
  to authenticated
  using (public.is_municipal_officer())
  with check (public.is_municipal_officer());

-- 5) Indexes for dashboard/report filtering performance
create index if not exists idx_visitor_reports_status_created on public.visitor_reports(status, created_at desc);
create index if not exists idx_visitor_reports_establishment_status_date on public.visitor_reports(establishment_id, status, report_date desc);
create index if not exists idx_visitor_reports_report_date on public.visitor_reports(report_date desc);
create index if not exists idx_accommodation_reports_status_created on public.accommodation_reports(status, created_at desc);
create index if not exists idx_accommodation_reports_establishment_status_date on public.accommodation_reports(establishment_id, status, report_date desc);
create index if not exists idx_accommodation_reports_report_date on public.accommodation_reports(report_date desc);
create index if not exists idx_audit_logs_entity_created on public.audit_logs(entity_type, entity_id, created_at desc);


-- ===== 20260821_officer_onboarding_establishment_rpc.sql =====

-- Allows authenticated municipal officers to create the establishment part of
-- the combined staff + establishment onboarding flow without being blocked by
-- table RLS. The role check still happens inside the SECURITY DEFINER function.

create or replace function public.create_officer_onboarding_establishment(
  p_name text,
  p_type text,
  p_address text,
  p_contact_number text,
  p_total_rooms integer default 0,
  p_amenities text default '',
  p_status text default 'active'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_establishment_id uuid;
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers can create establishments during onboarding';
  end if;

  if nullif(trim(p_name), '') is null
    or nullif(trim(p_address), '') is null
    or nullif(trim(p_contact_number), '') is null then
    raise exception 'Establishment name, address, and contact number are required';
  end if;

  insert into public.establishments (
    name,
    type,
    address,
    contact_number,
    total_rooms,
    amenities,
    status
  ) values (
    trim(p_name),
    coalesce(nullif(trim(p_type), ''), 'Hotel'),
    trim(p_address),
    trim(p_contact_number),
    greatest(coalesce(p_total_rooms, 0), 0),
    coalesce(p_amenities, ''),
    coalesce(nullif(trim(p_status), ''), 'active')
  )
  returning id into v_establishment_id;

  return v_establishment_id;
end;
$$;

grant execute on function public.create_officer_onboarding_establishment(text, text, text, text, integer, text, text) to authenticated;


-- ===== 20260821_officer_onboarding_staff_profile_rpc.sql =====

-- Allows municipal officers to link a newly signed-up auth user to the
-- establishment created during the Add User onboarding flow. This supports
-- Supabase projects whose signup email template sends a confirmation link
-- instead of a visible OTP code.

create or replace function public.complete_officer_onboarding_staff_profile(
  p_user_id uuid,
  p_email text,
  p_full_name text,
  p_establishment_id uuid,
  p_status text default 'active'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers can complete staff onboarding';
  end if;

  if nullif(trim(p_email), '') is null
    or nullif(trim(p_full_name), '') is null
    or p_establishment_id is null then
    raise exception 'Staff email, full name, and establishment are required';
  end if;

  v_user_id := p_user_id;

  if v_user_id is null then
    select id
      into v_user_id
      from auth.users
     where lower(email) = lower(trim(p_email))
     order by created_at desc
     limit 1;
  end if;

  if v_user_id is null then
    raise exception 'Supabase auth user was not found for this email';
  end if;

  insert into public.profiles (
    id,
    email,
    full_name,
    role,
    establishment_id,
    status
  ) values (
    v_user_id,
    lower(trim(p_email)),
    trim(p_full_name),
    'establishment_staff',
    p_establishment_id,
    coalesce(nullif(trim(p_status), ''), 'active')
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = excluded.full_name,
    role = excluded.role,
    establishment_id = excluded.establishment_id,
    status = excluded.status;
end;
$$;

grant execute on function public.complete_officer_onboarding_staff_profile(uuid, text, text, uuid, text) to authenticated;


-- ===== 20260821_delete_establishment_with_staff_rpc.sql =====

-- Deletes an establishment and its establishment staff profiles in one verified
-- security-definer operation. The regular client-side delete could report
-- success even when RLS/dependent rows prevented the establishment from
-- disappearing from the officer list.

create or replace function public.delete_officer_establishment_with_staff(
  p_establishment_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_staff_user_ids uuid[] := '{}';
  v_establishment_deleted integer := 0;
  v_staff_profiles_deleted integer := 0;
  v_auth_users_deleted integer := 0;
  v_related_deleted jsonb := '{}'::jsonb;
  v_count integer := 0;
  v_optional_table text;
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers can delete establishments';
  end if;

  if p_establishment_id is null then
    raise exception 'Establishment id is required';
  end if;

  if not exists (select 1 from public.establishments where id = p_establishment_id) then
    raise exception 'Establishment was not found or is already deleted';
  end if;

  select coalesce(array_agg(id), '{}')
    into v_staff_user_ids
    from public.profiles
   where establishment_id = p_establishment_id
     and role = 'establishment_staff';

  -- Delete dependent data first so FK constraints cannot leave the establishment
  -- row behind while the UI reports a successful delete.
  if to_regclass('public.room_occupancy_details') is not null
     and to_regclass('public.accommodation_reports') is not null then
    delete from public.room_occupancy_details
     where accommodation_report_id in (
       select id from public.accommodation_reports where establishment_id = p_establishment_id
     );
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('room_occupancy_details', v_count);
  end if;

  -- Public ratings and AI caches can differ between deployments. Only touch
  -- actual tables that expose establishment_id; views or older schemas are
  -- skipped safely.
  for v_optional_table in
    select unnest(array[
      'establishment_ratings',
      'ai_recommendations',
      'ai_anomalies_cache',
      'ai_insights_cache'
    ])
  loop
    if exists (
      select 1
      from information_schema.tables t
      join information_schema.columns c
        on c.table_schema = t.table_schema
       and c.table_name = t.table_name
      where t.table_schema = 'public'
        and t.table_name = v_optional_table
        and t.table_type = 'BASE TABLE'
        and c.column_name = 'establishment_id'
    ) then
      execute format('delete from public.%I where establishment_id = $1', v_optional_table)
        using p_establishment_id;
      get diagnostics v_count = row_count;
      v_related_deleted := v_related_deleted || jsonb_build_object(v_optional_table, v_count);
    end if;
  end loop;

  if to_regclass('public.visitor_reports') is not null then
    delete from public.visitor_reports where establishment_id = p_establishment_id;
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('visitor_reports', v_count);
  end if;

  if to_regclass('public.accommodation_reports') is not null then
    delete from public.accommodation_reports where establishment_id = p_establishment_id;
    get diagnostics v_count = row_count;
    v_related_deleted := v_related_deleted || jsonb_build_object('accommodation_reports', v_count);
  end if;

  delete from public.profiles
   where establishment_id = p_establishment_id
     and role = 'establishment_staff';
  get diagnostics v_staff_profiles_deleted = row_count;

  delete from public.establishments where id = p_establishment_id;
  get diagnostics v_establishment_deleted = row_count;

  if v_establishment_deleted <> 1 then
    raise exception 'Failed to delete establishment';
  end if;

  if array_length(v_staff_user_ids, 1) is not null and to_regclass('auth.users') is not null then
    delete from auth.users where id = any(v_staff_user_ids);
    get diagnostics v_auth_users_deleted = row_count;
  end if;

  return jsonb_build_object(
    'establishment_deleted', v_establishment_deleted,
    'staff_profiles_deleted', v_staff_profiles_deleted,
    'auth_users_deleted', v_auth_users_deleted,
    'related_deleted', v_related_deleted
  );
end;
$$;

grant execute on function public.delete_officer_establishment_with_staff(uuid) to authenticated;


-- ===== 20260821_remove_officer_user_rpc.sql =====

-- Removes an establishment staff profile through a verified security-definer RPC.
-- This avoids client-side RLS/update-returning edge cases where PostgREST can
-- return an empty updated row set even though the officer clicked a visible user.

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

  -- The profile references auth.users(id), so the profile row must be removed
  -- before deleting the auth user. Otherwise Postgres raises profiles_id_fkey.
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
    'auth_users_deleted', v_auth_users_deleted
  );
end;
$$;

grant execute on function public.remove_officer_user(uuid) to authenticated;


-- ===== 20260822_email_otps_emailjs.sql =====

-- Stores hashed OTPs for Nodemailer-powered staff creation and password reset.
-- Run this in Supabase SQL Editor before using the Nodemailer OTP APIs.

create table if not exists public.email_otps (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  purpose text not null check (purpose in ('staff_creation', 'password_reset', 'email_verification')),
  otp_hash text not null,
  attempts integer not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_email_otps_lookup
  on public.email_otps (email, purpose, otp_hash)
  where consumed_at is null;

create index if not exists idx_email_otps_expiry
  on public.email_otps (expires_at);

alter table public.email_otps enable row level security;

-- No browser/client access. Serverless functions use the service-role key and bypass RLS.
drop policy if exists "No client access to email otps" on public.email_otps;
create policy "No client access to email otps"
  on public.email_otps
  for all
  to authenticated, anon
  using (false)
  with check (false);

-- ===== 20260823_staff_email_verification_otp.sql =====

alter table public.email_otps
  drop constraint if exists email_otps_purpose_check;

alter table public.email_otps
  add constraint email_otps_purpose_check
  check (purpose in ('staff_creation', 'password_reset', 'email_verification'));
