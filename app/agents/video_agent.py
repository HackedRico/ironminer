"""Video Agent — video chunking + GPU inference via Vast.ai.

Pipeline:
  1. Upload video to Vast.ai GPU instance
  2. Execute remote_inference.py on the instance (LLaVA-NeXT-Video 34B)
  3. Download JSON results and build VideoProcessingResult
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

from app.agents.base import BaseAgent
from app.config import VASTAI_MODEL_ID
from app.models.video import FrameData, VideoProcessingResult
from app.services import vastai_client
from app.utils.video import split_video

logger = logging.getLogger(__name__)

# Files uploaded to the GPU instance before each run
_REMOTE_SCRIPT = Path(__file__).resolve().parent.parent.parent / "scripts" / "remote_inference.py"
_SHARED_MODULE = Path(__file__).resolve().parent.parent / "utils" / "video_common.py"

__all__ = ["VideoAgent", "split_video"]


class VideoAgent(BaseAgent):
    async def process(
        self,
        job_id: str,
        site_id: str,
        file_path: str,
        frame_interval: float = 5.0,
    ) -> VideoProcessingResult:
        logger.info("Uploading shared module and inference script to Vast.ai instance")
        await vastai_client.upload_file(str(_SHARED_MODULE), "/workspace/video_common.py")
        await vastai_client.upload_inference_script(str(_REMOTE_SCRIPT))

        video_filename = os.path.basename(file_path)
        remote_video_path = f"/workspace/{video_filename}"
        logger.info("Uploading video %s to Vast.ai instance", video_filename)
        await vastai_client.upload_file(file_path, remote_video_path)

        logger.info("Starting remote inference for job %s", job_id)
        result_data = await vastai_client.run_remote_inference(
            remote_video_path=remote_video_path,
            model_id=VASTAI_MODEL_ID,
            chunk_seconds=frame_interval,
            max_frames=8,
        )

        chunk_summaries: list[str] = result_data.get("chunk_summaries", [])
        combined_briefing: str = result_data.get("combined_briefing", "")
        thumbnails: dict[str, str] = result_data.get("thumbnails", {})
        model_used: str = result_data.get("model", VASTAI_MODEL_ID)

        frame_data_list: list[FrameData] = []
        zone_analyses: dict[str, str] = {}

        for idx, summary in enumerate(chunk_summaries):
            chunk_id = f"{job_id}_c{idx:04d}"
            timestamp = idx * frame_interval

            thumbnail_key = f"chunk_{idx:04d}"
            image_data = thumbnails.get(thumbnail_key, "")

            frame_data_list.append(FrameData(
                id=chunk_id,
                site_id=site_id,
                timestamp=timestamp,
                image_data=image_data,
                filename=f"chunk_{idx:04d}.mp4",
            ))
            zone_analyses[chunk_id] = summary

        logger.info(
            "Job %s complete: %d chunks analyzed, briefing %d chars",
            job_id, len(chunk_summaries), len(combined_briefing),
        )

        return VideoProcessingResult(
            job_id=job_id,
            site_id=site_id,
            frames=frame_data_list,
            zone_analyses=zone_analyses,
            temporal_chain=chunk_summaries,
            metadata={"combined_briefing": combined_briefing, "model": model_used},
        )
