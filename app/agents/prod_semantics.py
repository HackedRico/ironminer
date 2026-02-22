"""Semantic completion evaluation for construction site zones.

Compares VLM zone analysis text against "completed zone" standards
using embedding similarity to score how complete each zone is.

Pipeline:
  1. Extract zone analysis text from VideoProcessingResult
  2. Chunk each zone's analysis + entity relationships into segments
  3. Embed chunks and standard descriptions with a HuggingFace model
  4. Score each standard against zone evidence via cosine similarity
  5. Produce a per-zone completion report

Usage (standalone):
  python -m app.agents.prod_semantics \\
      --vlm_json path/to/vlm_result.json \\
      --standards app/agents/standards.txt

Usage (in pipeline):
  from app.agents.prod_semantics import SemanticEvaluator
  evaluator = SemanticEvaluator(model_name="...", standards_path="...")
  reports = evaluator.evaluate(video_processing_result)
"""

from __future__ import annotations

import argparse
import json
import logging
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Embedding model config — replace with your chosen HuggingFace model
# ---------------------------------------------------------------------------
# Recommended options:
#   "BAAI/bge-base-en-v1.5"
#   "sentence-transformers/all-MiniLM-L6-v2"
#   "thenlper/gte-base"
DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# Similarity threshold: a standard is "met" if best evidence >= this
DEFAULT_PASS_THRESHOLD = 0.55


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TextChunk:
    """A chunk of text with metadata for embedding comparison."""
    chunk_id: str
    zone_id: str
    text: str
    source: str  # "vlm" or "standard"


@dataclass(frozen=True)
class StandardMatch:
    """Result of matching a single standard against zone evidence."""
    standard_id: str
    standard_text: str
    best_evidence_chunk: str
    best_evidence_text: str
    similarity: float
    passed: bool


@dataclass
class ZoneCompletionReport:
    """Completion evaluation for a single zone."""
    zone_id: str
    completion_score: float
    matches: List[StandardMatch]
    passed_count: int = 0
    failed_count: int = 0
    total_standards: int = 0
    gap_summary: str = ""


# ---------------------------------------------------------------------------
# Standards loading
# ---------------------------------------------------------------------------

def load_standards(path: str) -> List[str]:
    """Load standard descriptions from a text file.

    Format: each non-empty line or blank-line-separated block is one standard.
    """
    text = Path(path).read_text(encoding="utf-8")

    blocks: List[str] = []
    current: List[str] = []

    for line in text.splitlines():
        stripped = line.strip()
        if stripped == "":
            if current:
                blocks.append("\n".join(current).strip())
                current = []
        else:
            current.append(stripped)
    if current:
        blocks.append("\n".join(current).strip())

    return [b for b in blocks if b]


def _standards_to_chunks(standards: List[str]) -> List[TextChunk]:
    return [
        TextChunk(
            chunk_id=f"std_{i}",
            zone_id="STANDARD",
            text=s,
            source="standard",
        )
        for i, s in enumerate(standards)
    ]


# ---------------------------------------------------------------------------
# Zone text extraction and chunking
# ---------------------------------------------------------------------------

def extract_zone_texts(
    zone_analyses: Dict[str, str],
    entity_relationships: Dict[str, str],
) -> Dict[str, str]:
    """Combine zone analysis and entity relationships into a single
    text block per zone, ready for chunking."""
    combined: Dict[str, str] = {}
    all_zones = set(zone_analyses.keys()) | set(entity_relationships.keys())

    for zone_id in all_zones:
        parts: List[str] = []
        analysis = zone_analyses.get(zone_id, "").strip()
        relationships = entity_relationships.get(zone_id, "").strip()

        if analysis:
            parts.append(f"Zone analysis: {analysis}")
        if relationships:
            parts.append(f"Spatial relationships: {relationships}")

        if parts:
            combined[zone_id] = "\n".join(parts)

    return combined


