#!/usr/bin/env bash
set -u

CODESPACE_ARG=()

if [ -n "${CODESPACE_NAME:-}" ]; then
  CODESPACE_ARG=(--codespace "$CODESPACE_NAME")
fi

if ! command -v gh >/dev/null 2>&1; then
  echo "GitHub CLI is not available; skipping Codespaces port visibility update."
  exit 0
fi

for attempt in 1 2 3 4 5; do
  if gh codespace ports visibility 3001:public "${CODESPACE_ARG[@]}" >/tmp/lifemap-public-ports.log 2>&1; then
    echo "LifeMap Codespaces port is public: 3001."
    exit 0
  fi
  sleep 2
done

echo "Could not automatically make port 3001 public. You can run manually:"
echo "gh codespace ports visibility 3001:public ${CODESPACE_NAME:+--codespace $CODESPACE_NAME}"
cat /tmp/lifemap-public-ports.log 2>/dev/null || true
exit 0
