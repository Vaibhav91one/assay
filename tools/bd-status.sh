#!/usr/bin/env bash
# Poll one Bright Data snapshot until it stops running.
#   BRIGHTDATA_API_TOKEN=... tools/bd-status.sh j_xxxxx
# Token comes from the environment or a local .env - never hardcoded, never committed.
set -u
[ -f .env ] && set -a && . ./.env && set +a
SNAP="${1:?snapshot id required}"
: "${BRIGHTDATA_API_TOKEN:?set BRIGHTDATA_API_TOKEN}"
mkdir -p results

for i in $(seq 1 60); do
  body=$(curl -s -m 30 -H "Authorization: Bearer ${BRIGHTDATA_API_TOKEN}" \
    "https://api.brightdata.com/dca/dataset?id=${SNAP}" 2>/dev/null) || true
  first=$(printf '%s' "$body" | head -c 1)
  if [ "$first" = "[" ]; then
    n=$(printf '%s' "$body" | python3 -c 'import sys,json;print(len(json.load(sys.stdin)))' 2>/dev/null || echo "?")
    printf '%s' "$body" > "results/${SNAP}.json"
    echo "READY records=${n} -> results/${SNAP}.json"
    exit 0
  fi
  status=$(printf '%s' "$body" | python3 -c 'import sys,json;d=json.load(sys.stdin);print(d.get("status") or d.get("message") or str(d)[:120])' 2>/dev/null || echo "unparsed:$(printf '%s' "$body" | head -c 80)")
  case "$status" in
    *ailed*|*rror*|*ancel*) echo "TERMINAL ${status}"; exit 1 ;;
  esac
  echo "poll ${i}: ${status}"
  sleep 20
done
echo "TIMEOUT after 20 minutes"; exit 2
