#!/usr/bin/env python3
"""Remote inference script — runs on a Vast.ai GPU instance.

Receives a video file, splits into chunks, runs LLaVA-NeXT-Video inference
with temporal chaining, and writes JSON results to disk.

Imports shared utilities from video_common.py (uploaded alongside this script).

Usage:
    python remote_inference.py \
        --video /workspace/video.mp4 \
        --model-id llava-hf/LLaVA-NeXT-Video-34B-hf \
        --chunk-seconds 5 \
        --max-frames 8 \
        --output /workspace/result.json
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import shutil
import sys

import numpy as np
import torch
from transformers import (
    LlavaNextVideoForConditionalGeneration,
    LlavaNextVideoProcessor,
)

from video_common import (
    COMBINE_PROMPT,
    TEMPORAL_PROMPT_PREFIX,
    ZONE_PROMPT,
    grab_thumbnail,
    read_video,
    split_video,
)

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

# ── Model loading ─────────────────────────────────────────────────────────────

_processor = None
_model = None


def load_vlm(model_id: str):
    """Load LLaVA-NeXT-Video once and cache globally."""
    global _processor, _model
    if _model is not None:
        return _processor, _model

    logger.info("Loading VLM: %s", model_id)
    _processor = LlavaNextVideoProcessor.from_pretrained(model_id)
    _model = LlavaNextVideoForConditionalGeneration.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        device_map="auto",
    )
    _model.eval()
    logger.info("VLM loaded successfully on %s", next(_model.parameters()).device)
    return _processor, _model


# ── Inference ─────────────────────────────────────────────────────────────────


def run_inference(
    text_prompt: str,
    model_id: str,
    clip: np.ndarray | None = None,
    max_new_tokens: int = 512,
) -> str:
    """Run LLaVA-NeXT-Video inference. Pass clip for video+text, omit for text-only."""
    processor, model = load_vlm(model_id)

    content: list[dict] = []
    if clip is not None:
        content.append({"type": "video"})
    content.append({"type": "text", "text": text_prompt})

    conversation = [{"role": "user", "content": content}]
    prompt = processor.apply_chat_template(conversation, add_generation_prompt=True)

    processor_kwargs = {"videos": clip} if clip is not None else {}
    inputs = processor(prompt, **processor_kwargs, return_tensors="pt").to(model.device)

    with torch.no_grad():
        output_ids = model.generate(**inputs, max_new_tokens=max_new_tokens)

    generated = output_ids[0][inputs["input_ids"].shape[-1]:]
    return processor.decode(generated, skip_special_tokens=True).strip()


# ── Main pipeline ─────────────────────────────────────────────────────────────


def process_video(
    video_path: str,
    model_id: str,
    chunk_seconds: float,
    max_frames: int,
) -> dict:
    """Full inference pipeline: split -> analyze chunks -> combine -> return JSON-serializable dict."""
    chunks = split_video(video_path, chunk_seconds)
    if not chunks:
        return {"chunk_summaries": [], "combined_briefing": "", "thumbnails": {}, "model": model_id}

    chunk_summaries: list[str] = []
    thumbnails: dict[str, str] = {}
    previous_summary: str | None = None

    for idx, chunk_path in enumerate(chunks):
        clip = read_video(chunk_path, max_frames=max_frames)

        if previous_summary:
            prompt = TEMPORAL_PROMPT_PREFIX.format(previous=previous_summary) + ZONE_PROMPT
        else:
            prompt = ZONE_PROMPT

        summary = run_inference(prompt, model_id, clip=clip, max_new_tokens=512)
        logger.info("Chunk %d/%d analyzed (%d chars)", idx + 1, len(chunks), len(summary))

        chunk_summaries.append(summary)
        thumbnails[f"chunk_{idx:04d}"] = grab_thumbnail(chunk_path)
        previous_summary = summary

    # Combine all chunk summaries into a site-level briefing
    numbered = "\n\n".join(
        f"--- Chunk {i+1} (t={i * chunk_seconds:.0f}s\u2013{(i+1) * chunk_seconds:.0f}s) ---\n{s}"
        for i, s in enumerate(chunk_summaries)
    )
    combined = run_inference(
        COMBINE_PROMPT.format(summaries=numbered), model_id, max_new_tokens=600,
    )
    logger.info("Combined briefing: %d chars", len(combined))

    # Cleanup temp chunk files
    shutil.rmtree(os.path.dirname(chunks[0]), ignore_errors=True)

    return {
        "chunk_summaries": chunk_summaries,
        "combined_briefing": combined,
        "thumbnails": thumbnails,
        "model": model_id,
    }


def main():
    parser = argparse.ArgumentParser(description="Run LLaVA-NeXT-Video inference on a construction site video")
    parser.add_argument("--video", required=True, help="Path to input video file")
    parser.add_argument("--model-id", default="llava-hf/LLaVA-NeXT-Video-34B-hf", help="HuggingFace model ID")
    parser.add_argument("--chunk-seconds", type=float, default=5.0, help="Chunk duration in seconds")
    parser.add_argument("--max-frames", type=int, default=8, help="Max frames to sample per chunk")
    parser.add_argument("--output", required=True, help="Path to write result JSON")
    args = parser.parse_args()

    if not os.path.isfile(args.video):
        logger.error("Video file not found: %s", args.video)
        sys.exit(1)

    result = process_video(
        video_path=args.video,
        model_id=args.model_id,
        chunk_seconds=args.chunk_seconds,
        max_frames=args.max_frames,
    )

    with open(args.output, "w") as f:
        json.dump(result, f, indent=2)

    logger.info("Results written to %s", args.output)


if __name__ == "__main__":
    main()
