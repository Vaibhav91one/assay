#!/usr/bin/env bash
# Bring Assay up on Apple Container (Apple Silicon, macOS).
#
# Apple declined to make Compose a core feature, and the community shims are
# immature -- so this is plain `container` CLI, mirroring what
# docker-compose.yml does. Idempotent: safe to re-run.
#
#   ./scripts/container-up.sh

set -euo pipefail

NET=assay
PGVOL=assay-pgdata
CAPVOL=assay-captures
IMAGE=assay:local
PGPASS=assay
# Host ports are overridable: a self-hoster with Postgres already on 5432 (or
# anything on 3000) should get a working stack, not a cryptic bind failure.
PGPORT="${ASSAY_PGPORT:-5432}"
WEBPORT="${ASSAY_WEBPORT:-3000}"
# DBURL is built after postgres starts -- see the IP lookup below. Apple
# Container has no container-name DNS, so the host part is an address.

command -v container >/dev/null || {
  echo "error: Apple 'container' CLI not found. https://github.com/apple/container" >&2
  exit 1
}
container system status >/dev/null 2>&1 || {
  echo "error: container system is not running. Try: container system start" >&2
  exit 1
}

# `container X create` errors if the object exists, so check rather than
# swallow -- a swallowed error hides the failure that actually matters.
exists() { container "$1" list --quiet 2>/dev/null | grep -qx "$2"; }

exists network "$NET"   || container network create "$NET"
exists volume  "$PGVOL" || container volume create "$PGVOL"
exists volume  "$CAPVOL" || container volume create "$CAPVOL"

echo "==> building $IMAGE"
container build --tag "$IMAGE" .

# `list --quiet` shows only RUNNING containers; `--all` includes stopped ones.
# Both matter: a stopped container still holds its name, so `run --name` would
# collide on a second invocation. That is what makes this re-runnable.
running() { container list --quiet 2>/dev/null | grep -qx "$1"; }
present() { container list --all --quiet 2>/dev/null | grep -qx "$1"; }

if running assay-postgres; then
  echo "==> postgres already running"
elif present assay-postgres; then
  echo "==> restarting existing postgres"
  container start assay-postgres
else
  echo "==> starting postgres"
  container run --detach --name assay-postgres --network "$NET" \
    --env POSTGRES_USER=assay \
    --env POSTGRES_PASSWORD="$PGPASS" \
    --env POSTGRES_DB=assay \
    --env PGDATA=/var/lib/postgresql/data/pgdata \
    --volume "$PGVOL:/var/lib/postgresql/data" \
    --publish "${PGPORT}:5432" \
    postgres:17-alpine
fi

echo "==> waiting for postgres"
for i in $(seq 1 30); do
  if container exec assay-postgres pg_isready -U assay >/dev/null 2>&1; then
    echo "    ready after ${i}s"; break
  fi
  [ "$i" -eq 30 ] && { echo "error: postgres never became ready" >&2; container logs assay-postgres >&2; exit 1; }
  sleep 1
done

# Apple Container does not resolve container names between containers, and the
# only name-based alternative (`container system dns create`) needs admin
# rights -- which a self-host script has no business demanding. So: read the
# address off the running container. Docker Compose gives you service-name DNS
# for free; this is the one place the two paths genuinely differ.
PGIP=$(container inspect assay-postgres 2>/dev/null \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); d=d[0] if isinstance(d,list) else d; print(d["status"]["networks"][0]["ipv4Address"].split("/")[0])' 2>/dev/null || true)
[ -n "${PGIP:-}" ] || { echo "error: could not read postgres address from 'container inspect'" >&2; exit 1; }
DBURL="postgres://assay:${PGPASS}@${PGIP}:5432/assay"
echo "==> postgres at ${PGIP}"

echo "==> migrating schema"
container run --rm --network "$NET" \
  --env DATABASE_URL="$DBURL" \
  "$IMAGE" npm run db:migrate

# Replace web outright rather than restarting: it must pick up the image just
# built, and a restart would silently run the old one.
if present assay-web; then
  echo "==> replacing web"
  running assay-web && container stop assay-web >/dev/null
  container rm assay-web >/dev/null
fi

echo "==> starting web"
container run --detach --name assay-web --network "$NET" \
  --env DATABASE_URL="$DBURL" \
  --env ASSAY_CAPTURES=/data/captures \
  --env "AUTH_MODE=${AUTH_MODE:-none}" \
  --volume "$CAPVOL:/data/captures" \
  --publish "${WEBPORT}:3000" \
  "$IMAGE"

# The worker lands in D3; tools/worker.js does not exist yet. When it does,
# start it here with the same env and the captures volume.

echo
echo "up. http://localhost:${WEBPORT}    logs: container logs -f assay-web"
