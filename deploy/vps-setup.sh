#!/bin/bash
set -e

echo "============================================"
echo "  Hostinger VPS Setup for ana-ca.com"
echo "============================================"
echo ""

if [ "$(id -u)" -ne 0 ]; then
  echo "ERROR: Run this script as root"
  exit 1
fi

echo ">>> Installing Docker..."
if ! command -v docker &> /dev/null; then
  apt update
  apt install -y ca-certificates curl gnupg
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
  apt update
  apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
  echo "Docker installed successfully"
else
  echo "Docker already installed"
fi

echo ""
echo ">>> Installing Nginx..."
if ! command -v nginx &> /dev/null; then
  apt install -y nginx
  systemctl enable nginx
  systemctl start nginx
  echo "Nginx installed"
else
  echo "Nginx already installed"
fi

echo ""
echo ">>> Installing Certbot..."
if ! command -v certbot &> /dev/null; then
  apt install -y certbot python3-certbot-nginx
  echo "Certbot installed"
else
  echo "Certbot already installed"
fi

echo ""
echo ">>> Setting up SSH key for GitHub Actions..."
if [ ! -f ~/.ssh/id_ed25519 ]; then
  ssh-keygen -t ed25519 -f ~/.ssh/id_ed25519 -N "" -C "github-actions-deploy"
  echo ""
  echo "=========================================="
  echo "  COPY THIS PRIVATE KEY TO GITHUB SECRETS"
  echo "  Secret name: VPS_SSH_KEY"
  echo "=========================================="
  cat ~/.ssh/id_ed25519
  echo ""
  echo "=========================================="
  echo ""
  cat ~/.ssh/id_ed25519.pub >> ~/.ssh/authorized_keys
  chmod 600 ~/.ssh/authorized_keys
  echo "Public key added to authorized_keys"
else
  echo "SSH key already exists"
  echo "Private key to add to GitHub secrets (VPS_SSH_KEY):"
  echo "=========================================="
  cat ~/.ssh/id_ed25519
  echo ""
  echo "=========================================="
fi

echo ""
echo ">>> Cloning repository..."
APP_DIR=~/firm-hrm
if [ ! -d "$APP_DIR" ]; then
  git clone https://github.com/aqeelalamfca-sys/firm-hrm.git "$APP_DIR"
else
  cd "$APP_DIR"
  git pull origin main
fi

echo ""
echo ">>> Setting up environment..."
if [ ! -f "$APP_DIR/deploy/.env" ]; then
  cp "$APP_DIR/deploy/.env.example" "$APP_DIR/deploy/.env"
  DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 20)
  sed -i "s/your_strong_password_here/$DB_PASS/" "$APP_DIR/deploy/.env"
  echo "Generated DB password: $DB_PASS"
  echo "Saved to $APP_DIR/deploy/.env"
fi

echo ""
echo ">>> Building and starting containers..."
cd "$APP_DIR/deploy"
docker compose --env-file .env up -d --build

echo ""
echo ">>> Setting up Nginx for ana-ca.com..."
cp "$APP_DIR/deploy/nginx-ana-ca.conf" /etc/nginx/sites-available/ana-ca.com
ln -sf /etc/nginx/sites-available/ana-ca.com /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

echo ""
echo ">>> Setting up SSL..."
certbot --nginx -d ana-ca.com -d www.ana-ca.com --non-interactive --agree-tos -m admin@ana-ca.com || echo "SSL setup failed — make sure DNS is pointing to this server first"

echo ""
echo "============================================"
echo "  SETUP COMPLETE"
echo "============================================"
echo ""
echo "Next steps:"
echo "1. Add these GitHub Secrets at:"
echo "   https://github.com/aqeelalamfca-sys/firm-hrm/settings/secrets/actions"
echo ""
echo "   VPS_HOST      = 187.77.130.117"
echo "   VPS_USERNAME   = root"
echo "   VPS_SSH_KEY    = (private key shown above)"
echo "   VPS_PORT       = 22"
echo ""
echo "2. Point ana-ca.com DNS (A record) to 187.77.130.117"
echo "3. Push code from Replit to trigger auto-deploy"
echo ""
