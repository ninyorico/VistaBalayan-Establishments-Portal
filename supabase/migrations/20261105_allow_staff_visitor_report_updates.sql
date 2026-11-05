-- Allow day-tour staff to revise submitted rows for their own establishment.
-- This preserves officer review access and does not grant cross-establishment access.
drop policy if exists "Staff update visitor reports for own establishment" on public.visitor_reports;
create policy "Staff update visitor reports for own establishment"
  on public.visitor_reports for update
  to authenticated
  using (
    public.is_municipal_officer()
    or establishment_id = public.current_establishment_id()
  )
  with check (
    public.is_municipal_officer()
    or establishment_id = public.current_establishment_id()
  );
