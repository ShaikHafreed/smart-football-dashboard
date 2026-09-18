-- Device identity and claiming hardening.
--
-- Before this, a football device could be taken by anyone: every signed-in
-- user could list every unclaimed device (football_devices_claimable) and
-- claim any of them with a plain UPDATE, so pairing was first-come rather
-- than proof of physically holding the ball. Device tokens were also stored
-- in plaintext, so a database dump handed over working ingest credentials
-- for the whole fleet.

alter table public.football_devices
  -- SHA-256 of the ingest token. The token itself is never stored again.
  add column device_token_hash text,
  -- SHA-256 of device_uid + ':' + the pairing code the board generates on
  -- first boot and prints to its serial monitor. Salted with the uid so one
  -- precomputed table can't cover every device. Proving knowledge of this
  -- code is what claiming now requires.
  add column pairing_code_hash text,
  add column claimed_at timestamptz;

-- device_token becomes transitional: rows written before this migration keep
-- their plaintext value until that device's next authenticated request,
-- which swaps it for a hash and nulls this column (see authenticate_device
-- in backend/server.py). New registrations never populate it -- hence
-- nullable. Existing devices keep working; nothing is re-provisioned blindly.
alter table public.football_devices alter column device_token drop not null;

-- Claiming is no longer something a client can do on its own. It runs
-- through POST /api/device/claim, which verifies the pairing code with the
-- service role -- the server is the only authority on ownership transitions.
drop policy if exists "anyone signed in can claim an unclaimed device" on public.football_devices;

-- ...and the view that existed only to power that flow goes with it. It told
-- every signed-in user exactly which balls were sitting unclaimed, which is
-- an inventory of what to grab. Pairing is now by device id + code, entered
-- by someone holding the device, so nothing needs listing.
drop view if exists public.football_devices_claimable;

-- The remaining football_devices policies are unchanged and still scope
-- every row to its owner:
--   "owners can view their own devices"    select using (owner_id = auth.uid())
--   "owners can insert their own devices"  insert with check (owner_id = auth.uid())
--   "owners can update their own devices"  update using (owner_id = auth.uid())
--   "owners can delete their own devices"  delete using (owner_id = auth.uid())
-- Postgres applies an UPDATE policy's USING clause as its WITH CHECK when no
-- WITH CHECK is given, so an owner still cannot hand a row to another user
-- (or un-own it) directly from the client -- that path is /api/device/release,
-- which also revokes the device's credentials rather than leaving a live
-- token pointing at a ball someone else now holds.
