-- Minimum Supabase surface the real migrations depend on, so they can be
-- applied verbatim to a vanilla Postgres container.
--
-- This is NOT a reimplementation of Supabase. It provides only the four
-- things the football migrations reference, so that the schema, indexes,
-- policies and aggregates under test are the ones from the repository rather
-- than a hand-rewritten approximation.

-- 1. auth.users, referenced by every owner_id / user_id foreign key.
create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key,
  email text
);

-- 2. auth.uid(), read from the same request.jwt.claims GUC Supabase uses, so
--    a policy written for production behaves the same way here.
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(
    coalesce(
      nullif(current_setting('request.jwt.claim.sub', true), ''),
      (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
    ),
    ''
  )::uuid;
$$;

-- 3. The roles the migrations grant to.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

grant usage on schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;

-- The migrations create tables and then grant on views; PostgREST would
-- normally hold table grants. Mirror that so RLS is what limits access here,
-- exactly as in production, rather than a missing grant.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

-- 4. The realtime publication the live-reading migration adds tables to.
do $$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;
end $$;
