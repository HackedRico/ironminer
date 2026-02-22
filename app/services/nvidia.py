"""
NVIDIA Grounding DINO + NV-CLIP integration.
Python port of Nemo/backend/services/nvidia.js.

Flow for detection:
  1. PIL decode + resize to 640px max → JPEG
  2. Upload as NVCF asset (S3 presigned URL)
  3. POST to Grounding DINO endpoint with asset_id reference
  4. Handle 202 polling until result is ready
  5. Parse JSON or ZIP response → scale bboxes back to original coords

Flow for embedding:
  1. POST to NV-CLIP endpoint with base64 data URI
  2. Return 512-dim float vector

Both functions fall back to mock implementations when NVIDIA_API_KEY is absent.
"""
from __future__ import annotations

import asyncio
import base64
import hashlib
import io
import json
import math
import random
import zipfile
from typing import Optional

import httpx
from PIL import Image

from app.config import NVIDIA_API_KEY
from app.models.embedding import DetectionResult

# ── Endpoints ─────────────────────────────────────────────────────────────────
GROUNDING_DINO_URL = "https://ai.api.nvidia.com/v1/cv/nvidia/nv-grounding-dino"
NVCLIP_URL         = "https://integrate.api.nvidia.com/v1/embeddings"
ASSETS_URL         = "https://api.nvcf.nvidia.com/v2/nvcf/assets"
POLLING_URL        = "https://api.nvcf.nvidia.com/v2/nvcf/pexec/status/"

# ── Timeouts (seconds) ────────────────────────────────────────────────────────
TIMEOUT_ASSET_CREATE = 60
TIMEOUT_ASSET_PUT    = 120
TIMEOUT_INFER        = 180
TIMEOUT_POLL         = 30
TIMEOUT_EMBED        = 30

# ── Polling ───────────────────────────────────────────────────────────────────
MAX_POLL_RETRIES   = 30
POLL_DELAY_SECS    = 2

# ── Image pre-processing ──────────────────────────────────────────────────────
MAX_IMAGE_DIMENSION = 640
JPEG_QUALITY        = 80

# ── Detection prompt ──────────────────────────────────────────────────────────
DEFAULT_DETECT_PROMPT = "object . person . equipment . vehicle . structure . pipe . valve . machinery"


# ── Helpers ───────────────────────────────────────────────────────────────────

def _decode_image(image_b64: str) -> bytes:
    """Strip optional data URI prefix and base64-decode."""
    if image_b64.startswith("data:"):
        _, rest = image_b64.split(",", 1)
        image_b64 = rest
    return base64.b64decode(image_b64)


def _resize_for_detect(raw: bytes) -> tuple[bytes, int, int, int, int]:
    """
    Resize image to MAX_IMAGE_DIMENSION on longest side, convert to JPEG.
    Returns (jpeg_bytes, orig_w, orig_h, resized_w, resized_h).
    """
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    orig_w, orig_h = img.size

    # Resize if needed
    if orig_w > MAX_IMAGE_DIMENSION or orig_h > MAX_IMAGE_DIMENSION:
        ratio = MAX_IMAGE_DIMENSION / max(orig_w, orig_h)
        new_w = max(1, int(orig_w * ratio))
        new_h = max(1, int(orig_h * ratio))
        img = img.resize((new_w, new_h), Image.LANCZOS)
    else:
        new_w, new_h = orig_w, orig_h

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY)
    return buf.getvalue(), orig_w, orig_h, new_w, new_h


def _scale_bboxes(detections: list[DetectionResult],
                  orig_w: int, orig_h: int,
                  res_w: int, res_h: int) -> list[DetectionResult]:
    if orig_w == res_w and orig_h == res_h:
        return detections
    sx = orig_w / res_w
    sy = orig_h / res_h
    scaled = []
    for d in detections:
        x1, y1, x2, y2 = d.bbox
        scaled.append(DetectionResult(
            bbox=[round(x1 * sx), round(y1 * sy), round(x2 * sx), round(y2 * sy)],
            label=d.label,
            confidence=d.confidence,
        ))
    return scaled


