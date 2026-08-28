#!/usr/bin/env bash
# rotate-convex-ingest-secret.sh
#
# Rotates CONVEX_INGEST_SECRET across the Convex deployment and Vercel.
# The value is stored in Vercel as a *sensitive* (managed) environment
# variable, so it is encrypted at rest and masked in `vercel env pull`.
#
# Usage:
#   CONVEX_DEPLOY_KEY=prod:... ./scripts/rotate-convex-ingest-secret.sh
#
#   The deploy key can also live in .env.local or .env (CONVEX_DEPLOY_KEY=...).
#   Requires: openssl, curl, an authenticated Vercel CLI, and network access.
#
# Overridable via env:
#   CONVEX_DEPLOYMENT_NAME  deployment codename (default: limitless-chickadee-236)
#   CONVEX_SITE_URL         HTTP actions site URL (default: <deployment>.eu-west-1.convex.site)
set -euo pipefail
cd "$(dirname "$0")/.."

DEPLOYMENT_NAME="${CONVEX_DEPLOYMENT_NAME:-limitless-chickadee-236}"
SITE_URL="${CONVEX_SITE_URL:-https://${DEPLOYMENT_NAME}.eu-west-1.convex.site}"

# Resolve CONVEX_DEPLOY_KEY from the environment, .env.local, then .env.
if [[ -z "${CONVEX_DEPLOY_KEY:-}" && -f .env.local ]]; then
  CONVEX_DEPLOY_KEY="$(grep -E '^CONVEX_DEPLOY_KEY=' .env.local | tail -1 | sed -E 's/^CONVEX_DEPLOY_KEY="?//; s/"$//')"
fi
if [[ -z "${CONVEX_DEPLOY_KEY:-}" && -f .env ]]; then
  CONVEX_DEPLOY_KEY="$(grep -E '^CONVEX_DEPLOY_KEY=' .env | tail -1 | sed -E 's/^CONVEX_DEPLOY_KEY="?//; s/"$//')"
fi
if [[ -z "${CONVEX_DEPLOY_KEY:-}" ]]; then
  echo "ERROR: CONVEX_DEPLOY_KEY is required (env var, .env.local or .env)" >&2
  exit 1
fi
export CONVEX_DEPLOY_KEY

# 1. Generate a fresh secret (64 hex chars).
SECRET="$(openssl rand -hex 32)"
echo "[1/4] Generated new CONVEX_INGEST_SECRET (64 hex chars)"

# 2. Set it on the Convex deployment.
#    (< /dev/null keeps the CLI non-interactive in non-TTY environments)
echo "[2/4] Setting CONVEX_INGEST_SECRET on Convex deployment ${DEPLOYMENT_NAME}..."
npx -p node@20 convex env set CONVEX_INGEST_SECRET "$SECRET" < /dev/null

# 3. Update Vercel as a sensitive (managed) env var for production.
echo "[3/4] Updating CONVEX_INGEST_SECRET in Vercel (production, sensitive)..."
npx vercel env add CONVEX_INGEST_SECRET production --sensitive --force --value "$SECRET" --yes < /dev/null

# 4. Verify authentication without side effects (no DB writes):
#    - new secret + invalid payload -> 400 (auth passed, body validation failed)
#    - wrong secret                 -> 401 (auth enforced)
echo "[4/4] Verifying the endpoint accepts the new secret..."
ok="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${SITE_URL}/events/bot-message" \
  -H 'Content-Type: application/json' \
  -H "Authorization: Bearer ${SECRET}" \
  -d '{}')"
denied="$(curl -s -o /dev/null -w '%{http_code}' -X POST "${SITE_URL}/events/bot-message" \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer invalid-secret' \
  -d '{}')"
if [[ "${ok}" != "400" ]]; then
  echo "ERROR: expected HTTP 400 with the new secret, got ${ok}" >&2
  exit 1
fi
if [[ "${denied}" != "401" ]]; then
  echo "ERROR: expected HTTP 401 with a wrong secret, got ${denied}" >&2
  exit 1
fi

echo "✔ Rotation complete."
echo "  Deployment:  ${DEPLOYMENT_NAME}"
echo "  Endpoint:    ${SITE_URL}/events/bot-message"
echo "  Old value is invalidated; redeploy the app if you want the runtime"
echo "  environment refreshed immediately (not needed for build-time vars)."
