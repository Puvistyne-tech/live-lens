-- Admins (authenticated JWT with app_metadata.role = admin) can read all media including pending
create policy media_select_admin
  on public.media for select
  to authenticated
  using (coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') = 'admin');
