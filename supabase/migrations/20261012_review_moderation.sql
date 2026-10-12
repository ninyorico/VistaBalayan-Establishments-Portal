-- Public review reporting and officer moderation.
-- Existing reviews remain unchanged and visible by default.
-- Officer removal is an auditable soft removal from public display.

alter table public.establishment_ratings
  add column if not exists is_hidden boolean not null default false,
  add column if not exists hidden_at timestamptz,
  add column if not exists hidden_by uuid references public.profiles(id),
  add column if not exists moderation_reason text;

create index if not exists establishment_ratings_visible_idx
  on public.establishment_ratings (establishment_id, created_at desc)
  where is_hidden = false;

create table if not exists public.establishment_rating_reports (
  id uuid primary key default gen_random_uuid(),
  rating_id uuid not null references public.establishment_ratings(id) on delete cascade,
  reporter_token_hash text not null,
  reason text not null check (char_length(trim(reason)) between 3 and 500),
  status text not null default 'open' check (status in ('open', 'reviewed', 'dismissed')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id),
  unique (rating_id, reporter_token_hash)
);

create index if not exists establishment_rating_reports_status_idx
  on public.establishment_rating_reports (status, created_at desc);

alter table public.establishment_rating_reports enable row level security;
revoke all on public.establishment_rating_reports from anon, authenticated;

-- Public visitors report through the locked RPC below; officers read through the queue RPC.
drop policy if exists "Officers can read review reports" on public.establishment_rating_reports;
create policy "Officers can read review reports"
  on public.establishment_rating_reports
  for select to authenticated
  using (public.is_municipal_officer());

-- Rebuild the public review view so hidden reviews are no longer public and officers
-- can still identify the exact review through the moderation RPC.
drop view if exists public.establishment_rating_reviews;
create view public.establishment_rating_reviews as
select
  ratings.id,
  ratings.establishment_id,
  ratings.rating,
  ratings.reviewer_name,
  nullif(trim(ratings.comment), '') as comment,
  ratings.created_at,
  ratings.photo_path
from public.establishment_ratings ratings
join public.establishments establishments
  on establishments.id = ratings.establishment_id
where establishments.status = 'active'
  and ratings.is_hidden = false
  and (
    lower(establishments.type) like '%hotel%'
    or lower(establishments.type) like '%inn%'
    or lower(establishments.type) like '%lodge%'
    or lower(establishments.type) like '%resort%'
    or lower(establishments.type) like '%pool%'
    or lower(establishments.type) like '%farm%'
  );

grant select on public.establishment_rating_reviews to anon, authenticated;

create or replace function public.report_establishment_rating(
  p_rating_id uuid,
  p_reporter_token text,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_token text := trim(coalesce(p_reporter_token, ''));
  normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
  report_id uuid;
begin
  if p_rating_id is null then
    raise exception 'rating_id is required';
  end if;
  if length(normalized_token) < 16 or length(normalized_token) > 128 then
    raise exception 'valid reporter token is required';
  end if;
  if normalized_reason is null or char_length(normalized_reason) < 3 or char_length(normalized_reason) > 500 then
    raise exception 'report reason must be between 3 and 500 characters';
  end if;
  if not exists (
    select 1 from public.establishment_ratings
    where id = p_rating_id and is_hidden = false
  ) then
    raise exception 'review is not available for reporting';
  end if;

  insert into public.establishment_rating_reports (rating_id, reporter_token_hash, reason)
  values (p_rating_id, md5(normalized_token), normalized_reason)
  on conflict (rating_id, reporter_token_hash) do update
    set reason = excluded.reason,
        status = 'open',
        reviewed_at = null,
        reviewed_by = null
  returning id into report_id;

  return report_id;
end;
$$;

revoke all on function public.report_establishment_rating(uuid, text, text) from public;
grant execute on function public.report_establishment_rating(uuid, text, text) to anon, authenticated;

create or replace function public.get_review_moderation_queue()
returns table (
  id uuid,
  establishment_id uuid,
  establishment_name text,
  rating integer,
  reviewer_name text,
  comment text,
  created_at timestamptz,
  is_hidden boolean,
  moderation_reason text,
  report_count integer,
  latest_report_reason text,
  latest_report_created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers may view review moderation records';
  end if;

  return query
  select
    ratings.id,
    ratings.establishment_id,
    establishments.name,
    ratings.rating,
    ratings.reviewer_name,
    ratings.comment,
    ratings.created_at,
    ratings.is_hidden,
    ratings.moderation_reason,
    count(reports.id)::integer,
    (array_agg(reports.reason order by reports.created_at desc))[1],
    max(reports.created_at)
  from public.establishment_ratings ratings
  join public.establishments establishments on establishments.id = ratings.establishment_id
  left join public.establishment_rating_reports reports on reports.rating_id = ratings.id
  group by ratings.id, establishments.name
  order by ratings.is_hidden asc, max(reports.created_at) desc nulls last, ratings.created_at desc;
end;
$$;

revoke all on function public.get_review_moderation_queue() from public;
grant execute on function public.get_review_moderation_queue() to authenticated;

create or replace function public.moderate_establishment_rating(
  p_rating_id uuid,
  p_action text,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_action text := lower(trim(coalesce(p_action, '')));
  normalized_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if not public.is_municipal_officer() then
    raise exception 'Only municipal officers may moderate reviews';
  end if;
  if normalized_action not in ('remove', 'restore') then
    raise exception 'moderation action must be remove or restore';
  end if;
  if normalized_action = 'remove' and (normalized_reason is null or char_length(normalized_reason) < 3 or char_length(normalized_reason) > 500) then
    raise exception 'a removal reason is required';
  end if;
  if not exists (select 1 from public.establishment_ratings where id = p_rating_id) then
    raise exception 'review not found';
  end if;

  update public.establishment_ratings
  set is_hidden = normalized_action = 'remove',
      hidden_at = case when normalized_action = 'remove' then now() else null end,
      hidden_by = case when normalized_action = 'remove' then auth.uid() else null end,
      moderation_reason = case when normalized_action = 'remove' then normalized_reason else null end
  where id = p_rating_id;

  update public.establishment_rating_reports
  set status = case when normalized_action = 'remove' then 'reviewed' else 'dismissed' end,
      reviewed_at = now(),
      reviewed_by = auth.uid()
  where rating_id = p_rating_id and status = 'open';
end;
$$;

revoke all on function public.moderate_establishment_rating(uuid, text, text) from public;
grant execute on function public.moderate_establishment_rating(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
