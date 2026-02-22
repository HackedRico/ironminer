from __future__ import annotations

import logging
import uuid
from datetime import date as date_type, datetime, timezone

from fastapi import APIRouter, HTTPException, Query
from typing import Optional

from app.models.analysis import ProductivityReport, ProductivityAnalyzeRequest, TradeOverlap
from app.models.benchmarks import (
    Benchmark, BenchmarkCreate, BenchmarkGoal,
    EvaluateRequest, EvaluationResult, GoalResult,
)
from app.models.site import Zone
from app.services import db
from app.services.storage import (
    PRODUCTIVITY_REPORTS, BENCHMARKS, EVALUATIONS, VIDEO_RESULTS,
)
from app.agents.productivity_agent import ProductivityAgent

logger = logging.getLogger(__name__)

router = APIRouter()
agent = ProductivityAgent()


# ── Existing site-based endpoints ─────────────────────────────────────────────

@router.post("/analyze", response_model=ProductivityReport)
async def run_productivity_analysis(body: ProductivityAnalyzeRequest):
    video_result = await db.get_video_result(body.video_job_id)
    if not video_result:
        raise HTTPException(404, "Video result not found — run video processing first")
    report = await agent.process(site_id=body.site_id, video_result=video_result)
    PRODUCTIVITY_REPORTS[body.site_id] = report
    return report


@router.get("/report/{site_id}", response_model=ProductivityReport)
async def get_productivity_report(site_id: str):
    report = PRODUCTIVITY_REPORTS.get(site_id)
    if not report:
        raise HTTPException(404, "No productivity report for this site yet")
    return report


@router.get("/report/{site_id}/zones", response_model=list[Zone])
async def get_zones(site_id: str):
    site = await db.get_site(site_id)
    if not site:
        raise HTTPException(404, "Site not found")
    return site.zones


@router.get("/report/{site_id}/overlaps", response_model=list[TradeOverlap])
async def get_overlaps(site_id: str):
    report = PRODUCTIVITY_REPORTS.get(site_id)
    if not report:
        raise HTTPException(404, "No productivity report for this site yet")
    return report.trade_overlaps


@router.get("/report/{site_id}/suggestions")
async def get_suggestions(site_id: str):
    report = PRODUCTIVITY_REPORTS.get(site_id)
    if not report:
        raise HTTPException(404, "No productivity report for this site yet")
    return report.resource_suggestions


@router.get("/trend/{site_id}")
async def get_trend(site_id: str, hours: int = 24):
    report = PRODUCTIVITY_REPORTS.get(site_id)
    trend = report.congestion_trend if report else "stable"
    return {"trend": trend, "data_points": []}


# ── Teams (for benchmark view) ───────────────────────────────────────────────

@router.get("/teams")
async def list_productivity_teams(site_id: Optional[str] = None):
    """Return teams for the productivity benchmark view."""
    from app.services.team_service import TEAMS

    today = str(date_type.today())
    teams = list(TEAMS.values())

    if site_id:
        teams = [t for t in teams if t.site_id == site_id]

    # Filter to today's teams (or show all if none for today)
    today_teams = [t for t in teams if t.date == today]
    if today_teams:
        teams = today_teams

    return [t.model_dump() for t in teams]


@router.get("/teams/{team_id}")
async def get_productivity_team(team_id: str):
    from app.services.team_service import TEAMS
    team = TEAMS.get(team_id)
    if not team:
        raise HTTPException(404, "Team not found")
    return team.model_dump()


# ── Benchmarks ───────────────────────────────────────────────────────────────

def _find_latest_benchmark(team_id: str, date: str) -> Benchmark | None:
    """Find the highest-version benchmark for a team+date."""
    best = None
    for key, bm in BENCHMARKS.items():
        if bm.team_id == team_id and bm.date == date:
            if best is None or bm.version > best.version:
                best = bm
    return best


@router.get("/teams/{team_id}/benchmark")
async def get_benchmark(team_id: str, date: Optional[str] = Query(default=None)):
    d = date or str(date_type.today())
    bm = _find_latest_benchmark(team_id, d)
    if not bm:
        raise HTTPException(404, "No benchmark found for this team/date")
    return bm.model_dump()


@router.get("/teams/{team_id}/benchmark/versions")
async def get_benchmark_versions(team_id: str, date: Optional[str] = Query(default=None)):
    d = date or str(date_type.today())
    versions = [bm for bm in BENCHMARKS.values() if bm.team_id == team_id and bm.date == d]
    versions.sort(key=lambda b: b.version)
    return [v.model_dump() for v in versions]


