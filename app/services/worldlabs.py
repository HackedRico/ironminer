"""
World Labs API client — generates 3D worlds from image snapshots.

Ported from worldly/world-models/create_world.py, adapted for async FastAPI usage.
Requires WORLD_LABS_API_KEY in the environment.
"""
from __future__ import annotations

import mimetypes
import os
import subprocess
import shutil
import tempfile
import time
from pathlib import Path
from typing import Optional

import requests

API_BASE = "https://api.worldlabs.ai/marble/v1"
API_KEY: str = os.getenv("WORLD_LABS_API_KEY", "")

IMAGE_EXTENSIONS = {"jpg", "jpeg", "png", "webp"}
VIDEO_EXTENSIONS = {"mp4", "mov", "mkv"}
MAX_VIDEO_UPLOAD_MB = 10
MAX_VIDEO_UPLOAD_FRAMES = 1800

IMAGE_PROMPT = (
    "Convert this construction site snapshot into a fully navigable, metrically accurate, "
    "hyperrealistic 3D scene. Preserve real-world scale, geometry, lighting, and material "
    "properties. Reconstruct fine geometric detail (scaffolding, rebar, formwork, machinery). "
    "Generate PBR materials for concrete, steel, wood, and earth surfaces."
)

VIDEO_PROMPT = (
    "Convert the provided video into a fully navigable, metrically accurate, hyperrealistic 3D scene. "
    "The output must preserve real-world scale, geometry, lighting, and material properties, "
    "enabling free camera movement and real-time rendering."
)


def _get_api_key() -> str:
    key = os.getenv("WORLD_LABS_API_KEY", "") or API_KEY
    if not key:
        raise RuntimeError(
            "WORLD_LABS_API_KEY is not set. Set it in your .env file."
        )
    return key


def _get_ffmpeg_path() -> str:
    env = os.getenv("FFMPEG_PATH", "").strip()
    if env:
        return env
    which = shutil.which("ffmpeg")
    if which:
        return which
    try:
        import imageio_ffmpeg
        return imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:
        return "ffmpeg"


def upload_media_file(file_path: str, kind: str) -> str:
    """Prepare upload → PUT to signed URL → return media_asset id."""
    api_key = _get_api_key()
    path = os.path.abspath(file_path)
    if not os.path.isfile(path):
        raise FileNotFoundError(f"File not found: {path}")

    file_name = os.path.basename(path)
    ext = (os.path.splitext(file_name)[1] or "").lstrip(".").lower()

    if kind == "video":
        allowed = VIDEO_EXTENSIONS
    elif kind == "image":
        allowed = IMAGE_EXTENSIONS
    else:
        allowed = IMAGE_EXTENSIONS | VIDEO_EXTENSIONS

    if ext not in allowed:
        raise ValueError(f"Extension .{ext} not in allowed set {allowed}")

    if kind == "video":
        path = compress_video_for_upload(path, MAX_VIDEO_UPLOAD_MB, MAX_VIDEO_UPLOAD_FRAMES)
        file_name = os.path.basename(path)
        ext = (os.path.splitext(file_name)[1] or "").lstrip(".").lower()

    prep = requests.post(
        f"{API_BASE}/media-assets:prepare_upload",
        headers={"Content-Type": "application/json", "WLT-Api-Key": api_key},
        json={"file_name": file_name, "kind": kind, "extension": ext or "bin"},
        timeout=30,
    )
    prep.raise_for_status()
    data = prep.json()
    media_asset = data["media_asset"]
    upload_url = data["upload_info"]["upload_url"]
    required_headers = data["upload_info"].get("required_headers") or {}

    file_size = os.path.getsize(path)
    size_range = required_headers.get("x-goog-content-length-range")
    if size_range:
        try:
            lo_str, hi_str = size_range.split(",", 1)
            if not (int(lo_str.strip()) <= file_size <= int(hi_str.strip())):
                raise RuntimeError(
                    f"File too large for upload policy: {file_size} bytes "
                    f"({file_size / (1024*1024):.2f} MB)"
                )
        except ValueError:
            pass

    guessed_type = mimetypes.guess_type(path)[0]

    def run_upload(extra_headers=None):
        curl_cmd = ["curl", "-sS", "-X", "PUT", upload_url]
        for hk, hv in required_headers.items():
            curl_cmd.extend(["-H", f"{hk}: {hv}"])
        for h in (extra_headers or []):
            curl_cmd.extend(["-H", h])
        curl_cmd.extend(["--data-binary", f"@{path}", "-w", "\n__HTTP_STATUS__:%{http_code}"])
        return subprocess.run(curl_cmd, capture_output=True, text=True)

    upload_proc = run_upload()
    output = (upload_proc.stdout or "").strip()
    status = output.split("__HTTP_STATUS__:")[-1].strip() if "__HTTP_STATUS__:" in output else ""
    if upload_proc.returncode == 0 and status.startswith("2"):
        return media_asset.get("id") or media_asset.get("media_asset_id")

    extra = [f"Content-Type: {guessed_type or 'application/octet-stream'}"]
    upload_proc_2 = run_upload(extra_headers=extra)
    output_2 = (upload_proc_2.stdout or "").strip()
    status_2 = output_2.split("__HTTP_STATUS__:")[-1].strip() if "__HTTP_STATUS__:" in output_2 else ""
    if upload_proc_2.returncode == 0 and status_2.startswith("2"):
        return media_asset.get("id") or media_asset.get("media_asset_id")

    raise RuntimeError(f"Signed upload failed: status1={status} status2={status_2}")


