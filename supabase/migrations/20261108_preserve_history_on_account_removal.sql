-- Preserve historical reports when an establishment staff account is removed.
-- Account-owned notifications are deleted with the account; report/audit attribution
-- is retained as NULL rather than deleting historical tourism records.

begin;

-- Historical report submitter references must not block account removal.
alter table public.visitor_reports
  alter column submitted_by drop not null;

alter table public.accommodation_reports
  alter column submitted_by drop not null;

-- Account-owned notifications do not need to survive account deletion.
-- The column is made nullable for an idempotent transition before replacing the FK.
alter table public.notifications
  alter column user_id drop not null;

-- Replace profile foreign keys with deletion behavior that preserves history.
alter table public.visitor_reports
  drop constraint if exists visitor_reports_submitted_by_fkey,
  drop constraint if exists visitor_reports_reviewed_by_fkey;

alter table public.visitor_reports
  add constraint visitor_reports_submitted_by_fkey
    foreign key (submitted_by) references public.profiles(id) on delete set null,
  add constraint visitor_reports_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.accommodation_reports
  drop constraint if exists accommodation_reports_submitted_by_fkey,
  drop constraint if exists accommodation_reports_reviewed_by_fkey;

alter table public.accommodation_reports
  add constraint accommodation_reports_submitted_by_fkey
    foreign key (submitted_by) references public.profiles(id) on delete set null,
  add constraint accommodation_reports_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.establishment_rating_reports
  drop constraint if exists establishment_rating_reports_reviewed_by_fkey;

alter table public.establishment_rating_reports
  add constraint establishment_rating_reports_reviewed_by_fkey
    foreign key (reviewed_by) references public.profiles(id) on delete set null;

alter table public.establishment_ratings
  drop constraint if exists establishment_ratings_hidden_by_fkey;

alter table public.establishment_ratings
  add constraint establishment_ratings_hidden_by_fkey
    foreign key (hidden_by) references public.profiles(id) on delete set null;

alter table public.audit_logs
  drop constraint if exists audit_logs_actor_id_fkey;

alter table public.audit_logs
  add constraint audit_logs_actor_id_fkey
    foreign key (actor_id) references public.profiles(id) on delete set null;

alter table public.notifications
  drop constraint if exists notifications_user_id_fkey;

alter table public.notifications
  add constraint notifications_user_id_fkey
    foreign key (user_id) references public.profiles(id) on delete cascade;

commit;
