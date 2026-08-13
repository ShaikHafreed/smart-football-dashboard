-- "members can view org roster" queried football_org_members from inside
-- its own USING clause -- a policy on table X subquerying table X
-- re-triggers the same policy on every nested evaluation, so Postgres
-- correctly refuses with "infinite recursion detected in policy for
-- relation \"football_org_members\"". This only surfaced once a real
-- login path (via the org-visible-profiles policy added afterward) hit
-- it for the first time; it's been broken since the org migration.
--
-- Fix: a SECURITY DEFINER function bypasses RLS internally, so it can
-- look up "which orgs is this user in" without re-entering the policy
-- it's used from.
create or replace function public.my_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from public.football_org_members where user_id = auth.uid();
$$;

grant execute on function public.my_org_ids() to authenticated;

drop policy "members can view org roster" on public.football_org_members;

create policy "members can view org roster"
  on public.football_org_members for select
  using (org_id in (select public.my_org_ids()));
