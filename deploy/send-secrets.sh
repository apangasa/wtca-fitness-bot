#!/usr/bin/env bash
# Runs LOCALLY. Copies your .env and the existing database to the VM.
# Kept separate from push.sh so the Discord token only moves when you run this.
#   ./deploy/send-secrets.sh <vm-public-ip> --overwrite-production
# This REPLACES the database on the VM with the local one. It is for the first setup. Once the bot has been running, the VM's database is the
# real one and this would erase everything logged since; the flag exists so that cannot happen by accident.
set -euo pipefail

IP="${1:?usage: ./deploy/send-secrets.sh <vm-public-ip> --overwrite-production}"
if [ "${2:-}" != "--overwrite-production" ]; then
  echo "Refusing: this replaces the database on $IP with the local one. Pass --overwrite-production if that is what you want." >&2
  exit 1
fi
KEY="$HOME/.ssh/oracle_wtca_ed25519"
USER_NAME="${VM_USER:-ubuntu}"
REMOTE="$USER_NAME@$IP"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

cd "$(dirname "$0")/.."
mkdir -p out

echo "==> snapshotting local database"
node deploy/snapshot-db.mjs out/fitness-snapshot.db

echo "==> stopping remote bot so it is not writing during the swap"
ssh "${SSH_OPTS[@]}" "$REMOTE" "sudo systemctl stop wtca-bot 2>/dev/null || true"

# Keep what is there: a copy that includes anything still in the write-ahead log, then clear the old log so it cannot be replayed into the new file.
echo "==> backing up the VM's current database"
ssh "${SSH_OPTS[@]}" "$REMOTE" 'DB=/var/lib/wtca-fitness-bot/fitness.db
  if sudo test -f "$DB"; then
    sudo mkdir -p /var/backups/wtca
    sudo node -e "const D=require(\"/opt/wtca-fitness-bot/node_modules/better-sqlite3\");new D(process.argv[1],{readonly:true}).exec(\"VACUUM INTO \x27\"+process.argv[2]+\"\x27\")" "$DB" "/var/backups/wtca/pre-send-secrets-$(date +%Y%m%dT%H%M%S).db"
  fi
  sudo rm -f "$DB-wal" "$DB-shm"'

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
