-- Include attached public review photos in the officer moderation queue.
-- Existing review rows and moderation behavior remain unchanged.

drop function if exists public.get_review_moderation_queue();

create function public.get_review_moderation_queue()
returns table (
  id uuid,
  establishment_id uuid,
  establishment_name text,
  rating integer,
  reviewer_name text,
  comment text,
  photo_path text,
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
    ratings.photo_path,
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
