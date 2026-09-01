-- Make VistaBalayan notifications usable from the portal while keeping row-level access scoped.
-- Adds optional fields used by the notification center and allows recipients to mark their own notifications read.

alter table if exists public.notifications
  add column if not exists read_at timestamptz,
  add column if not exists action_path text;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'created_at'
      and data_type = 'timestamp without time zone'
  ) then
    alter table public.notifications
      alter column created_at type timestamptz using created_at at time zone 'UTC';
  end if;
end $$;

create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

-- Keep read access private to the recipient plus municipal officers.
drop policy if exists "Notifications scoped to recipient or officers" on public.notifications;
create policy "Notifications scoped to recipient or officers"
  on public.notifications
  for select
  to authenticated
  using (is_municipal_officer() or user_id = auth.uid());

-- Officers can create notifications for staff/officers. The application currently
-- also generates live count-based reminders client-side, so inserts are optional.
drop policy if exists "Officers create notifications" on public.notifications;
create policy "Officers create notifications"
  on public.notifications
  for insert
  to authenticated
  with check (is_municipal_officer());

-- Recipients can only mark their own notification as read/unread. Restrict
-- column privileges too, so a client cannot edit title/message/action/user_id.
revoke update on public.notifications from authenticated;
grant update (is_read, read_at) on public.notifications to authenticated;

drop policy if exists "Recipients update own notifications" on public.notifications;
create policy "Recipients update own notifications"
  on public.notifications
  for update
  to authenticated
  using (is_municipal_officer() or user_id = auth.uid())
  with check (is_municipal_officer() or user_id = auth.uid());
