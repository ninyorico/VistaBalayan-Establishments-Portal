-- Web Push device subscriptions for authenticated VistaBalayan portal users.
-- Review and apply explicitly; this migration does not modify existing report data.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  platform text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists push_subscriptions_user_active_idx
  on public.push_subscriptions (user_id, last_seen_at desc)
  where revoked_at is null;

alter table public.push_subscriptions enable row level security;
alter table public.push_subscriptions force row level security;

revoke all on public.push_subscriptions from anon;
revoke all on public.push_subscriptions from authenticated;

grant select, insert, update, delete on public.push_subscriptions to authenticated;

drop policy if exists "Users manage their own push subscriptions" on public.push_subscriptions;
create policy "Users manage their own push subscriptions"
  on public.push_subscriptions
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
