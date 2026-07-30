#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REMOTE_HOST="${REMOTE_HOST:-copy-live-do}"
REMOTE_DIR="${REMOTE_DIR:-/var/www/beck-v1}"
APP_NAME="${APP_NAME:-beck-v1}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DRY_RUN="${1:-}"

rsync_flags=(-av)
if [[ "$DRY_RUN" == "--dry-run" ]]; then
  rsync_flags+=(--dry-run)
fi

ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR/backups/$TIMESTAMP' && cp '$REMOTE_DIR/bridge-server.js' '$REMOTE_DIR/package.json' '$REMOTE_DIR/package-lock.json' '$REMOTE_DIR/backups/$TIMESTAMP/' 2>/dev/null || true && cp -R '$REMOTE_DIR/public' '$REMOTE_DIR/backups/$TIMESTAMP/public'"

rsync "${rsync_flags[@]}" --delete "$ROOT_DIR/public/" "$REMOTE_HOST:$REMOTE_DIR/public/"
rsync "${rsync_flags[@]}" "$ROOT_DIR/bridge-server.js" "$ROOT_DIR/package.json" "$ROOT_DIR/package-lock.json" "$REMOTE_HOST:$REMOTE_DIR/"

if [[ "$DRY_RUN" == "--dry-run" ]]; then
  echo "dry run complete"
  exit 0
fi

ssh "$REMOTE_HOST" "cd '$REMOTE_DIR' && node --check bridge-server.js && node --check public/app.js && pm2 restart '$APP_NAME' --update-env && sleep 3 && curl -s https://copy.bktsai.link/health"
