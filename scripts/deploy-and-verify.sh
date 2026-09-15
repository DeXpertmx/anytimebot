#!/usr/bin/env bash
# Deploy to production, wait for Ready, then run the post-deploy smoke test.
#
# Usage:
#   npm run deploy:verify                    # deploy → wait Ready → smoke on https://anytimebot.app
#   SKIP_DEPLOY=1 npm run deploy:verify      # skip the deploy, just re-run the smoke test
#   APP_URL=<url> npm run deploy:verify      # smoke a different URL after deploy
#   MAX_WAIT_SEC=1200 npm run deploy:verify  # raise the build ceiling (default 900s)
#   VERCEL_TOKEN=<token> npm run deploy:verify
#
# Credentials, first match wins:
#   1. $VERCEL_TOKEN                   — long-lived token (recommended for scripts/CI)
#   2. $VERCEL_TOKEN_FILE              — file holding a token (default ~/.vercel-token)
#   3. the interactive CLI session     — ~/.local/share/com.vercel.cli/auth.json
#
# The interactive session carries a short-lived access token that is rotated with a
# single-use refresh token. When two Vercel CLI commands run at the same time the
# rotation can race and the deploy dies with "Error: Not authorized". This script
# recognizes that specific failure, forces a session refresh and retries the deploy
# once, instead of reporting it as a build failure.
#
# Exit 0 only when the deployment is Ready AND all smoke flows passed.
# On failure the Vercel build log is kept for inspection (path printed on exit).

set -uo pipefail

MAX_WAIT_SEC="${MAX_WAIT_SEC:-900}"      # ceiling for the build (default 15 min)
URL_WAIT_SEC="${URL_WAIT_SEC:-120}"      # ceiling for alias/URL propagation
LOG_FILE="${LOG_FILE:-/tmp/vercel-deploy-verify.log}"
TARGET_URL="${APP_URL:-https://anytimebot.app}"
AUTH_RETRIES="${AUTH_RETRIES:-1}"        # extra attempts allowed after an auth failure

# --- Credentials -------------------------------------------------------------
TOKEN="${VERCEL_TOKEN:-}"
TOKEN_SOURCE="VERCEL_TOKEN env var"
if [ -z "$TOKEN" ]; then
  TOKEN_FILE="${VERCEL_TOKEN_FILE:-$HOME/.vercel-token}"
  if [ -s "$TOKEN_FILE" ]; then
    TOKEN="$(tr -d '[:space:]' < "$TOKEN_FILE")"
    TOKEN_SOURCE="$TOKEN_FILE"
  fi
fi
if [ -z "$TOKEN" ]; then
  TOKEN_SOURCE="interactive CLI session"
fi

# Prefer a locally installed CLI (reproducible) over fetching the latest via npx.
if [ -x node_modules/.bin/vercel ]; then
  VC_BIN=(node_modules/.bin/vercel)
else
  VC_BIN=(npx vercel)
fi

vc() {
  if [ -n "$TOKEN" ]; then
    "${VC_BIN[@]}" --token "$TOKEN" "$@"
  else
    "${VC_BIN[@]}" "$@"
  fi
}

# True when a Vercel CLI log shows an authentication/authorization failure.
is_auth_error() {
  grep -qiE "not authorized|unauthorized|invalid token|token (is )?expired|token is not valid" "$1" 2>/dev/null
}

# The build log is the source of truth, not the CLI exit code: a successful
# deploy can still exit non-zero (the CLI reports it after aliasing), and a killed
# local process does not cancel the remote build at all.
#
# IMPORTANT: `Production  <url>` is printed right after the UPLOAD, before the
# build even starts, so it does NOT mean the deploy shipped. `✓ Ready in` is the
# only marker the CLI prints once the build finished and the alias was promoted.
deploy_shipped() {
  grep -qF "✓ Ready in" "$LOG_FILE" 2>/dev/null
}

# Echoes the URL of the deployment this run produced (empty if not determinable).
deployed_url() {
  sed 's/\x1b\[[0-9;]*m//g' "$LOG_FILE" 2>/dev/null \
    | grep -oE 'https://anytimebot-[a-z0-9]+-[a-z0-9-]+\.vercel\.app' \
    | tail -1
}

# 0 = shipped, 1 = build error, 2 = credentials rejected, 3 = timed out.
wait_for_build() {
  local elapsed=0
  echo "==> Waiting for build (max ${MAX_WAIT_SEC}s)…"
  while :; do
    if deploy_shipped; then
      break
    fi
    # A hard CLI error: stop early and let the classification below decide
    # whether it was a build problem or a rejected credential.
    if grep -qE "^Error:" "$LOG_FILE" 2>/dev/null; then
      break
    fi
    if ! kill -0 "$DEPLOY_PID" 2>/dev/null; then
      break
    fi
    if [ "$elapsed" -ge "$MAX_WAIT_SEC" ]; then
      echo "✗ Deploy did not finish within ${MAX_WAIT_SEC}s" >&2
      tail -5 "$LOG_FILE" >&2
      kill "$DEPLOY_PID" 2>/dev/null
      return 3
    fi
    sleep 10
    elapsed=$((elapsed + 10))
  done

  wait "$DEPLOY_PID" 2>/dev/null

  if deploy_shipped; then
    echo "==> Deployed: ${DEPLOY_URL:-$(deployed_url)} ($(grep -m1 -F '✓ Ready in' "$LOG_FILE" | sed 's/\x1b\[[0-9;]*m//g'))"
    return 0
  fi
  if is_auth_error "$LOG_FILE"; then
    return 2
  fi
  return 1
}

