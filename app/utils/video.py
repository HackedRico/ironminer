"""
Shared video utilities and prompts.
"""
from __future__ import annotations

import base64
import io
import logging
import os
import subprocess
import tempfile

import av
import numpy as np

logger = logging.getLogger(__name__)

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


# ── Video utilities ───────────────────────────────────────────────────────────


def split_video(video_path: str, chunk_seconds: float, output_dir: str | None = None) -> list[str]:
    """Split a video into N-second chunks using ffmpeg CLI. Returns sorted chunk paths."""
    tmpdir = output_dir or tempfile.mkdtemp(prefix="ironsite_chunks_")
    os.makedirs(tmpdir, exist_ok=True)
    pattern = os.path.join(tmpdir, "chunk_%04d.mp4")

    subprocess.run(
        [
            "ffmpeg", "-i", video_path,
            "-f", "segment",
            "-segment_time", str(chunk_seconds),
            "-reset_timestamps", "1",
            "-c", "copy",
            "-y", pattern,
        ],
        capture_output=True,
        check=True,
    )

    chunks = sorted(
        os.path.join(tmpdir, f)
        for f in os.listdir(tmpdir)
        if f.endswith(".mp4")
    )
    logger.info("Split %s into %d chunks (%.0fs each)", video_path, len(chunks), chunk_seconds)
    return chunks


def read_video(video_path: str, max_frames: int = 8) -> np.ndarray:
    """Decode video and uniformly sample max_frames frames. Returns (N, H, W, 3) uint8."""
    container = av.open(video_path)
    frames = [f.to_ndarray(format="rgb24") for f in container.decode(video=0)]
    container.close()

    if not frames:
        raise ValueError(f"No frames decoded from {video_path}")

    total = len(frames)
    indices = np.linspace(0, total - 1, min(max_frames, total), dtype=int)
    return np.stack([frames[i] for i in indices])


def grab_thumbnail(video_path: str) -> str:
    """Return base64 JPEG of the mid-point frame."""
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
