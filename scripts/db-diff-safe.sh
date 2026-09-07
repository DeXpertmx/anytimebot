#!/usr/bin/env bash
# =============================================================================
# db-diff-safe.sh — Safe wrapper for `prisma migrate diff`.
#
# WHY THIS EXISTS (incident 2026-09-04):
#   `prisma migrate diff --shadow-database-url <PRODUCTION_URL>` was run with
#   the production Neon URL as the shadow database. Prisma treats the shadow
#   database as disposable and resets it to run migrations against it — the
#   production database was emptied, all rows lost (recovered later via Neon
#   point-in-time restore).
#
# RULES ENFORCED HERE:
#   1. The shadow URL must be provided explicitly with --shadow-url.
#   2. The shadow URL host may NOT be the same as the host of $DATABASE_URL
#      (the app database) nor any URL in the blocklist below.
#   3. If you are not 100% sure the shadow database is disposable, DO NOT run
#      this script. Use a real throwaway database (local Postgres, Neon
#      ephemeral branch, or a dedicated dev database).
#
# USAGE:
#   db-diff-safe.sh --from-migrations ./prisma/migrations \
#                   --to-schema-datamodel prisma/schema.prisma \
#                   --shadow-url postgresql://user:pass@ep-dev-shadowname.aws.neon.tech/shadow
#
# Anything passed after the flag --shadow-url is forwarded to prisma.
# =============================================================================
set -euo pipefail

# Hosts that are ALWAYS forbidden as shadow databases. Production first.
BLOCKLIST_HOSTS=(
  "ep-green-thunder-av3ed81q"   # Anytimebot production (Neon project muddy-field-25896962)
)

# The app's real database — if it resolves to a blocklisted host, bail out.
APP_HOST=""
if [[ -n "${DATABASE_URL:-}" ]]; then
  APP_HOST="$(printf '%s' "$DATABASE_URL" | sed -E 's#^[^:]+://[^@]*@?([^:/]+).*#\1#' | tr -d '[]')"
fi

# Parse args, extract --shadow-url (and its value) if present.
ARGS=("$@")
SHADOW_URL=""
OUT=()
skip_next=0
for ((i = 0; i < ${#ARGS[@]}; i++)); do
  if [[ $skip_next -eq 1 ]]; then
    skip_next=0
    continue
  fi
  if [[ "${ARGS[$i]}" == "--shadow-url" ]]; then
    SHADOW_URL="${ARGS[$((i + 1))]:-}"
    skip_next=1
  elif [[ "${ARGS[$i]}" == --shadow-url=* ]]; then
    SHADOW_URL="${ARGS[$i]#--shadow-url=}"
  else
    OUT+=("${ARGS[$i]}")
  fi
done

die() { echo "✋ ABORTADO: $1" >&2; exit 1; }

[[ -n "$SHADOW_URL" ]] || die "falta --shadow-url <URL>. El shadow database NUNCA puede ser la base real."

SHADOW_HOST="$(printf '%s' "$SHADOW_URL" | sed -E 's#^[^:]+://[^@]*@?([^:/]+).*#\1#' | tr -d '[]')"
[[ -n "$SHADOW_HOST" ]] || die "no se pudo extraer el host de la URL de shadow."

for h in "${BLOCKLIST_HOSTS[@]}"; do
  [[ "$SHADOW_HOST" != "$h" ]] || die "el host '$SHADOW_HOST' está en la blocklist (producción). Usa una base desechable real."
done

if [[ -n "$APP_HOST" && "$SHADOW_HOST" == "$APP_HOST" ]]; then
  die "el shadow database ($SHADOW_HOST) es el MISMO host que DATABASE_URL. NUNCA uses la base real como shadow."
fi

echo "✅ shadow host '$SHADOW_HOST' no está bloqueado y no es la base de la app."
echo "   Ejecutando: npx prisma migrate diff ${OUT[*]} --shadow-database-url <oculto>"
npx prisma migrate diff "${OUT[@]}" --shadow-database-url "$SHADOW_URL"