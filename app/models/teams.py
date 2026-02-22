from pydantic import BaseModel


class SiteWorker(BaseModel):
    id: str          # e.g. "w_s1_06"
    name: str        # e.g. "K. Johnson"
    trade: str       # e.g. "Electrical"
    site_id: str     # e.g. "s1"


class Team(BaseModel):
    id: str
    site_id: str
    date: str             # ISO date string "2025-02-21" (today only — fresh daily)
    name: str             # e.g. "Electrical Team"
    task: str = ""        # free-text: "Panel installation — Level 3 East"
    zone: str = ""        # full zone string from site, e.g. "Zone B — Level 3 East Scaffolding"
    worker_ids: list[str] = []
    color_index: int = 0  # 0–7, maps to TEAM_COLORS palette on frontend


class TeamCreate(BaseModel):
    site_id: str
    name: str = ""


class TeamUpdate(BaseModel):
    name: str | None = None
    task: str | None = None
    zone: str | None = None
    worker_ids: list[str] | None = None
