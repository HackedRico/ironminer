"""Lightweight keyword-based evaluator — fallback when sentence-transformers is not installed.

Same interface as SemanticEvaluator but uses Jaccard similarity instead of embeddings.
"""
from __future__ import annotations

import re
from pathlib import Path
from typing import Dict, List, Optional

from app.agents.prod_semantics import (
    ZoneCompletionReport,
    StandardMatch,
    extract_zone_texts,
    chunk_zone_text,
    build_zone_report,
    load_standards,
)


def _tokenize(text: str) -> set[str]:
    """Extract lowercase word tokens from text."""
    return set(re.findall(r"\w{2,}", text.lower()))


def _jaccard(a: set[str], b: set[str]) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


class KeywordEvaluator:
    """Lightweight evaluator using keyword overlap / Jaccard similarity."""

    def __init__(
        self,
        standards: Optional[List[str]] = None,
        standards_path: Optional[str] = None,
        pass_threshold: float = 0.15,
        **_kwargs,
    ):
        self.pass_threshold = pass_threshold
        if standards:
            self._standards = standards
        elif standards_path:
            self._standards = load_standards(standards_path)
        else:
            default = Path(__file__).parent / "standards.txt"
            self._standards = load_standards(str(default)) if default.exists() else []

    def evaluate_from_texts(
        self,
        zone_analyses: Dict[str, str],
        entity_relationships: Optional[Dict[str, str]] = None,
    ) -> List[ZoneCompletionReport]:
        entity_rels = entity_relationships or {}
        zone_texts = extract_zone_texts(zone_analyses, entity_rels)

        reports: List[ZoneCompletionReport] = []
        for zone_id, text in zone_texts.items():
            vlm_chunks = chunk_zone_text(zone_id, text)
            matches: List[StandardMatch] = []

            for i, std in enumerate(self._standards):
                std_tokens = _tokenize(std)
                best_score = 0.0
                best_chunk = None
                for chunk in vlm_chunks:
                    score = _jaccard(std_tokens, _tokenize(chunk.text))
                    if score > best_score:
                        best_score = score
                        best_chunk = chunk

                matches.append(StandardMatch(
                    standard_id=f"std_{i}",
                    standard_text=std,
                    best_evidence_chunk=best_chunk.chunk_id if best_chunk else "none",
                    best_evidence_text=best_chunk.text[:300] if best_chunk else "",
                    similarity=best_score,
                    passed=best_score >= self.pass_threshold,
                ))

            reports.append(build_zone_report(zone_id, matches))

        reports.sort(key=lambda r: r.completion_score)
        return reports
