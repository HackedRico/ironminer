#!/usr/bin/env python3
"""
Test the processing workflow (summary.txt → video result → safety + productivity agents)
without changing the frontend.

Uses job_id=mock_vj_001 and site_id=s1 so the frontend's "Run Safety Analysis" and
productivity report for site s1 continue to work.

Usage:
  # Backend must be running: uvicorn app.main:app --reload (from repo root)
  python scripts/test_processing_workflow.py
  python scripts/test_processing_workflow.py --summary-file app/summarizer/summary.txt
  python scripts/test_processing_workflow.py --base-url http://localhost:8000
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

try:
    import requests
except ImportError:
    print("Install requests: pip install requests", file=sys.stderr)
    sys.exit(1)

JOB_ID = "mock_vj_001"
SITE_ID = "s1"
DEFAULT_SUMMARY_FILE = Path(__file__).resolve().parent.parent / "app" / "summarizer" / "summary.txt"
FALLBACK_SUMMARY = "Construction site activity: workers in PPE, equipment in use. Summary from local file (Twelve Labs not called)."


def load_summary(path: Path | None) -> str:
    if path and path.exists():
        return path.read_text().strip() or FALLBACK_SUMMARY
    return FALLBACK_SUMMARY


def _out(msg: str = "") -> None:
    print(msg, flush=True)


def main() -> int:
    p = argparse.ArgumentParser(description="Test processing workflow (summary → safety + productivity)")
    p.add_argument("--base-url", default="http://localhost:8000", help="API base URL")
    p.add_argument("--summary-file", type=Path, default=DEFAULT_SUMMARY_FILE, help="Path to summary.txt")
    args = p.parse_args()
    base = args.base_url.rstrip("/")
    _out(f"Using API at {base}")
    summary_text = load_summary(args.summary_file)
    _out(f"Summary length: {len(summary_text)} chars")

    session = requests.Session()
    session.headers["Content-Type"] = "application/json"

    # 1) Ensure video result exists and has summary_text
    _out("Fetching video result...")
    try:
        r = session.get(f"{base}/api/video/jobs/{JOB_ID}/result", timeout=10)
    except requests.RequestException as e:
        print(f"Failed to reach backend at {base}: {e}", file=sys.stderr)
        return 1

    if r.status_code == 404:
        # Create minimal result so analyze endpoints can run
        body = {
            "job_id": JOB_ID,
            "site_id": SITE_ID,
            "frames": [],
            "zones": [],
            "trade_proximities": [],
            "temporal_events": [],
            "metadata": {},
            "summary_text": summary_text,
        }
        r2 = session.post(f"{base}/api/video/jobs/{JOB_ID}/complete", json=body, timeout=10)
        if not r2.ok:
            print(f"POST complete failed: {r2.status_code} {r2.text}", file=sys.stderr, flush=True)
            return 1
        _out(f"Created video result for job {JOB_ID}.")
    else:
        if not r.ok:
            print(f"GET result failed: {r.status_code} {r.text}", file=sys.stderr, flush=True)
            return 1
        body = r.json()
        body["summary_text"] = summary_text
        r2 = session.post(f"{base}/api/video/jobs/{JOB_ID}/complete", json=body, timeout=10)
        if not r2.ok:
            print(f"POST complete (update) failed: {r2.status_code} {r2.text}", file=sys.stderr, flush=True)
            return 1
        _out(f"Updated video result for job {JOB_ID}.")

    # 2) Run safety analysis
    _out("Running safety analysis (may call Gemini)...")
    safety_body = {"site_id": SITE_ID, "video_job_id": JOB_ID}
    r3 = session.post(f"{base}/api/safety/analyze", json=safety_body, timeout=60)
    if not r3.ok:
        print(f"Safety analyze failed: {r3.status_code} {r3.text}", file=sys.stderr, flush=True)
        return 1
    safety_report = r3.json()
    _out("\n--- Safety report ---")
    _out("Overall risk: " + str(safety_report.get("overall_risk", "?")))
    _out("Violations: " + str(len(safety_report.get("violations", []))))
    summary = safety_report.get("summary", "")
    _out("Summary (first 400 chars): " + (summary[:400] + "..." if len(summary) > 400 else summary))

    # 3) Run productivity analysis
    _out("\nRunning productivity analysis...")
    r4 = session.post(f"{base}/api/productivity/analyze", json=safety_body, timeout=30)
    if not r4.ok:
        print(f"Productivity analyze failed: {r4.status_code} {r4.text}", file=sys.stderr, flush=True)
        return 1
    prod_report = r4.json()
    _out("\n--- Productivity report ---")
    prod_summary = prod_report.get("summary", "")
    _out("Summary (first 400 chars): " + (prod_summary[:400] + "..." if len(prod_summary) > 400 else prod_summary))

    _out("\nDone. Open the frontend, select site s1, and click 'Run Safety Analysis' to see the same report.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
