from __future__ import annotations
from fastapi import APIRouter, HTTPException

from app.models.analysis import SafetyReport, SafetyAnalyzeRequest, SafetyViolation
from app.services import db
from app.agents.safety_agent import SafetyAgent

router = APIRouter()
agent = SafetyAgent()


@router.post("/analyze", response_model=SafetyReport)
async def run_safety_analysis(body: SafetyAnalyzeRequest):
    video_result = await db.get_video_result(body.video_job_id)
    if not video_result:
        raise HTTPException(404, "Video result not found — run video processing first")
    report = await agent.process(site_id=body.site_id, video_result=video_result)
    await db.save_safety_report(body.site_id, report)
    return report


@router.get("/report/{site_id}", response_model=SafetyReport)
async def get_safety_report(site_id: str):
    report = await db.get_safety_report(site_id)
    if not report:
        raise HTTPException(404, "No safety report for this site yet")
    return report


@router.get("/report/{site_id}/violations", response_model=list[SafetyViolation])
async def get_violations(site_id: str, severity: str | None = None):
    report = await db.get_safety_report(site_id)
    if not report:
        raise HTTPException(404, "No safety report for this site yet")
    violations = report.violations
    if severity:
        violations = [v for v in violations if v.severity == severity]
    return violations


@router.post("/analyze-frame")
async def analyze_frame_safety(body: dict):
    # TODO: single-frame safety check
    return {"status": "not implemented yet"}