def _parse_detections_from_json(data: dict) -> Optional[list[DetectionResult]]:
    choices = data.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    content = choices[0].get("message", {}).get("content", {})
    bounding_boxes = content.get("boundingBoxes")
    if not isinstance(bounding_boxes, list):
        return None

    detections: list[DetectionResult] = []
    for box in bounding_boxes:
        phrase = box.get("phrase") or "object"
        bboxes = box.get("bboxes") or []
        confidences = box.get("confidence") or []
        for i, b in enumerate(bboxes):
            if isinstance(b, (list, tuple)) and len(b) >= 4:
                detections.append(DetectionResult(
                    bbox=[b[0], b[1], b[2], b[3]],
                    label=phrase,
                    confidence=confidences[i] if i < len(confidences) else 0.8,
                ))
    return detections if detections else None


def _parse_zip_response(content: bytes) -> Optional[list[DetectionResult]]:
    try:
        with zipfile.ZipFile(io.BytesIO(content)) as zf:
            for name in zf.namelist():
                lower = name.lower()
                if lower.endswith(".json") or lower.endswith(".response"):
                    raw = zf.read(name).decode("utf-8")
                    try:
                        data = json.loads(raw)
                        det = _parse_detections_from_json(data)
                        if det is not None:
                            return det
                        # Valid empty response
                        if data.get("choices", [{}])[0].get("message", {}).get("content", {}).get("boundingBoxes") is not None:
                            return []
                    except json.JSONDecodeError:
                        pass
    except Exception as exc:
        print(f"[nvidia] ZIP parse error: {exc}")
    return None


# ── Asset upload ──────────────────────────────────────────────────────────────

async def _upload_asset(client: httpx.AsyncClient, jpeg_bytes: bytes) -> str:
    """Upload image bytes to NVCF asset store; return assetId."""
    # Step 1: Create asset slot
    resp = await client.post(
        ASSETS_URL,
        json={"contentType": "image/jpeg", "description": "Input image"},
        headers={
            "Authorization": f"Bearer {NVIDIA_API_KEY}",
            "Content-Type": "application/json",
            "accept": "application/json",
        },
        timeout=TIMEOUT_ASSET_CREATE,
    )
    resp.raise_for_status()
    data = resp.json()
    upload_url = data["uploadUrl"]
    asset_id = data["assetId"]

    # Step 2: PUT image bytes to S3
    put_resp = await client.put(
        upload_url,
        content=jpeg_bytes,
        headers={
            "x-amz-meta-nvcf-asset-description": "Input image",
            "content-type": "image/jpeg",
        },
        timeout=TIMEOUT_ASSET_PUT,
    )
    put_resp.raise_for_status()
    return str(asset_id)


# ── Polling ───────────────────────────────────────────────────────────────────

async def _poll_until_ready(client: httpx.AsyncClient, req_id: str) -> httpx.Response:
    for i in range(MAX_POLL_RETRIES):
        await asyncio.sleep(POLL_DELAY_SECS)
        resp = await client.get(
            f"{POLLING_URL}{req_id}",
            headers={"Authorization": f"Bearer {NVIDIA_API_KEY}", "accept": "application/json"},
            timeout=TIMEOUT_POLL,
        )
        if resp.status_code == 202:
            continue
        if resp.status_code == 200:
            return resp
        resp.raise_for_status()
    raise RuntimeError(f"Max poll retries ({MAX_POLL_RETRIES}) reached for reqId {req_id}")


async def _handle_success_response(resp: httpx.Response) -> Optional[list[DetectionResult]]:
    ct = resp.headers.get("content-type", "")
    if "application/json" in ct:
        data = resp.json()
        det = _parse_detections_from_json(data)
        if det is not None:
            return det
        # Valid empty — no objects found
        if data.get("choices", [{}])[0].get("message", {}).get("content", {}).get("boundingBoxes") is not None:
            return []
    else:
        # Binary (ZIP) response
        det = _parse_zip_response(resp.content)
        if det is not None:
            return det
    return None


# ── Public API ────────────────────────────────────────────────────────────────

