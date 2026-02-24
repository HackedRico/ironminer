"""
World generation store — JSON-backed persistence for SiteWorld jobs.

On startup `initialize()` is called once:
  - Tries to load data/worlds.json; if absent, starts with an empty dict.
  - Any job still "generating" at load time was interrupted — marked as error.

Every write operation saves the file immediately so data survives restarts.

File:
  data/worlds.json  — all SiteWorld job records
"""
import json
from pathlib import Path

from app.models.streaming import SiteWorld
from app.services.storage import WORLDS

# ── File paths ────────────────────────────────────────────────────────────────

_ROOT = Path(__file__).resolve().parent.parent.parent  # …/ironminer/
DATA_DIR = _ROOT / "data"
WORLDS_FILE = DATA_DIR / "worlds.json"


# ── JSON helpers ──────────────────────────────────────────────────────────────

def save_worlds() -> None:
    DATA_DIR.mkdir(exist_ok=True)
    with open(WORLDS_FILE, "w", encoding="utf-8") as f:
        json.dump(
            [w.model_dump(mode="json") for w in WORLDS.values()],
            f, indent=2, default=str,
        )


def _load_worlds() -> None:
    if not WORLDS_FILE.exists():
        return
    try:
        with open(WORLDS_FILE, encoding="utf-8") as f:
            records = json.load(f)
        for r in records:
            # Any job still "generating" at load time was interrupted mid-poll
            if r.get("status") == "generating":
                r["status"] = "error"
                r["error"] = "Interrupted by server restart"
            WORLDS[r["id"]] = SiteWorld(**r)
    except Exception as exc:
        print(f"[world_service] Failed to load worlds.json: {exc}")


# ── Startup ───────────────────────────────────────────────────────────────────

def initialize() -> None:
    _load_worlds()
    print(f"[world_service] Loaded {len(WORLDS)} world job(s)")
