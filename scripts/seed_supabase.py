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

    # ── Safety report (pre-computed from mock data) ───────────────────────────
    _seed_safety_report(sb)

    print("Done! All seed data upserted.")


def _seed_safety_report(sb) -> None:
    """Compute and upsert the Safety Agent report for site s1."""
    from datetime import datetime, timezone
    from app.agents.safety_agent import (
        run_deterministic_checks,
        _compute_compliance,
        _compute_overall_risk,
    )
    from app.models.analysis import SafetyReport
    from app.data.mock_video_results import MOCK_VIDEO_RESULT

    violations = run_deterministic_checks(MOCK_VIDEO_RESULT)
    ppe, zone = _compute_compliance(MOCK_VIDEO_RESULT, violations)
    risk = _compute_overall_risk(violations)
    summary = (
        f"[Pre-seeded] {len(violations)} safety violations detected across Riverside Tower. "
        f"Overall risk: {risk}. Top concerns: Zone B scaffold congestion (3 trades, 400 sqft), "
        f"Zone C crane violations (workers under suspended load, missing hard hats in swing radius), "
        f"Zone E live electrical work without LOTO and hot work without fire watch. "
        f"Run backend analysis to generate a full LLM-written executive summary."
    )
    report = SafetyReport(
        site_id="s1",
        violations=violations,
        ppe_compliance=ppe,
        zone_adherence=zone,
        overall_risk=risk,
        summary=summary,
        generated_at=datetime.now(timezone.utc),
    )
    print(f"Upserting safety report for s1 ({len(violations)} violations, risk={risk})...")
    sb.table("safety_reports").upsert(
        {
            "site_id": "s1",
            "generated_at": report.generated_at.isoformat(),
            "data": report.model_dump(mode="json"),
        },
        on_conflict="site_id",
    ).execute()


if __name__ == "__main__":
    main()
