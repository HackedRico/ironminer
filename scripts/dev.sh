#!/bin/bash
# Start both backend and frontend dev servers
# Usage: ./scripts/dev.sh

cd "$(dirname "$0")/.."

echo "Starting IronSite Manager..."
echo ""

# Start backend
echo "[Backend] Starting FastAPI on :8000"
.venv/bin/uvicorn app.main:app --reload --port 8000 &
BACKEND_PID=$!

# Start frontend
echo "[Frontend] Starting Vite on :5173"
cd gui && npm run dev &
FRONTEND_PID=$!

cd ..

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null" EXIT

echo ""
echo "Backend:  http://localhost:8000  (Swagger: http://localhost:8000/docs)"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop both servers."

wait
