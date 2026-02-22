#!/bin/bash
# Start both backend and frontend dev servers
# Usage: ./scripts/dev.sh

cd "$(dirname "$0")/.."

# Detect LAN IP (first non-loopback IPv4 address)
if command -v ip &>/dev/null; then
  LAN_IP=$(ip route get 1 2>/dev/null | awk '{for(i=1;i<=NF;i++) if($i=="src") print $(i+1); exit}')
elif command -v ipconfig &>/dev/null; then
  # Windows Git Bash fallback
  LAN_IP=$(ipconfig | awk '/IPv4/ && !/127.0.0.1/ {gsub(/.*: /,""); print; exit}')
fi
LAN_IP="${LAN_IP:-<your-lan-ip>}"

echo "Starting IronSite Manager..."
echo ""

# Start LiveKit
echo "[LiveKit] Starting via docker-compose..."
if ! command -v docker-compose &> /dev/null && ! command -v docker &> /dev/null; then
  echo "❌ Docker/Docker Compose not found. Install Docker Desktop to run LiveKit."
  echo "   https://www.docker.com/products/docker-desktop"
  exit 1
fi

docker-compose up -d 2>/dev/null
if [ $? -ne 0 ]; then
  echo "❌ Error: Could not start LiveKit via docker-compose"
  echo "   Troubleshooting:"
  echo "   1. Ensure Docker Desktop is running"
  echo "   2. Check docker-compose.yml and livekit.yaml exist"
  echo "   3. Try: docker-compose logs"
  exit 1
fi
sleep 2
echo "✓ LiveKit started"

# Start backend on all interfaces so LAN devices can reach it directly if needed
echo "[Backend] Starting FastAPI on :8000"

UVICORN_CMD=".venv/bin/uvicorn"
if [ ! -x "$UVICORN_CMD" ]; then
  UVICORN_CMD="uvicorn"
fi

"$UVICORN_CMD" app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
# Start frontend (vite.config.js has host:true for LAN access)
echo "[Frontend] Starting Vite on :5173"
cd gui && npm run dev &
FRONTEND_PID=$!

cd ..

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; docker-compose down 2>/dev/null" EXIT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backend:   http://localhost:8000"
echo "  Swagger:   http://localhost:8000/docs"
echo "  Frontend:  http://localhost:5173"
echo "  LiveKit:   ws://localhost:7880"
echo ""
echo "  For phone/LAN access:"
echo "  Frontend:  http://${LAN_IP}:5173"
echo "  LiveKit WS is auto-detected from Origin header —"
echo "  no extra config needed for same-network devices."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
