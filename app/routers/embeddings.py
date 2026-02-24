"""
Embeddings router — object detection + visual embedding for LiveMode annotations.

POST /detect   → run NVIDIA Grounding DINO on a frame, return bounding boxes
POST /embed    → crop selected bbox, create NV-CLIP embedding, attach note, persist
GET  /worker/{worker_identity}  → list embedded objects for a worker
GET  /feed/{feed_id}            → list embedded objects for a feed
"""
from __future__ import annotations

import asyncio
import math
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException

from app.models.embedding import (
    DetectRequest,
    DetectionResult,
    EmbedObjectCreate,
    EmbeddedObject,
    SimilarRequest,
    SimilarResult,
)
from app.services import nvidia
from app.services.storage import EMBEDDINGS


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    mag_a = math.sqrt(sum(x * x for x in a))
    mag_b = math.sqrt(sum(x * x for x in b))
    if mag_a == 0.0 or mag_b == 0.0:
        return 0.0
    return dot / (mag_a * mag_b)

router = APIRouter()


# ── Detection ──────────────────────────────────────────────────────────────────

@router.post("/detect", response_model=list[DetectionResult])
async def detect_objects(body: DetectRequest):
    """Run NVIDIA Grounding DINO on the provided frame. Returns detected objects with bboxes."""
    if not body.image_b64:
        raise HTTPException(400, "image_b64 is required")
    try:
        detections = await nvidia.detect_objects(body.image_b64, prompt=body.prompt)
        return detections
    except Exception as exc:
        raise HTTPException(502, f"Detection failed: {exc}") from exc


# ── Embedding ──────────────────────────────────────────────────────────────────

@router.post("/embed", response_model=EmbeddedObject)
async def embed_object(body: EmbedObjectCreate):
    """
    Crop the selected bbox from the frame, create an NV-CLIP embedding,
    optionally transcribe an audio note via Parakeet, persist and return.
    """
    if not body.frame_b64:
        raise HTTPException(400, "frame_b64 is required")
    if not body.bbox or len(body.bbox) < 4:
        raise HTTPException(400, "bbox must have 4 values [x1, y1, x2, y2]")

    # 1. Crop the frame to the selected bbox
    try:
        crop_b64 = nvidia.crop_image_b64(body.frame_b64, body.bbox)
    except Exception as exc:
        raise HTTPException(422, f"Could not crop image: {exc}") from exc

    # 2. Create visual embedding from the cropped region
    try:
        embedding = await nvidia.create_embedding(crop_b64)
    except Exception as exc:
        raise HTTPException(502, f"Embedding failed: {exc}") from exc

    # 3. Resolve note text (typed note or audio transcript via Parakeet)
    note_text = (body.note or "").strip()

    if body.audio_b64 and not note_text:
        try:
            from app.services.parakeet import transcribe_audio_base64
            transcript = await asyncio.to_thread(transcribe_audio_base64, body.audio_b64)
            if transcript:
                note_text = transcript
        except Exception as exc:
            print(f"[embeddings] Parakeet transcription failed: {exc}")

    if not note_text:
        note_text = "[no note]"

    # 4. Persist
    obj = EmbeddedObject(
        id=str(uuid.uuid4()),
        feed_id=body.feed_id,
        site_id=body.site_id,
        worker_identity=body.worker_identity,
        crop_b64=crop_b64,
        bbox=body.bbox,
        label=body.label,
        note=note_text,
        embedding=embedding,
        created_at=datetime.now(timezone.utc),
    )
    EMBEDDINGS[obj.id] = obj
    return obj


# ── Admin ──────────────────────────────────────────────────────────────────────

@router.delete("/all")
async def clear_all_embeddings():
    """Delete every stored embedding (dev/reset use only)."""
    count = len(EMBEDDINGS)
    EMBEDDINGS.clear()
    return {"deleted": count}


# ── Listing ────────────────────────────────────────────────────────────────────

@router.get("/worker/{worker_identity}", response_model=list[EmbeddedObject])
async def list_worker_embeddings(worker_identity: str):
    """Return all embedded objects associated with a worker, newest first."""
    results = [
        obj for obj in EMBEDDINGS.values()
        if obj.worker_identity == worker_identity
    ]
    return sorted(results, key=lambda o: o.created_at, reverse=True)


@router.get("/feed/{feed_id}", response_model=list[EmbeddedObject])
async def list_feed_embeddings(feed_id: str):
    """Return all embedded objects recorded on a specific feed, newest first."""
    results = [
        obj for obj in EMBEDDINGS.values()
        if obj.feed_id == feed_id
    ]
    return sorted(results, key=lambda o: o.created_at, reverse=True)


# ── Similarity search ───────────────────────────────────────────────────────────

@router.post("/similar", response_model=list[SimilarResult])
async def find_similar(body: SimilarRequest):
    """
    Embed the provided frame with NV-CLIP, then rank all stored EmbeddedObjects
    by cosine similarity to that embedding.  Optionally scoped to a worker or feed.
    Returns up to top_k results above the similarity threshold, best match first.
    """
    if not body.frame_b64:
        raise HTTPException(400, "frame_b64 is required")

    # 1. Embed the current frame
    try:
        query_embedding = await nvidia.create_embedding(body.frame_b64)
    except Exception as exc:
        raise HTTPException(502, f"Embedding failed: {exc}") from exc

    # 2. Collect candidates (scoped by worker, feed, or all)
    all_objects = list(EMBEDDINGS.values())
    if body.worker_identity:
        candidates = [o for o in all_objects if o.worker_identity == body.worker_identity]
    elif body.feed_id:
        candidates = [o for o in all_objects if o.feed_id == body.feed_id]
    else:
        candidates = all_objects

    if not candidates:
        return []

    # 3. Score each candidate
    scored: list[SimilarResult] = []
    for obj in candidates:
        if not obj.embedding:
            continue
        sim = _cosine_similarity(query_embedding, obj.embedding)
        if sim >= body.threshold:
            scored.append(SimilarResult(embedded_object=obj, similarity=round(sim, 4)))

    # 4. Sort by similarity descending, return top_k
    scored.sort(key=lambda r: r.similarity, reverse=True)
    return scored[: body.top_k]
