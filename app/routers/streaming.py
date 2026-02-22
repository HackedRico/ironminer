from __future__ import annotations
from datetime import datetime, timezone
import asyncio
import uuid
import tempfile
import os
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, Request, UploadFile, WebSocket, WebSocketDisconnect

from app.models.streaming import (
    FeedConfig,
    FeedCreate,
    LiveScanResult,
    AutoScanRequest,
    FeedNoteCreate,
    FeedNote,
    WorldGenerateRequest,
    FramesWorldRequest,
    SiteWorld,
    TokenRequest,
    TokenResponse,
)

from app.services import db
from app.services.parakeet import transcribe_audio_base64
from app.services.worldlabs import generate_world, poll_operation
from app.services.storage import FEEDS, NOTES, WORLDS
from app.models.streaming import SiteWorld

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


@router.get("/notes", response_model=list[FeedNote])
async def list_site_notes(site_id: str | None = None, worker_identity: str | None = None):
    """Return notes, newest first. Filter by site_id and/or worker_identity."""
    result = []
    for notes in NOTES.values():
        for n in notes:
            if site_id and n.site_id != site_id:
                continue
            if worker_identity and n.worker_identity != worker_identity:
                continue
            result.append(n)
    return sorted(result, key=lambda n: n.created_at, reverse=True)


@router.get("/feeds/{feed_id}/notes", response_model=list[FeedNote])
async def list_feed_notes(feed_id: str):
    result = []
    for notes in NOTES.values():
        for n in notes:
            if n.feed_id == feed_id:
                result.append(n)
    return sorted(result, key=lambda n: n.created_at)


@router.post("/feeds/{feed_id}/notes", response_model=FeedNote)
async def create_feed_note(feed_id: str, body: FeedNoteCreate):
    if body.feed_id != feed_id:
        raise HTTPException(400, "feed_id mismatch")
    transcript = (body.transcript or "").strip()
    if body.audio_base64:
        try:
            result = await asyncio.to_thread(transcribe_audio_base64, body.audio_base64)
            if result:
                transcript = result
        except Exception as exc:
            # Log but don't block — note is saved with audio; transcript can be retried
            print(f"[Parakeet] STT failed: {exc}")
    if not transcript and not body.audio_base64:
        raise HTTPException(400, "transcript or audio required")
    note = FeedNote(
        id=str(uuid.uuid4()),
        feed_id=feed_id,
        site_id=body.site_id,
        worker_identity=body.worker_identity,
        transcript=transcript or '[transcription pending]',
        audio_base64=body.audio_base64,
        created_at=datetime.now(timezone.utc),
    )
    # Store by worker_identity so notes are attached to the person, not the feed
    key = note.worker_identity or feed_id
    NOTES.setdefault(key, []).append(note)
    return note


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


