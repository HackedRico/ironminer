from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, WebSocket, WebSocketDisconnect

from app.models.streaming import (
    FeedConfig,
    FeedCreate,
    LiveScanResult,
    AutoscanRequest,
    TokenRequest,
    TokenResponse,
)

from app.services.storage import FEEDS

from app.services.livekit_service import (
    generate_manager_token,
    generate_worker_token,
    list_rooms,
    list_participants,
    livekit_ws_url_for_client,
)


from app.ws.manager import ws_manager

router = APIRouter()

_feed_counter = 6  # seed data has 6 feeds


@router.get("/feeds", response_model=list[FeedConfig])
async def list_feeds(site_id: str | None = None):
    return await db.get_feeds(site_id)


@router.post("/feeds", response_model=FeedConfig)
async def register_feed(body: FeedCreate):
    global _feed_counter
    _feed_counter += 1
    feed_id = f"cam{_feed_counter}"
    feed = FeedConfig(
        id=feed_id,
        label=body.label,
        site_id=body.site_id,
        site_name=body.site_name,
        worker=body.worker,
        type=body.type,
    )
    return await db.create_feed(feed)


@router.get("/feeds/{feed_id}", response_model=FeedConfig)
async def get_feed(feed_id: str):
    feed = await db.get_feed(feed_id)
    if not feed:
        raise HTTPException(404, "Feed not found")
    return feed


@router.post("/feeds/{feed_id}/scan", response_model=LiveScanResult)
async def scan_feed(feed_id: str):
    feed = await db.get_feed(feed_id)
    if not feed:
        raise HTTPException(404, "Feed not found")
    # TODO: grab frame from feed, run abbreviated analysis
    return LiveScanResult(
        feed_id=feed_id,
        frame_id="pending",
        scan_text="Scan not implemented yet.",
        scanned_at=datetime.now(timezone.utc),
    )


@router.post("/feeds/{feed_id}/auto-scan")
async def toggle_auto_scan(feed_id: str, body: AutoScanRequest):
    feed = await db.update_feed(
        feed_id, {"auto_scan": body.enabled, "scan_interval": body.interval_seconds}
    )
    if not feed:
        raise HTTPException(404, "Feed not found")
    return {"enabled": feed.auto_scan, "interval_seconds": feed.scan_interval}


# ── WebSocket endpoints ──────────────────────────────────────────────────────

@router.websocket("/ws/live/{feed_id}")
async def ws_live_feed(ws: WebSocket, feed_id: str):
    await ws_manager.connect(f"live:{feed_id}", ws)
    try:
        while True:
            await ws.receive_text()  # keep alive
    except WebSocketDisconnect:
        ws_manager.disconnect(f"live:{feed_id}", ws)


@router.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket):
    await ws_manager.connect("alerts", ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect("alerts", ws)


@router.websocket("/ws/comms/{feed_id}")
async def ws_comms(ws: WebSocket, feed_id: str):
    channel = f"comms:{feed_id}"
    await ws_manager.connect(channel, ws)
    try:
        while True:
            data = await ws.receive_json()
            msg = {
                "from": data.get("from", "Manager"),
                "text": data.get("text", ""),
                "time": datetime.now(timezone.utc).isoformat(),
            }
            await ws_manager.broadcast(channel, msg)
    except WebSocketDisconnect:
        ws_manager.disconnect(channel, ws)


# ── LiveKit endpoints ─────────────────────────────────────────────────────────

@router.post("/livekit/token/manager", response_model=TokenResponse)
async def get_manager_token(body: TokenRequest, request: Request):
    """
    Generate a manager JWT. Manager can publish microphone audio (push-to-talk)
    and subscribe to all worker video + audio streams in the room.
    The livekit_url in the response is automatically adjusted to the client's
    network — phone on LAN gets ws://192.168.x.x:7880, localhost gets ws://localhost:7880.
    """
    token = generate_manager_token(
        room_name=body.room_name,
        identity=body.identity,
        display_name=body.display_name or body.identity,
    )
    return TokenResponse(
        token=token,
        room_name=body.room_name,
        livekit_url=livekit_ws_url_for_client(request.headers.get("origin", "")),
    )


@router.post("/livekit/token/worker", response_model=TokenResponse)
async def get_worker_token(body: TokenRequest, request: Request):
    """
    Generate a worker JWT. Worker publishes camera video + microphone audio
    and subscribes to manager audio instructions.
    """
    token = generate_worker_token(
        room_name=body.room_name,
        identity=body.identity,
        display_name=body.display_name or body.identity,
    )
    return TokenResponse(
        token=token,
        room_name=body.room_name,
        livekit_url=livekit_ws_url_for_client(request.headers.get("origin", "")),
    )


@router.get("/livekit/rooms")
async def get_livekit_rooms():
    """List active LiveKit rooms. Returns 503 if LiveKit server is unreachable."""
    try:
        return await list_rooms()
    except Exception as exc:
        raise HTTPException(503, f"LiveKit unavailable: {exc}")


@router.get("/livekit/rooms/{room_name}/participants")
async def get_room_participants(room_name: str):
    """List participants currently in a LiveKit room."""
    try:
        return await list_participants(room_name)
    except Exception as exc:
        raise HTTPException(503, f"LiveKit unavailable: {exc}")
