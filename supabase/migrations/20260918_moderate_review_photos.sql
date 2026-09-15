-- Public review moderation and optional visitor photo support.
alter table public.establishment_ratings
  add column if not exists photo_path text;

comment on column public.establishment_ratings.photo_path is
  'Optional public review photo path in the review-photos storage bucket.';

create or replace function public.contains_inappropriate_review_language(p_text text)
returns boolean
language sql
immutable
as $$
  select coalesce(
    p_text ~* '(^|[^[:alnum:]])(asshole|bastard|bitch|bullshit|cunt|dick|fuck|fucker|motherfucker|nigger|piss|porn|shit|slut|whore)([^[:alnum:]]|$)',
    false
  );
$$;

-- Ensure the public review photo bucket exists and is readable.
insert into storage.buckets (id, name, public)
values ('review-photos', 'review-photos', true)
on conflict (id) do update set public = true;

drop policy if exists "Public can upload review photos" on storage.objects;
create policy "Public can upload review photos"
  on storage.objects for insert
  to anon, authenticated
  with check (
    bucket_id = 'review-photos'
    and name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$'
  );

drop policy if exists "Anyone can read review photos" on storage.objects;
create policy "Anyone can read review photos"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'review-photos');

-- The old five-argument RPC remains available for compatibility but now uses
-- the same moderation rules and no-photo behavior.
create or replace function public.submit_establishment_rating(
  p_establishment_id uuid,
  p_visitor_token text,
  p_rating integer,
  p_comment text default null,
  p_reviewer_name text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.submit_establishment_rating(
    p_establishment_id,
    p_visitor_token,
    p_rating,
    p_comment,
    p_reviewer_name,
    null
  );
end;
$$;

create or replace function public.submit_establishment_rating(
  p_establishment_id uuid,
  p_visitor_token text,
  p_rating integer,
  p_comment text default null,
  p_reviewer_name text default null,
  p_photo_path text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  normalized_token text := trim(p_visitor_token);
  token_hash text;
  public_establishment_exists boolean;
  normalized_comment text := nullif(trim(p_comment), '');
  normalized_reviewer_name text := nullif(trim(p_reviewer_name), '');
  normalized_photo_path text := nullif(trim(p_photo_path), '');
begin
  if p_establishment_id is null then raise exception 'establishment_id is required'; end if;
  if normalized_token is null or length(normalized_token) < 16 or length(normalized_token) > 128 then raise exception 'valid visitor token is required'; end if;
  if p_rating is null or p_rating < 1 or p_rating > 5 then raise exception 'rating must be between 1 and 5'; end if;
  if normalized_comment is not null and char_length(normalized_comment) > 500 then raise exception 'comment must be 500 characters or fewer'; end if;
  if normalized_reviewer_name is null then raise exception 'reviewer name is required'; end if;
  if char_length(normalized_reviewer_name) > 80 then raise exception 'reviewer name must be 80 characters or fewer'; end if;
  if public.contains_inappropriate_review_language(coalesce(normalized_comment, '') || ' ' || normalized_reviewer_name) then
    raise exception 'review contains inappropriate language';
  end if;
  if normalized_photo_path is not null and normalized_photo_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.(jpg|jpeg|png|webp)$' then
    raise exception 'invalid review photo';
  end if;

  select exists (
    select 1 from public.establishments e
    where e.id = p_establishment_id and e.status = 'active'
      and (lower(e.type) like '%hotel%' or lower(e.type) like '%inn%' or lower(e.type) like '%lodge%'
        or lower(e.type) like '%resort%' or lower(e.type) like '%pool%' or lower(e.type) like '%farm%')
  ) into public_establishment_exists;
  if not public_establishment_exists then raise exception 'establishment is not publicly rateable'; end if;

  token_hash := md5(normalized_token);
  insert into public.establishment_ratings (establishment_id, visitor_token_hash, rating, reviewer_name, comment, photo_path)
  values (p_establishment_id, token_hash, p_rating, normalized_reviewer_name, normalized_comment, normalized_photo_path)
  on conflict (establishment_id, visitor_token_hash)
  do update set rating = excluded.rating, reviewer_name = excluded.reviewer_name,
                comment = excluded.comment, photo_path = excluded.photo_path;
end;
$$;

revoke all on function public.contains_inappropriate_review_language(text) from public;
revoke all on function public.submit_establishment_rating(uuid, text, integer, text, text) from public;
revoke all on function public.submit_establishment_rating(uuid, text, integer, text, text, text) from public;
grant execute on function public.submit_establishment_rating(uuid, text, integer, text, text) to anon, authenticated;
grant execute on function public.submit_establishment_rating(uuid, text, integer, text, text, text) to anon, authenticated;

-- Recreate the public review view with the optional photo path.
drop view if exists public.establishment_rating_reviews;
create view public.establishment_rating_reviews as
select r.establishment_id, r.rating, r.reviewer_name,
       nullif(trim(r.comment), '') as comment, r.photo_path, r.created_at
from public.establishment_ratings r
join public.establishments e on e.id = r.establishment_id
where e.status = 'active'
  and (lower(e.type) like '%hotel%' or lower(e.type) like '%inn%' or lower(e.type) like '%lodge%'
    or lower(e.type) like '%resort%' or lower(e.type) like '%pool%' or lower(e.type) like '%farm%');

grant select on public.establishment_rating_reviews to anon, authenticated;
notify pgrst, 'reload schema';
