#!/usr/bin/env bash
set -euo pipefail

PORT="${PORT:-3001}"

listener_pids() {
  if command -v lsof >/dev/null 2>&1; then
    lsof -tiTCP:"${PORT}" -sTCP:LISTEN 2>/dev/null || true
    return
  fi

  if command -v fuser >/dev/null 2>&1; then
    fuser "${PORT}/tcp" 2>/dev/null | tr ' ' '\n' | sed '/^$/d' || true
  fi
}

stop_stale_listener() {
  local pids
  pids="$(listener_pids | sort -u | tr '\n' ' ')"
  if [ -z "${pids// /}" ]; then
    return
  fi

  echo "LifeMap: stopping stale listener on port ${PORT}: ${pids}"
  kill ${pids} 2>/dev/null || true

  for _ in 1 2 3 4 5; do
    sleep 1
    if [ -z "$(listener_pids)" ]; then
      return
    fi
  done

  pids="$(listener_pids | sort -u | tr '\n' ' ')"
  if [ -n "${pids// /}" ]; then
    echo "LifeMap: forcing stale listener shutdown: ${pids}"
    kill -9 ${pids} 2>/dev/null || true
    sleep 1
  fi
}

stop_stale_listener

echo "LifeMap: building UI..."
npm run build

echo "LifeMap: starting unified UI + API on port ${PORT}..."
exec node server.js
