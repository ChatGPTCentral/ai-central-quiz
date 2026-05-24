#!/usr/bin/env bash
# Deploy to either prod or staging by swapping the .vercel/project.json link.
#
# Usage:
#   ./scripts/deploy.sh prod      → ai-central-quiz.vercel.app
#   ./scripts/deploy.sh staging   → ai-central-quiz-staging.vercel.app
#
# Both target environments are independent Vercel projects in the same team.
# Their env vars live in their respective Vercel project settings.

set -e

cd "$(dirname "$0")/.."

ENV="${1:-}"
if [ "$ENV" != "prod" ] && [ "$ENV" != "staging" ]; then
  echo "Usage: $0 prod|staging"
  exit 1
fi

LINK_FILE=".vercel/project.${ENV}.json"
if [ ! -f "$LINK_FILE" ]; then
  echo "Missing $LINK_FILE — run 'vercel link --project ai-central-quiz-$ENV' first"
  exit 1
fi

# Snapshot current link so we always restore prod afterwards
ORIG_LINK=""
if [ -f .vercel/project.json ]; then
  ORIG_LINK="$(cat .vercel/project.json)"
fi

cleanup() {
  # Always restore the prod link so subsequent vercel commands target prod by default
  if [ -f .vercel/project.prod.json ]; then
    cp .vercel/project.prod.json .vercel/project.json
  elif [ -n "$ORIG_LINK" ]; then
    echo "$ORIG_LINK" > .vercel/project.json
  fi
}
trap cleanup EXIT

# Branch safety check — prod must come from `main`, staging from `test`
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "(no git)")
EXPECTED_BRANCH="main"
[ "$ENV" = "staging" ] && EXPECTED_BRANCH="test"
if [ "$CURRENT_BRANCH" != "$EXPECTED_BRANCH" ] && [ "$CURRENT_BRANCH" != "(no git)" ]; then
  echo "⚠️  You are on branch '$CURRENT_BRANCH' but $ENV deploys expect '$EXPECTED_BRANCH'."
  read -r -p "Continue anyway? [y/N] " ans
  [ "$ans" = "y" ] || [ "$ans" = "Y" ] || { echo "Aborted."; exit 1; }
fi

cp "$LINK_FILE" .vercel/project.json
echo "→ Deploying to $ENV (branch: $CURRENT_BRANCH)"
vercel --prod
