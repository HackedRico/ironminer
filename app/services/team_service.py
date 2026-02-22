"""
Team service — JSON-backed store for the daily crew planning board.

On startup `initialize()` is called once:
  - Tries to load workers.json; if absent, seeds the default roster and writes it.
  - Tries to load teams.json; if absent, starts with an empty dict.

Every write operation saves the affected file immediately so data survives restarts.

Files:
  data/workers.json  — site worker roster (rarely changes)
  data/teams.json    — daily team assignments (wiped in the UI each day, but the
                       file keeps a full history so old dates are preserved)
"""
import json
import uuid
from datetime import date as date_type, timedelta
from pathlib import Path
from app.models.teams import SiteWorker, Team, TeamCreate, TeamUpdate

# ── File paths ────────────────────────────────────────────────────────────────

_ROOT = Path(__file__).resolve().parent.parent.parent  # …/ironminer/
DATA_DIR = _ROOT / "data"
WORKERS_FILE = DATA_DIR / "workers.json"
TEAMS_FILE = DATA_DIR / "teams.json"

# ── In-memory store ───────────────────────────────────────────────────────────

SITE_WORKERS: dict[str, SiteWorker] = {}
TEAMS: dict[str, Team] = {}

# ── JSON helpers ──────────────────────────────────────────────────────────────

def _save_workers() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with open(WORKERS_FILE, "w", encoding="utf-8") as f:
        json.dump([w.model_dump() for w in SITE_WORKERS.values()], f, indent=2)


def _save_teams() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with open(TEAMS_FILE, "w", encoding="utf-8") as f:
        json.dump([t.model_dump() for t in TEAMS.values()], f, indent=2)


def _load_workers() -> bool:
    """Load workers from JSON. Returns True if file existed."""
    if not WORKERS_FILE.exists():
        return False
    with open(WORKERS_FILE, encoding="utf-8") as f:
        for item in json.load(f):
            w = SiteWorker(**item)
            SITE_WORKERS[w.id] = w
    return True


def _load_teams() -> None:
    if not TEAMS_FILE.exists():
        return
    with open(TEAMS_FILE, encoding="utf-8") as f:
        for item in json.load(f):
            t = Team(**item)
            TEAMS[t.id] = t


# ── Default worker roster (used only on first run) ────────────────────────────

_DEFAULT_WORKERS = [
    # ── s1: Riverside Tower (23 workers) ──────────────────────────────────
    ("w_s1_01", "M. Rivera",    "Concrete",       "s1"),
    ("w_s1_02", "D. Nguyen",    "Concrete",       "s1"),
    ("w_s1_03", "J. Brooks",    "Concrete",       "s1"),
    ("w_s1_04", "P. Gutierrez", "Concrete",       "s1"),
    ("w_s1_05", "S. Patel",     "Concrete",       "s1"),
    ("w_s1_06", "K. Johnson",   "Electrical",     "s1"),
    ("w_s1_07", "R. Thompson",  "Electrical",     "s1"),
    ("w_s1_08", "A. Garcia",    "Electrical",     "s1"),
    ("w_s1_09", "L. Kim",       "Electrical",     "s1"),
    ("w_s1_10", "T. Davis",     "Electrical",     "s1"),
    ("w_s1_11", "F. Martinez",  "Plumbing",       "s1"),
    ("w_s1_12", "B. Wilson",    "Plumbing",       "s1"),
    ("w_s1_13", "C. Rodriguez", "Plumbing",       "s1"),
    ("w_s1_14", "R. Chen",      "Framing",        "s1"),
    ("w_s1_15", "J. Santos",    "Framing",        "s1"),
    ("w_s1_16", "M. Baker",     "Framing",        "s1"),
    ("w_s1_17", "D. Williams",  "Framing",        "s1"),
    ("w_s1_18", "A. Lee",       "Framing",        "s1"),
    ("w_s1_19", "E. Taylor",    "HVAC",           "s1"),
    ("w_s1_20", "N. Hernandez", "HVAC",           "s1"),
    ("w_s1_21", "P. Anderson",  "Crane Ops",      "s1"),
    ("w_s1_22", "T. Williams",  "Delivery",       "s1"),
    ("w_s1_23", "O. Jackson",   "Delivery",       "s1"),
    # ── s2: Harbor Warehouse (14 workers) ─────────────────────────────────
    ("w_s2_01", "V. Castro",    "Steel Erection", "s2"),
    ("w_s2_02", "M. Okafor",    "Steel Erection", "s2"),
    ("w_s2_03", "J. Park",      "Steel Erection", "s2"),
    ("w_s2_04", "B. Singh",     "Steel Erection", "s2"),
    ("w_s2_05", "L. Morales",   "Steel Erection", "s2"),
    ("w_s2_06", "W. James",     "Concrete",       "s2"),
    ("w_s2_07", "R. Patel",     "Concrete",       "s2"),
    ("w_s2_08", "C. Kim",       "Concrete",       "s2"),
    ("w_s2_09", "S. Martinez",  "Plumbing",       "s2"),
    ("w_s2_10", "A. Thompson",  "Plumbing",       "s2"),
    ("w_s2_11", "D. Lee",       "Plumbing",       "s2"),
    ("w_s2_12", "H. Brown",     "Delivery",       "s2"),
    ("w_s2_13", "E. White",     "Delivery",       "s2"),
    ("w_s2_14", "G. Davis",     "Staging",        "s2"),
    # ── s3: Oakfield Homes Ph.2 (8 workers) ───────────────────────────────
    ("w_s3_01", "C. Nelson",    "Framing",        "s3"),
    ("w_s3_02", "T. Green",     "Framing",        "s3"),
    ("w_s3_03", "M. Clark",     "Framing",        "s3"),
    ("w_s3_04", "J. Adams",     "Framing",        "s3"),
    ("w_s3_05", "B. Turner",    "Cladding",       "s3"),
    ("w_s3_06", "S. Evans",     "Cladding",       "s3"),
    ("w_s3_07", "P. Cooper",    "Cladding",       "s3"),
    ("w_s3_08", "O. Murphy",    "Concrete",       "s3"),
]


