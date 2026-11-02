#!/usr/bin/env bash
# Builds the game and ships it, with the signaling server, to the GCP VM behind Caddy.
# Usage: GCP_ACCOUNT=you@example.com ./deploy.sh
set -euo pipefail
cd "$(dirname "$0")"
VM=expenses
ZONE=us-central1-a
PROJECT=expenses-509914
gc() { gcloud --account="${GCP_ACCOUNT:?set GCP_ACCOUNT to the Google account that owns the VM}" --project="$PROJECT" "$@"; }

npm run build
BUNDLE=$(mktemp -t sea-battle).tgz
# The VM has node but no npm, so ship the server's only dependency (ws, pure JS) prebuilt.
COPYFILE_DISABLE=1 tar --no-xattrs -czf "$BUNDLE" dist server/index.ts server/package.json server/node_modules/ws deploy
gc compute scp --zone="$ZONE" "$BUNDLE" "$VM":/tmp/sea-battle.tgz
gc compute ssh "$VM" --zone="$ZONE" --command 'bash -s' <deploy/remote.sh
rm -f "$BUNDLE"
echo "Deployed: https://seabattle.yuvi.dev"
