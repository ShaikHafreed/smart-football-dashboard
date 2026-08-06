-- Live sensor snapshot, updated on every reading (not just detected
-- kicks), so the Dashboard can subscribe to this row via Realtime instead
-- of polling /data every second.
alter table public.football_devices
  add column last_speed numeric,
  add column last_spin numeric,
  add column last_force numeric,
  add column last_distance numeric,
  add column last_shot text,
  add column last_reading_at timestamptz;

-- Enable Realtime on the tables the frontend needs to subscribe to.
-- Row-level security still applies to Realtime subscriptions -- a client
-- only ever receives change events for rows it could already SELECT.
alter publication supabase_realtime add table public.football_devices;
alter publication supabase_realtime add table public.football_shots;
