"""Worker registry endpoints — register helmet-cam workers and track their status."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

from app.models.streaming import WorkerInfo, WorkerRegisterRequest, WorkerStatusUpdate
from app.services.worker_registry import register_worker, get_workers, update_status, heartbeat

router = APIRouter()


def _room_name_for_site(site_id: str) -> str:
    """One LiveKit room per site: site-{siteId}."""
    return f"site-{site_id}"


@router.post("/register", response_model=WorkerInfo)
async def register(body: WorkerRegisterRequest):
    """
    Register a worker device. Called by the Android headset client on startup.
    Returns WorkerInfo including the room_name the client should join.
    """
    room_name = _room_name_for_site(body.site_id)
    return register_worker(
        identity=body.identity,
        display_name=body.display_name,
        site_id=body.site_id,
        room_name=room_name,
        feed_id=body.feed_id,
    )


@router.get("", response_model=list[WorkerInfo])
async def list_all_workers(site_id: str | None = None):
    """List registered workers, optionally filtered by site_id."""
    return get_workers(site_id=site_id)


@router.patch("/{identity}/status", response_model=WorkerInfo)
async def set_worker_status(identity: str, body: WorkerStatusUpdate):
    """Update a worker's status (online | offline | streaming)."""
    worker = update_status(identity, body.status)
    if not worker:
        raise HTTPException(404, "Worker not found")
    return worker


@router.post("/{identity}/heartbeat", response_model=WorkerInfo)
async def worker_heartbeat(identity: str):
    """Keepalive ping. Worker devices call this every 30s to stay marked online."""
    worker = heartbeat(identity)
    if not worker:
        raise HTTPException(404, "Worker not found")
    return worker
