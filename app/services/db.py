"""Async database access layer. Reads from Supabase when configured, falls back to in-memory storage."""
from __future__ import annotations

import asyncio
from typing import Optional

from app.services.supabase_client import get_supabase
from app.models.site import Site
from app.models.alert import Alert
from app.models.streaming import FeedConfig
from app.models.video import VideoProcessingResult, FrameData
from app.models.analysis import SafetyReport

# Lazy import to avoid circular — storage module is only needed for fallback
_storage = None


def _get_storage():
    global _storage
    if _storage is None:
        from app.services import storage as _s
        _storage = _s
    return _storage


# ── Sites ──────────────────────────────────────────────────────────────────────

async def get_sites(status: Optional[str] = None) -> list[Site]:
    sb = get_supabase()
    if not sb:
        sites = list(_get_storage().SITES.values())
        if status:
            sites = [s for s in sites if s.status == status]
        return sites

    def _query():
        q = sb.table("sites").select("*")
        if status:
            q = q.eq("status", status)
        return q.execute().data

    rows = await asyncio.to_thread(_query)
    return [Site(**r) for r in rows]


async def get_site(site_id: str) -> Optional[Site]:
    sb = get_supabase()
    if not sb:
        return _get_storage().SITES.get(site_id)

    def _query():
        return sb.table("sites").select("*").eq("id", site_id).execute().data

    rows = await asyncio.to_thread(_query)
    return Site(**rows[0]) if rows else None


async def create_site(site: Site) -> Site:
    sb = get_supabase()
    if not sb:
        _get_storage().SITES[site.id] = site
        return site

    def _query():
        row = site.model_dump(mode="json")
        sb.table("sites").upsert(row, on_conflict="id").execute()

    await asyncio.to_thread(_query)
    return site


# ── Briefings ──────────────────────────────────────────────────────────────────

async def get_briefing(site_id: str) -> Optional[str]:
    sb = get_supabase()
    if not sb:
        return _get_storage().BRIEFINGS.get(site_id)

    def _query():
        return sb.table("briefings").select("text").eq("site_id", site_id).execute().data

    rows = await asyncio.to_thread(_query)
    return rows[0]["text"] if rows else None


# ── Frames (in-memory only — no Supabase table) ───────────────────────────────

async def get_frames(site_id: str, limit: int = 50, offset: int = 0) -> list[FrameData]:
    frames = _get_storage().FRAMES.get(site_id, [])
    return frames[offset: offset + limit]


# ── Alerts ─────────────────────────────────────────────────────────────────────

async def get_alerts(
    site_id: Optional[str] = None,
    severity: Optional[str] = None,
    acknowledged: Optional[bool] = None,
    limit: int = 50,
) -> list[Alert]:
    sb = get_supabase()
    if not sb:
        alerts = list(_get_storage().ALERTS.values())
        if site_id:
            alerts = [a for a in alerts if a.site_id == site_id]
        if severity:
            alerts = [a for a in alerts if a.severity == severity]
        if acknowledged is not None:
            alerts = [a for a in alerts if a.acknowledged == acknowledged]
        alerts.sort(key=lambda a: a.created_at, reverse=True)
        return alerts[:limit]

    def _query():
        q = sb.table("alerts").select("*")
        if site_id:
            q = q.eq("site_id", site_id)
        if severity:
            q = q.eq("severity", severity)
        if acknowledged is not None:
            q = q.eq("acknowledged", acknowledged)
        q = q.order("created_at", desc=True).limit(limit)
        return q.execute().data

    rows = await asyncio.to_thread(_query)
    return [Alert(**r) for r in rows]


async def get_alert(alert_id: str) -> Optional[Alert]:
    sb = get_supabase()
    if not sb:
        return _get_storage().ALERTS.get(alert_id)

    def _query():
        return sb.table("alerts").select("*").eq("id", alert_id).execute().data

    rows = await asyncio.to_thread(_query)
    return Alert(**rows[0]) if rows else None


async def create_alert(alert: Alert) -> Alert:
    sb = get_supabase()
    if not sb:
        _get_storage().ALERTS[alert.id] = alert
        return alert

    def _query():
        row = alert.model_dump(mode="json")
        sb.table("alerts").upsert(row, on_conflict="id").execute()

    await asyncio.to_thread(_query)
    return alert


