-- A signed-in user needs to look up an unclaimed device by device_uid
-- before they can claim it, but RLS filters rows, not columns -- a select
-- policy directly on football_devices would expose device_token (the
-- firmware's secret ingest credential) to anyone who queries an unclaimed
-- row. This view exposes only the four columns that are safe to show
-- during pairing, never the token.
create view public.football_devices_claimable
with (security_invoker = false) as
select id, device_uid, name, created_at
from public.football_devices
where owner_id is null;

grant select on public.football_devices_claimable to authenticated;
