-- Verified public accounts and review ownership.
-- Additive migration: preserves legacy visitor-token reviews but excludes them
-- from official customer-satisfaction calculations until they are attributable
-- to a verified public account.

begin;

create table if not exists public.public_user_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(trim(display_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.public_user_profiles enable row level security;
revoke all on public.public_user_profiles from anon;
grant select, insert, update on public.public_user_profiles to authenticated;

drop policy if exists "Public users can read own profile" on public.public_user_profiles;
create policy "Public users can read own profile"
  on public.public_user_profiles for select to authenticated
  using (id = auth.uid());

drop policy if exists "Public users can insert own profile" on public.public_user_profiles;
create policy "Public users can insert own profile"
  on public.public_user_profiles for insert to authenticated
  with check (id = auth.uid());

drop policy if exists "Public users can update own profile" on public.public_user_profiles;
create policy "Public users can update own profile"
  on public.public_user_profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create table if not exists public.public_user_account_deletion_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  reason text,
  status text not null default 'open' check (status in ('open', 'processing', 'completed', 'rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id)
);

create index if not exists public_user_account_deletion_requests_user_idx
  on public.public_user_account_deletion_requests (user_id, created_at desc);
create unique index if not exists public_user_account_deletion_requests_one_open_idx
  on public.public_user_account_deletion_requests (user_id)
  where status in ('open', 'processing');

alter table public.public_user_account_deletion_requests enable row level security;
revoke all on public.public_user_account_deletion_requests from anon;
grant select, insert on public.public_user_account_deletion_requests to authenticated;

drop policy if exists "Public users can create own deletion request" on public.public_user_account_deletion_requests;
create policy "Public users can create own deletion request"
  on public.public_user_account_deletion_requests for insert to authenticated
  with check (user_id = auth.uid());

drop policy if exists "Public users can read own deletion request" on public.public_user_account_deletion_requests;
create policy "Public users can read own deletion request"
  on public.public_user_account_deletion_requests for select to authenticated
  using (user_id = auth.uid());

create or replace function public.request_public_account_deletion(p_reason text default null)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare request_id uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  insert into public.public_user_account_deletion_requests (user_id, reason)
  values (auth.uid(), nullif(trim(coalesce(p_reason, '')), ''))
  on conflict do nothing
  returning id into request_id;
  if request_id is null then
    select id into request_id from public.public_user_account_deletion_requests where user_id = auth.uid() and status in ('open', 'processing') order by created_at desc limit 1;
  end if;
  return request_id;
end;
$$;

grant execute on function public.request_public_account_deletion(text) to authenticated;

alter table public.establishment_ratings
  add column if not exists user_id uuid references auth.users(id),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists deleted_at timestamptz,
  add column if not exists moderation_status text not null default 'published',
  add column if not exists is_verified_account boolean not null default false,
  add column if not exists suspicious_flag boolean not null default false,
  add column if not exists suspicious_reason text,
  add column if not exists source text not null default 'legacy_visitor_token';

alter table public.establishment_ratings
  drop constraint if exists establishment_ratings_moderation_status_check;
alter table public.establishment_ratings
  add constraint establishment_ratings_moderation_status_check
  check (moderation_status in ('pending', 'published', 'flagged', 'rejected', 'hidden'));

update public.establishment_ratings
set moderation_status = case when coalesce(is_hidden, false) then 'hidden' else 'published' end,
    source = coalesce(nullif(source, ''), 'legacy_visitor_token'),
    updated_at = coalesce(updated_at, created_at, now())
where user_id is null;

create index if not exists establishment_ratings_user_idx
  on public.establishment_ratings (user_id, establishment_id, created_at desc)
  where user_id is not null and deleted_at is null;

create unique index if not exists establishment_ratings_one_active_user_establishment_idx
  on public.establishment_ratings (user_id, establishment_id)
  where user_id is not null
    and deleted_at is null
    and moderation_status not in ('rejected', 'hidden');

create table if not exists public.review_moderation_audit (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.establishment_ratings(id) on delete cascade,
  actor_id uuid not null references public.profiles(id),
  previous_status text,
  next_status text not null,
  reason text,
  created_at timestamptz not null default now(),
  check (char_length(coalesce(reason, '')) <= 500)
);

create index if not exists review_moderation_audit_rating_idx
  on public.review_moderation_audit (rating_id, created_at desc);

alter table public.review_moderation_audit enable row level security;
revoke all on public.review_moderation_audit from anon, authenticated;

alter table public.establishment_rating_reports
  add column if not exists reporter_user_id uuid references auth.users(id);

create index if not exists establishment_rating_reports_user_idx
  on public.establishment_rating_reports (reporter_user_id, created_at desc)
  where reporter_user_id is not null;

-- Public reads expose only published content. Private ownership identifiers are
-- deliberately omitted; verified_account is a safe display indicator.
drop view if exists public.establishment_rating_reviews;
create view public.establishment_rating_reviews
with (security_invoker = true)
as
select
  ratings.id,
  ratings.establishment_id,
  ratings.rating,
  ratings.reviewer_name,
  nullif(trim(ratings.comment), '') as comment,
  nullif(trim(ratings.photo_path), '') as photo_path,
  ratings.created_at,
  ratings.updated_at,
  ratings.is_verified_account as verified_account
from public.establishment_ratings ratings
join public.establishments establishments on establishments.id = ratings.establishment_id
where establishments.status = 'active'
  and ratings.deleted_at is null
  and ratings.moderation_status = 'published'
  and (
    lower(establishments.type) like '%hotel%'
    or lower(establishments.type) like '%inn%'
    or lower(establishments.type) like '%lodge%'
    or lower(establishments.type) like '%resort%'
    or lower(establishments.type) like '%pool%'
    or lower(establishments.type) like '%farm%'
  );

grant select on public.establishment_rating_reviews to anon, authenticated;

-- Official customer-feedback calculations use only verified, published,
-- non-suspicious, non-deleted reviews. A null average means no eligible rating;
-- it is never converted to a zero-star score.
drop view if exists public.establishment_rating_summaries;
create view public.establishment_rating_summaries
with (security_invoker = true)
as
select
  ratings.establishment_id,
  round(avg(ratings.rating)::numeric, 2) as average_rating,
  count(*)::integer as rating_count,
  count(*) filter (where ratings.rating = 1)::integer as one_star_count,
  count(*) filter (where ratings.rating = 2)::integer as two_star_count,
  count(*) filter (where ratings.rating = 3)::integer as three_star_count,
  count(*) filter (where ratings.rating = 4)::integer as four_star_count,
  count(*) filter (where ratings.rating = 5)::integer as five_star_count,
  count(*) filter (where nullif(trim(ratings.comment), '') is not null)::integer as comment_count,
  round((count(*) filter (where ratings.rating in (4, 5))::numeric / nullif(count(*), 0)) * 100, 2) as positive_rating_percentage,
  round((((avg(ratings.rating) - 1) / 4) * 100)::numeric, 2) as customer_satisfaction_score,
  case when count(*) >= 5 then 'eligible' else 'insufficient_feedback' end as feedback_eligibility,
  max(ratings.created_at) as latest_rating_at
from public.establishment_ratings ratings
where ratings.user_id is not null
  and ratings.is_verified_account = true
  and ratings.suspicious_flag = false
  and ratings.deleted_at is null
  and ratings.moderation_status = 'published'
group by ratings.establishment_id;

grant select on public.establishment_rating_summaries to anon, authenticated;

create or replace function public.current_public_user_verified()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce(
    auth.uid() is not null
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid()
        and u.email_confirmed_at is not null
    ), false
  );
$$;

revoke all on function public.current_public_user_verified() from public;
grant execute on function public.current_public_user_verified() to authenticated;

drop function if exists public.submit_establishment_rating(uuid, text, integer, text, text, text);
create or replace function public.submit_establishment_rating(
  p_establishment_id uuid,
  p_visitor_token text default null,
  p_rating integer default null,
  p_comment text default null,
  p_reviewer_name text default null,
  p_photo_path text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  normalized_name text := nullif(trim(coalesce(p_reviewer_name, '')), '');
  normalized_comment text := nullif(trim(coalesce(p_comment, '')), '');
  normalized_photo_path text := nullif(trim(coalesce(p_photo_path, '')), '');
  existing_id uuid;
  review_id uuid;
  account_verified boolean := false;
  suspicious boolean := false;
  suspicious_note text := null;
begin
  if actor_id is null or not public.current_public_user_verified() then
    raise exception 'A verified public account is required';
  end if;
  if p_establishment_id is null then raise exception 'establishment_id is required'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating must be between 1 and 5'; end if;
  if normalized_name is null or char_length(normalized_name) > 80 then raise exception 'reviewer name is required and must be 80 characters or fewer'; end if;
  if normalized_comment is not null and char_length(normalized_comment) > 500 then raise exception 'comment must be 500 characters or fewer'; end if;
  if normalized_comment ~* '(buy now|free money|click here|https?://)' then raise exception 'review text contains unsupported promotional content'; end if;
  if not exists (
    select 1 from public.establishments e
    where e.id = p_establishment_id
      and e.status = 'active'
      and (lower(e.type) like '%hotel%' or lower(e.type) like '%inn%' or lower(e.type) like '%lodge%' or lower(e.type) like '%resort%' or lower(e.type) like '%pool%' or lower(e.type) like '%farm%')
  ) then raise exception 'establishment is not publicly rateable'; end if;
  if exists (select 1 from public.profiles p where p.id = actor_id and p.role = 'establishment_staff' and p.establishment_id = p_establishment_id) then
    raise exception 'Establishment operators cannot rate their own establishment';
  end if;
  if normalized_photo_path is not null and normalized_photo_path !~ ('^' || p_establishment_id::text || '/' || actor_id::text || '/[0-9a-f-]+\.(jpg|jpeg|png|webp)$') then
    raise exception 'invalid review photo path';
  end if;

  insert into public.public_user_profiles (id, display_name)
  values (actor_id, normalized_name)
  on conflict (id) do update set display_name = excluded.display_name, updated_at = now();

  select r.id into existing_id
  from public.establishment_ratings r
  where r.user_id = actor_id
    and r.establishment_id = p_establishment_id
    and r.deleted_at is null
    and r.moderation_status not in ('rejected', 'hidden')
  order by r.created_at desc
  limit 1;

  select count(*) >= 3 into suspicious
  from public.establishment_ratings r
  where r.user_id = actor_id and r.created_at > now() - interval '24 hours';
  if suspicious then suspicious_note := 'Multiple public reviews submitted within a short period'; end if;

  if existing_id is not null then
    update public.establishment_ratings
    set rating = p_rating,
        reviewer_name = normalized_name,
        comment = normalized_comment,
        photo_path = normalized_photo_path,
        updated_at = now(),
        moderation_status = case when suspicious then 'flagged' else 'pending' end,
        suspicious_flag = suspicious,
        suspicious_reason = suspicious_note,
        is_verified_account = true,
        source = 'verified_public_user'
    where id = existing_id
    returning id into review_id;
  else
    insert into public.establishment_ratings (
      establishment_id, user_id, rating, reviewer_name, comment, photo_path,
      moderation_status, is_verified_account, suspicious_flag, suspicious_reason, source
    ) values (
      p_establishment_id, actor_id, p_rating, normalized_name, normalized_comment, normalized_photo_path,
      case when suspicious then 'flagged' else 'published' end, true, suspicious, suspicious_note, 'verified_public_user'
    ) returning id into review_id;
  end if;

  return review_id;
end;
$$;

revoke all on function public.submit_establishment_rating(uuid, text, integer, text, text, text) from public;
grant execute on function public.submit_establishment_rating(uuid, text, integer, text, text, text) to authenticated;

create or replace function public.update_establishment_rating(
  p_rating_id uuid,
  p_rating integer,
  p_comment text default null,
  p_reviewer_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  actor_id uuid := auth.uid();
  review_id uuid;
begin
  if actor_id is null or not public.current_public_user_verified() then raise exception 'A verified public account is required'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating must be between 1 and 5'; end if;
  update public.establishment_ratings
  set rating = p_rating,
      comment = nullif(trim(coalesce(p_comment, '')), ''),
      reviewer_name = nullif(trim(coalesce(p_reviewer_name, '')), ''),
      updated_at = now(),
      moderation_status = 'pending'
  where id = p_rating_id and user_id = actor_id and deleted_at is null and moderation_status not in ('rejected', 'hidden')
  returning id into review_id;
  if review_id is null then raise exception 'Review not found or not owned by this account'; end if;
  return review_id;
end;
$$;

grant execute on function public.update_establishment_rating(uuid, integer, text, text) to authenticated;

create or replace function public.delete_establishment_rating(p_rating_id uuid)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  update public.establishment_ratings
  set deleted_at = now(), moderation_status = 'hidden', updated_at = now()
  where id = p_rating_id and user_id = auth.uid() and deleted_at is null;
  if not found then raise exception 'Review not found or not owned by this account'; end if;
end;
$$;

grant execute on function public.delete_establishment_rating(uuid) to authenticated;

create or replace function public.get_public_user_reviews()
returns table (
  id uuid,
  establishment_id uuid,
  rating integer,
  reviewer_name text,
  comment text,
  moderation_status text,
  created_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = public, auth
as $$
  select r.id, r.establishment_id, r.rating, r.reviewer_name, r.comment,
         r.moderation_status, r.created_at, r.updated_at
  from public.establishment_ratings r
  where r.user_id = auth.uid() and r.deleted_at is null
  order by r.updated_at desc;
$$;

grant execute on function public.get_public_user_reviews() to authenticated;

-- Keep the existing report RPC, but associate authenticated reports when possible.
create or replace function public.report_establishment_rating(
  p_rating_id uuid,
  p_reporter_token text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
  report_id uuid;
  reporter_hash text := md5(trim(coalesce(p_reporter_token, '')));
begin
  if normalized_reason is null or char_length(normalized_reason) < 3 or char_length(normalized_reason) > 500 then raise exception 'report reason must be between 3 and 500 characters'; end if;
  if not exists (select 1 from public.establishment_ratings where id = p_rating_id and deleted_at is null and moderation_status = 'published') then raise exception 'review is not available for reporting'; end if;
  insert into public.establishment_rating_reports (rating_id, reporter_token_hash, reporter_user_id, reason)
  values (p_rating_id, reporter_hash, auth.uid(), normalized_reason)
  on conflict (rating_id, reporter_token_hash) do update set reason = excluded.reason, reporter_user_id = coalesce(excluded.reporter_user_id, establishment_rating_reports.reporter_user_id), status = 'open', reviewed_at = null, reviewed_by = null
  returning id into report_id;
  return report_id;
end;
$$;

grant execute on function public.report_establishment_rating(uuid, text, text) to anon, authenticated;

-- Moderation status and audit trail remain officer-controlled.
create or replace function public.moderate_establishment_rating(
  p_rating_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
  previous_status text;
  next_status text;
begin
  if not public.is_municipal_officer() then raise exception 'Only municipal officers may moderate reviews'; end if;
  if normalized_action not in ('publish', 'flag', 'reject', 'hide', 'restore', 'remove') then raise exception 'unsupported moderation action'; end if;
  if normalized_action in ('reject', 'hide', 'remove', 'flag') and (normalized_reason is null or char_length(normalized_reason) < 3 or char_length(normalized_reason) > 500) then raise exception 'a moderation reason is required'; end if;
  select moderation_status into previous_status from public.establishment_ratings where id = p_rating_id for update;
  if previous_status is null then raise exception 'review not found'; end if;
  next_status := case normalized_action when 'publish' then 'published' when 'restore' then 'published' when 'flag' then 'flagged' when 'reject' then 'rejected' when 'hide' then 'hidden' when 'remove' then 'hidden' end;
  update public.establishment_ratings
  set moderation_status = next_status,
      is_hidden = next_status in ('hidden', 'rejected'),
      hidden_at = case when next_status in ('hidden', 'rejected') then now() else null end,
      hidden_by = case when next_status in ('hidden', 'rejected') then auth.uid() else null end,
      moderation_reason = normalized_reason,
      updated_at = now()
  where id = p_rating_id;
  insert into public.review_moderation_audit (rating_id, actor_id, previous_status, next_status, reason)
  values (p_rating_id, auth.uid(), previous_status, next_status, normalized_reason);
  update public.establishment_rating_reports
  set status = case when next_status in ('hidden', 'rejected', 'flagged') then 'reviewed' else 'dismissed' end,
      reviewed_at = now(), reviewed_by = auth.uid()
  where rating_id = p_rating_id and status = 'open';
end;
$$;

grant execute on function public.moderate_establishment_rating(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';

commit;
