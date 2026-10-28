#!/usr/bin/env bash
# Pre-push privacy gate: scans the FULL TREE of every commit a push would
# publish (not just the net diff) for personal data and secrets.
# Usage: scripts/prepush-privacy-gate.sh <ref-to-push> [remote]
# Exit 1 (block push) on any hit. Install as .git/hooks/pre-push or run in CI.
set -euo pipefail
# --tree MODE: scan the working tree only (CI/build environments without full history)
if [ "${1:-}" = "--tree" ]; then
  ALLOW='habayitcc\.org|habayitcc\.com|resend\.(com|dev)|example\.|@local|noreply@|users\.noreply\.github\.com|supabase\.io|@(x|y|t)\.com|@email\.com|@test\.com|^test@|^you@|^your@|@placeholder'
  EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
  SECRET_RE='(sk_live_|sk_test_|whsec_|sb_secret_|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
  hits=$(grep -rhoE "$EMAIL_RE" . --exclude-dir=node_modules --exclude-dir=.git --exclude=prepush-privacy-gate.sh 2>/dev/null | grep -viE "$ALLOW" | sort -u || true)
  shits=$(grep -rnE "$SECRET_RE" . --exclude-dir=node_modules --exclude-dir=.git --exclude=prepush-privacy-gate.sh 2>/dev/null | head -5 || true)
  fail=0
  [ -n "$hits" ] && { echo "gate: BLOCK tree personal-email-like values:"; echo "$hits" | sed 's/^/    /'; fail=1; }
  [ -n "$shits" ] && { echo "gate: BLOCK tree secret-like values:"; echo "$shits" | sed 's/^/    /'; fail=1; }
  [ "$fail" = 1 ] && exit 1
  echo "gate: CLEAN tree scan"; exit 0
fi
REF="${1:?usage: prepush-privacy-gate.sh <ref> [remote] | --tree}"
REMOTE="${2:-origin}"

# Commits this push would newly publish (all ancestors not already on any remote branch)
NEW_COMMITS=$(git rev-list "$REF" --not --remotes="$REMOTE" 2>/dev/null || git rev-list "$REF")
if [ -z "$NEW_COMMITS" ]; then echo "gate: nothing new to scan"; exit 0; fi
COUNT=$(echo "$NEW_COMMITS" | wc -l | tr -d ' ')
echo "gate: scanning full trees of $COUNT commit(s) to be published"

# Safe senders/org addresses allowed in repo
ALLOW='habayitcc\.org|habayitcc\.com|resend\.(com|dev)|example\.|@local|noreply@|users\.noreply\.github\.com|supabase\.io|@(x|y|t)\.com|@email\.com|@test\.com|^test@|^you@|^your@|@placeholder'

# Personal email pattern (excluding allowlisted)
EMAIL_RE='[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}'
# Secret value patterns
SECRET_RE='(sk_live_|sk_test_|whsec_|sb_secret_|eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9\.[A-Za-z0-9_-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)'
# Repo-specific personal-data markers: maintained privately, never committed.
MARKER_RE='__NO_COMMITTED_MARKERS__'

fail=0
for c in $NEW_COMMITS; do
  # emails
  hits=$(git grep -hoE "$EMAIL_RE" "$c" -- . ':!scripts/prepush-privacy-gate.sh' 2>/dev/null | sed 's/^[^:]*://' | grep -viE "$ALLOW" | sort -u || true)
  if [ -n "$hits" ]; then echo "gate: BLOCK $c personal-email-like values:"; echo "$hits" | sed 's/^/    /'; fail=1; fi
  # secrets
  shits=$(git grep -nE "$SECRET_RE" "$c" -- . ':!scripts/prepush-privacy-gate.sh' 2>/dev/null | head -5 || true)
  if [ -n "$shits" ]; then echo "gate: BLOCK $c secret-like values:"; echo "$shits" | sed 's/^/    /'; fail=1; fi
  # repo-specific markers
  mhits=$(git grep -nE "$MARKER_RE" "$c" -- . ':!scripts/prepush-privacy-gate.sh' 2>/dev/null | head -5 || true)
  if [ -n "$mhits" ]; then echo "gate: BLOCK $c known personal-data markers:"; echo "$mhits" | sed 's/^/    /'; fail=1; fi
done
if [ "$fail" = 1 ]; then echo "gate: PUSH BLOCKED - scrub and rebuild as clean single commit"; exit 1; fi
echo "gate: CLEAN - $COUNT commit(s), all trees scanned"
