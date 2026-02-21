# End-to-end test: Live tab + LiveKit worker

## Prerequisites

- **Docker Desktop** (or Docker Engine) running so `docker ps` works.
- **Python 3.11+** with venv (optional but recommended).
- **Node.js 18+** for the frontend.

## 1. Start infrastructure

```bash
docker compose up -d
```

Verify:

```bash
docker ps
```

You should see `livekit` (ports 7880, 7881, 7882) and `redis` (6379).

## 2. Backend (FastAPI)

```bash
# From project root
python -m venv .venv
.venv\Scripts\activate   # Windows
# source .venv/bin/activate   # macOS/Linux

pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

- API: http://localhost:8000  
- Swagger: http://localhost:8000/docs  

Optional: copy `.env.example` to `.env`; defaults (devkey/devsecret, LIVEKIT_HOST=http://localhost:7880) work for local test.

## 3. Frontend (Vite)

In a **second terminal**:

```bash
cd gui
npm install
npm run dev
```

- App: http://localhost:5173  

Ensure Vite proxies `/api` and `/ws` to the backend (see `gui/vite.config.js`).

## 4. Test in the browser

1. Open **http://localhost:5173**.
2. Switch to the **Live** tab.
3. You should see either:
   - **“Connect to Site Room”** (or similar) when LiveKit is reachable, or  
   - **“LIVEKIT OFFLINE”** mock fallback if the backend can’t reach LiveKit.
4. Click **“Connect to Site Room”** and choose a site (e.g. **Riverside Tower** / `site-s1`).  
   - Backend will issue a **manager token**; the dashboard should join the room.

## 5. Join as a worker (video in dashboard)

To see worker video in the dashboard:

- **Option A — LiveKit Playground:**  
  Open **http://localhost:7880** (or your LiveKit server URL). If a web UI is served there, join room **`site-s1`** as a **worker** with camera/mic. You may need a **worker token** from your backend (e.g. `POST /api/streaming/livekit/token/worker` with `room_name: "site-s1"`, `identity`, `display_name`).

- **Option B — Android headset client:**  
  Run the app in `headset-client/`, register and get a worker token from the backend, connect to room **`site-s1`**. The worker’s camera should show in the dashboard’s Live view.

After a worker joins **`site-s1`** with video, their feed should appear in the manager’s Live tab.

## Demo from your phone

To use the Worker Simulator from your phone (same Wi-Fi as your computer):

1. Find your computer's LAN IP (e.g. 192.168.1.100): Windows `ipconfig`; macOS/Linux `ifconfig` or `ip addr`.
2. In project `.env` add: `LIVEKIT_PUBLIC_WS_URL=ws://YOUR_IP:7880` (replace YOUR_IP), then restart the backend.
3. Start everything as above. Vite listens on all interfaces, so the app is at `http://YOUR_IP:5173`.
4. On your phone browser open `http://YOUR_IP:5173/worker`, allow camera and mic, room **site-s1**, then Connect.

## Demo from phone via ngrok (HTTPS, any network)

Use ngrok when the phone is on a different network (e.g. cellular) or when LAN is blocked. **HTTPS is required** for camera/mic in mobile browsers — ngrok provides it automatically.

1. **Install ngrok** (if not already): `winget install ngrok` or [ngrok.com/download](https://ngrok.com/download).
2. **Log in:** `ngrok config add-authtoken YOUR_TOKEN` (free account at [ngrok.com](https://ngrok.com)).
3. **Start both tunnels** (keep running in a separate terminal):
   ```bash
   ngrok start --all --config ngrok.yml
   ```
   You’ll see two URLs, e.g. `frontend → https://abc123.ngrok-free.app` and `livekit → https://def456.ngrok-free.app`.
4. **In project `.env`** set the LiveKit tunnel (use **wss://** for the WebSocket URL):
   ```
   LIVEKIT_PUBLIC_WS_URL=wss://def456.ngrok-free.app
   ```
   (Use the **livekit** tunnel URL from step 3.)
5. **Restart the FastAPI backend** so it picks up the new env.
6. **On the phone** open `https://abc123.ngrok-free.app/worker` (use the **frontend** tunnel URL), allow camera and mic, then **Connect & share camera**.
7. **On the laptop** open `http://localhost:5173` → **Live** tab → **Connect to Site Room** (site-s1). The phone’s feed should appear in the worker video grid.

Frontend `getLiveKitWsUrl` trusts the backend’s `livekit_url` when not on localhost, so with `LIVEKIT_PUBLIC_WS_URL` set the phone correctly uses the LiveKit ngrok URL.

## Quick checks

| Check | Command / URL |
|-------|----------------|
| LiveKit + Redis up | `docker ps` |
| Backend up | http://localhost:8000 → `{"app":"IronSite Manager",...}` |
| LiveKit rooms | http://localhost:8000/api/streaming/livekit/rooms (or via Swagger) |
| Manager token | `POST /api/streaming/livekit/token/manager` with `room_name: "site-s1"` |
| Worker token | `POST /api/streaming/livekit/token/worker` with `room_name: "site-s1"` |
| Frontend | http://localhost:5173 → Live tab |

## Troubleshooting

- **“LIVEKIT OFFLINE”**  
  Backend can’t reach LiveKit. Ensure `docker compose up -d` is running and `LIVEKIT_HOST` in `.env` is `http://localhost:7880` (or your LiveKit URL).

- **No worker video**  
  Worker must join the **same room** as the manager (e.g. `site-s1`) and publish **video** (and optionally audio). Use worker token from `POST /api/streaming/livekit/token/worker`.

- **Redis connection (LiveKit in Docker)**  
  `livekit.yaml` uses `redis:6379` when running via Docker so the LiveKit container can reach the Redis service.