def chunk_zone_text(
    zone_id: str,
    text: str,
    max_chars: int = 1200,
) -> List[TextChunk]:
    """Split a zone's combined text into chunks for embedding.

    Strategy: split on sentence boundaries, accumulate until max_chars.
    """
    # Simple sentence splitting — handles periods, newlines
    sentences: List[str] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Split on ". " but keep the period
        parts = line.replace(". ", ".\n").split("\n")
        sentences.extend(p.strip() for p in parts if p.strip())

    if not sentences:
        return []

    chunks: List[TextChunk] = []
    buf: List[str] = []
    buf_len = 0
    idx = 0

    def flush():
        nonlocal buf, buf_len, idx
        if not buf:
            return
        chunks.append(TextChunk(
            chunk_id=f"vlm_{zone_id}_{idx}",
            zone_id=zone_id,
            text=" ".join(buf),
            source="vlm",
        ))
        idx += 1
        buf = []
        buf_len = 0

    for sent in sentences:
        if buf and buf_len + len(sent) + 1 > max_chars:
            flush()
        buf.append(sent)
        buf_len += len(sent) + 1

    flush()
    return chunks


# ---------------------------------------------------------------------------
# Embedding wrapper
# ---------------------------------------------------------------------------

class EmbeddingModel:
    """Wraps a HuggingFace sentence-transformers model for text embedding.

    Install: pip install sentence-transformers torch
    """

    def __init__(self, model_name: str = DEFAULT_MODEL_NAME, device: Optional[str] = None):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise RuntimeError(
                "sentence-transformers is required. "
                "Install with: pip install sentence-transformers torch"
            )

        import torch

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = SentenceTransformer(model_name, device=self.device)
        self._torch = torch
        logger.info("Loaded embedding model %s on %s", model_name, self.device)

    def embed(self, texts: List[str], batch_size: int = 32):
        """Embed a list of texts. Returns a torch.Tensor of shape [N, D]."""
        import numpy as np

        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=False,
        )
        return self._torch.from_numpy(embeddings).float()

    def cosine_similarity_matrix(self, a, b):
        """Compute cosine similarity between two sets of embeddings.

        Args:
            a: Tensor [N, D]
            b: Tensor [M, D]

        Returns:
            Tensor [N, M] of cosine similarities
        """
        F = self._torch.nn.functional
        a_norm = F.normalize(a, p=2, dim=1)
        b_norm = F.normalize(b, p=2, dim=1)
        return a_norm @ b_norm.T


# ---------------------------------------------------------------------------
# Matching and scoring
# ---------------------------------------------------------------------------

def score_zone_against_standards(
    zone_chunks: List[TextChunk],
    standard_chunks: List[TextChunk],
    embedder: EmbeddingModel,
    pass_threshold: float = DEFAULT_PASS_THRESHOLD,
) -> List[StandardMatch]:
    """For each standard, find the best-matching VLM zone chunk."""
    if not zone_chunks or not standard_chunks:
        return [
            StandardMatch(
                standard_id=sc.chunk_id,
                standard_text=sc.text,
                best_evidence_chunk="none",
                best_evidence_text="(no zone evidence available)",
                similarity=0.0,
                passed=False,
            )
            for sc in standard_chunks
        ]

    vlm_texts = [c.text for c in zone_chunks]
    std_texts = [c.text for c in standard_chunks]

    vlm_emb = embedder.embed(vlm_texts)
    std_emb = embedder.embed(std_texts)

    # sim[i, j] = similarity between standard i and vlm chunk j
    sim = embedder.cosine_similarity_matrix(std_emb, vlm_emb)

    matches: List[StandardMatch] = []
    for j, std_chunk in enumerate(standard_chunks):
        best_val, best_idx = sim[j].max(dim=0)
        best_score = float(best_val)
        best_vlm = zone_chunks[int(best_idx)]

        matches.append(StandardMatch(
            standard_id=std_chunk.chunk_id,
            standard_text=std_chunk.text,
            best_evidence_chunk=best_vlm.chunk_id,
            best_evidence_text=best_vlm.text[:300],
            similarity=best_score,
            passed=best_score >= pass_threshold,
        ))

    return matches


