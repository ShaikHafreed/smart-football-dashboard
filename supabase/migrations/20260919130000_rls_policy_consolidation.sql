-- Merge each own-row / org-shared permissive pair into one policy.
--
-- WHY: six table+command combinations carried two permissive policies - one
-- granting access to the row's owner, one granting it to other coaches in the
-- same organization. Permissive policies OR together, so both had to be
-- evaluated on every read, and the database advisor reported 30
-- multiple_permissive_policies findings across the four tables.
--
-- EQUIVALENCE: every pair was checked before merging, not assumed from the
-- names. Both policies in each pair are PERMISSIVE, apply to PUBLIC (no role
-- restriction), target the same table and command, and split cleanly -
-- SELECT and UPDATE carry only USING, INSERT only WITH CHECK. The predicates
-- below are character-for-character the existing ones, joined with OR.
--
-- For UPDATE, neither original declared WITH CHECK, so Postgres derived the
-- check from USING. The merged policy does the same, keeping the write test
-- identical to (own OR org).
--
-- ORDERING: the merged policy is created FIRST, while both originals still
-- exist, and only then are the originals dropped. At no instant during this
-- transaction is the access set anything other than (own OR org).
--
-- VERIFIED ON PRODUCTION: the rows visible to each of the four real accounts
-- were snapshotted before and after and are byte-identical; policy count went
-- 25 -> 19 (exactly the six merges); RLS remains enabled on all seven tables;
-- no policy was left without a predicate; football_shots still has zero write
-- policies for clients.
--
-- HONEST NOTE ON THE BENEFIT: the executed query plan did not change.
-- Postgres already combined the two permissive policies into a single OR'd
-- filter at runtime, so this does not make the scan cheaper. What it does is
-- remove six redundant policy objects, clear all 30 advisor findings, and
-- leave one place per table+command where access is defined instead of two.

-- ==========================================
-- football_players - SELECT, INSERT, UPDATE
-- (DELETE has only one policy and is left alone)
-- ==========================================
create policy "players readable by owner or org" on public.football_players
  for select using (
    (select auth.uid()) = user_id
    or org_id in (
      select football_org_members.org_id from public.football_org_members
      where football_org_members.user_id = (select auth.uid())
    )
  );
drop policy "own players select" on public.football_players;
drop policy "org members can view org players" on public.football_players;

create policy "players insertable by owner or org" on public.football_players
  for insert with check (
    (select auth.uid()) = user_id
    or org_id in (
      select football_org_members.org_id from public.football_org_members
      where football_org_members.user_id = (select auth.uid())
    )
  );
drop policy "own players insert" on public.football_players;
drop policy "org members can add org players" on public.football_players;

create policy "players updatable by owner or org" on public.football_players
  for update using (
    (select auth.uid()) = user_id
    or org_id in (
      select football_org_members.org_id from public.football_org_members
      where football_org_members.user_id = (select auth.uid())
    )
  );
drop policy "own players update" on public.football_players;
drop policy "org members can update org players" on public.football_players;

-- ==========================================
-- football_profiles - SELECT
-- ==========================================
create policy "profiles readable by self or org" on public.football_profiles
  for select using (
    (select auth.uid()) = id
    or id in (
      select football_org_members.user_id
      from public.football_org_members
      where football_org_members.org_id in (
        select football_org_members_1.org_id
        from public.football_org_members football_org_members_1
        where football_org_members_1.user_id = (select auth.uid())
      )
    )
  );
drop policy "own profile select" on public.football_profiles;
drop policy "org members can view each others profile" on public.football_profiles;

-- ==========================================
-- football_sessions - SELECT
-- ==========================================
create policy "sessions readable by owner or org" on public.football_sessions
  for select using (
    (select auth.uid()) = user_id
    or player_id in (
      select football_players.id from public.football_players
      where football_players.org_id in (
        select football_org_members.org_id from public.football_org_members
        where football_org_members.user_id = (select auth.uid())
      )
    )
  );
drop policy "own sessions select" on public.football_sessions;
drop policy "org members can view org player sessions" on public.football_sessions;

-- ==========================================
-- football_shots - SELECT
--
-- Still read-only for clients: there is deliberately no insert, update or
-- delete policy on this table. Shots are written by the relay using the
-- service role, which bypasses RLS.
-- ==========================================
create policy "shots readable by player owner or org" on public.football_shots
  for select using (
    exists (
      select 1 from public.football_players p
      where p.id = football_shots.player_id and p.user_id = (select auth.uid())
    )
    or player_id in (
      select football_players.id from public.football_players
      where football_players.org_id in (
        select football_org_members.org_id from public.football_org_members
        where football_org_members.user_id = (select auth.uid())
      )
    )
  );
drop policy "own shots select" on public.football_shots;
drop policy "org members can view org player shots" on public.football_shots;

-- NOT merged, deliberately: football_players DELETE, football_profiles
-- INSERT/UPDATE, football_sessions INSERT/UPDATE and every football_devices
-- and football_organizations policy each have a single policy for their
-- command. There is nothing to consolidate and no reason to touch them.
