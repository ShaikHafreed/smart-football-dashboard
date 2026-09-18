-- SYNTHETIC benchmark dataset. Never run this against production.
--
-- Deterministic by construction: every value is derived arithmetically from
-- a row index or from hashtext() of a stable key, so two runs produce the
-- same database and a plan difference means a real change, not a reshuffle.
--
-- Shape is chosen to exercise the things the schema actually has to survive:
-- players shared through an organization as well as solo ones, sessions of
-- realistic length, shots spread over months rather than clustered, and one
-- player with an outsized history so the per-player index has something to
-- earn its keep against.

\set ON_ERROR_STOP on

-- ==========================================
-- Accounts
-- ==========================================
insert into auth.users (id, email)
select ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'bench' || n || '@example.test'
from generate_series(1, 12) n;

insert into public.football_profiles (id, full_name, role, created_at)
select id,
       'Bench User ' || right(id::text, 3),
       case when right(id::text, 1)::int % 3 = 0 then 'coach' else 'player' end,
       now() - interval '200 days'
from auth.users;

-- ==========================================
-- Organizations: three academies, coaches 1-6 spread across them
-- ==========================================
insert into public.football_organizations (id, name, invite_code, owner_id, created_at)
select ('10000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'Bench Academy ' || n,
       'BENCH' || lpad(n::text, 3, '0'),
       ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       now() - interval '190 days'
from generate_series(1, 3) n;

-- The owner trigger already enrolled each owner as admin; add the rest.
insert into public.football_org_members (org_id, user_id, role, joined_at)
select ('10000000-0000-4000-8000-' || lpad((((n - 1) % 3) + 1)::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'coach',
       now() - interval '180 days'
from generate_series(4, 6) n
on conflict do nothing;

-- ==========================================
-- Players: 24 shared through an org, 16 solo
-- ==========================================
insert into public.football_players (id, user_id, name, org_id, created_at)
select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((((n - 1) % 6) + 1)::text, 12, '0'))::uuid,
       'Bench Player ' || n,
       ('10000000-0000-4000-8000-' || lpad((((n - 1) % 3) + 1)::text, 12, '0'))::uuid,
       now() - interval '170 days'
from generate_series(1, 24) n;

insert into public.football_players (id, user_id, name, org_id, created_at)
select ('20000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad((((n - 1) % 12) + 1)::text, 12, '0'))::uuid,
       'Bench Solo Player ' || n,
       null,
       now() - interval '170 days'
from generate_series(25, 40) n;

-- ==========================================
-- Devices: one per coach-ish account
-- ==========================================
insert into public.football_devices (id, owner_id, device_uid, device_token_hash, pairing_code_hash,
                                     name, is_active, created_at, claimed_at)
select ('30000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       ('00000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       'BENCHUID' || lpad(n::text, 8, '0'),
       md5('token' || n),
       md5('pair' || n),
       'Bench Ball ' || n,
       true,
       now() - interval '160 days',
       now() - interval '160 days'
from generate_series(1, 12) n;

-- ==========================================
-- Sessions: 600 across 180 days, each closed.
-- The partial unique index allows only one OPEN session per device, so every
-- seeded session is given an ended_at; the open-session case is exercised
-- separately in the benchmark.
-- ==========================================
insert into public.football_sessions (id, user_id, player_id, device_id, started_at, ended_at)
select ('40000000-0000-4000-8000-' || lpad(n::text, 12, '0'))::uuid,
       p.user_id,
       p.id,
       ('30000000-0000-4000-8000-' || lpad((((n - 1) % 12) + 1)::text, 12, '0'))::uuid,
       now() - ((180 - (n % 180)) * interval '1 day') - interval '2 hours',
       now() - ((180 - (n % 180)) * interval '1 day') - interval '1 hour'
from generate_series(1, 600) n
join lateral (
  -- Player 1 gets a disproportionate share, so one player's history is large
  -- enough for the per-player index to matter.
  select id, user_id from public.football_players
  where id = case when n % 4 = 0
                  then '20000000-0000-4000-8000-000000000001'::uuid
                  else ('20000000-0000-4000-8000-' || lpad((((n - 1) % 40) + 1)::text, 12, '0'))::uuid
             end
) p on true;

-- ==========================================
-- Shots: ~500 per session, timestamps inside the session window.
-- Values use the post-calibration-honesty scales: speed is a 0-100 index,
-- force is in g (<=16), spin in rpm (<=333), carry is the derived index.
-- ==========================================
insert into public.football_shots (player_id, session_id, speed, spin, force, distance, shot_type, created_at, device_id)
select s.player_id,
       s.id,
       idx.speed,
       idx.spin,
       idx.force,
       round((idx.speed * 1.5)::numeric, 2),
       case when (g + abs(hashtext(s.id::text))) % 5 = 0 then 'pass' else 'kick' end,
       s.started_at + (g * interval '7 seconds'),
       s.device_id
from public.football_sessions s
cross join lateral generate_series(1, 450 + (abs(hashtext(s.id::text)) % 100)) g
cross join lateral (
  select
    round((20 + ((abs(hashtext(s.id::text || g::text)) % 8000) / 100.0))::numeric, 2) as speed,
    round((((abs(hashtext(g::text || s.id::text)) % 33300) / 100.0))::numeric, 2)     as spin,
    round((1 + ((abs(hashtext('f' || s.id::text || g::text)) % 1500) / 100.0))::numeric, 2) as force
) idx;

analyze;

select 'players'  as tbl, count(*) from public.football_players
union all select 'sessions', count(*) from public.football_sessions
union all select 'shots',    count(*) from public.football_shots
union all select 'devices',  count(*) from public.football_devices
union all select 'orgs',     count(*) from public.football_organizations
union all select 'members',  count(*) from public.football_org_members;