def build_zone_report(
    zone_id: str,
    matches: List[StandardMatch],
) -> ZoneCompletionReport:
    """Aggregate standard matches into a zone completion report."""
    passed = [m for m in matches if m.passed]
    failed = [m for m in matches if not m.passed]

    if matches:
        score = sum(m.similarity for m in matches) / len(matches)
    else:
        score = 0.0

    # Build gap summary
    gaps: List[str] = []
    for m in sorted(failed, key=lambda x: x.similarity):
        gaps.append(f"- {m.standard_text} (score: {m.similarity:.2f})")

    gap_summary = ""
    if gaps:
        gap_summary = "Unmet standards:\n" + "\n".join(gaps)
    else:
        gap_summary = "All standards met."

    return ZoneCompletionReport(
        zone_id=zone_id,
        completion_score=score,
        matches=sorted(matches, key=lambda m: m.similarity, reverse=True),
        passed_count=len(passed),
        failed_count=len(failed),
        total_standards=len(matches),
        gap_summary=gap_summary,
    )


# ---------------------------------------------------------------------------
# Main evaluator class
# ---------------------------------------------------------------------------

class SemanticEvaluator:
    """End-to-end semantic completion evaluator.

    Usage:
        evaluator = SemanticEvaluator(
            model_name="BAAI/bge-base-en-v1.5",
            standards_path="app/agents/standards.txt",
        )
        reports = evaluator.evaluate_from_texts(zone_analyses, entity_relationships)
    """

    def __init__(
        self,
        model_name: str = DEFAULT_MODEL_NAME,
        standards_path: Optional[str] = None,
        standards: Optional[List[str]] = None,
        pass_threshold: float = DEFAULT_PASS_THRESHOLD,
        device: Optional[str] = None,
    ):
        self.pass_threshold = pass_threshold
        self.embedder = EmbeddingModel(model_name=model_name, device=device)

        if standards is not None:
            self._standards = standards
        elif standards_path is not None:
            self._standards = load_standards(standards_path)
        else:
            # Default: look for standards.txt next to this file
            default_path = Path(__file__).parent / "standards.txt"
            if default_path.exists():
                self._standards = load_standards(str(default_path))
            else:
                raise ValueError(
                    "No standards provided. Pass standards_path or standards list."
                )

        self._standard_chunks = _standards_to_chunks(self._standards)

    def evaluate_from_texts(
        self,
        zone_analyses: Dict[str, str],
        entity_relationships: Optional[Dict[str, str]] = None,
    ) -> List[ZoneCompletionReport]:
        """Evaluate zone completion from raw analysis text.

        Args:
            zone_analyses: {zone_id: analysis_text} from VideoProcessingResult
            entity_relationships: {zone_id: relationships_text} (optional)

        Returns:
            List of ZoneCompletionReport, one per zone.
        """
        entity_rels = entity_relationships or {}
        zone_texts = extract_zone_texts(zone_analyses, entity_rels)

        reports: List[ZoneCompletionReport] = []
        for zone_id, text in zone_texts.items():
            vlm_chunks = chunk_zone_text(zone_id, text)
            matches = score_zone_against_standards(
                vlm_chunks,
                self._standard_chunks,
                self.embedder,
                self.pass_threshold,
            )
            report = build_zone_report(zone_id, matches)
            reports.append(report)

        # Sort by completion score ascending (worst zones first)
        reports.sort(key=lambda r: r.completion_score)
        return reports

    def evaluate(self, video_result) -> List[ZoneCompletionReport]:
        """Evaluate from a VideoProcessingResult object directly."""
        return self.evaluate_from_texts(
            zone_analyses=video_result.zone_analyses,
            entity_relationships=video_result.entity_relationships,
        )


# ---------------------------------------------------------------------------
# Report formatting
# ---------------------------------------------------------------------------