async def detect_objects(image_b64: str) -> list[DetectionResult]:
    """
    Detect objects in a base64-encoded image using NVIDIA Grounding DINO.
    Falls back to a single mock detection when NVIDIA_API_KEY is not set.
    """
    if not NVIDIA_API_KEY:
        print("[nvidia] No API key — returning mock detections")
        return _mock_detections()

    raw = _decode_image(image_b64)
    jpeg_bytes, orig_w, orig_h, res_w, res_h = _resize_for_detect(raw)

    async with httpx.AsyncClient() as client:
        asset_id = await _upload_asset(client, jpeg_bytes)

        body = {
            "model": "Grounding-Dino",
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": DEFAULT_DETECT_PROMPT},
                        {"type": "media_url", "media_url": {"url": f"data:image/jpeg;asset_id,{asset_id}"}},
                    ],
                }
            ],
            "threshold": 0.3,
        }
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {NVIDIA_API_KEY}",
            "NVCF-INPUT-ASSET-REFERENCES": asset_id,
            "NVCF-FUNCTION-ASSET-IDS": asset_id,
        }

        resp = await client.post(GROUNDING_DINO_URL, json=body, headers=headers, timeout=TIMEOUT_INFER)

        if resp.status_code == 200:
            detections = await _handle_success_response(resp)
        elif resp.status_code == 202:
            req_id = resp.headers.get("NVCF-REQID")
            if not req_id:
                raise RuntimeError("202 without NVCF-REQID header")
            poll_resp = await _poll_until_ready(client, req_id)
            detections = await _handle_success_response(poll_resp)
        else:
            resp.raise_for_status()
            detections = None

        if detections is None:
            return []

        return _scale_bboxes(detections, orig_w, orig_h, res_w, res_h)


async def create_embedding(image_b64: str) -> list[float]:
    """
    Create a 512-dim visual embedding using NVIDIA NV-CLIP.
    Falls back to a deterministic mock embedding when NVIDIA_API_KEY is not set.
    """
    if not NVIDIA_API_KEY:
        print("[nvidia] No API key — returning mock embedding")
        return _mock_embedding(image_b64)

    # Ensure data URI prefix
    if not image_b64.startswith("data:"):
        image_b64 = f"data:image/jpeg;base64,{image_b64}"

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            NVCLIP_URL,
            json={"input": [image_b64], "model": "nvidia/nvclip"},
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {NVIDIA_API_KEY}",
            },
            timeout=TIMEOUT_EMBED,
        )
        resp.raise_for_status()
        data = resp.json()
        embedding = data["data"][0]["embedding"]
        if not isinstance(embedding, list):
            raise RuntimeError("No embedding in NV-CLIP response")
        return embedding


def crop_image_b64(frame_b64: str, bbox: list[float]) -> str:
    """
    Crop a base64-encoded image to the given bbox [x1, y1, x2, y2].
    Returns the cropped region as a base64 JPEG string.
    """
    raw = _decode_image(frame_b64)
    img = Image.open(io.BytesIO(raw)).convert("RGB")
    x1, y1, x2, y2 = [int(v) for v in bbox]
    # Clamp to image bounds
    w, h = img.size
    x1, y1 = max(0, x1), max(0, y1)
    x2, y2 = min(w, x2), min(h, y2)
    if x2 <= x1 or y2 <= y1:
        # Degenerate bbox — return small center crop
        cx, cy = w // 2, h // 2
        size = min(w, h, 128) // 2
        x1, y1, x2, y2 = cx - size, cy - size, cx + size, cy + size
    cropped = img.crop((x1, y1, x2, y2))
    buf = io.BytesIO()
    cropped.save(buf, format="JPEG", quality=85)
    return base64.b64encode(buf.getvalue()).decode("ascii")


# ── Mock fallbacks ────────────────────────────────────────────────────────────

def _mock_detections() -> list[DetectionResult]:
    return [DetectionResult(bbox=[80.0, 60.0, 240.0, 240.0], label="object", confidence=0.92)]


def _mock_embedding(image_b64: str) -> list[float]:
    """Deterministic unit-vector based on image content hash (for cosine similarity to work)."""
    seed_str = image_b64[-200:] if len(image_b64) > 200 else image_b64
    seed = int(hashlib.sha256(seed_str.encode()).hexdigest(), 16) % (2 ** 32)
    rng = random.Random(seed)
    dim = 512
    vec = [rng.gauss(0, 1) for _ in range(dim)]
    norm = math.sqrt(sum(v * v for v in vec)) or 1.0
    return [v / norm for v in vec]
