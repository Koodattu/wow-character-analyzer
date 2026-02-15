#!/bin/bash
# ──────────────────────────────────────────────────────────
# init-letsencrypt.sh — First-deploy SSL certificate bootstrap
#
# Run ONCE on a fresh server to obtain Let's Encrypt certificates.
# After this, the certbot container handles automatic renewal.
#
# Usage:
#   chmod +x init-letsencrypt.sh
#   ./init-letsencrypt.sh
#
# Prerequisites:
#   - Domain DNS must point to this server's IP
#   - Ports 80 and 443 must be open
#   - Docker and Docker Compose must be installed
# ──────────────────────────────────────────────────────────

set -euo pipefail

# ── Configuration ─────────────────────────────────────────
# Load from .env if present, otherwise use defaults
if [ -f .env ]; then
  source .env
fi

DOMAIN="${DOMAIN:?Error: DOMAIN not set. Set it in .env or export it.}"
EMAIL="${CERTBOT_EMAIL:?Error: CERTBOT_EMAIL not set. Set it in .env or export it.}"
STAGING="${CERTBOT_STAGING:-0}"  # Set to 1 for testing (avoids rate limits)

DATA_PATH="./certbot"
COMPOSE_PROD="-f docker-compose.yml -f docker-compose.prod.yml"

echo "───────────────────────────────────────────"
echo "  Domain:  $DOMAIN"
echo "  Email:   $EMAIL"
echo "  Staging: $STAGING"
echo "───────────────────────────────────────────"

# ── Check for existing certificates ───────────────────────
if [ -d "$DATA_PATH/conf/live/$DOMAIN" ]; then
  read -p "Existing certificates found for $DOMAIN. Replace? (y/N) " decision
  if [ "$decision" != "Y" ] && [ "$decision" != "y" ]; then
    echo "Aborted."
    exit 0
  fi
fi

# ── Download recommended TLS parameters ───────────────────
echo "Downloading recommended TLS parameters..."
mkdir -p "$DATA_PATH/conf"
if [ ! -f "$DATA_PATH/conf/options-ssl-nginx.conf" ]; then
  curl -sSf https://raw.githubusercontent.com/certbot/certbot/master/certbot-nginx/certbot_nginx/_internal/tls_configs/options-ssl-nginx.conf \
    > "$DATA_PATH/conf/options-ssl-nginx.conf"
fi
if [ ! -f "$DATA_PATH/conf/ssl-dhparams.pem" ]; then
  curl -sSf https://raw.githubusercontent.com/certbot/certbot/master/certbot/certbot/ssl-dhparams.pem \
    > "$DATA_PATH/conf/ssl-dhparams.pem"
fi

# ── Create dummy certificate ──────────────────────────────
echo "Creating dummy certificate for $DOMAIN..."
CERT_PATH="$DATA_PATH/conf/live/$DOMAIN"
mkdir -p "$CERT_PATH"

docker compose $COMPOSE_PROD run --rm --entrypoint "\
  openssl req -x509 -nodes -newkey rsa:2048 -days 1 \
    -keyout '/etc/letsencrypt/live/$DOMAIN/privkey.pem' \
    -out '/etc/letsencrypt/live/$DOMAIN/fullchain.pem' \
    -subj '/CN=localhost'" certbot

echo "Dummy certificate created."

# ── Start nginx ───────────────────────────────────────────
echo "Starting nginx..."
docker compose $COMPOSE_PROD up -d nginx
echo "Waiting for nginx to start..."
sleep 5

# ── Delete dummy certificate ──────────────────────────────
echo "Removing dummy certificate..."
docker compose $COMPOSE_PROD run --rm --entrypoint "\
  rm -rf /etc/letsencrypt/live/$DOMAIN && \
  rm -rf /etc/letsencrypt/archive/$DOMAIN && \
  rm -rf /etc/letsencrypt/renewal/$DOMAIN.conf" certbot

# ── Request real certificate ──────────────────────────────
echo "Requesting Let's Encrypt certificate for $DOMAIN..."

STAGING_ARG=""
if [ "$STAGING" != "0" ]; then
  STAGING_ARG="--staging"
  echo "  (Using staging environment — certificate will NOT be trusted)"
fi

docker compose $COMPOSE_PROD run --rm --entrypoint "\
  certbot certonly --webroot -w /var/www/certbot \
    $STAGING_ARG \
    --email $EMAIL \
    -d $DOMAIN \
    --rsa-key-size 4096 \
    --agree-tos \
    --no-eff-email \
    --force-renewal" certbot

# ── Reload nginx with real certificate ────────────────────
echo "Reloading nginx with real certificate..."
docker compose $COMPOSE_PROD exec nginx nginx -s reload

echo ""
echo "───────────────────────────────────────────"
echo "  SSL certificate obtained successfully!"
echo "  "
echo "  You can now start all services:"
echo "  docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d"
echo "───────────────────────────────────────────"