async def update_alert(alert_id: str, data: dict) -> Optional[Alert]:
    sb = get_supabase()
    if not sb:
        alert = _get_storage().ALERTS.get(alert_id)
        if not alert:
            return None
        for k, v in data.items():
            setattr(alert, k, v)
        _get_storage().ALERTS[alert_id] = alert
        return alert

    def _query():
        return sb.table("alerts").update(data).eq("id", alert_id).execute().data

    rows = await asyncio.to_thread(_query)
    return Alert(**rows[0]) if rows else None


# ── Feeds ──────────────────────────────────────────────────────────────────────

async def get_feeds(site_id: Optional[str] = None) -> list[FeedConfig]:
    sb = get_supabase()
    if not sb:
        feeds = list(_get_storage().FEEDS.values())
        if site_id:
            feeds = [f for f in feeds if f.site_id == site_id]
        return feeds

    def _query():
        q = sb.table("feeds").select("*")
        if site_id:
            q = q.eq("site_id", site_id)
        return q.execute().data

    rows = await asyncio.to_thread(_query)
    return [FeedConfig(**r) for r in rows]


async def get_feed(feed_id: str) -> Optional[FeedConfig]:
    sb = get_supabase()
    if not sb:
        return _get_storage().FEEDS.get(feed_id)

    def _query():
        return sb.table("feeds").select("*").eq("id", feed_id).execute().data

    rows = await asyncio.to_thread(_query)
    return FeedConfig(**rows[0]) if rows else None


async def create_feed(feed: FeedConfig) -> FeedConfig:
    sb = get_supabase()
    if not sb:
        _get_storage().FEEDS[feed.id] = feed
        return feed

    def _query():
        row = feed.model_dump(mode="json")
        sb.table("feeds").upsert(row, on_conflict="id").execute()

    await asyncio.to_thread(_query)
    return feed


async def update_feed(feed_id: str, data: dict) -> Optional[FeedConfig]:
    sb = get_supabase()
    if not sb:
        feed = _get_storage().FEEDS.get(feed_id)
        if not feed:
            return None
        for k, v in data.items():
            setattr(feed, k, v)
        _get_storage().FEEDS[feed_id] = feed
        return feed

    def _query():
        return sb.table("feeds").update(data).eq("id", feed_id).execute().data

    rows = await asyncio.to_thread(_query)
    return FeedConfig(**rows[0]) if rows else None


# ── Video Results ──────────────────────────────────────────────────────────────

async def get_video_result(job_id: str) -> Optional[VideoProcessingResult]:
    sb = get_supabase()
    if not sb:
        return _get_storage().VIDEO_RESULTS.get(job_id)

    def _query():
        return sb.table("video_results").select("*").eq("job_id", job_id).execute().data

    rows = await asyncio.to_thread(_query)
    if not rows:
        return None
    return VideoProcessingResult(**rows[0]["data"])


async def save_video_result(job_id: str, site_id: str, result: VideoProcessingResult) -> None:
    sb = get_supabase()
    if not sb:
        _get_storage().VIDEO_RESULTS[job_id] = result
        return

    def _query():
        sb.table("video_results").upsert(
            {"job_id": job_id, "site_id": site_id, "data": result.model_dump(mode="json")},
            on_conflict="job_id",
        ).execute()

    await asyncio.to_thread(_query)


# ── Safety Reports ─────────────────────────────────────────────────────────────

async def get_safety_report(site_id: str) -> Optional[SafetyReport]:
    sb = get_supabase()
    if not sb:
        return _get_storage().SAFETY_REPORTS.get(site_id)

    def _query():
        return sb.table("safety_reports").select("*").eq("site_id", site_id).execute().data

    rows = await asyncio.to_thread(_query)
    if not rows:
        return None
    return SafetyReport(**rows[0]["data"])


async def save_safety_report(site_id: str, report: SafetyReport) -> None:
    sb = get_supabase()
    if not sb:
        _get_storage().SAFETY_REPORTS[site_id] = report
        return

    def _query():
        generated_at = getattr(report, "generated_at", None)
        if generated_at is None:
            generated_at = datetime.now(timezone.utc)
        sb.table("safety_reports").upsert(
            {
                "site_id": site_id,
                "generated_at": generated_at,
                "data": report.model_dump(mode="json"),
            },
            on_conflict="site_id",
        ).execute()

    await asyncio.to_thread(_query)
