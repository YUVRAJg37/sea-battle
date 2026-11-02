#!/usr/bin/env bash
# Runs on the VM: installs the game files and the signaling server, and adds the Caddy site once.
# Safe to re-run; the Caddy change is validated first and rolled back if invalid.
set -euo pipefail
BUNDLE=/tmp/sea-battle.tgz
STAGE=$(mktemp -d)
tar -xzf "$BUNDLE" -C "$STAGE"

id seabattle &>/dev/null || sudo useradd --system --no-create-home --shell /usr/sbin/nologin seabattle

sudo mkdir -p /var/www/sea-battle /opt/sea-battle/server
sudo rm -rf /var/www/sea-battle/*
sudo cp -r "$STAGE"/dist/. /var/www/sea-battle/
sudo rm -rf /opt/sea-battle/server/node_modules
sudo cp -r "$STAGE"/server/. /opt/sea-battle/server/

sudo cp "$STAGE"/deploy/sea-battle-signal.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --quiet sea-battle-signal
sudo systemctl restart sea-battle-signal

if ! sudo grep -q '^seabattle.yuvi.dev' /etc/caddy/Caddyfile; then
  sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.bak-before-sea-battle
  printf '\n' | sudo tee -a /etc/caddy/Caddyfile >/dev/null
  sudo tee -a /etc/caddy/Caddyfile <"$STAGE"/deploy/Caddyfile.sea-battle >/dev/null
  if sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile &>/tmp/caddy-validate.log; then
    sudo systemctl reload caddy
    echo "caddy: site added"
  else
    sudo cp /etc/caddy/Caddyfile.bak-before-sea-battle /etc/caddy/Caddyfile
    echo "caddy: new config invalid, restored the old one" >&2
    cat /tmp/caddy-validate.log >&2
    exit 1
  fi
fi

rm -rf "$STAGE" "$BUNDLE"
sleep 1
systemctl is-active sea-battle-signal
