from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from app.models.alert import Alert, AlertCreate
from app.services.storage import ALERTS

router = APIRouter()

_counter = len(ALERTS)


@router.get("", response_model=list[Alert])
async def list_alerts(
    site_id: str | None = None,
    severity: str | None = None,
    acknowledged: bool | None = None,
    limit: int = 50,
):
    alerts = list(ALERTS.values())
    if site_id:
        alerts = [a for a in alerts if a.site_id == site_id]
    if severity:
        alerts = [a for a in alerts if a.severity == severity]
    if acknowledged is not None:
        alerts = [a for a in alerts if a.acknowledged == acknowledged]
    alerts.sort(key=lambda a: a.created_at, reverse=True)
    return alerts[:limit]


@router.get("/{alert_id}", response_model=Alert)
async def get_alert(alert_id: str):
    alert = ALERTS.get(alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    return alert


@router.patch("/{alert_id}/acknowledge", response_model=Alert)
async def acknowledge_alert(alert_id: str):
    alert = ALERTS.get(alert_id)
    if not alert:
        raise HTTPException(404, "Alert not found")
    alert.acknowledged = True
    ALERTS[alert_id] = alert
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
    ALERTS[alert_id] = alert
    return alert
