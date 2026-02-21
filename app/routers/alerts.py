from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from app.models.alert import Alert, AlertCreate
from app.services import db

router = APIRouter()

_counter = 5  # seed data has 5 alerts


@router.get("", response_model=list[Alert])
async def list_alerts(
    site_id: str | None = None,
    severity: str | None = None,
    acknowledged: bool | None = None,
    limit: int = 50,
):
    return await db.get_alerts(site_id=site_id, severity=severity, acknowledged=acknowledged, limit=limit)


@router.get("/{alert_id}", response_model=Alert)
async def get_alert(alert_id: str):
    alert = await db.get_alert(alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    return alert


@router.patch("/{alert_id}/acknowledge", response_model=Alert)
async def acknowledge_alert(alert_id: str):
    alert = await db.update_alert(alert_id, {"acknowledged": True})
    if not alert:
        raise HTTPException(404, "Alert not found")
    return alert


@router.post("", response_model=Alert)
async def create_alert(body: AlertCreate):
    global _counter
    _counter += 1
    alert_id = f"a_{_counter:03d}"
    alert = Alert(
        id=alert_id,
        site_id=body.site_id,
        site_name=body.site_name,
        severity=body.severity,
        title=body.title,
        detail=body.detail,
        source_agent=body.source_agent,
        created_at=datetime.now(timezone.utc),
    )
    return await db.create_alert(alert)
