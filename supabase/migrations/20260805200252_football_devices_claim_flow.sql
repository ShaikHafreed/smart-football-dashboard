-- A device exists (self-registered by firmware) before anyone claims it.
alter table public.football_devices alter column owner_id drop not null;

-- Let a signed-in user claim any currently-unclaimed device by device_uid.
-- Existing "owners can update their own devices" policy still covers
-- renaming/deactivating a device you already own.
create policy "anyone signed in can claim an unclaimed device"
  on public.football_devices for update
  using (owner_id is null)
  with check (owner_id = auth.uid());
