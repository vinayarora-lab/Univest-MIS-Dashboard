#!/bin/bash
# Start Financial Intelligence Dashboard
# Usage: bash dashboard/start.sh [--mock]

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

export MOCK_MODE=false
if [[ "$1" == "--mock" ]]; then
  export MOCK_MODE=true
  echo "📊 Starting in MOCK MODE (no Zoho API calls)"
fi

# Load .env from project root
if [ -f "$ROOT_DIR/.env" ]; then
  export $(grep -v '^#' "$ROOT_DIR/.env" | xargs)
fi

# Start server
echo "🚀 Starting dashboard server on http://localhost:${DASHBOARD_PORT:-3001}"
cd "$SCRIPT_DIR/server" && node index.js &
SERVER_PID=$!

# Start client dev server if not in production
if [ -d "$SCRIPT_DIR/client/node_modules" ]; then
  echo "🎨 Starting React dev server on http://localhost:5173"
  cd "$SCRIPT_DIR/client" && npm run dev &
  CLIENT_PID=$!
fi

echo ""
echo "  Dashboard: http://localhost:5173"
echo "  API:       http://localhost:${DASHBOARD_PORT:-3001}/api/status"
echo ""
echo "  Press Ctrl+C to stop"

trap "kill $SERVER_PID $CLIENT_PID 2>/dev/null" EXIT
wait
