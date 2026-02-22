from datetime import date as date_type
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from app.models.teams import SiteWorker, Team, TeamCreate, TeamUpdate
from app.services import team_service

router = APIRouter()


class WorkerCreate(BaseModel):
    name: str
    trade: str
    site_id: str


@router.get("/workers", response_model=list[SiteWorker])
def list_site_workers(site_id: str = Query(...)):
    """Return the worker roster for a site."""
    return team_service.get_site_workers(site_id)


@router.post("/workers", response_model=SiteWorker, status_code=201)
def add_worker(data: WorkerCreate):
    """Add a new worker to the site roster (persisted to workers.json)."""
    return team_service.add_worker(data.name, data.trade, data.site_id)


@router.delete("/workers/{worker_id}", status_code=204)
def remove_worker(worker_id: str):
    """Remove a worker from the roster (persisted to workers.json)."""
    if not team_service.remove_worker(worker_id):
        raise HTTPException(status_code=404, detail="Worker not found")


@router.get("", response_model=list[Team])
def list_teams(
    site_id: str = Query(...),
    date: str = Query(default=None),
):
    """Return today's teams for a site. Date defaults to today (ISO format)."""
    today = date or str(date_type.today())
    return team_service.get_teams(site_id, today)


@router.post("", response_model=Team, status_code=201)
def create_team(data: TeamCreate, date: str = Query(default=None)):
    today = date or str(date_type.today())
    return team_service.create_team(data, today)


@router.put("/{team_id}", response_model=Team)
def update_team(team_id: str, patch: TeamUpdate):
    team = team_service.update_team(team_id, patch)
    if not team:
        raise HTTPException(status_code=404, detail="Team not found")
    return team


@router.delete("/{team_id}", status_code=204)
def delete_team(team_id: str):
    if not team_service.delete_team(team_id):
        raise HTTPException(status_code=404, detail="Team not found")
