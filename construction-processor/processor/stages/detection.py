"""Stage 1: RT-DETR detection. Process every Nth frame."""
from __future__ import annotations

import logging
from typing import Any

import numpy as np

from ..config import DETECTION_CLASSES, DETECTION_CONF_THRESH, DETECTION_NMS_THRESH, FRAME_SKIP

logger = logging.getLogger(__name__)

# COCO index for person; map others by name if using COCO-based model
COCO_PERSON_ID = 0


class DetectionStage:
    def __init__(
        self,
        conf_thresh: float = DETECTION_CONF_THRESH,
        nms_thresh: float = DETECTION_NMS_THRESH,
        frame_skip: int = FRAME_SKIP,
        class_names: list[str] | None = None,
    ):
        self.conf_thresh = conf_thresh
        self.nms_thresh = nms_thresh
        self.frame_skip = frame_skip
        self.class_names = class_names or DETECTION_CLASSES
        self._model = None

    def _load_model(self) -> Any:
        if self._model is not None:
            return self._model
        try:
            from ultralytics import RTDETR
            self._model = RTDETR("rtdetr-l.pt")
            logger.info("Loaded RT-DETR model (ultralytics)")
        except ImportError:
            logger.warning(
                "ultralytics not installed - no detections will run. "
                "Install with: pip install ultralytics"
            )
            self._model = "placeholder"
        except Exception as e:
            logger.warning(
                "RT-DETR load failed (%s) - no detections. Check PyTorch/CUDA and try: pip install ultralytics",
                e,
            )
            self._model = "placeholder"
        return self._model

    def run(self, frame_bgr: np.ndarray, frame_index: int) -> list[dict[str, Any]]:
        """Return detections for this frame. Empty if frame should be skipped."""
        if frame_index % self.frame_skip != 0:
            return []
        model = self._load_model()
        if model == "placeholder":
            return []
        results = model.predict(
            frame_bgr,
            conf=self.conf_thresh,
            iou=self.nms_thresh,
            verbose=False,
        )
        out = []
        for r in results:
            boxes = r.boxes
            if boxes is None:
                continue
            for i in range(len(boxes)):
                xyxy = boxes.xyxy[i].cpu().numpy()
                conf = float(boxes.conf[i].cpu().numpy())
                cls_id = int(boxes.cls[i].cpu().numpy())
                # Map COCO class id to name (ultralytics uses COCO by default)
                name = self._cls_id_to_name(cls_id)
                out.append({
                    "class_id": cls_id,
                    "class_name": name,
                    "bbox": xyxy.tolist(),
                    "confidence": conf,
                })
        return out

    def _cls_id_to_name(self, cls_id: int) -> str:
        """Map model class ID to our class name."""
        # Ultralytics COCO: 0=person, 1=bicycle, ...; we only keep person + custom
        if cls_id == 0:
            return "person"
        if cls_id < len(self.class_names):
            return self.class_names[cls_id]
        return "unknown"
