-- Reconstructed from live schema introspection (see note in the baseline
-- migration above) -- adds date-of-birth and avatar fields used by the
-- onboarding flow (src/pages/onboarding/DOBInput.jsx) and profile pages.

alter table public.football_profiles add column dob date;
alter table public.football_profiles add column avatar_url text;

alter table public.football_players add column dob date;
alter table public.football_players add column avatar_url text;
