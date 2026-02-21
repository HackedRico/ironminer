from __future__ import annotations
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException

from app.models.site import Site, SiteCreate
from app.services.storage import SITES, BRIEFINGS, FRAMES

router = APIRouter()


@router.get("", response_model=list[Site])
async def list_sites(status: str | None = None):
    sites = list(SITES.values())
    if status:
        sites = [s for s in sites if s.status == status]
    return sites


@router.post("", response_model=Site)
async def create_site(body: SiteCreate):
    site_id = f"s{len(SITES) + 1}"
    site = Site(id=site_id, name=body.name, address=body.address)
    SITES[site_id] = site
    return site


@router.get("/{site_id}", response_model=Site)
async def get_site(site_id: str):
    site = SITES.get(site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    return site


@router.get("/{site_id}/frames")
async def get_site_frames(site_id: str, limit: int = 50, offset: int = 0):
    if site_id not in SITES:
        raise HTTPException(404, "Site not found")
    frames = FRAMES.get(site_id, [])
    return frames[offset : offset + limit]


@router.get("/{site_id}/briefing")
async def get_site_briefing(site_id: str):
    if site_id not in SITES:
        raise HTTPException(404, "Site not found")
    text = BRIEFINGS.get(site_id, "No briefing available yet.")
    return {"text": text, "generated_at": datetime.now(timezone.utc)}


@router.get("/{site_id}/timeline")
async def get_site_timeline(site_id: str):
    if site_id not in SITES:
        raise HTTPException(404, "Site not found")
    # TODO: return temporal analysis chain once video agent populates it
    return []
