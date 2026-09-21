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
| `04_scale_1m.sql` | Additive top-up from ~300k to ~1M shots, to see the scaling trend |
| `05_pagination.sql` | OFFSET vs keyset vs a bounded date range, plus the scan-bound aggregates |
| `06_pagination_correctness.sql` | Walks the keyset pager against the OFFSET pager row by row |

`04`, `05` and `06` are run by hand against the container `run.sh` leaves
behind, in that order:

```bash
docker exec -i sfb-bench psql -U postgres -d bench -q < tools/benchmark/05_pagination.sql   # 300k
docker exec -i sfb-bench psql -U postgres -d bench -v ON_ERROR_STOP=1 -q < tools/benchmark/04_scale_1m.sql
docker exec -i sfb-bench psql -U postgres -d bench -q < tools/benchmark/05_pagination.sql   # 1M
docker exec -i sfb-bench psql -U postgres -d bench -q < tools/benchmark/06_pagination_correctness.sql
```

Run `05` twice at each scale and read the second; the first pass warms the
cache.

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

## What the evidence said (2026-09-21, 300k and 1M synthetic shots)

Postgres 17.11 in a container on a laptop, read as an authenticated user with
RLS in force. Milliseconds compare plans against each other and are not a
prediction of production latency; the row counts and the *shape* of the curve
are the parts that transfer.

### Pagination: depth, not table size, is what hurts

| | 300k | 1M |
|---|---|---|
| OFFSET, page 1 | 1.0 ms | 2.1 ms |
| OFFSET, page 11 | 1.5 ms | 3.1 ms |
| OFFSET, page 201 | 99.8 ms | 166.5 ms |
| OFFSET, page 1001 | 1852 ms | 1928 ms |
| Keyset, depth 250 | 1.2 ms | 1.9 ms |
| Keyset, depth 5,000 | 0.5 ms | 0.5 ms |
| Keyset, depth 25,000 | 1.2 ms | 0.5 ms |

OFFSET walks and throws away every row before the page, so its cost tracks
how deep you are rather than how big the table is. The keyset seeks to the
boundary through `football_shots_created_at_idx` and reads the page: flat at
every depth measured, at both scales.

`06_pagination_correctness.sql` walks both pagers ten pages deep at 1M rows:
250 rows each, 0 duplicates, 0 position mismatches, 0 rows one saw and the
other missed, ordering strictly descending, and a player + 90-day filtered
walk with 0 rows outside the filter.

### Counting: the expensive half of a pager

| | 300k | 1M |
|---|---|---|
| `count(*)`, unbounded | 1190 ms | 1690 ms |
| `count(*)`, last 7 days | 109 ms | 101 ms |

The unbounded count is a sequential scan and grows with the table. A bounded
one is a bitmap heap scan over a window and stays flat as history grows.

### The aggregates are still scan-bound, and that is still fine

| | 300k | 1M |
|---|---|---|
| Leaderboard, top 100 | 1638 ms | 2362 ms |
| Personal bests, one player | 1333 ms | 1663 ms |
| Shot-type totals, roster | 1253 ms | 1688 ms |

They grow sublinearly - 3.3x the rows costs about 1.3x the time - but they do
grow, and there is no index that fixes an aggregate over every row a viewer
can see.

**No rollup was built, deliberately.** Production holds zero shots. The
alternatives each cost something real:

- *Bounded windows* would change what the numbers mean. A personal best is
  all-time by definition; "best in the last 90 days" is a different statistic,
  not a faster version of the same one.
- *Materialized views* cannot be `security_invoker`. Every aggregate here is
  invoker-scoped so a viewer's own RLS applies before aggregation; a matview
  computes once, for everyone, and would have to be re-filtered afterwards or
  it leaks across organizations. That disqualifies it on security, not speed.
- *Incremental rollups* would work, and mean a trigger on the hot insert path,
  a backfill, a reconciliation story for when the two disagree, and RLS on the
  rollup table that matches RLS on the source. That is a lot of machinery to
  maintain against a table that is currently empty.

**Revisit when** a real organization passes roughly 250k shots, or the
leaderboard exceeds about a second against production data. Until there is
production evidence, an incremental rollup would be complexity bought with a
benchmark.
