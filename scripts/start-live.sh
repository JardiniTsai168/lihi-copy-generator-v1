#!/bin/zsh
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
RUN_DIR="$ROOT_DIR/.runtime"
PORT="${PORT:-3000}"

mkdir -p "$RUN_DIR"

if [[ -f "$RUN_DIR/server.pid" ]] && kill -0 "$(cat "$RUN_DIR/server.pid")" 2>/dev/null; then
  echo "server already running on pid $(cat "$RUN_DIR/server.pid")"
else
  cd "$ROOT_DIR"
  nohup env BECK_V1_MODE=openclaw PORT="$PORT" node server.js >"$RUN_DIR/server.log" 2>&1 &
  echo $! >"$RUN_DIR/server.pid"
  sleep 2
fi

if [[ -f "$RUN_DIR/tunnel.pid" ]] && kill -0 "$(cat "$RUN_DIR/tunnel.pid")" 2>/dev/null; then
  echo "tunnel already running on pid $(cat "$RUN_DIR/tunnel.pid")"
else
  nohup cloudflared tunnel --url "http://127.0.0.1:$PORT" --no-autoupdate >"$RUN_DIR/tunnel.log" 2>&1 &
  echo $! >"$RUN_DIR/tunnel.pid"
  sleep 5
fi

echo "server pid: $(cat "$RUN_DIR/server.pid")"
echo "tunnel pid: $(cat "$RUN_DIR/tunnel.pid")"
