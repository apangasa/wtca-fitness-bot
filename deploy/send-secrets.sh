#!/usr/bin/env bash
# Runs LOCALLY. Copies your .env and the existing database to the VM.
# Kept separate from push.sh so the Discord token only moves when you run this.
#   ./deploy/send-secrets.sh <vm-public-ip>
set -euo pipefail

IP="${1:?usage: ./deploy/send-secrets.sh <vm-public-ip>}"
KEY="$HOME/.ssh/oracle_wtca_ed25519"
USER_NAME="${VM_USER:-ubuntu}"
REMOTE="$USER_NAME@$IP"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

cd "$(dirname "$0")/.."
mkdir -p out

echo "==> stopping remote bot so it is not writing during the swap"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo systemctl stop wtca-bot 2>/dev/null || true"

echo "==> snapshotting local database"
node deploy/snapshot-db.mjs out/fitness-snapshot.db

echo "==> uploading .env and database"
scp "${SSH_OPTS[@]}" .env "$REMOTE:/opt/wtca-fitness-bot/.env"

# Pin DB_PATH on the remote copy: a blank value in the local .env overrides the systemd Environment= line.
ssh "${SSH_OPTS[@]}" "$REMOTE" \
  "sudo sed -i 's#^DB_PATH=.*#DB_PATH=/var/lib/wtca-fitness-bot/fitness.db#' /opt/wtca-fitness-bot/.env"
scp "${SSH_OPTS[@]}" out/fitness-snapshot.db "$REMOTE:/var/lib/wtca-fitness-bot/fitness.db"

echo "==> starting service"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo systemctl restart wtca-bot && sleep 10 && systemctl is-active wtca-bot && journalctl -u wtca-bot -n 15 --no-pager"

echo
echo "Done. Stop the bot on your PC now - two instances would double-respond."
