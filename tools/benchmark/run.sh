#!/usr/bin/env bash
# Data-layer benchmark against a disposable Postgres. See README.md.
#
# Never run this against production: it seeds hundreds of thousands of rows.
set -euo pipefail

CONTAINER=sfb-bench
IMAGE=postgres:17-alpine
DB=bench
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../.." && pwd)"

psql_run() { docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -v ON_ERROR_STOP=1 -q "$@"; }

echo "==> starting $IMAGE as $CONTAINER"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=bench -e POSTGRES_DB="$DB" "$IMAGE" >/dev/null

for _ in $(seq 1 30); do
  docker exec "$CONTAINER" pg_isready -U postgres -d "$DB" >/dev/null 2>&1 && break
  sleep 2
done
docker exec "$CONTAINER" psql -U postgres -d "$DB" -tAc 'select version()' | cut -c1-40

echo "==> supabase compatibility shim"
psql_run < "$HERE/00_supabase_shim.sql"

echo "==> applying repository migrations"
for f in "$REPO"/supabase/migrations/*.sql; do
  printf '    %-56s ' "$(basename "$f")"
  psql_run < "$f" && echo ok
done

echo "==> seeding synthetic dataset (this takes a minute)"
psql_run < "$HERE/01_seed.sql"

echo "==> correctness: RLS visibility and aggregate agreement"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -q < "$HERE/02_correctness.sql"

# First pass warms the cache; a cold first touch made a 40-row table look like
# it took 100 ms. The second pass is the one worth reading.
echo "==> performance pass 1 of 2 (warming)"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -q < "$HERE/03_performance.sql" >/dev/null 2>&1

echo "==> performance pass 2 of 2 (reported)"
docker exec -i "$CONTAINER" psql -U postgres -d "$DB" -q < "$HERE/03_performance.sql"

echo
echo "Container $CONTAINER is still running so you can inspect it:"
echo "    docker exec -it $CONTAINER psql -U postgres -d $DB"
echo "Remove it with:"
echo "    docker rm -f $CONTAINER"