def format_reports(reports: List[ZoneCompletionReport]) -> str:
    """Format multiple zone reports into a readable string."""
    lines: List[str] = []
    lines.append("=" * 60)
    lines.append("ZONE COMPLETION EVALUATION")
    lines.append("=" * 60)

    for report in reports:
        lines.append("")
        lines.append(f"Zone: {report.zone_id}")
        lines.append(f"Completion Score: {report.completion_score:.3f}")
        lines.append(
            f"Standards: {report.passed_count}/{report.total_standards} passed"
        )
        lines.append("")

        for m in report.matches:
            status = "PASS" if m.passed else "FAIL"
            lines.append(f"  [{status}] {m.similarity:.3f} | {m.standard_text}")
            evidence_preview = m.best_evidence_text.split("\n")[0][:120]
            lines.append(f"         evidence: {evidence_preview}")

        lines.append("")
        lines.append(report.gap_summary)
        lines.append("-" * 60)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Semantic zone completion evaluation"
    )
    parser.add_argument(
        "--vlm_json", required=True,
        help="Path to VLM JSON (VideoProcessingResult format)",
    )
    parser.add_argument(
        "--standards", required=True,
        help="Path to standards text file",
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL_NAME,
        help=f"HuggingFace embedding model (default: {DEFAULT_MODEL_NAME})",
    )
    parser.add_argument(
        "--pass_threshold", type=float, default=DEFAULT_PASS_THRESHOLD,
        help=f"Similarity threshold for passing (default: {DEFAULT_PASS_THRESHOLD})",
    )
    args = parser.parse_args()

    # Load VLM JSON — expects VideoProcessingResult-shaped dict
    with open(args.vlm_json, "r") as f:
        vlm_data = json.load(f)

    zone_analyses = vlm_data.get("zone_analyses", {})
    entity_relationships = vlm_data.get("entity_relationships", {})

    if not zone_analyses:
        print("No zone_analyses found in VLM JSON. Nothing to evaluate.")
        return

    evaluator = SemanticEvaluator(
        model_name=args.model,
        standards_path=args.standards,
        pass_threshold=args.pass_threshold,
    )
    reports = evaluator.evaluate_from_texts(zone_analyses, entity_relationships)
    print(format_reports(reports))


if __name__ == "__main__":
    main()

"""Semantic completion evaluation for construction site zones.

Compares VLM zone analysis text against "completed zone" standards
using embedding similarity to score how complete each zone is.

Pipeline:
  1. Extract zone analysis text from VideoProcessingResult
  2. Chunk each zone's analysis + entity relationships into segments
  3. Embed chunks and standard descriptions with a HuggingFace model
  4. Score each standard against zone evidence via cosine similarity
  5. Produce a per-zone completion report

Usage (standalone):
  python -m app.agents.prod_semantics \\
      --vlm_json path/to/vlm_result.json \\
      --standards app/agents/standards.txt

Usage (in pipeline):
  from app.agents.prod_semantics import SemanticEvaluator
  evaluator = SemanticEvaluator(model_name="...", standards_path="...")
  reports = evaluator.evaluate(video_processing_result)
"""

from __future__ import annotations

import argparse
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Embedding model config — replace with your chosen HuggingFace model
# ---------------------------------------------------------------------------
# Recommended options:
#   "BAAI/bge-base-en-v1.5"
#   "sentence-transformers/all-MiniLM-L6-v2"
#   "thenlper/gte-base"
DEFAULT_MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"

# Similarity threshold: a standard is "met" if best evidence >= this
DEFAULT_PASS_THRESHOLD = 0.55


# ---------------------------------------------------------------------------
# Data structures
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class TextChunk:
    """A chunk of text with metadata for embedding comparison."""
    chunk_id: str
    zone_id: str
    text: str
    source: str  # "vlm" or "standard"


@dataclass(frozen=True)
class StandardMatch:
    """Result of matching a single standard against zone evidence."""
    standard_id: str
    standard_text: str
    best_evidence_chunk: str
    best_evidence_text: str
    similarity: float
    passed: bool


@dataclass
class ZoneCompletionReport:
    """Completion evaluation for a single zone."""
    zone_id: str
    completion_score: float
    matches: List[StandardMatch]
    passed_count: int = 0
    failed_count: int = 0
    total_standards: int = 0
    gap_summary: str = ""


# ---------------------------------------------------------------------------
# Standards loading
# ---------------------------------------------------------------------------

