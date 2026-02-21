"""Push mock seed data into Supabase tables.

Idempotent — uses upsert so it can be re-run safely.

Usage:
    python scripts/seed_supabase.py
"""
from __future__ import annotations

import sys
import os

# Allow running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from supabase import create_client

from app.config import SUPABASE_URL, SUPABASE_KEY
from app.services.storage import SITES, ALERTS, BRIEFINGS, FEEDS, VIDEO_RESULTS


def main() -> None:
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("ERROR: Set SUPABASE_URL and SUPABASE_KEY env vars (or in .env)")
        sys.exit(1)

    sb = create_client(SUPABASE_URL, SUPABASE_KEY)

    # ── Sites ─────────────────────────────────────────────────────────────────
    print(f"Upserting {len(SITES)} sites...")
    for site in SITES.values():
        row = site.model_dump(mode="json")
        # zones stored as JSONB column
        sb.table("sites").upsert(row, on_conflict="id").execute()

    # ── Alerts ────────────────────────────────────────────────────────────────
    print(f"Upserting {len(ALERTS)} alerts...")
    for alert in ALERTS.values():
        row = alert.model_dump(mode="json")
        sb.table("alerts").upsert(row, on_conflict="id").execute()

    # ── Briefings ─────────────────────────────────────────────────────────────
    print(f"Upserting {len(BRIEFINGS)} briefings...")
    for site_id, text in BRIEFINGS.items():
        sb.table("briefings").upsert(
            {"site_id": site_id, "text": text}, on_conflict="site_id"
        ).execute()

    # ── Feeds ─────────────────────────────────────────────────────────────────
    print(f"Upserting {len(FEEDS)} feeds...")
    for feed in FEEDS.values():
        row = feed.model_dump(mode="json")
        sb.table("feeds").upsert(row, on_conflict="id").execute()

    # ── Video results ─────────────────────────────────────────────────────────
    print(f"Upserting {len(VIDEO_RESULTS)} video results...")
    for vr in VIDEO_RESULTS.values():
        sb.table("video_results").upsert(
            {
                "job_id": vr.job_id,
                "site_id": vr.site_id,
                "data": vr.model_dump(mode="json"),
            },
            on_conflict="job_id",
        ).execute()

    print("Done! All seed data upserted.")


if __name__ == "__main__":
    main()
