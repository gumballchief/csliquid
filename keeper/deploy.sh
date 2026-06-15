#!/usr/bin/env bash
# deploy.sh — Deploy or update the CSLIQUID keeper bot on this server.
# Run from the project root: bash keeper/deploy.sh
set -euo pipefail

KEEPER_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$KEEPER_DIR/.." && pwd)"

echo "==> Pulling latest code..."
cd "$PROJECT_ROOT"
git pull --ff-only

echo "==> Installing keeper dependencies..."
cd "$KEEPER_DIR"
npm install --omit=dev 2>/dev/null || npm install

echo "==> Building TypeScript..."
npm run build

echo "==> Creating log directory..."
mkdir -p "$KEEPER_DIR/logs"

echo "==> Starting / restarting PM2 process..."
if pm2 describe csliquid-keeper > /dev/null 2>&1; then
  pm2 reload ecosystem.config.js --update-env
else
  # First-time start — env vars must already be exported in the shell
  # or passed via the ecosystem env block
  pm2 start ecosystem.config.js
fi

pm2 save

echo ""
echo "==> Done. Keeper status:"
pm2 show csliquid-keeper

echo ""
echo "Tail logs with:  pm2 logs csliquid-keeper"
echo ""
echo "Required env vars (set before first deploy):"
echo "  export HELIUS_RPC_URL=https://devnet.helius-rpc.com/?api-key=YOUR_KEY"
echo "  export ADMIN_KEYPAIR=<base58-encoded-secret-key>"
echo "  export TELEGRAM_BOT_TOKEN=<token>    # optional"
echo "  export TELEGRAM_CHAT_ID=<chat-id>    # optional"
