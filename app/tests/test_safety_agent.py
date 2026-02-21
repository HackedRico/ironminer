"""Deterministic pytest tests for Safety Agent OSHA rule checks.

No LLM, no Supabase, no network — pure unit tests against mock video data.

Run:
    python -m pytest app/tests/test_safety_agent.py -v
"""
from __future__ import annotations

import pytest

from app.agents.safety_agent import (
    run_deterministic_checks,
    _compute_compliance,
    _compute_overall_risk,
)
from app.data.mock_video_results import MOCK_VIDEO_RESULT
from app.models.alert import AlertSeverity


# ── Fixtures ──────────────────────────────────────────────────────────────────

@pytest.fixture(scope="module")
def violations():
    """Run deterministic checks once, reuse across all tests."""
    return run_deterministic_checks(MOCK_VIDEO_RESULT)


@pytest.fixture(scope="module")
def compliance(violations):
    ppe, zone = _compute_compliance(MOCK_VIDEO_RESULT, violations)
    return ppe, zone


# ── Tests ─────────────────────────────────────────────────────────────────────

class TestViolationCount:
    def test_expected_violation_count(self, violations):
        """Mock data should produce exactly 25 deterministic violations."""
        assert len(violations) == 25, (
            f"Expected 25 violations, got {len(violations)}. "
            f"Types: {[v.type for v in violations]}"
        )

    def test_all_violations_have_zone(self, violations):
        for v in violations:
            assert v.zone, f"Violation missing zone: {v}"

    def test_all_violations_have_description(self, violations):
        for v in violations:
            assert v.description, f"Violation missing description: {v}"

    def test_all_violations_have_workers_affected(self, violations):
        for v in violations:
            assert v.workers_affected >= 1, f"workers_affected must be ≥ 1: {v}"


class TestPPEViolations:
    def test_ppe_violations_exist(self, violations):
        ppe = [v for v in violations if v.type == "ppe_missing"]
        assert len(ppe) >= 1, "Expected at least one ppe_missing violation"

    def test_crane_radius_worker_escalated_to_high(self, violations):
        """Workers w_c1 and w_c2 are in crane swing radius without hard hats → high."""
        crane_ppe = [
            v for v in violations
            if v.type == "ppe_missing" and "crane swing radius" in v.description
        ]
        assert len(crane_ppe) >= 2, (
            f"Expected ≥ 2 crane-radius PPE violations, got {len(crane_ppe)}"
        )
        for v in crane_ppe:
            assert v.severity == AlertSeverity.high, (
                f"Crane-radius PPE violation should be HIGH, got {v.severity}: {v.description}"
            )


class TestFallProtectionViolations:
    def test_harness_not_tied_off_violations(self, violations):
        """Workers w_b1, w_b2 at 30ft with harness not tied off → zone_breach high."""
        tied_off = [
            v for v in violations
            if v.type == "zone_breach" and "harness not tied off" in v.description
        ]
        assert len(tied_off) >= 2, (
            f"Expected ≥ 2 harness-not-tied-off violations, got {len(tied_off)}"
        )
        for v in tied_off:
            assert v.severity == AlertSeverity.high

    def test_fall_protection_required_violations(self, violations):
        """Workers at elevation > 6 ft without fall harness → zone_breach."""
        fall = [
            v for v in violations
            if v.type == "zone_breach" and "fall harness" in v.description and "without fall harness" in v.description
        ]
        assert len(fall) >= 1, "Expected at least one fall-protection-missing violation"


class TestCraneViolations:
    def test_under_suspended_load_violation(self, violations):
        """Worker w_c3 is directly under suspended load → clearance_issue high."""
        suspended = [
            v for v in violations
            if v.type == "clearance_issue" and "suspended load" in v.description
        ]
        assert len(suspended) >= 1, "Expected ≥ 1 suspended-load violation"
        for v in suspended:
            assert v.severity == AlertSeverity.high

    def test_signal_person_los_violation(self, violations):
        """Crane eq_c1 has signal_person_line_of_sight=False → clearance_issue high."""
        los = [
            v for v in violations
            if v.type == "clearance_issue" and "line of sight" in v.description
        ]
        assert len(los) >= 1, "Expected ≥ 1 crane signal LOS violation"