@router.websocket("/ws/pipeline/{site_id}")
async def ws_pipeline(ws: WebSocket, site_id: str):
    await ws_manager.connect(f"pipeline:{site_id}", ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(f"pipeline:{site_id}", ws)


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


# ── World Labs 3D generation endpoints ──────────────────────────────────────

async def _run_world_generation(
    world_id: str,
    input_type: str,
    file_path: str | None,
    image_base64: str | None,
    display_name: str,
    text_prompt: str | None,
):
    """Background coroutine: calls World Labs API, polls until done, cleans up temp file."""
    tmp_to_delete = file_path  # remember original for cleanup
    try:
        result = await asyncio.to_thread(
            generate_world, input_type, file_path, image_base64, display_name, text_prompt
        )
        operation_id = result["operation_id"]
        WORLDS[world_id].operation_id = operation_id
        while True:
            await asyncio.sleep(15)
            status = await asyncio.to_thread(poll_operation, operation_id)
            WORLDS[world_id].progress = status.get("progress", "")
            if status.get("done"):
                if status.get("error"):
                    WORLDS[world_id].status = "error"
                    WORLDS[world_id].error = str(status["error"])
                else:
                    WORLDS[world_id].status = "done"
                    WORLDS[world_id].world_id = status.get("world_id")
                    WORLDS[world_id].marble_url = status.get("marble_url")
                    WORLDS[world_id].worldvr_url = status.get("worldvr_url")
                break
    except Exception as exc:
        if world_id in WORLDS:
            WORLDS[world_id].status = "error"
            WORLDS[world_id].error = str(exc)
    finally:
        # Clean up uploaded temp file
        if tmp_to_delete and os.path.exists(tmp_to_delete):
            try:
                os.remove(tmp_to_delete)
            except OSError:
                pass
        # worldlabs.py may produce a .upload.mp4 alongside the original
        if tmp_to_delete:
            compressed = os.path.splitext(tmp_to_delete)[0] + ".upload.mp4"
            if os.path.exists(compressed):
                try:
                    os.remove(compressed)
                except OSError:
                    pass


@router.post("/worlds", response_model=SiteWorld)
async def submit_world(
    site_id: str = Form(...),
    input_type: str = Form("video"),
    display_name: str = Form("Site World"),
    text_prompt: str | None = Form(None),
    file: UploadFile | None = File(None),
):
    """Start 3D world generation from a video or image clip."""
    world_id = f"wg_{uuid.uuid4().hex[:12]}"
    file_path: str | None = None

    if file and file.filename:
        ext = os.path.splitext(file.filename)[1] or ".mp4"
        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            content = await file.read()
            tmp.write(content)
            file_path = tmp.name

    world = SiteWorld(
        id=world_id,
        site_id=site_id,
        operation_id="pending",
        status="generating",
        progress="Submitting to World Labs…",
        created_at=datetime.now(timezone.utc),
    )
    WORLDS[world_id] = world
    asyncio.create_task(
        _run_world_generation(world_id, input_type, file_path, None, display_name, text_prompt)
    )
    return world


@router.get("/worlds", response_model=list[SiteWorld])
async def list_worlds(site_id: str | None = None):
    """List all world generation jobs, optionally filtered by site."""
    result = [w for w in WORLDS.values() if site_id is None or w.site_id == site_id]
    return sorted(result, key=lambda w: w.created_at, reverse=True)


@router.get("/worlds/{world_id}", response_model=SiteWorld)
async def get_world(world_id: str):
    """Get current status of a world generation job."""
    world = WORLDS.get(world_id)
    if not world:
        raise HTTPException(404, "World job not found")
    return world


def _frames_to_video(frames_base64: list[str], tmp_dir: str) -> str:
    """Save JPEG frames and stitch into an MP4 via ffmpeg concat. Returns video path."""
    import base64 as _b64
    from app.services.worldlabs import _get_ffmpeg_path

    frame_paths = []
    for i, b64 in enumerate(frames_base64):
        raw = b64.split(",", 1)[-1]  # strip data URL prefix if present
        img_bytes = _b64.b64decode(raw)
        p = os.path.join(tmp_dir, f"frame_{i:02d}.jpg")
        with open(p, "wb") as f:
            f.write(img_bytes)
        frame_paths.append(p)

    concat_path = os.path.join(tmp_dir, "concat.txt")
    with open(concat_path, "w") as f:
        for p in frame_paths:
            f.write(f"file '{p}'\n")
            f.write("duration 2\n")
        # ffmpeg concat requires repeating last entry to flush final frame
        f.write(f"file '{frame_paths[-1]}'\n")

    video_path = os.path.join(tmp_dir, "site_scan.mp4")
    cmd = [
        _get_ffmpeg_path(), "-y", "-f", "concat", "-safe", "0",
        "-i", concat_path,
        "-vf", "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
        "-c:v", "libx264", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        video_path,
    ]
    import subprocess as _sp
    result = _sp.run(cmd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"ffmpeg frame stitch failed: {result.stderr.strip()}")
    return video_path


@router.post("/worlds/from-frames", response_model=SiteWorld)
async def submit_world_from_frames(body: FramesWorldRequest):
    """
    Generate a 3D world from 6 helmet-cam frames captured during a live session.
    Frames are stitched into a slideshow video via ffmpeg, then sent to World Labs.
    """
    if len(body.frames_base64) < 2:
        raise HTTPException(400, "At least 2 frames required")

    world_id = f"wg_{uuid.uuid4().hex[:12]}"
    tmp_dir = tempfile.mkdtemp(prefix="site_scan_")

    world = SiteWorld(
        id=world_id,
        site_id=body.site_id,
        worker_identity=body.worker_identity,
        operation_id="pending",
        status="generating",
        progress="Stitching frames into video…",
        created_at=datetime.now(timezone.utc),
    )
    WORLDS[world_id] = world

    async def _run():
        try:
            video_path = await asyncio.to_thread(
                _frames_to_video, body.frames_base64, tmp_dir
            )
            result = await asyncio.to_thread(
                generate_world, "video", video_path, None,
                body.display_name, None
            )
            WORLDS[world_id].operation_id = result["operation_id"]
            WORLDS[world_id].progress = "Submitted — building 3D world…"
            while True:
                await asyncio.sleep(15)
                status = await asyncio.to_thread(poll_operation, WORLDS[world_id].operation_id)
                WORLDS[world_id].progress = status.get("progress", "")
                if status.get("done"):
                    if status.get("error"):
                        WORLDS[world_id].status = "error"
                        WORLDS[world_id].error = str(status["error"])
                    else:
                        WORLDS[world_id].status = "done"
                        WORLDS[world_id].world_id = status.get("world_id")
                        WORLDS[world_id].marble_url = status.get("marble_url")
                        WORLDS[world_id].worldvr_url = status.get("worldvr_url")
                    break
        except Exception as exc:
            if world_id in WORLDS:
                WORLDS[world_id].status = "error"
                WORLDS[world_id].error = str(exc)
        finally:
            import shutil as _shutil
            try:
                _shutil.rmtree(tmp_dir, ignore_errors=True)
            except Exception:
                pass

    asyncio.create_task(_run())
    return world
