#!/usr/bin/env bash
# Runs LOCALLY. Ships the source to the VM and provisions it.
#   ./deploy/push.sh <vm-public-ip>
set -euo pipefail

IP="${1:?usage: ./deploy/push.sh <vm-public-ip>}"
KEY="$HOME/.ssh/oracle_wtca_ed25519"
USER_NAME="${VM_USER:-ubuntu}"
REMOTE="$USER_NAME@$IP"
SSH_OPTS=(-i "$KEY" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=15)

cd "$(dirname "$0")/.."

echo "==> packing source"
tar --exclude=node_modules --exclude=dist --exclude=out --exclude=.git \
    --exclude='*.db' --exclude=.env \
    -czf /tmp/wtca-src.tar.gz .

echo "==> uploading to $REMOTE"
scp "${SSH_OPTS[@]}" /tmp/wtca-src.tar.gz "$REMOTE:/tmp/wtca-src.tar.gz"
scp "${SSH_OPTS[@]}" deploy/provision.sh "$REMOTE:/tmp/provision.sh"

echo "==> provisioning"
ssh "${SSH_OPTS[@]}" "$REMOTE" "chmod +x /tmp/provision.sh && bash /tmp/provision.sh"