def compress_video_for_upload(input_path: str, max_size_mb: int, max_frames: int) -> str:
    input_path = os.path.abspath(input_path)
    output_path = os.path.splitext(input_path)[0] + ".upload.mp4"

    ffmpeg_cmd = [
        _get_ffmpeg_path(), "-y", "-hide_banner", "-loglevel", "error",
        "-i", input_path, "-an", "-c:v", "libx264", "-preset", "medium",
        "-crf", "30", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        "-frames:v", str(max_frames), "-fs", f"{max_size_mb}M", output_path,
    ]

    try:
        proc = subprocess.run(ffmpeg_cmd, capture_output=True, text=True)
    except FileNotFoundError:
        raise RuntimeError("ffmpeg is required for video compression but was not found.")

    if proc.returncode != 0:
        raise RuntimeError(f"Video compression failed: {proc.stderr.strip() or 'unknown error'}")
    if not os.path.isfile(output_path):
        raise RuntimeError("Video compression failed: output file not created")

    output_size = os.path.getsize(output_path)
    if output_size > max_size_mb * 1024 * 1024:
        raise RuntimeError(f"Compressed video still too large: {output_size / (1024*1024):.2f} MB")

    return output_path


def generate_world(
    input_type: str,
    file_path: Optional[str] = None,
    image_base64: Optional[str] = None,
    display_name: str = "Site Snapshot World",
    text_prompt: Optional[str] = None,
) -> dict:
    """
    Start world generation. Returns {"operation_id": ..., "world_id": ...}.
    For image snapshots from the live view, pass image_base64 (data URL or raw base64).
    """
    import base64 as b64mod

    api_key = _get_api_key()
    headers = {"Content-Type": "application/json", "WLT-Api-Key": api_key}

    temp_path = None
    try:
        if input_type == "image" and image_base64 and not file_path:
            raw = image_base64
            if "," in raw:
                raw = raw.split(",", 1)[1]
            img_bytes = b64mod.b64decode(raw)
            with tempfile.NamedTemporaryFile(delete=False, suffix=".png") as tmp:
                tmp.write(img_bytes)
                temp_path = tmp.name
            file_path = temp_path

        if input_type == "text":
            world_prompt = {"type": "text", "text_prompt": (text_prompt or IMAGE_PROMPT).strip()}
        elif input_type == "image":
            if not file_path:
                raise ValueError("file_path or image_base64 required for image input")
            media_asset_id = upload_media_file(file_path, "image")
            world_prompt = {
                "type": "image",
                "image_prompt": {"source": "media_asset", "media_asset_id": media_asset_id},
            }
            if text_prompt:
                world_prompt["text_prompt"] = text_prompt.strip()
            else:
                world_prompt["text_prompt"] = IMAGE_PROMPT
        elif input_type == "video":
            if not file_path:
                raise ValueError("file_path required for video input")
            media_asset_id = upload_media_file(file_path, "video")
            world_prompt = {
                "type": "video",
                "video_prompt": {"source": "media_asset", "media_asset_id": media_asset_id},
                "text_prompt": (text_prompt or VIDEO_PROMPT).strip(),
            }
        else:
            raise ValueError(f"input_type must be text, video, or image — got '{input_type}'")

        payload = {
            "display_name": display_name,
            "world_prompt": world_prompt,
            "permission": {"public": True},
        }

        r = requests.post(f"{API_BASE}/worlds:generate", json=payload, headers=headers, timeout=60)

        if not r.ok and input_type in ("video", "image") and "has not been uploaded yet" in (r.text or ""):
            for attempt in range(1, 7):
                wait_s = 2 * attempt
                print(f"[WorldLabs] Media asset not ready yet, retrying in {wait_s}s (attempt {attempt}/6)...")
                time.sleep(wait_s)
                r = requests.post(f"{API_BASE}/worlds:generate", json=payload, headers=headers, timeout=60)
                if r.ok:
                    break

        if not r.ok:
            raise RuntimeError(f"worlds:generate failed ({r.status_code}): {r.text or r.reason}")

        op = r.json()
        operation_id = op.get("operation_id")
        if not operation_id:
            raise RuntimeError(f"No operation_id in response: {op}")

        return {"operation_id": operation_id}
    finally:
        if temp_path and os.path.exists(temp_path):
            try:
                os.remove(temp_path)
            except OSError:
                pass


def poll_operation(operation_id: str) -> dict:
    """Check generation status. Returns {done, progress, world_id?, marble_url?, worldvr_url?, error?}."""
    api_key = _get_api_key()
    r = requests.get(
        f"{API_BASE}/operations/{operation_id}",
        headers={"WLT-Api-Key": api_key},
        timeout=30,
    )
    r.raise_for_status()
    op = r.json()

    done = op.get("done", False)
    meta = op.get("metadata") or {}
    progress = (meta.get("progress") or {}).get("description", "")
    error_info = op.get("error")

    result = {"done": done, "progress": progress}

    if error_info:
        result["error"] = str(error_info)

    if done and not error_info:
        response = op.get("response") or {}
        world_id = response.get("id") or meta.get("world_id")
        marble_url = response.get("world_marble_url") or f"https://marble.worldlabs.ai/world/{world_id}"
        worldvr_url = marble_url.replace("/world/", "/worldvr/")
        result.update({
            "world_id": world_id,
            "marble_url": marble_url,
            "worldvr_url": worldvr_url,
        })

    return result
