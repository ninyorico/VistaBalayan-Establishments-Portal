-- Period-aware customer-feedback summaries for comparable historical analysis.
-- Uses the same verified, published, non-suspicious eligibility contract.

drop view if exists public.establishment_rating_period_summaries;
create view public.establishment_rating_period_summaries
with (security_invoker = true)
as
select
  ratings.establishment_id,
  date_trunc('month', ratings.created_at)::date as period_start,
  round(avg(ratings.rating)::numeric, 2) as average_rating,
  count(*)::integer as rating_count,
  round((((avg(ratings.rating) - 1) / 4) * 100)::numeric, 2) as customer_satisfaction_score,
  round((count(*) filter (where ratings.rating in (4, 5))::numeric / nullif(count(*), 0)) * 100, 2) as positive_rating_percentage
from public.establishment_ratings ratings
where ratings.user_id is not null
  and ratings.is_verified_account = true
  and ratings.suspicious_flag = false
  and ratings.deleted_at is null
  and ratings.moderation_status = 'published'
group by ratings.establishment_id, date_trunc('month', ratings.created_at)::date;

grant select on public.establishment_rating_period_summaries to anon, authenticated;
