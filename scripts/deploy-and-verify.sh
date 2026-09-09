#!/usr/bin/env bash
# Deploy to production, wait for Ready, then run the post-deploy smoke test.
#
# Usage:
#   npm run deploy:verify                    # deploy → wait Ready → smoke on https://anytimebot.app
#   SKIP_DEPLOY=1 npm run deploy:verify      # skip the deploy, just re-run the smoke test
#   APP_URL=<url> npm run deploy:verify      # smoke a different URL after deploy
#   MAX_WAIT_SEC=1200 npm run deploy:verify  # raise the build ceiling (default 900s)
#
# Exit 0 only when the deployment is Ready AND all smoke flows passed.
# On failure the Vercel build log is kept for inspection (path printed on exit).

set -uo pipefail

MAX_WAIT_SEC="${MAX_WAIT_SEC:-900}"      # ceiling for the build (default 15 min)
URL_WAIT_SEC="${URL_WAIT_SEC:-120}"      # ceiling for alias/URL propagation
LOG_FILE="${LOG_FILE:-/tmp/vercel-deploy-verify.log}"
TARGET_URL="${APP_URL:-https://anytimebot.app}"

if [ "${SKIP_DEPLOY:-0}" != "1" ]; then
  echo "==> Deploying to production (log: $LOG_FILE)"
  : > "$LOG_FILE"
  npx vercel --prod --yes >"$LOG_FILE" 2>&1 &
  DEPLOY_PID=$!

  echo "==> Waiting for build (max ${MAX_WAIT_SEC}s)…"
  elapsed=0
  while kill -0 "$DEPLOY_PID" 2>/dev/null && [ "$elapsed" -lt "$MAX_WAIT_SEC" ]; do
    if grep -qE "^Error:|Build failed" "$LOG_FILE" 2>/dev/null; then
      echo "✗ Build error detected:" >&2
      grep -E "^Error:|Build failed" "$LOG_FILE" | head -5 >&2
      kill "$DEPLOY_PID" 2>/dev/null
      exit 1
    fi
    sleep 10
    elapsed=$((elapsed + 10))
  done

  if kill -0 "$DEPLOY_PID" 2>/dev/null; then
    echo "✗ Deploy did not finish within ${MAX_WAIT_SEC}s" >&2
    tail -5 "$LOG_FILE" >&2
    kill "$DEPLOY_PID" 2>/dev/null
    exit 1
  fi
  wait "$DEPLOY_PID"; DEPLOY_EXIT=$?

  # Vercel prints "Production: <url>" only on success.
  if [ "$DEPLOY_EXIT" -ne 0 ] || ! grep -q "Production:" "$LOG_FILE"; then
    echo "✗ Deploy failed (exit $DEPLOY_EXIT)" >&2
    tail -20 "$LOG_FILE" >&2
    exit 1
  fi
  echo "==> Deployed: $(grep -m1 'Production:' "$LOG_FILE" | sed 's/\x1b\[[0-9;]*m//g')"
else
  echo "==> SKIP_DEPLOY=1 — running the smoke test only"
fi

# --- Wait for the public URL to answer (alias propagation) ---
echo "==> Waiting for $TARGET_URL to answer (max ${URL_WAIT_SEC}s)…"
elapsed=0
url_ok=""
while [ "$elapsed" -lt "$URL_WAIT_SEC" ]; do
  code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$TARGET_URL/" 2>/dev/null)
  if [ "$code" = "200" ]; then
    url_ok=1
    break
  fi
  sleep 5
  elapsed=$((elapsed + 5))
done
if [ -z "$url_ok" ]; then
  echo "✗ $TARGET_URL did not answer 200 within ${URL_WAIT_SEC}s (last: ${code:-none})" >&2
  exit 1
fi
echo "==> $TARGET_URL is live"

# --- Run the smoke test (login + booking + payment) ---
echo "==> Running smoke test…"
if npm run --silent smoke; then
  echo ""
  echo "✓ DEPLOY VERIFIED — production is up and all smoke flows passed"
  exit 0
else
  echo "" >&2
  echo "✗ Deploy finished but SMOKE FAILED — see output above. Build log: $LOG_FILE" >&2
  exit 1
fi
