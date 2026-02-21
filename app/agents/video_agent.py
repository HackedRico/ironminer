"""Video Agent — frame extraction + GPU processing via vest.ai.

Teammate: implement your vest.ai integration here.
The router at app/routers/video.py calls into this agent.
"""
from __future__ import annotations
from app.agents.base import BaseAgent
from app.models.video import VideoProcessingResult


class VideoAgent(BaseAgent):
    async def process(self, job_id: str, site_id: str, file_bytes: bytes, frame_interval: float = 5.0) -> VideoProcessingResult:
        # TODO: implement vest.ai GPU processing
        # 1. Extract frames from video at frame_interval
        # 2. Send frames to vest.ai for parallel GPU processing
        # 3. Run zone decomposition + entity-relationship prompts
        # 4. Build temporal chain across frames
        # 5. Return VideoProcessingResult
        return VideoProcessingResult(
            job_id=job_id,
            site_id=site_id,
        )
