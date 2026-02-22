"""
TeamPlannerAgent — uses Claude to suggest which unassigned workers should go to which teams.

Two-phase pattern (same as SafetyAgent / ProductivityAgent):
  Phase 1 (caller): deterministic data gather + signal computation (in team_service)
  Phase 2 (here):   LLM reasoning → structured JSON assignment plan
"""
from __future__ import annotations
import json
import re

from app.agents.base import BaseAgent
from app.services.claude_client import call_claude

SYSTEM_PROMPT = """You are a construction site superintendent's AI assistant.
Assign unassigned workers to teams. A team can and should have multiple workers — assign several people per team (e.g. 2–5 per team depending on task and pool size). Balance crew sizes across teams when possible.

Rules (in priority order):
1. Prefer exact trade match — assign workers whose trade matches the team's task when available.
2. If no worker has the exact trade for a team's task, still suggest the best available workers (e.g. related trade; or "reward" flag). In the reason, state clearly when it's a fallback, e.g. "No Masonry/Tile workers; suggesting as nearest fit — superintendent to confirm."
3. Prefer workers flagged "reward"; be cautious placing "needs_training" workers in zones with recent safety alerts.
4. Assign multiple workers per team so each team has a reasonable crew size; balance team sizes when all else is equal.
5. Only leave a worker unassigned if every team is already well staffed or there is truly no reasonable fit.

You must return at least one assignment per empty team when any unassigned workers exist. Prefer suggesting multiple workers per team over leaving teams understaffed.

Return ONLY valid JSON with no prose before or after:
{
  "assignments": [{"worker_id": "...", "team_id": "...", "reason": "one sentence"}],
  "unassigned_worker_ids": ["..."],
  "summary": "2-3 sentence briefing for the superintendent"
}"""


class TeamPlannerAgent(BaseAgent):
    async def process(self, unassigned: list[dict], teams: list[dict]) -> dict:
        """
        Args:
            unassigned: list of {id, name, trade, flag, days_assigned, total_alerts}
            teams:      list of {id, name, task, zone, assigned_trades}
        Returns:
            Parsed dict with keys: assignments, unassigned_worker_ids, summary
        """
        worker_lines = "\n".join(
            f"- {w['name']} | id={w['id']} | Trade: {w['trade']} "
            f"| Signal: {w['flag']} | Days assigned (7d): {w['days_assigned']} "
            f"| Alerts (7d): {w['total_alerts']}"
            for w in unassigned
        )
        team_lines = "\n".join(
            f"- \"{t['name']}\" | id={t['id']} | Zone: {t['zone'] or 'TBD'} "
            f"| Task: {t['task'] or 'General labour'} "
            f"| Trades already on team: {t['assigned_trades'] or ['none']}"
            for t in teams
        )
        user_msg = (
            f"Workers available (unassigned):\n{worker_lines}"
            f"\n\nTeams needing workers:\n{team_lines}"
        )

        raw = await call_claude(
            [{"role": "user", "content": user_msg}],
            max_tokens=1024,
            system=SYSTEM_PROMPT,
        )

        # Strip markdown code fences if the model wraps output
        raw = re.sub(r"^```(?:json)?\s*|\s*```$", "", raw.strip())
        return json.loads(raw)
