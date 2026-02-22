"""Productivity benchmark and evaluation models."""
from __future__ import annotations

from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class BenchmarkGoal(BaseModel):
    id: str
    description: str
    category: str = "general"  # safety | quality | progress | general


class Benchmark(BaseModel):
    team_id: str
    date: str  # ISO date string
    version: int = 1
    goals: list[BenchmarkGoal] = []
    created_at: datetime
    updated_at: datetime


class BenchmarkCreate(BaseModel):
    date: str
    goals: list[BenchmarkGoal] = []


class GoalResult(BaseModel):
    goal_id: str
    goal_text: str
    passed: bool
    score: float  # 0.0 to 1.0
    best_evidence: str = ""


class EvaluationResult(BaseModel):
    team_id: str
    date: str
    benchmark_version: int
    overall_score: float  # 0.0 to 1.0
    completed_count: int
    incomplete_count: int
    total_goals: int
    goal_results: list[GoalResult]
    gap_summary: str = ""
    evaluated_at: datetime


class EvaluateRequest(BaseModel):
    date: str
    site_id: Optional[str] = None
    vlm_job_id: Optional[str] = None
