"""Vast.ai SDK wrapper — manages file transfer and remote execution on a pre-existing GPU instance."""
from __future__ import annotations

import asyncio
import json
import logging
import os
import tempfile
from pathlib import Path

from tenacity import retry, stop_after_attempt, wait_exponential, before_sleep_log
from vastai import VastAI

from app.config import VASTAI_API_KEY, VASTAI_INSTANCE_ID

logger = logging.getLogger(__name__)

_client: VastAI | None = None

_RETRY = dict(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
    before_sleep=before_sleep_log(logger, logging.WARNING),
    reraise=True,
)


def _get_client() -> VastAI:
    """Return a cached VastAI SDK client."""
    global _client
    if _client is None:
        if not VASTAI_API_KEY:
            raise RuntimeError("VASTAI_API_KEY is not set")
        _client = VastAI(api_key=VASTAI_API_KEY)
        logger.info("VastAI SDK client initialized")
    return _client


def _get_instance_id() -> int:
    """Resolve the configured instance ID."""
    if not VASTAI_INSTANCE_ID:
        raise RuntimeError(
            "VASTAI_INSTANCE_ID is not set — set it to your running Vast.ai instance ID"
        )
    return int(VASTAI_INSTANCE_ID)


@retry(**_RETRY)
def _copy_sync(client: VastAI, src: str, dst: str) -> None:
    client.copy(src=src, dst=dst)


@retry(**_RETRY)
def _execute_sync(client: VastAI, instance_id: int, command: str) -> str:
    return str(client.execute(id=instance_id, COMMAND=command))


async def upload_file(local_path: str, remote_path: str) -> None:
    """Copy a local file to the Vast.ai instance workspace."""
    client = _get_client()
    instance_id = _get_instance_id()
    dst = f"{instance_id}:{remote_path}"

    logger.info("Uploading %s → %s", local_path, dst)
    await asyncio.to_thread(_copy_sync, client, local_path, dst)
    logger.info("Upload complete: %s", remote_path)


async def download_file(remote_path: str, local_path: str) -> None:
    """Copy a file from the Vast.ai instance to local filesystem."""
    client = _get_client()
    instance_id = _get_instance_id()
    src = f"{instance_id}:{remote_path}"

    logger.info("Downloading %s → %s", src, local_path)
    await asyncio.to_thread(_copy_sync, client, src, local_path)
    logger.info("Download complete: %s", local_path)


async def execute_command(command: str) -> str:
    """Execute a command on the Vast.ai instance and return its output."""
    client = _get_client()
    instance_id = _get_instance_id()

    logger.info("Executing on instance %d: %s", instance_id, command[:120])
    result = await asyncio.to_thread(_execute_sync, client, instance_id, command)
    logger.info("Execution complete, result length: %d", len(result))
    return result


async def upload_inference_script(script_path: str) -> None:
    """Upload the remote inference script to /workspace/ on the instance."""
    await upload_file(script_path, "/workspace/remote_inference.py")


async def run_remote_inference(
    remote_video_path: str,
    model_id: str,
    chunk_seconds: float = 5.0,
    max_frames: int = 8,
) -> dict:
    """Execute the inference script on the GPU instance and return parsed JSON results.

    Steps:
      1. Run remote_inference.py on the instance with the given video path
      2. The script writes results to /workspace/result.json
      3. Download and parse result.json
    """
    cmd = (
        f"cd /workspace && python remote_inference.py "
        f"--video '{remote_video_path}' "
        f"--model-id '{model_id}' "
        f"--chunk-seconds {chunk_seconds} "
        f"--max-frames {max_frames} "
        f"--output /workspace/result.json"
    )

    await execute_command(cmd)

    tmp_fd, local_result_path = tempfile.mkstemp(suffix=".json")
    os.close(tmp_fd)
    try:
        await download_file("/workspace/result.json", local_result_path)
        result_text = Path(local_result_path).read_text()
        return json.loads(result_text)
    finally:
        try:
            os.unlink(local_result_path)
        except OSError:
            pass
