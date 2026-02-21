"""In-memory worker registry. Workers register on headset startup."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Optional

from app.models.streaming import WorkerInfo

# Global registry: identity → WorkerInfo
# Follows the same pattern as app/services/storage.py
WORKERS: dict[str, WorkerInfo] = {}


def register_worker(
    identity: str,
    display_name: str,
    site_id: str,
    room_name: str,
    feed_id: Optional[str] = None,
) -> WorkerInfo:
    now = datetime.now(timezone.utc)
    worker = WorkerInfo(
        identity=identity,
        display_name=display_name,
        site_id=site_id,
        feed_id=feed_id,
        status="online",
        room_name=room_name,
        registered_at=now,
        last_heartbeat=now,
    )
    WORKERS[identity] = worker
    return worker


def get_workers(site_id: Optional[str] = None) -> list[WorkerInfo]:
    workers = list(WORKERS.values())
    if site_id:
        workers = [w for w in workers if w.site_id == site_id]
    return workers


def update_status(identity: str, status: str) -> Optional[WorkerInfo]:
    worker = WORKERS.get(identity)
    if not worker:
        return None
    worker.status = status
    WORKERS[identity] = worker
    return worker


def heartbeat(identity: str) -> Optional[WorkerInfo]:
    worker = WORKERS.get(identity)
    if not worker:
        return None
    worker.last_heartbeat = datetime.now(timezone.utc)
    WORKERS[identity] = worker
    return worker
