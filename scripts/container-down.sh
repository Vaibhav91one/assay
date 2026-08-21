#!/usr/bin/env bash
# Tear down the Apple Container stack. Volumes survive unless --volumes is
# passed -- losing a database because a teardown script was tidy is not a
# trade anyone wants.
#
#   ./scripts/container-down.sh [--volumes]

set -euo pipefail

command -v container >/dev/null || { echo "error: 'container' CLI not found" >&2; exit 1; }

for c in assay-web assay-worker assay-postgres; do
  if container list --quiet 2>/dev/null | grep -qx "$c"; then
    echo "==> stopping $c"
    container stop "$c" >/dev/null
  fi
  container rm "$c" >/dev/null 2>&1 || true
done

if [ "${1:-}" = "--volumes" ]; then
  echo "==> deleting volumes (data loss)"
  container volume delete assay-pgdata assay-captures 2>/dev/null || true
fi

container network delete assay >/dev/null 2>&1 || true
echo "down."