def load_standards(path: str) -> List[str]:
    """Load standard descriptions from a text file.

    Format: each non-empty line or blank-line-separated block is one standard.
    """
    text = Path(path).read_text(encoding="utf-8")

    blocks: List[str] = []
    current: List[str] = []

    for line in text.splitlines():
        stripped = line.strip()
        if stripped == "":
            if current:
                blocks.append("\n".join(current).strip())
                current = []
        else:
            current.append(stripped)
    if current:
        blocks.append("\n".join(current).strip())

    return [b for b in blocks if b]


def _standards_to_chunks(standards: List[str]) -> List[TextChunk]:
    return [
        TextChunk(
            chunk_id=f"std_{i}",
            zone_id="STANDARD",
            text=s,
            source="standard",
        )
        for i, s in enumerate(standards)
    ]


# ---------------------------------------------------------------------------
# Zone text extraction and chunking
# ---------------------------------------------------------------------------

def extract_zone_texts(
    zone_analyses: Dict[str, str],
    entity_relationships: Dict[str, str],
) -> Dict[str, str]:
    """Combine zone analysis and entity relationships into a single
    text block per zone, ready for chunking."""
    combined: Dict[str, str] = {}
    all_zones = set(zone_analyses.keys()) | set(entity_relationships.keys())

    for zone_id in all_zones:
        parts: List[str] = []
        analysis = zone_analyses.get(zone_id, "").strip()
        relationships = entity_relationships.get(zone_id, "").strip()

        if analysis:
            parts.append(f"Zone analysis: {analysis}")
        if relationships:
            parts.append(f"Spatial relationships: {relationships}")

        if parts:
            combined[zone_id] = "\n".join(parts)

    return combined


def chunk_zone_text(
    zone_id: str,
    text: str,
    max_chars: int = 1200,
) -> List[TextChunk]:
    """Split a zone's combined text into chunks for embedding.

    Strategy: split on sentence boundaries, accumulate until max_chars.
    """
    # Simple sentence splitting — handles periods, newlines
    sentences: List[str] = []
    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Split on ". " but keep the period
        parts = line.replace(". ", ".\n").split("\n")
        sentences.extend(p.strip() for p in parts if p.strip())

    if not sentences:
        return []

    chunks: List[TextChunk] = []
    buf: List[str] = []
    buf_len = 0
    idx = 0

    def flush():
        nonlocal buf, buf_len, idx
        if not buf:
            return
        chunks.append(TextChunk(
            chunk_id=f"vlm_{zone_id}_{idx}",
            zone_id=zone_id,
            text=" ".join(buf),
            source="vlm",
        ))
        idx += 1
        buf = []
        buf_len = 0

    for sent in sentences:
        if buf and buf_len + len(sent) + 1 > max_chars:
            flush()
        buf.append(sent)
        buf_len += len(sent) + 1

    flush()
    return chunks


# ---------------------------------------------------------------------------
# Embedding wrapper
# ---------------------------------------------------------------------------

class EmbeddingModel:
    """Wraps a HuggingFace sentence-transformers model for text embedding.

    Install: pip install sentence-transformers torch
    """

    def __init__(self, model_name: str = DEFAULT_MODEL_NAME, device: Optional[str] = None):
        try:
            from sentence_transformers import SentenceTransformer
        except ImportError:
            raise RuntimeError(
                "sentence-transformers is required. "
                "Install with: pip install sentence-transformers torch"
            )

        import torch

        self.device = device or ("cuda" if torch.cuda.is_available() else "cpu")
        self.model = SentenceTransformer(model_name, device=self.device)
        self._torch = torch
        logger.info("Loaded embedding model %s on %s", model_name, self.device)

    def embed(self, texts: List[str], batch_size: int = 32):
        """Embed a list of texts. Returns a torch.Tensor of shape [N, D]."""
        embeddings = self.model.encode(
            texts,
            batch_size=batch_size,
            show_progress_bar=False,
            convert_to_numpy=True,
            normalize_embeddings=False,
        )
        return self._torch.from_numpy(embeddings).float()

    def cosine_similarity_matrix(self, a, b):
        """Compute cosine similarity between two sets of embeddings.

        Args:
            a: Tensor [N, D]
            b: Tensor [M, D]

        Returns:
            Tensor [N, M] of cosine similarities
        """
        F = self._torch.nn.functional
        a_norm = F.normalize(a, p=2, dim=1)
        b_norm = F.normalize(b, p=2, dim=1)
        return a_norm @ b_norm.T


