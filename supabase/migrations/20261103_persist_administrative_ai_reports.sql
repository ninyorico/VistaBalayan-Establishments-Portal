-- Persist generated Tourism Officer administrative AI reports by selected period.
-- Report rows are server-written after bearer-token/profile authorization.

alter table public.ai_insights_cache enable row level security;

drop policy if exists "Authenticated users read AI insights cache" on public.ai_insights_cache;
drop policy if exists "Authenticated users write AI insights cache" on public.ai_insights_cache;

revoke all on public.ai_insights_cache from anon, authenticated;
grant select on public.ai_insights_cache to authenticated;

create policy "Municipal officers read administrative AI reports"
  on public.ai_insights_cache for select
  to authenticated
  using (
    public.is_municipal_officer()
    and insight_type = 'administrative_report'
  );

create index if not exists idx_ai_insights_cache_admin_report_period
  on public.ai_insights_cache(insight_type, period, generated_at desc)
  where is_active = true and insight_type = 'administrative_report';

comment on table public.ai_insights_cache is
  'Server-controlled derived AI cache. Administrative reports are persisted by selected period so officers can reuse them without regenerating.';
