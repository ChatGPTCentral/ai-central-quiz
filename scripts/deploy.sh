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

cp "$LINK_FILE" .vercel/project.json
echo "→ Deploying to $ENV (project: $(jq -r .projectName .vercel/project.json 2>/dev/null || cat .vercel/project.json))"
vercel --prod