# ---------------------------------------------------------------------------
# Matching and scoring
# ---------------------------------------------------------------------------

def score_zone_against_standards(
    zone_chunks: List[TextChunk],
    standard_chunks: List[TextChunk],
    embedder: EmbeddingModel,
    pass_threshold: float = DEFAULT_PASS_THRESHOLD,
) -> List[StandardMatch]:
    """For each standard, find the best-matching VLM zone chunk."""
    if not zone_chunks or not standard_chunks:
        return [
            StandardMatch(
                standard_id=sc.chunk_id,
                standard_text=sc.text,
                best_evidence_chunk="none",
                best_evidence_text="(no zone evidence available)",
                similarity=0.0,
                passed=False,
            )
            for sc in standard_chunks
        ]

    vlm_texts = [c.text for c in zone_chunks]
    std_texts = [c.text for c in standard_chunks]

    vlm_emb = embedder.embed(vlm_texts)
    std_emb = embedder.embed(std_texts)

    # sim[i, j] = similarity between standard i and vlm chunk j
    sim = embedder.cosine_similarity_matrix(std_emb, vlm_emb)

    matches: List[StandardMatch] = []
    for j, std_chunk in enumerate(standard_chunks):
        best_val, best_idx = sim[j].max(dim=0)
        best_score = float(best_val)
        best_vlm = zone_chunks[int(best_idx)]

        matches.append(StandardMatch(
            standard_id=std_chunk.chunk_id,
            standard_text=std_chunk.text,
            best_evidence_chunk=best_vlm.chunk_id,
            best_evidence_text=best_vlm.text[:300],
            similarity=best_score,
            passed=best_score >= pass_threshold,
        ))

    return matches


def build_zone_report(
    zone_id: str,
    matches: List[StandardMatch],
) -> ZoneCompletionReport:
    """Aggregate standard matches into a zone completion report."""
    passed = [m for m in matches if m.passed]
    failed = [m for m in matches if not m.passed]

    if matches:
        score = sum(m.similarity for m in matches) / len(matches)
    else:
        score = 0.0

    # Build gap summary
    gaps: List[str] = []
    for m in sorted(failed, key=lambda x: x.similarity):
        gaps.append(f"- {m.standard_text} (score: {m.similarity:.2f})")

    gap_summary = ""
    if gaps:
        gap_summary = "Unmet standards:\n" + "\n".join(gaps)
    else:
        gap_summary = "All standards met."

    return ZoneCompletionReport(
        zone_id=zone_id,
        completion_score=score,
        matches=sorted(matches, key=lambda m: m.similarity, reverse=True),
        passed_count=len(passed),
        failed_count=len(failed),
        total_standards=len(matches),
        gap_summary=gap_summary,
    )


# ---------------------------------------------------------------------------
# Main evaluator class
# ---------------------------------------------------------------------------

