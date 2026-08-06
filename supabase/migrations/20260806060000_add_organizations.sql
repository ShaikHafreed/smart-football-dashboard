-- An organization is an academy/club/team that multiple coaches share a
-- roster under, instead of every coach's players being visible only to
-- that one coach's account.
create table public.football_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  invite_code text not null unique default substr(md5(random()::text), 1, 8),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.football_organizations enable row level security;

create table public.football_org_members (
  org_id uuid not null references public.football_organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'coach' check (role in ('admin', 'coach')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);

alter table public.football_org_members enable row level security;

create policy "members can view their org"
  on public.football_organizations for select
  using (id in (select org_id from public.football_org_members where user_id = auth.uid()));

create policy "creator can create an org"
  on public.football_organizations for insert
  with check (owner_id = auth.uid());

create policy "owner can update their org"
  on public.football_organizations for update
  using (owner_id = auth.uid());

create policy "members can view org roster"
  on public.football_org_members for select
  using (org_id in (select org_id from public.football_org_members where user_id = auth.uid()));

-- The org creator is auto-enrolled as its first admin member via trigger,
-- rather than a client-side insert (avoids a chicken/egg RLS check: you
-- can't satisfy "members can view org roster" before you're a member).
create or replace function public.add_owner_as_org_admin()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.football_org_members (org_id, user_id, role)
  values (new.id, new.owner_id, 'admin');
  return new;
end;
$$;

create trigger trg_add_owner_as_admin
  after insert on public.football_organizations
  for each row execute function public.add_owner_as_org_admin();

-- Join-by-code: security definer so it can look up an org by invite_code
-- (deliberately not selectable directly -- see below) and enroll the
-- calling user, in one atomic step.
create or replace function public.join_org_by_code(code text)
returns public.football_organizations
language plpgsql
security definer
set search_path = public
as $$
declare
  org public.football_organizations;
begin
  select * into org from public.football_organizations where invite_code = code;
  if org.id is null then
    raise exception 'Invalid invite code';
  end if;

  insert into public.football_org_members (org_id, user_id, role)
  values (org.id, auth.uid(), 'coach')
  on conflict (org_id, user_id) do nothing;

  return org;
end;
$$;

grant execute on function public.join_org_by_code(text) to authenticated;

-- Share players (and their shots/sessions) across every coach in the
-- same org, on top of -- not instead of -- the existing single-owner
-- policies, so a solo coach with no org keeps working exactly as before.
alter table public.football_players add column org_id uuid references public.football_organizations(id) on delete set null;

create index football_players_org_id_idx on public.football_players(org_id);

create policy "org members can view org players"
  on public.football_players for select
  using (org_id in (select org_id from public.football_org_members where user_id = auth.uid()));

create policy "org members can add org players"
  on public.football_players for insert
  with check (org_id in (select org_id from public.football_org_members where user_id = auth.uid()));

create policy "org members can update org players"
  on public.football_players for update
  using (org_id in (select org_id from public.football_org_members where user_id = auth.uid()));

create policy "org members can view org player shots"
  on public.football_shots for select
  using (
    player_id in (
      select id from public.football_players
      where org_id in (select org_id from public.football_org_members where user_id = auth.uid())
    )
  );

create policy "org members can view org player sessions"
  on public.football_sessions for select
  using (
    player_id in (
      select id from public.football_players
      where org_id in (select org_id from public.football_org_members where user_id = auth.uid())
    )
  );
