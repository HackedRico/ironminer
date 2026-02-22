"""Orchestrate 4-stage pipeline: detection -> tracking -> spatial -> VLM; write outputs."""
from __future__ import annotations

import logging
import time
from pathlib import Path
from typing import Any

import cv2
import numpy as np

from .config import FRAME_SKIP, TRAIL_LEN
from .file_io import (
    load_calibration,
    load_zones,
    EventsWriter,
    CSVLogger,
    VideoWriter,
    SummaryWriter,
)
from .stages import DetectionStage, TrackingStage, SpatialStage, VLMStage

logger = logging.getLogger(__name__)


def run(
    video_path: str | Path,
    calibration_path: str | Path,
    zones_path: str | Path,
    output_dir: str | Path,
) -> None:
    output_dir = Path(output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)
    logger.info("Outputs will be written to: %s", output_dir)
    load_calibration(calibration_path)
    load_zones(zones_path)
    cap = cv2.VideoCapture(str(video_path))
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    logger.info("Video %s: %dx%d @ %.1f fps, %d frames", video_path, w, h, fps, total_frames)

    detection = DetectionStage()
    tracking = TrackingStage()
    spatial = SpatialStage()
    vlm = VLMStage()

    events_writer = EventsWriter(output_dir / "events.json")
    csv_logger = CSVLogger(output_dir / "object_log.csv")
    video_writer = VideoWriter(output_dir / "annotated_video.mp4", fps, w, h, trail_len=TRAIL_LEN)
    summary_writer = SummaryWriter(output_dir / "summary.txt")

    stats = {
        "proximity_warnings": 0,
        "proximity_critical": 0,
        "ttc_warnings": 0,
        "hardhat_yes": 0,
        "hardhat_total": 0,
        "vest_yes": 0,
        "vest_total": 0,
        "zone_violations": {},
    }
    start_time = time.time()
    frame_index = 0
    last_detections: list[dict[str, Any]] = []
    last_tracks: list[dict[str, Any]] = []

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        timestamp_sec = frame_index / fps
        # Stage 1: detection (every FRAME_SKIP)
        if frame_index % FRAME_SKIP == 0:
            detections = detection.run(frame, frame_index)
            if detections:
                last_detections = detections
        else:
            detections = last_detections
        # Stage 2: tracking (use last detections when we skipped detection)
        if detections:
            tracks = tracking.run(detections, frame, frame_index)
            last_tracks = tracks
        else:
            tracks = last_tracks
        # Stage 3: spatial
        spatial_tracks, spatial_events = spatial.run(tracks, frame_index, timestamp_sec)
        for e in spatial_events:
            events_writer.add(e)
            if e.get("type") == "proximity_alert":
                if e.get("severity") == "warning":
                    stats["proximity_warnings"] += 1
                else:
                    stats["proximity_critical"] += 1
            elif e.get("type") == "ttc_warning":
                stats["ttc_warnings"] += 1
            elif e.get("type") == "zone_entry":
                zn = e.get("zone", "unknown")
                stats["zone_violations"][zn] = stats["zone_violations"].get(zn, 0) + 1
        # Stage 4: VLM
        vlm_tracks, ppe_events = vlm.run(spatial_tracks, frame, frame_index, spatial_events)
        for e in ppe_events:
            events_writer.add(e)
            stats["hardhat_total"] += 1
            stats["vest_total"] += 1
            if e.get("hardhat") == "YES":
                stats["hardhat_yes"] += 1
            if e.get("vest") == "YES":
                stats["vest_yes"] += 1
        # CSV row per object
        for tr in vlm_tracks:
            bbox = tr.get("bbox", [0, 0, 0, 0])
            csv_logger.write_row({
                "frame": frame_index,
                "object_id": tr.get("object_id", ""),
                "class": tr.get("class_name", ""),
                "x_px": bbox[0],
                "y_px": bbox[1],
                "w_px": bbox[2] - bbox[0],
                "h_px": bbox[3] - bbox[1],
                "x_m": tr.get("x_m", ""),
                "y_m": tr.get("y_m", ""),
                "vx_mps": tr.get("vx_mps", ""),
                "vy_mps": tr.get("vy_mps", ""),
                "in_zone": tr.get("in_zone", ""),
                "hardhat": tr.get("hardhat", "NA"),
                "vest": tr.get("vest", "NA"),
            })
        # Annotated frame
        video_writer.write_frame(frame, vlm_tracks, spatial_events + ppe_events)
        frame_index += 1
        if frame_index % 500 == 0:
            logger.info("Processed frame %d / %d", frame_index, total_frames if total_frames else "?")

    cap.release()
    duration_sec = time.time() - start_time
    events_writer.flush()
    csv_logger.close()
    video_writer.close()
    summary_writer.set_stats(
        total_frames=frame_index,
        duration_sec=duration_sec,
        proximity_warnings=stats["proximity_warnings"],
        proximity_critical=stats["proximity_critical"],
        ttc_warnings=stats["ttc_warnings"],
        hardhat_yes=stats["hardhat_yes"],
        hardhat_total=stats["hardhat_total"],
        vest_yes=stats["vest_yes"],
        vest_total=stats["vest_total"],
        zone_violations=stats["zone_violations"],
    )
    summary_writer.flush()
    logger.info(
        "Pipeline finished: %d frames in %.1f s. Outputs: %s",
        frame_index, duration_sec,
        [str(output_dir / n) for n in ("events.json", "object_log.csv", "annotated_video.mp4", "summary.txt")],
    )