if [ "${SKIP_DEPLOY:-0}" != "1" ]; then
  # --- Preflight: verify credentials before spending an upload/build ---------
  echo "==> Auth: $TOKEN_SOURCE"
  if [ -z "$TOKEN" ]; then
    echo "    (tip: a long-lived token in ~/.vercel-token is immune to session rotation)"
  fi
  echo "==> Checking Vercel authentication…"
  PREFLIGHT="$(vc whoami 2>&1)"
  if printf '%s' "$PREFLIGHT" | grep -qiE "not authorized|unauthorized|invalid token|no credentials|error:"; then
    echo "✗ Vercel authentication failed ($TOKEN_SOURCE):" >&2
    printf '%s\n' "$PREFLIGHT" | tail -5 >&2
    cat >&2 <<'HINT'

  Fix one of these, then re-run `npm run deploy:verify`:
    • npx vercel login                       # refresh the interactive session
    • printf '%s' '<token>' > ~/.vercel-token # long-lived token (never rotates)
    • VERCEL_TOKEN=<token> npm run deploy:verify
HINT
    exit 1
  fi
  echo "==> Authenticated as $(printf '%s\n' "$PREFLIGHT" | grep -v '^Vercel CLI' | grep -v '^$' | tail -1)"

  # --- Deploy (retrying once if the credentials were rejected) ---------------
  attempt=0
  while :; do
    attempt=$((attempt + 1))
    echo "==> Deploying to production (attempt ${attempt}, log: $LOG_FILE)"
    : > "$LOG_FILE"
    vc --prod --yes </dev/null >"$LOG_FILE" 2>&1 &
    DEPLOY_PID=$!
    trap 'kill "$DEPLOY_PID" 2>/dev/null' INT TERM

    DEPLOY_URL="$(deployed_url)"
    wait_for_build
    status=$?
    DEPLOY_URL="$(deployed_url)"
    trap - INT TERM

    if [ "$status" -eq 0 ]; then
      break
    fi

    if [ "$status" -eq 2 ] && [ "$attempt" -le "$AUTH_RETRIES" ]; then
      echo "==> Vercel rejected the stored credentials — refreshing the session and retrying…" >&2
      if [ -z "$TOKEN" ]; then
        # Touching any authenticated command makes the CLI rotate its access token.
        npx vercel whoami >/dev/null 2>&1 || true
      fi
      continue
    fi

    if [ "$status" -eq 2 ]; then
      echo "✗ Authentication still failing after ${attempt} attempt(s) with $TOKEN_SOURCE" >&2
      cat >&2 <<'HINT'

  Run `npx vercel login`, or drop a long-lived token in ~/.vercel-token:
    printf '%s' '<token>' > ~/.vercel-token
HINT
      echo "  Build log: $LOG_FILE" >&2
      exit 1
    fi

    echo "✗ Deploy failed" >&2
    grep -E "^Error:|Build failed" "$LOG_FILE" | head -5 >&2
    inspect_url="$(grep -m1 -oE 'https://vercel\.com/[^ ]+' "$LOG_FILE" || true)"
    [ -n "$inspect_url" ] && echo "  Inspect: $inspect_url" >&2
    echo "  Build log kept at: $LOG_FILE" >&2
    exit 1
  done
else
  echo "==> SKIP_DEPLOY=1 — running the smoke test only"
fi

# --- Wait for the new deployment itself, then for the public alias ---
# The bare deployment URL sits behind Vercel Deployment Protection, so it answers
# 302 → vercel.com/sso-api instead of 200. That redirect still proves the new
# deployment is live, so it counts as "serving"; the production alias below is the
# hard gate that the smoke then exercises.
if [ -n "${DEPLOY_URL:-}" ] && [ "$DEPLOY_URL" != "$TARGET_URL" ]; then
  echo "==> Waiting for $DEPLOY_URL to answer (max ${URL_WAIT_SEC}s)…"
  elapsed=0
  new_ok=""
  code=""
  while [ "$elapsed" -lt "$URL_WAIT_SEC" ]; do
    code=$(curl -s -o /dev/null -w "%{http_code}" --max-time 10 "$DEPLOY_URL/" 2>/dev/null)
    if [ "$code" = "200" ]; then
      new_ok="live"
      break
    fi
    if [ "$code" = "302" ] || [ "$code" = "307" ]; then
      location=$(curl -s -o /dev/null -D - --max-time 10 "$DEPLOY_URL/" 2>/dev/null | tr -d '\r' | grep -i '^location:' | head -1)
      case "$location" in
        *vercel.com/sso-api*)
          new_ok="protected"
          break
          ;;
      esac
    fi
    sleep 5
    elapsed=$((elapsed + 5))
  done
  if [ -z "$new_ok" ]; then
    echo "✗ $DEPLOY_URL did not answer within ${URL_WAIT_SEC}s (last: ${code:-none})" >&2
    exit 1
  fi
  if [ "$new_ok" = "protected" ]; then
    echo "==> Deployment is serving: $DEPLOY_URL (200 → Deployment Protection redirect)"
  else
    echo "==> Deployment is serving: $DEPLOY_URL"
  fi
fi

echo "==> Waiting for $TARGET_URL to answer (max ${URL_WAIT_SEC}s)…"
elapsed=0
url_ok=""
code=""
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
# Hand the deployment URL/commit to the smoke so it can record the verified
# deployment into SystemSetting('deploy.status') for the admin status panel.
if DEPLOYED_URL="${DEPLOY_URL:-}" DEPLOYED_COMMIT="$(git rev-parse --short HEAD 2>/dev/null || true)" npm run --silent smoke; then
  echo ""
  echo "✓ DEPLOY VERIFIED — production is up and all smoke flows passed"
  exit 0
else
  echo "" >&2
  echo "✗ Deploy finished but SMOKE FAILED — see output above. Build log: $LOG_FILE" >&2
  exit 1
fi
