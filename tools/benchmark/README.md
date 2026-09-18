# Data-layer benchmark

Runs the project's real migrations against a disposable Postgres container,
fills it with a deterministic synthetic dataset, and measures what the
application's actual queries do at a volume production has never seen.

**Never point this at production.** It creates hundreds of thousands of rows.

## Running it

Needs Docker. Nothing is installed on the host.

```bash
bash tools/benchmark/run.sh
```

That will:

1. start `postgres:17-alpine` as a throwaway container (`sfb-bench`),
2. apply `00_supabase_shim.sql` — the minimum Supabase surface the migrations
   reference (`auth.users`, `auth.uid()`, the `anon`/`authenticated` roles, the
   realtime publication), so the **real** migrations apply unmodified,
3. apply every migration in `supabase/migrations/` in order,
4. seed `01_seed.sql`,
5. run `02_correctness.sql` and `03_performance.sql`,
6. leave the container running so you can poke at it, and print how to remove it.

## What each file is for

| File | Purpose |
|---|---|
| `00_supabase_shim.sql` | Supabase compatibility, so migrations run on vanilla Postgres |
| `01_seed.sql` | Deterministic synthetic dataset (~300k shots) |
| `02_correctness.sql` | RLS visibility and aggregate results vs independent references |
| `03_performance.sql` | `EXPLAIN (ANALYZE, BUFFERS)` for the real frontend query shapes |

## Reading the results

**Correctness is the part that transfers.** Row counts, RLS visibility and
aggregate agreement are properties of the schema and the queries, so a result
here means the same thing in production.

**Timings are not.** They come from a container on whatever machine ran them.
Use them to compare plans against each other, never as a prediction of
production latency. The durable number in a plan is the row count: "135,181
rows examined to return 25" is true regardless of hardware.

## Two harness traps worth knowing

- **`SET LOCAL ROLE` outside a transaction is a no-op.** It warns and carries
  on as the table owner — and the owner bypasses RLS, so a probe will report
  that everything is visible and look like a catastrophic leak that is not
  real. Every identity probe here runs inside `BEGIN`/`COMMIT`.
- **Cold caches dominate the first run.** A 40-row table appeared to take
  100 ms on first touch. `run.sh` executes the performance pass twice and
  reports the second.

## Dataset shape

Deterministic: every value comes from a row index or `hashtext()` of a stable
key, so two runs produce the same database and a plan change means a real
change.

- 12 accounts, 3 organizations, 6 memberships
- 40 players — 24 shared through an organization, 16 solo
- 12 devices, 600 closed sessions across 180 days
- ~300,000 shots, ~500 per session, one player deliberately over-represented
  so a single player's history is large enough to matter

Values use the post-calibration scales: speed is a 0–100 index, force is in g,
spin in rpm, carry is the derived index.

No dataset file is committed — the seed regenerates it.
