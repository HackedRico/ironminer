"""Test video chunking using a real sample video.

Chunks are saved to app/tests/chunks/ for inspection.
"""
import os
from pathlib import Path

from app.utils.video import split_video

TESTS_DIR = Path(__file__).parent
VIDEO_PATH = str(TESTS_DIR / "14_transit_prep_mp.mp4")
OUTPUT_DIR = str(TESTS_DIR / "chunks")
CHUNK_SECONDS = 5.0


def test_split_video():
    chunks = split_video(VIDEO_PATH, chunk_seconds=CHUNK_SECONDS, output_dir=OUTPUT_DIR)

    assert len(chunks) > 0, "Expected at least one chunk"

    for path in chunks:
        assert os.path.exists(path), f"Chunk file missing: {path}"
        assert os.path.getsize(path) > 0, f"Chunk file is empty: {path}"
        assert path.endswith(".mp4"), f"Expected .mp4 chunk, got: {path}"

    print(f"Produced {len(chunks)} chunk(s) → {OUTPUT_DIR}")
    for i, path in enumerate(chunks):
        size_kb = os.path.getsize(path) / 1024
        print(f"  chunk {i+1}: {os.path.basename(path)} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    test_split_video()
    print("PASSED")
