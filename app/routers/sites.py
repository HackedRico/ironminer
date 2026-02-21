from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from app.models.site import Site, SiteCreate
from app.services import db

router = APIRouter()


@router.get("", response_model=list[Site])
async def list_sites(status: str | None = None):
    return await db.get_sites(status)


@router.post("", response_model=Site)
async def create_site(body: SiteCreate):
    # Generate an id — count existing sites for a simple incrementing id
    existing = await db.get_sites()
    site_id = f"s{len(existing) + 1}"
    site = Site(id=site_id, name=body.name, address=body.address)
    return await db.create_site(site)


@router.get("/{site_id}", response_model=Site)
async def get_site(site_id: str):
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    return site


@router.get("/{site_id}/frames")
async def get_site_frames(site_id: str, limit: int = 50, offset: int = 0):
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    return await db.get_frames(site_id, limit, offset)


@router.get("/{site_id}/briefing")
async def get_site_briefing(site_id: str):
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    text = await db.get_briefing(site_id)
    return {"text": text or "No briefing available yet.", "generated_at": datetime.now(timezone.utc)}


@router.get("/{site_id}/timeline")
async def get_site_timeline(site_id: str):
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    # TODO: return temporal analysis chain once video agent populates it
    return []
