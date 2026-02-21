"""Verify that the Safety Agent pipeline can fetch video_results from Supabase
and produce deterministic OSHA violations.

Usage:
    python scripts/verify_supabase_fetch.py

If Supabase isn't seeded yet, run:
    python scripts/seed_supabase.py
"""
from __future__ import annotations

import sys
import os

# Allow running from repo root
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.config import SUPABASE_URL, SUPABASE_KEY


def _separator(msg: str, ok: bool = True) -> None:
    icon = "✓" if ok else "✗"
    print(f"  {icon}  {msg}")


def check_supabase_fetch() -> bool:
    """Try fetching mock_vj_001 video result from Supabase and run rule checks."""
    from app.agents.safety_agent import run_deterministic_checks
    from app.models.video import VideoProcessingResult

    # ------------------------------------------------------------------ #
    # Path A: Supabase configured — try real fetch                        #
    # ------------------------------------------------------------------ #
    if SUPABASE_URL and SUPABASE_KEY:
        print("\n[Supabase mode] Credentials detected — fetching from Supabase...\n")
        try:
            from supabase import create_client
            sb = create_client(SUPABASE_URL, SUPABASE_KEY)
            _separator("Connected to Supabase")
        except Exception as exc:
            _separator(f"Failed to connect: {exc}", ok=False)
            return False

        rows = sb.table("video_results").select("*").eq("job_id", "mock_vj_001").execute().data
        if not rows:
            _separator(
                "No row found for mock_vj_001. Run: python scripts/seed_supabase.py",
                ok=False,
            )
            return False

        _separator("Fetched video_results row for mock_vj_001")
        try:
            result = VideoProcessingResult(**rows[0]["data"])
        except Exception as exc:
            _separator(f"Deserialization failed: {exc}", ok=False)
            return False

    # ------------------------------------------------------------------ #
    # Path B: No Supabase — use in-memory mock (still proves the logic)  #
    # ------------------------------------------------------------------ #
    else:
        print("\n[In-memory fallback] SUPABASE_URL/KEY not set — using mock data.\n")
        print(
            "  ℹ  Add SUPABASE_URL and SUPABASE_KEY to .env to test the real DB fetch.\n"
        )
        from app.data.mock_video_results import MOCK_VIDEO_RESULT
        result = MOCK_VIDEO_RESULT
        _separator("Loaded mock VideoProcessingResult (in-memory)")

    # ------------------------------------------------------------------ #
    # Common assertions                                                   #
    # ------------------------------------------------------------------ #
    zone_count = len(result.zones)
    worker_count = sum(len(z.workers) for z in result.zones)
    _separator(f"Deserialized: {zone_count} zones, {worker_count} workers")

    if zone_count != 5:
        _separator(f"Expected 5 zones, got {zone_count}", ok=False)
        return False

    violations = run_deterministic_checks(result)
    vcount = len(violations)
    _separator(f"Deterministic OSHA checks: {vcount} violations found")

    if vcount < 20:
        _separator(f"Expected ≥ 20 violations, got {vcount}", ok=False)
        return False

    high_count = sum(1 for v in violations if str(v.severity) in ("high", "AlertSeverity.high"))
    print(f"\n  Violation breakdown:")
    from collections import Counter
    types = Counter(v.type for v in violations)
    for t, c in sorted(types.items(), key=lambda x: -x[1]):
        print(f"    {t:25s} × {c}")

    print(f"\n  High-severity: {high_count} / {vcount} total")

    return True


def check_safety_report_save() -> bool:
    """Verify that save_safety_report writes back to Supabase (or in-memory)."""
    import asyncio
    from app.services import db
    from app.data.mock_video_results import MOCK_VIDEO_RESULT
    from app.agents.safety_agent import run_deterministic_checks, _compute_compliance, _compute_overall_risk
    from app.models.analysis import SafetyReport
    from datetime import datetime, timezone

    violations = run_deterministic_checks(MOCK_VIDEO_RESULT)
    ppe, zone = _compute_compliance(MOCK_VIDEO_RESULT, violations)
    risk = _compute_overall_risk(violations)

    report = SafetyReport(
        site_id="s1",
        violations=violations,
        ppe_compliance=ppe,
        zone_adherence=zone,
        overall_risk=risk,
        summary="[verify_supabase_fetch.py] Test save — not from LLM.",
        generated_at=datetime.now(timezone.utc),
    )

    async def _save():
        await db.save_safety_report("s1", report)
        fetched = await db.get_safety_report("s1")
        return fetched

    fetched = asyncio.run(_save())
    if fetched is None:
        _separator("save/fetch safety report: got None back", ok=False)
        return False

    _separator(f"Saved and re-fetched safety report: {len(fetched.violations)} violations, risk={fetched.overall_risk}")
    return True


def main() -> None:
    print("=" * 60)
    print("  IronMiner — Safety Agent Supabase Fetch Verification")
    print("=" * 60)

    step1 = check_supabase_fetch()
    print()
    step2 = check_safety_report_save()

    print("\n" + "=" * 60)
    if step1 and step2:
        print("  PASS — Supabase fetch pipeline is working end-to-end")
    else:
        print("  FAIL — see errors above")
        sys.exit(1)
    print("=" * 60)


if __name__ == "__main__":
    main()