class SemanticEvaluator:
    """End-to-end semantic completion evaluator.

    Usage:
        evaluator = SemanticEvaluator(
            model_name="BAAI/bge-base-en-v1.5",
            standards_path="app/agents/standards.txt",
        )
        reports = evaluator.evaluate_from_texts(zone_analyses, entity_relationships)
    """

    def __init__(
        self,
        model_name: str = DEFAULT_MODEL_NAME,
        standards_path: Optional[str] = None,
        standards: Optional[List[str]] = None,
        pass_threshold: float = DEFAULT_PASS_THRESHOLD,
        device: Optional[str] = None,
    ):
        self.pass_threshold = pass_threshold
        self.embedder = EmbeddingModel(model_name=model_name, device=device)

        if standards is not None:
            self._standards = standards
        elif standards_path is not None:
            self._standards = load_standards(standards_path)
        else:
            # Default: look for standards.txt next to this file
            default_path = Path(__file__).parent / "standards.txt"
            if default_path.exists():
                self._standards = load_standards(str(default_path))
            else:
                raise ValueError(
                    "No standards provided. Pass standards_path or standards list."
                )

        self._standard_chunks = _standards_to_chunks(self._standards)

    def evaluate_from_texts(
        self,
        zone_analyses: Dict[str, str],
        entity_relationships: Optional[Dict[str, str]] = None,
    ) -> List[ZoneCompletionReport]:
        """Evaluate zone completion from raw analysis text.

        Args:
            zone_analyses: {zone_id: analysis_text} from VideoProcessingResult
            entity_relationships: {zone_id: relationships_text} (optional)

        Returns:
            List of ZoneCompletionReport, one per zone.
        """
        entity_rels = entity_relationships or {}
        zone_texts = extract_zone_texts(zone_analyses, entity_rels)

        reports: List[ZoneCompletionReport] = []
        for zone_id, text in zone_texts.items():
            vlm_chunks = chunk_zone_text(zone_id, text)
            matches = score_zone_against_standards(
                vlm_chunks,
                self._standard_chunks,
                self.embedder,
                self.pass_threshold,
            )
            report = build_zone_report(zone_id, matches)
            reports.append(report)

        # Sort by completion score ascending (worst zones first)
        reports.sort(key=lambda r: r.completion_score)
        return reports

    def evaluate(self, video_result) -> List[ZoneCompletionReport]:
        """Evaluate from a VideoProcessingResult object directly."""
        return self.evaluate_from_texts(
            zone_analyses=video_result.zone_analyses,
            entity_relationships=video_result.entity_relationships,
        )


# ---------------------------------------------------------------------------
# Report formatting
# ---------------------------------------------------------------------------

def format_reports(reports: List[ZoneCompletionReport]) -> str:
    """Format multiple zone reports into a readable string."""
    lines: List[str] = []
    lines.append("=" * 60)
    lines.append("ZONE COMPLETION EVALUATION")
    lines.append("=" * 60)

    for report in reports:
        lines.append("")
        lines.append(f"Zone: {report.zone_id}")
        lines.append(f"Completion Score: {report.completion_score:.3f}")
        lines.append(
            f"Standards: {report.passed_count}/{report.total_standards} passed"
        )
        lines.append("")

        for m in report.matches:
            status = "PASS" if m.passed else "FAIL"
            lines.append(f"  [{status}] {m.similarity:.3f} | {m.standard_text}")
            evidence_preview = m.best_evidence_text.split("\n")[0][:120]
            lines.append(f"         evidence: {evidence_preview}")

        lines.append("")
        lines.append(report.gap_summary)
        lines.append("-" * 60)

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# CLI entrypoint
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Semantic zone completion evaluation"
    )
    parser.add_argument(
        "--vlm_json", required=True,
        help="Path to VLM JSON (VideoProcessingResult format)",
    )
    parser.add_argument(
        "--standards", required=True,
        help="Path to standards text file",
    )
    parser.add_argument(
        "--model", default=DEFAULT_MODEL_NAME,
        help=f"HuggingFace embedding model (default: {DEFAULT_MODEL_NAME})",
    )
    parser.add_argument(
        "--pass_threshold", type=float, default=DEFAULT_PASS_THRESHOLD,
        help=f"Similarity threshold for passing (default: {DEFAULT_PASS_THRESHOLD})",
    )
    args = parser.parse_args()

    # Load VLM JSON — expects VideoProcessingResult-shaped dict
    with open(args.vlm_json, "r") as f:
        vlm_data = json.load(f)

    zone_analyses = vlm_data.get("zone_analyses", {})
    entity_relationships = vlm_data.get("entity_relationships", {})

    if not zone_analyses:
        print("No zone_analyses found in VLM JSON. Nothing to evaluate.")
        return

    evaluator = SemanticEvaluator(
        model_name=args.model,
        standards_path=args.standards,
        pass_threshold=args.pass_threshold,
    )
    reports = evaluator.evaluate_from_texts(zone_analyses, entity_relationships)
    print(format_reports(reports))


if __name__ == "__main__":
    main()
