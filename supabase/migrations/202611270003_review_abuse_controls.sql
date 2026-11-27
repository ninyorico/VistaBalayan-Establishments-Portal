-- Additive abuse controls for authenticated public reviews.
-- Legacy anonymous/token reviews are intentionally excluded.

create or replace function public.guard_verified_public_review_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recent_count integer;
  repeated_count integer;
  normalized_comment text;
begin
  if new.source <> 'verified_public_user' or new.user_id is null then
    return new;
  end if;

  select count(*) into recent_count
  from public.establishment_ratings r
  where r.user_id = new.user_id
    and r.source = 'verified_public_user'
    and r.deleted_at is null
    and r.created_at > now() - interval '24 hours'
    and (tg_op = 'INSERT' or r.id <> new.id);

  if recent_count >= 5 then
    raise exception 'Review submission rate limit reached; please try again later';
  end if;

  normalized_comment := nullif(lower(regexp_replace(trim(coalesce(new.comment, '')), '\\s+', ' ', 'g')), '');
  if normalized_comment is not null then
    select count(*) into repeated_count
    from public.establishment_ratings r
    where r.user_id = new.user_id
      and r.source = 'verified_public_user'
      and r.deleted_at is null
      and r.id <> new.id
      and lower(regexp_replace(trim(coalesce(r.comment, '')), '\\s+', ' ', 'g')) = normalized_comment
      and r.created_at > now() - interval '30 days';

    if repeated_count > 0 then
      new.suspicious_flag := true;
      new.suspicious_reason := 'Repeated review text detected';
      if new.moderation_status = 'published' then
        new.moderation_status := 'flagged';
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.guard_verified_public_review_submission() from public;

drop trigger if exists trg_guard_verified_public_review_submission on public.establishment_ratings;
create trigger trg_guard_verified_public_review_submission
before insert or update of comment, source, user_id, moderation_status, deleted_at
on public.establishment_ratings
for each row execute function public.guard_verified_public_review_submission();
