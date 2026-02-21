"""Video Agent — video chunking + GPU inference via Vast.ai.

Pipeline per chunk:
  1. ffmpeg splits video into N-second chunks
  2. LLaVA-NeXT-Video 34B analyzes each chunk with previous summary as context
  3. All chunk summaries combined into one site-level briefing
"""
from __future__ import annotations

import base64
import io
import logging
import os
import tempfile

import av
import ffmpeg
import numpy as np
from transformers import (
    LlavaNextVideoForConditionalGeneration,
    LlavaNextVideoProcessor,
)
import torch

from app.agents.base import BaseAgent
from app.config import VASTAI_MODEL_ID
from app.models.video import FrameData, VideoProcessingResult

logger = logging.getLogger(__name__)

# ── LLaVA-NeXT-Video singleton ───────────────────────────────────────────────

_processor: LlavaNextVideoProcessor | None = None
_model: LlavaNextVideoForConditionalGeneration | None = None


def _load_vlm():
    """Load LLaVA-NeXT-Video once and cache globally."""
    global _processor, _model
    if _model is not None:
        return _processor, _model

    logger.info("Loading VLM: %s", VASTAI_MODEL_ID)
    _processor = LlavaNextVideoProcessor.from_pretrained(VASTAI_MODEL_ID)
    _model = LlavaNextVideoForConditionalGeneration.from_pretrained(
        VASTAI_MODEL_ID,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    _model.eval()
    logger.info("VLM loaded successfully")
    return _processor, _model


# ── Video utilities ───────────────────────────────────────────────────────────

def split_video(video_path: str, chunk_seconds: float, output_dir: str | None = None) -> list[str]:
    """Split a video into N-second chunks using ffmpeg. Returns sorted chunk paths."""
    tmpdir = output_dir or tempfile.mkdtemp(prefix="ironsite_chunks_")
    os.makedirs(tmpdir, exist_ok=True)
    pattern = os.path.join(tmpdir, "chunk_%04d.mp4")

    (
        ffmpeg
        .input(video_path)
        .output(
            pattern,
            f="segment",
            segment_time=chunk_seconds,
            reset_timestamps=1,
            c="copy",
        )
        .overwrite_output()
        .run(quiet=True)
    )

    chunks = sorted(
        os.path.join(tmpdir, f)
        for f in os.listdir(tmpdir)
        if f.endswith(".mp4")
    )
    logger.info("Split %s into %d chunks (%.0fs each)", video_path, len(chunks), chunk_seconds)
    return chunks


def _read_video(video_path: str, max_frames: int = 8) -> np.ndarray:
    """Decode a video and uniformly sample max_frames frames.

    Returns shape (max_frames, H, W, 3) uint8.
    """
    container = av.open(video_path)
    frames = [f.to_ndarray(format="rgb24") for f in container.decode(video=0)]
    container.close()

    if not frames:
        raise ValueError(f"No frames decoded from {video_path}")

    total = len(frames)
    indices = np.linspace(0, total - 1, min(max_frames, total), dtype=int)
    return np.stack([frames[i] for i in indices])


def _grab_thumbnail(video_path: str) -> str:
    """Return a base64 JPEG of the mid-point frame for storage."""
    container = av.open(video_path)
    frames = []
    for frame in container.decode(video=0):
        frames.append(frame)
        if len(frames) > 2:
            break
    container.close()

    if not frames:
        return ""

    img = frames[len(frames) // 2].to_image()
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=75)
    return base64.b64encode(buf.getvalue()).decode()


# ── Prompts ───────────────────────────────────────────────────────────────────

ZONE_PROMPT = (
    "You are a construction-site spatial analyst. "
    "Divide this video clip into spatial zones (foreground/midground/background, "
    "left/center/right, ground level/elevated). "
    "For each zone describe: what trade or activity is happening, how many workers "
    "are present, what equipment and materials occupy the space, and rate congestion "
    "on a 1-5 scale."
)

TEMPORAL_PROMPT_PREFIX = (
    "Previous site analysis:\n{previous}\n\n"
    "Now analyze the current video chunk. Note any changes: have congestion hotspots "
    "shifted? Have new trade overlaps appeared? Has any area cleared up? "
    "Rate the overall congestion trend: improving, stable, or worsening.\n\n"
)

COMBINE_PROMPT = (
    "You are a construction-site spatial analyst. Below are sequential chunk-by-chunk "
    "analyses of the same job site video, ordered chronologically.\n\n"
    "{summaries}\n\n"
    "Synthesize these into a single plain-English site briefing for a non-technical "
    "manager. Lead with the most important spatial issue. Mention zone-level congestion, "
    "trade overlap, and any temporal trends. End with one specific recommendation. "
    "Keep it under 200 words."
)


# ── Inference helpers ─────────────────────────────────────────────────────────

def _run_vlm_video(clip: np.ndarray, text_prompt: str) -> str:
    """Run LLaVA-NeXT-Video on sampled frames with a text prompt."""
    processor, model = _load_vlm()

    conversation = [
        {
            "role": "user",
            "content": [
                {"type": "video"},
                {"type": "text", "text": text_prompt},
            ],
        }
    ]
    prompt = processor.apply_chat_template(conversation, add_generation_prompt=True)
    inputs = processor(prompt, videos=clip, return_tensors="pt").to(model.device)

    with torch.no_grad():
        output_ids = model.generate(**inputs, max_new_tokens=512)

    generated = output_ids[0][inputs["input_ids"].shape[-1]:]
    return processor.decode(generated, skip_special_tokens=True).strip()


def _run_text_only(text_prompt: str) -> str:
    """Run LLaVA-NeXT-Video with a text-only prompt (final combine step)."""
    processor, model = _load_vlm()

    conversation = [
        {
            "role": "user",
            "content": [{"type": "text", "text": text_prompt}],
        }
    ]
    prompt = processor.apply_chat_template(conversation, add_generation_prompt=True)
    inputs = processor(prompt, return_tensors="pt").to(model.device)

    with torch.no_grad():
        output_ids = model.generate(**inputs, max_new_tokens=600)

    generated = output_ids[0][inputs["input_ids"].shape[-1]:]
    return processor.decode(generated, skip_special_tokens=True).strip()


# ── Main agent ────────────────────────────────────────────────────────────────

class VideoAgent(BaseAgent):
    async def process(
        self,
        job_id: str,
        site_id: str,
        file_path: str,
        frame_interval: float = 5.0,
    ) -> VideoProcessingResult:
        # 1. Split video into N-second chunks
        chunks = split_video(file_path, chunk_seconds=frame_interval)
        if not chunks:
            logger.warning("No chunks produced for job %s", job_id)
            return VideoProcessingResult(job_id=job_id, site_id=site_id)

        frame_data_list: list[FrameData] = []
        zone_analyses: dict[str, str] = {}
        chunk_summaries: list[str] = []
        previous_summary: str | None = None

        for idx, chunk_path in enumerate(chunks):
            chunk_id = f"{job_id}_c{idx:04d}"
            timestamp = idx * frame_interval

            # 2. Sample frames for LLaVA
            clip = _read_video(chunk_path, max_frames=8)

            # 3. Build prompt with temporal context
            if previous_summary:
                prompt = TEMPORAL_PROMPT_PREFIX.format(previous=previous_summary) + ZONE_PROMPT
            else:
                prompt = ZONE_PROMPT

            # 4. LLaVA: zone + congestion analysis
            summary = _run_vlm_video(clip, prompt)
            logger.info("Chunk %d/%d analyzed (%d chars)", idx + 1, len(chunks), len(summary))

            frame_data_list.append(FrameData(
                id=chunk_id,
                site_id=site_id,
                timestamp=timestamp,
                image_data=_grab_thumbnail(chunk_path),
                filename=f"chunk_{idx:04d}.mp4",
            ))
            zone_analyses[chunk_id] = summary
            chunk_summaries.append(summary)
            previous_summary = summary

        # 5. Combine all chunk summaries into one site-level briefing
        numbered = "\n\n".join(
            f"--- Chunk {i+1} (t={i * frame_interval:.0f}s\u2013{(i+1) * frame_interval:.0f}s) ---\n{s}"
            for i, s in enumerate(chunk_summaries)
        )
        combined = _run_text_only(COMBINE_PROMPT.format(summaries=numbered))
        logger.info("Combined briefing: %d chars", len(combined))

        # 6. Clean up temp chunk files
        for cp in chunks:
            try:
                os.unlink(cp)
            except OSError:
                pass
        if chunks:
            try:
                os.rmdir(os.path.dirname(chunks[0]))
            except OSError:
                pass

        return VideoProcessingResult(
            job_id=job_id,
            site_id=site_id,
            frames=frame_data_list,
            zone_analyses=zone_analyses,
            temporal_chain=chunk_summaries,
            metadata={"combined_briefing": combined, "model": VASTAI_MODEL_ID},
        )