# ── Startup ───────────────────────────────────────────────────────────────────

def initialize() -> None:
    """Load persisted data; seed workers from defaults if first run."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    if not _load_workers():
        for wid, name, trade, site_id in _DEFAULT_WORKERS:
            SITE_WORKERS[wid] = SiteWorker(id=wid, name=name, trade=trade, site_id=site_id)
        _save_workers()
    _load_teams()


# ── Worker CRUD ───────────────────────────────────────────────────────────────

def get_site_workers(site_id: str) -> list[SiteWorker]:
    return [w for w in SITE_WORKERS.values() if w.site_id == site_id]


def add_worker(name: str, trade: str, site_id: str) -> SiteWorker:
    # Generate a sequential-style id based on site + current count
    site_count = sum(1 for w in SITE_WORKERS.values() if w.site_id == site_id)
    wid = f"w_{site_id}_{site_count + 1:02d}_{uuid.uuid4().hex[:4]}"
    worker = SiteWorker(id=wid, name=name, trade=trade, site_id=site_id)
    SITE_WORKERS[wid] = worker
    _save_workers()
    return worker


def remove_worker(worker_id: str) -> bool:
    if worker_id not in SITE_WORKERS:
        return False
    del SITE_WORKERS[worker_id]
    # Also remove from any teams that reference this worker
    for team in TEAMS.values():
        if worker_id in team.worker_ids:
            team.worker_ids.remove(worker_id)
    _save_teams()
    _save_workers()
    return True


# ── Team CRUD ─────────────────────────────────────────────────────────────────

def get_teams(site_id: str, date: str) -> list[Team]:
    return [t for t in TEAMS.values() if t.site_id == site_id and t.date == date]


def create_team(data: TeamCreate, date: str) -> Team:
    existing = get_teams(data.site_id, date)
    color_index = len(existing) % 8
    team = Team(
        id=str(uuid.uuid4()),
        site_id=data.site_id,
        date=date,
        name=data.name or f"Team {len(existing) + 1}",
        color_index=color_index,
    )
    TEAMS[team.id] = team
    _save_teams()
    return team


def update_team(team_id: str, patch: TeamUpdate) -> Team | None:
    team = TEAMS.get(team_id)
    if not team:
        return None
    data = team.model_dump()
    data.update(patch.model_dump(exclude_none=True))
    TEAMS[team_id] = Team(**data)
    _save_teams()
    return TEAMS[team_id]


def delete_team(team_id: str) -> bool:
    if team_id not in TEAMS:
        return False
    del TEAMS[team_id]
    _save_teams()
    return True


# ── Worker history ─────────────────────────────────────────────────────────────

def get_worker_history(worker_id: str, site_id: str, days: int = 7) -> dict | None:
    """Return 7-day assignment history + alert correlation + performance signals."""
    worker = SITE_WORKERS.get(worker_id)
    if not worker or worker.site_id != site_id:
        return None

    today = date_type.today()
    dates = [str(today - timedelta(days=i)) for i in range(days)]  # newest first

    from app.services.storage import ALERTS  # local import avoids circular risk
    site_alerts = [a for a in ALERTS.values() if a.site_id == site_id]

    history = []
    for d in dates:
        day_teams = [t for t in TEAMS.values()
                     if t.site_id == site_id and t.date == d and worker_id in t.worker_ids]
        t = day_teams[0] if day_teams else None
        team_name = t.name if t else ""
        zone      = t.zone if t else ""
        task      = t.task if t else ""
        zone_prefix = zone.split("—")[0].strip() if zone else ""

        day_alerts = []
        for a in site_alerts:
            if a.created_at.date().isoformat() != d:
                continue
            if zone_prefix and (zone_prefix.lower() in a.title.lower()
                                or zone_prefix.lower() in a.detail.lower()):
                day_alerts.append(a)

        history.append({
            "date": d, "team_name": team_name, "zone": zone, "task": task,
            "alert_count": len(day_alerts),
            "alerts": [{"id": a.id, "severity": a.severity,
                         "title": a.title, "source_agent": a.source_agent}
                        for a in day_alerts],
        })

    flat       = [a for h in history for a in h["alerts"]]
    total      = len(flat)
    safety     = sum(1 for a in flat if a["source_agent"] == "safety")
    prod       = sum(1 for a in flat if a["source_agent"] == "productivity")
    assigned   = sum(1 for h in history if h["team_name"])

    if total <= 1 and assigned >= 3:
        flag = "reward"
    elif safety >= 2 or total >= 3:
        flag = "needs_training"
    else:
        flag = "neutral"

    return {
        "worker": worker.model_dump(),
        "history": history,
        "signals": {"days_assigned": assigned, "total_alerts": total,
                    "safety_alerts": safety, "productivity_alerts": prod, "flag": flag},
    }


# ── Auto-assign ────────────────────────────────────────────────────────────────

async def auto_assign_workers(site_id: str, date: str, team_id: str | None = None) -> dict:
    """Use Claude to suggest team assignments for unassigned workers.

    If team_id is set, only suggest for that team (must be empty). Otherwise
    suggest for all empty teams. Falls back to trade-matching if the API is unavailable.
    """
    from app.agents.team_planner_agent import TeamPlannerAgent

    all_workers = {w.id: w for w in get_site_workers(site_id)}
    today_teams = get_teams(site_id, date)
    assigned_ids = {wid for t in today_teams for wid in t.worker_ids}
    unassigned = [w for w in all_workers.values() if w.id not in assigned_ids]

    # Only target empty teams; optionally restrict to a single team (e.g. newly created)
    if team_id:
        empty_teams = [t for t in today_teams if t.id == team_id and not t.worker_ids]
    else:
        empty_teams = [t for t in today_teams if not t.worker_ids]

    if not unassigned or not empty_teams:
        return {
            "assignments": [],
            "unassigned_worker_ids": [w.id for w in unassigned],
            "summary": "Nothing to assign — no unassigned workers or no empty teams exist.",
            "used_ai": False,
        }

    # Lightweight signals for each unassigned worker (reuses get_worker_history)
    worker_contexts = []
    for w in unassigned:
        hist = get_worker_history(w.id, site_id, days=7)
        sig = (
            hist["signals"]
            if hist
            else {"days_assigned": 0, "total_alerts": 0, "flag": "neutral"}
        )
        worker_contexts.append({
            "id": w.id, "name": w.name, "trade": w.trade,
            "flag": sig["flag"],
            "days_assigned": sig["days_assigned"],
            "total_alerts": sig["total_alerts"],
        })

    team_contexts = [
        {"id": t.id, "name": t.name, "task": t.task, "zone": t.zone, "assigned_trades": []}
        for t in empty_teams
    ]

    agent = TeamPlannerAgent()
    try:
        plan = await agent.process(worker_contexts, team_contexts)
        team_map = {t.id: t.name for t in today_teams}
        # Normalize LLM response (may return worker_id/team_id or workerId/teamId)
        assignments = []
        for a in plan.get("assignments", []):
            wid = a.get("worker_id") or a.get("workerId")
            tid = a.get("team_id") or a.get("teamId")
            if wid in all_workers and tid in team_map:
                assignments.append({
                    "worker_id": wid,
                    "worker_name": all_workers[wid].name,
                    "team_id": tid,
                    "team_name": team_map[tid],
                    "reason": a.get("reason", ""),
                })
        return {
            "assignments": assignments,
            "unassigned_worker_ids": plan.get("unassigned_worker_ids", []),
            "summary": plan.get("summary", ""),
            "used_ai": True,
        }
    except Exception:
        # Fallback: assign multiple workers per team (trade-match when possible)
        # Target ~2+ workers per team; spread workers across teams
        assignments: list[dict] = []
        assigned_wids: set[str] = set()
        workers_per_team = max(2, len(worker_contexts) // max(1, len(team_contexts)))
        for t in team_contexts:
            count = 0
            for w in worker_contexts:
                if w["id"] in assigned_wids:
                    continue
                if count >= workers_per_team:
                    break
                if not t["assigned_trades"] or w["trade"] in t["assigned_trades"]:
                    assignments.append({
                        "worker_id": w["id"], "worker_name": w["name"],
                        "team_id": t["id"], "team_name": t["name"],
                        "reason": "Trade match (AI unavailable)",
                    })
                    assigned_wids.add(w["id"])
                    count += 1
        # Assign any remaining workers to teams that are under target
        for w in worker_contexts:
            if w["id"] in assigned_wids:
                continue
            for t in team_contexts:
                current = sum(1 for a in assignments if a["team_id"] == t["id"])
                if current < workers_per_team:
                    assignments.append({
                        "worker_id": w["id"], "worker_name": w["name"],
                        "team_id": t["id"], "team_name": t["name"],
                        "reason": "Trade match (AI unavailable)",
                    })
                    assigned_wids.add(w["id"])
                    break
        return {
            "assignments": assignments,
            "unassigned_worker_ids": [
                w["id"] for w in worker_contexts if w["id"] not in assigned_wids
            ],
            "summary": "AI unavailable — assigned by trade match only.",
            "used_ai": False,
        }
