-- Without this, the Organization member list can only ever show the
-- signed-in coach's own name -- every other coach's full_name is
-- invisible under the existing "own profile select" policy alone.
create policy "org members can view each others profile"
  on public.football_profiles for select
  using (
    id in (
      select user_id from public.football_org_members
      where org_id in (select org_id from public.football_org_members where user_id = auth.uid())
    )
  );
