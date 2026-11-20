-- Deterministic AI anomaly evidence and lookup support.
-- Safe to apply repeatedly; does not alter historical report data.

alter table public.ai_anomalies_cache
  add column if not exists input_snapshot jsonb,
  add column if not exists model_name text;

create index if not exists idx_ai_anomalies_cache_active_scope_detected
  on public.ai_anomalies_cache(status, establishment_id, detected_at desc);

create index if not exists idx_ai_anomalies_cache_input_snapshot
  on public.ai_anomalies_cache using gin(input_snapshot);