@router.post("/teams/{team_id}/benchmark")
async def save_benchmark(team_id: str, body: BenchmarkCreate):
    from app.services.team_service import TEAMS
    if team_id not in TEAMS:
        raise HTTPException(404, "Team not found")

    now = datetime.now(timezone.utc)

    # Auto-assign IDs to goals that don't have them
    for i, g in enumerate(body.goals):
        if not g.id or g.id.startswith("new_"):
            g.id = f"g_{uuid.uuid4().hex[:6]}"

    # Determine next version
    existing = _find_latest_benchmark(team_id, body.date)
    version = (existing.version + 1) if existing else 1

    bm = Benchmark(
        team_id=team_id,
        date=body.date,
        version=version,
        goals=body.goals,
        created_at=now,
        updated_at=now,
    )
    key = f"{team_id}:{body.date}:{version}"
    BENCHMARKS[key] = bm
    logger.info("Saved benchmark %s v%d with %d goals", team_id, version, len(body.goals))
    return bm.model_dump()


# ── Evaluation ───────────────────────────────────────────────────────────────

@router.post("/teams/{team_id}/evaluate")
async def run_evaluation(team_id: str, body: EvaluateRequest):
    """Run benchmark vs VLM comparison using prod_semantics (or keyword fallback)."""
    from app.services.team_service import TEAMS

    team = TEAMS.get(team_id)
    if not team:
        raise HTTPException(404, "Team not found")

    # Get benchmark
    bm = _find_latest_benchmark(team_id, body.date)
    if not bm or not bm.goals:
        raise HTTPException(404, "No benchmark with goals found for this team/date")

    # Get VLM zone data
    video_result = None
    if body.vlm_job_id:
        video_result = VIDEO_RESULTS.get(body.vlm_job_id)
    if not video_result and body.site_id:
        # Find latest video result for this site
        for vr in VIDEO_RESULTS.values():
            if vr.site_id == body.site_id:
                video_result = vr
                break
    if not video_result:
        # Fall back to any result for the team's site
        for vr in VIDEO_RESULTS.values():
            if vr.site_id == team.site_id:
                video_result = vr
                break
    if not video_result:
        raise HTTPException(404, "No video analysis data available for evaluation")

    # Convert benchmark goals to standards list
    standards = [g.description for g in bm.goals]

    # Run evaluator
    from app.agents.evaluator_factory import get_evaluator
    evaluator = get_evaluator(standards=standards)
    zone_reports = evaluator.evaluate_from_texts(
        zone_analyses=video_result.zone_analyses,
        entity_relationships=getattr(video_result, "entity_relationships", None) or {},
    )

    # Aggregate results across zones: for each goal, take the best score across all zones
    goal_results: list[GoalResult] = []
    for i, goal in enumerate(bm.goals):
        std_id = f"std_{i}"
        best_score = 0.0
        best_evidence = ""
        for zr in zone_reports:
            for m in zr.matches:
                if m.standard_id == std_id and m.similarity > best_score:
                    best_score = m.similarity
                    best_evidence = m.best_evidence_text
        goal_results.append(GoalResult(
            goal_id=goal.id,
            goal_text=goal.description,
            passed=best_score >= evaluator.pass_threshold,
            score=round(best_score, 3),
            best_evidence=best_evidence[:200],
        ))

    completed = sum(1 for g in goal_results if g.passed)
    incomplete = len(goal_results) - completed
    overall = sum(g.score for g in goal_results) / len(goal_results) if goal_results else 0.0

    # Build gap summary
    gaps = [g.goal_text for g in goal_results if not g.passed]
    gap_summary = ""
    if gaps:
        gap_summary = "Unmet goals:\n" + "\n".join(f"- {g}" for g in gaps)
    else:
        gap_summary = "All benchmark goals met."

    result = EvaluationResult(
        team_id=team_id,
        date=body.date,
        benchmark_version=bm.version,
        overall_score=round(overall, 3),
        completed_count=completed,
        incomplete_count=incomplete,
        total_goals=len(goal_results),
        goal_results=goal_results,
        gap_summary=gap_summary,
        evaluated_at=datetime.now(timezone.utc),
    )

    EVALUATIONS[f"{team_id}:{body.date}"] = result
    logger.info("Evaluation %s: %.1f%% (%d/%d)", team_id, overall * 100, completed, len(goal_results))
    return result.model_dump()
