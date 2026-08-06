-- Device identity: one row per physical ball, owned by the account that paired it.
create table public.football_devices (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  device_uid text not null unique,       -- stable hardware id (ESP32 chip id / MAC), set at pairing
  device_token text not null,            -- secret the firmware presents on every ingest request
  name text not null default 'My Football',
  firmware_version text,
  battery_pct int,
  wifi_rssi int,
  last_seen_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

alter table public.football_devices enable row level security;

create policy "owners can view their own devices"
  on public.football_devices for select
  using (owner_id = auth.uid());

create policy "owners can insert their own devices"
  on public.football_devices for insert
  with check (owner_id = auth.uid());

create policy "owners can update their own devices"
  on public.football_devices for update
  using (owner_id = auth.uid());

create policy "owners can delete their own devices"
  on public.football_devices for delete
  using (owner_id = auth.uid());

-- Attribute every shot and session to the physical device that produced it.
alter table public.football_shots
  add column device_id uuid references public.football_devices(id) on delete set null;

alter table public.football_sessions
  add column device_id uuid references public.football_devices(id) on delete set null;

create index football_shots_device_id_idx on public.football_shots(device_id);
create index football_sessions_device_id_idx on public.football_sessions(device_id);
create index football_devices_owner_id_idx on public.football_devices(owner_id);
