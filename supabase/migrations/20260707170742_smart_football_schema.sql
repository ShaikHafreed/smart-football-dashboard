-- Baseline snapshot of the schema as it existed before this migration
-- history started being tracked in the repo. Reconstructed from the live
-- database via introspection (including pg_policies) on 2026-08-05, not a
-- byte-for-byte replay of the original migration -- that SQL was never
-- captured anywhere. This is the exact schema + RLS those two untracked
-- migrations left behind, verified column-by-column and policy-by-policy
-- against the live project rather than assumed from application code.
--
-- Only the football_* tables are covered. This Supabase project is shared
-- with an unrelated app (roles, categories, products, temper_boxes,
-- temper_box_items, users, activity_logs, alembic_version) -- those are
-- intentionally out of scope and untouched by anything in this repo.

create table public.football_profiles (
  id uuid primary key references auth.users(id),
  full_name text,
  role text not null default 'coach',
  created_at timestamptz not null default now()
);

alter table public.football_profiles enable row level security;

create table public.football_players (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  name text not null,
  created_at timestamptz not null default now()
);

alter table public.football_players enable row level security;

create table public.football_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id),
  player_id uuid references public.football_players(id),
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

alter table public.football_sessions enable row level security;

create table public.football_shots (
  id uuid primary key default gen_random_uuid(),
  player_id uuid references public.football_players(id),
  session_id uuid references public.football_sessions(id),
  speed numeric,
  spin numeric,
  force numeric,
  distance numeric,
  shot_type text,
  created_at timestamptz not null default now()
);

alter table public.football_shots enable row level security;

-- football_profiles: a user can create/read/update only their own profile
-- row. No delete policy exists -- profiles are not user-deletable today.
create policy "own profile insert" on public.football_profiles
  for insert with check (auth.uid() = id);
create policy "own profile select" on public.football_profiles
  for select using (auth.uid() = id);
create policy "own profile update" on public.football_profiles
  for update using (auth.uid() = id);

-- football_players: full CRUD, scoped to rows the signed-in user owns.
create policy "own players select" on public.football_players
  for select using (auth.uid() = user_id);
create policy "own players insert" on public.football_players
  for insert with check (auth.uid() = user_id);
create policy "own players update" on public.football_players
  for update using (auth.uid() = user_id);
create policy "own players delete" on public.football_players
  for delete using (auth.uid() = user_id);

-- football_sessions: create/read/update your own sessions. No delete
-- policy -- a session, once created, can be ended but not removed.
create policy "own sessions select" on public.football_sessions
  for select using (auth.uid() = user_id);
create policy "own sessions insert" on public.football_sessions
  for insert with check (auth.uid() = user_id);
create policy "own sessions update" on public.football_sessions
  for update using (auth.uid() = user_id);

-- football_shots: READ ONLY for end users, scoped via the owning player.
-- There is deliberately no insert/update/delete policy here -- every shot
-- is written by the Flask backend using the Supabase service role key,
-- which bypasses RLS entirely. A regular authenticated user can never
-- write a shot row directly through the client.
create policy "own shots select" on public.football_shots
  for select using (
    exists (
      select 1 from football_players p
      where p.id = football_shots.player_id and p.user_id = auth.uid()
    )
  );
