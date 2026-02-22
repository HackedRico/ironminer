#!/usr/bin/env bash
# One-shot: ensure deps then start the API. Run from repo root.
set -e
cd "$(dirname "$0")/.."
if [ ! -d ".venv" ]; then
  echo "Creating .venv..."
  python3 -m venv .venv
fi
source .venv/bin/activate
echo "Installing dependencies (requirements-minimal.txt)..."
pip install -q -r requirements-minimal.txt
echo "Starting backend on http://localhost:8000 ..."
exec uvicorn app.main:app --reload --port 8000
