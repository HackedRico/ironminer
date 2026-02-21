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

# Start backend on all interfaces so LAN devices can reach it directly if needed
echo "[Backend] Starting FastAPI on :8000"
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!

# Start frontend (vite.config.js has host:true for LAN access)
echo "[Frontend] Starting Vite on :5173"
cd gui && npm run dev &
FRONTEND_PID=$!

cd ..

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Backend:   http://localhost:8000"
echo "  Swagger:   http://localhost:8000/docs"
echo "  Frontend:  http://localhost:5173"
echo ""
echo "  For phone/LAN access:"
echo "  Frontend:  http://${LAN_IP}:5173"
echo "  LiveKit WS is auto-detected from Origin header —"
echo "  no extra config needed for same-network devices."
echo ""
echo "  LiveKit (Docker): docker-compose up -d"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
