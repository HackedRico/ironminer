"""Factory for selecting the best available evaluator.

Tries SemanticEvaluator (embedding-based) first, falls back to
KeywordEvaluator if sentence-transformers / torch are not installed.
"""
from __future__ import annotations

import logging
from typing import List, Optional

logger = logging.getLogger(__name__)


def get_evaluator(
    standards: Optional[List[str]] = None,
    standards_path: Optional[str] = None,
    pass_threshold: float = 0.55,
):
    """Return the best available evaluator instance."""
    try:
        from app.agents.prod_semantics import SemanticEvaluator
        evaluator = SemanticEvaluator(
            standards=standards,
            standards_path=standards_path,
            pass_threshold=pass_threshold,
        )
        logger.info("Using SemanticEvaluator (embedding-based)")
        return evaluator
    except (RuntimeError, ImportError, Exception) as exc:
        logger.warning("SemanticEvaluator unavailable (%s), using KeywordEvaluator", exc)
        from app.agents.keyword_evaluator import KeywordEvaluator
        return KeywordEvaluator(
            standards=standards,
            standards_path=standards_path,
            pass_threshold=0.15,
        )