class TestHazardViolations:
    def test_hot_work_no_fire_watch(self, violations):
        """hz_e1 — hot work without fire watch → clearance_issue high."""
        hot = [
            v for v in violations
            if v.type == "clearance_issue" and "fire watch" in v.description
        ]
        assert len(hot) >= 1, "Expected ≥ 1 hot-work-no-fire-watch violation"
        for v in hot:
            assert v.severity == AlertSeverity.high

    def test_electrical_no_loto(self, violations):
        """hz_e2 — electrical exposure without LOTO → clearance_issue high."""
        loto = [
            v for v in violations
            if v.type == "clearance_issue" and "LOTO" in v.description
        ]
        assert len(loto) >= 1, "Expected ≥ 1 LOTO violation"
        for v in loto:
            assert v.severity == AlertSeverity.high


class TestEgressViolations:
    def test_blocked_egress_exists(self, violations):
        egress = [v for v in violations if v.type == "blocked_corridor"]
        assert len(egress) >= 2, f"Expected ≥ 2 blocked egress violations, got {len(egress)}"

    def test_emergency_egress_is_high_severity(self, violations):
        """eg_d1 is emergency_access=True, should be HIGH."""
        emergency = [
            v for v in violations
            if v.type == "blocked_corridor" and "Emergency vehicle" in v.description
        ]
        assert len(emergency) >= 1
        for v in emergency:
            assert v.severity == AlertSeverity.high

    def test_non_emergency_egress_is_medium(self, violations):
        """eg_b1 and eg_d2 are not emergency → medium."""
        non_emergency = [
            v for v in violations
            if v.type == "blocked_corridor" and "Emergency vehicle" not in v.description
        ]
        assert len(non_emergency) >= 1
        for v in non_emergency:
            assert v.severity == AlertSeverity.medium


class TestCongestionViolations:
    def test_multi_trade_congestion(self, violations):
        """Zone B has 3 trades in 400 sqft → zone_breach high."""
        congestion = [
            v for v in violations
            if v.type == "zone_breach" and "trades" in v.description and "sqft" in v.description
        ]
        assert len(congestion) >= 1, "Expected ≥ 1 multi-trade congestion violation"
        for v in congestion:
            assert v.severity == AlertSeverity.high

    def test_overhead_work_proximity(self, violations):
        """Zone B has overhead electrical above plumbing with 3ft separation → clearance_issue."""
        overhead = [
            v for v in violations
            if v.type == "clearance_issue" and "overhead" in v.description.lower()
        ]
        assert len(overhead) >= 1, "Expected ≥ 1 overhead-work proximity violation"


class TestOverallRisk:
    def test_overall_risk_is_critical(self, violations):
        """25 violations with many high-severity → critical."""
        risk = _compute_overall_risk(violations)
        assert risk == "critical", f"Expected 'critical', got '{risk}'"

    def test_empty_violations_gives_low_risk(self):
        assert _compute_overall_risk([]) == "low"


class TestComplianceDicts:
    def test_ppe_compliance_keys_are_zone_names(self, compliance):
        ppe, _ = compliance
        zone_names = [z.zone_name for z in MOCK_VIDEO_RESULT.zones]
        for name in zone_names:
            assert name in ppe, f"Zone '{name}' missing from ppe_compliance"

    def test_zone_b_ppe_noncompliant(self, compliance):
        ppe, _ = compliance
        assert ppe["Zone B — Level 3 East Scaffolding"] is False

    def test_zone_c_ppe_noncompliant(self, compliance):
        ppe, _ = compliance
        assert ppe["Zone C — North Exterior"] is False

    def test_zone_a_ppe_compliant(self, compliance):
        """Zone A workers all have hard hats — no ppe_missing violations."""
        ppe, _ = compliance
        assert ppe["Zone A — Ground Level West"] is True

    def test_zone_a_zone_adherent(self, compliance):
        _, zone = compliance
        assert zone["Zone A — Ground Level West"] is True

    def test_zone_b_not_adherent(self, compliance):
        _, zone = compliance
        assert zone["Zone B — Level 3 East Scaffolding"] is False
