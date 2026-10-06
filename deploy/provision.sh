#!/usr/bin/env bash
# Runs ON the Oracle VM. Idempotent - safe to re-run for redeploys.
set -euo pipefail

APP_DIR=/opt/wtca-fitness-bot
BROWSERS_DIR=/opt/wtca-fitness-bot/.playwright
DATA_DIR=/var/lib/wtca-fitness-bot
SERVICE=wtca-bot

# 1 GB of RAM is too little for Chromium plus a Node build: add swap.
if [ ! -f /swapfile ]; then
  echo "==> creating 2G swap file"
  sudo fallocate -l 2G /swapfile
  sudo chmod 600 /swapfile
  sudo mkswap /swapfile >/dev/null
  sudo swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
  free -m | sed 's/^/    /'
fi

echo "==> installing system packages"
sudo apt-get update -qq
sudo apt-get install -y -qq curl ca-certificates gnupg rsync >/dev/null

if ! command -v node >/dev/null || [ "$(node -v | cut -d. -f1)" != "v22" ]; then
  echo "==> installing Node 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash - >/dev/null
  sudo apt-get install -y -qq nodejs >/dev/null
fi
echo "    node $(node -v), npm $(npm -v)"

echo "==> unpacking application"
sudo mkdir -p "$APP_DIR" "$DATA_DIR"
sudo chown -R "$USER:$USER" "$APP_DIR" "$DATA_DIR"
tar -xzf /tmp/wtca-src.tar.gz -C "$APP_DIR"

cd "$APP_DIR"
echo "==> installing dependencies (this pulls Chromium, ~2 min)"
npm ci --ignore-scripts >/dev/null
# --ignore-scripts skips better-sqlite3's native build (no .node binary, crash loop); rebuild that one package.
npm rebuild better-sqlite3 >/dev/null
PLAYWRIGHT_BROWSERS_PATH="$BROWSERS_DIR" npx playwright install --with-deps chromium
npm run build >/dev/null
echo "    build ok"

echo "==> installing systemd unit"
sudo tee /etc/systemd/system/$SERVICE.service >/dev/null <<UNIT
[Unit]
Description=WTCA fitness Discord bot
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
# After EnvironmentFile so it wins over the blank DB_PATH in the checked-in .env.
Environment=DB_PATH=$DATA_DIR/fitness.db
Environment=NODE_ENV=production
# Explicit so Chromium is found whatever HOME systemd sets.
Environment=PLAYWRIGHT_BROWSERS_PATH=$BROWSERS_DIR
ExecStart=/usr/bin/node $APP_DIR/dist/index.js
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
UNIT

sudo systemctl daemon-reload
sudo systemctl enable $SERVICE >/dev/null 2>&1 || true

if [ -f "$APP_DIR/.env" ]; then
  sudo systemctl restart $SERVICE
  sleep 8
  echo "==> service status"
  systemctl is-active $SERVICE && journalctl -u $SERVICE -n 12 --no-pager
else
  echo
  echo "!! $APP_DIR/.env is missing - not starting."
  echo "   Copy it up, then: sudo systemctl restart $SERVICE"
fi
