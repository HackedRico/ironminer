"""
Standalone script: use Twelve Labs Pegasus API to get a descriptive summary of a video.

Independent of the main pipeline (no imports from processor). Requires:
  pip install twelvelabs

Environment:
  TWELVELABS_API_KEY  — Your API key (or use --api-key).

Usage:
  python pegasus_describe.py --video path/to/video.mp4 [--output path] [--index-id ID] [--api-key KEY]
"""
from __future__ import annotations

import argparse
import os
import subprocess
import sys
import tempfile
from pathlib import Path

# Default prompt: ask Pegasus to describe all events and context in the video
DEFAULT_PROMPT = """Describe everything that happens in this construction site (or workplace) video. Include:

1. **Events and actions** — All notable events in chronological order (what happens, when, and who or what is involved).
2. **People and equipment** — Who and what appears in the scene (workers, vehicles, machinery, tools) and what they are doing.
3. **Safety and risk** — Any safety-related moments: people near machinery, unsafe behavior, PPE (hard hats, vests), near-misses, or hazards.
4. **Scene and context** — Scene changes, areas of the site, and any important context (e.g. weather, time of day, activity type).

Be thorough and specific. Use timestamps where helpful. Write in clear paragraphs."""


def get_client(api_key: str | None):
    try:
        from twelvelabs import TwelveLabs
    except ImportError:
        print("twelvelabs package not installed. Run: pip install twelvelabs", file=sys.stderr)
        sys.exit(1)
    key = api_key or os.environ.get("TWELVELABS_API_KEY")
    if not key:
        print("Set TWELVELABS_API_KEY or pass --api-key.", file=sys.stderr)
        sys.exit(1)
    return TwelveLabs(api_key=key)


TEMP_INDEX_NAME = "pegasus-describe-temp"


def ensure_index(client, index_id: str | None):
    """Use existing index or create one with Pegasus for text generation."""
    if index_id:
        return index_id
    # Reuse existing index with our temp name if present (avoids 409 "name already exists")
    try:
        resp = client.indexes.list()
        items = getattr(resp, "data", None) or resp
        for idx in (items if isinstance(items, list) else list(items)):
            name = getattr(idx, "name", None) or getattr(idx, "index_name", None)
            if name == TEMP_INDEX_NAME:
                print(f"Using existing index: {idx.id} ({TEMP_INDEX_NAME})")
                return idx.id
    except Exception:
        pass
    from twelvelabs.indexes import IndexesCreateRequestModelsItem

    try:
        index = client.indexes.create(
            index_name=TEMP_INDEX_NAME,
            models=[
                IndexesCreateRequestModelsItem(
                    model_name="pegasus1.2",
                    model_options=["visual", "audio"],
                ),
            ],
        )
        return index.id
    except Exception as e:
        if "index_name_already_exists" in str(e).lower() or "409" in str(e):
            resp = client.indexes.list()
            items = getattr(resp, "data", None) or resp
            for idx in (items if isinstance(items, list) else list(items)):
                name = getattr(idx, "name", None) or getattr(idx, "index_name", None)
                if name == TEMP_INDEX_NAME:
                    print(f"Using existing index: {idx.id} ({TEMP_INDEX_NAME})")
                    return idx.id
        raise


PEGASUS_MIN_DURATION_SEC = 4.0


def get_video_duration_sec(path: Path) -> float | None:
    """Return duration in seconds via ffprobe, or None if unavailable."""
    try:
        r = subprocess.run(
            [
                "ffprobe", "-v", "error", "-show_entries", "format=duration",
                "-of", "default=noprint_wrappers=1:nokey=1", str(path),
            ],
            capture_output=True,
            text=True,
            timeout=10,
        )
        if r.returncode == 0 and r.stdout.strip():
            return float(r.stdout.strip())
    except Exception:
        pass
    return None


def reencode_for_pegasus(video_path: Path) -> Path:
    """Re-encode video to H.264 30fps main profile for Twelve Labs compatibility. Returns path to temp file."""
    video_path = video_path.resolve()
    if not video_path.is_file():
        raise FileNotFoundError(f"Video not found: {video_path}")
    out = Path(tempfile.gettempdir()) / f"pegasus_input_{video_path.stem}.mp4"
    cmd = [
        "ffmpeg", "-y", "-i", str(video_path),
        "-c:v", "libx264", "-profile:v", "main", "-pix_fmt", "yuv420p", "-r", "30",
        "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart",
        str(out),
    ]
    print("Re-encoding for API compatibility (30fps, H.264 main)...")
    r = subprocess.run(cmd, capture_output=True, text=True)
    if r.returncode != 0 or not out.is_file():
        raise RuntimeError(f"ffmpeg failed: {r.stderr or r.stdout}")
    print(f"Re-encoded to {out}")
    return out


def upload_and_wait(client, index_id: str, video_path: Path | None, video_url: str | None) -> str:
    """Upload video to index (from file or URL), wait for indexing, return video_id."""
    if video_url:
        print(f"Submitting video URL to index {index_id}...")
        task = client.tasks.create(index_id=index_id, video_url=video_url)
    else:
        video_path = (video_path or Path()).resolve()
        if not video_path.is_file():
            print(f"Video file not found: {video_path}", file=sys.stderr)
            sys.exit(1)
        duration = get_video_duration_sec(video_path)
        if duration is not None and duration < PEGASUS_MIN_DURATION_SEC:
            print(
                f"\nVideo duration is {duration:.1f}s. Twelve Labs Pegasus requires at least {PEGASUS_MIN_DURATION_SEC} seconds.\n"
                "Pad or use a longer clip, e.g.:\n"
                f"  ffmpeg -i 12013.mp4 -t 5 -c copy output/longer.mp4   # first 5 seconds\n"
                f"  ffmpeg -stream_loop 1 -i 12013.mp4 -c copy -t 5 output/looped.mp4   # loop to 5s\n",
                file=sys.stderr,
            )
            sys.exit(1)
        print(f"Uploading {video_path} to index {index_id}...")
        try:
            # Pass (filename, file_handle, mime_type) so the SDK sends a proper multipart filename
            with open(video_path, "rb") as f:
                task = client.tasks.create(
                    index_id=index_id,
                    video_file=(video_path.name, f, "video/mp4"),
                )
        except Exception as e:
            err_msg = str(e).lower()
            if "video_file_broken" in err_msg or "unable to process video" in err_msg:
                print(
                    "\nThe API could not process this video file.\n"
                    "Common causes:\n"
                    f"  • Duration under {PEGASUS_MIN_DURATION_SEC} seconds (Pegasus minimum). Check with: ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 <file>\n"
                    "  • Codec/format: try --reencode or use --video-url with a public URL.\n",
                    file=sys.stderr,
                )
            raise
    print(f"Task id={task.id}, waiting for indexing...")
    task = client.tasks.wait_for_done(
        task_id=task.id,
        sleep_interval=5,
        callback=lambda t: print(f"  Status={t.status}"),
    )
    if task.status != "ready":
        print(f"Indexing failed with status {task.status}", file=sys.stderr)
        sys.exit(1)
    print(f"Indexing done. video_id={task.video_id}")
    return task.video_id


def analyze_video(client, video_id: str, prompt: str) -> str:
    """Call Pegasus analyze (open-ended) and return generated text."""
    print("Calling Pegasus API (analyze)...")
    res = client.analyze(video_id=video_id, prompt=prompt)
    return getattr(res, "data", None) or getattr(res, "text", None) or str(res)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Get a descriptive summary of a video using Twelve Labs Pegasus API (standalone)."
    )
    parser.add_argument("--video", default=None, help="Path to video file (MP4, etc.)")
    parser.add_argument(
        "--video-url",
        default=None,
        help="Public URL of the video (use instead of --video if local file fails with 'video_file_broken').",
    )
    parser.add_argument(
        "--output",
        default="pegasus_description.txt",
        help="Output text file path (default: pegasus_description.txt)",
    )
    parser.add_argument(
        "--index-id",
        default=None,
        help="Existing Twelve Labs index ID (with Pegasus). If not set, a temporary index is created.",
    )
    parser.add_argument("--api-key", default=None, help="Twelve Labs API key (or set TWELVELABS_API_KEY)")
    parser.add_argument(
        "--prompt",
        default=None,
        help="Custom prompt for Pegasus (default: describe all events, people, equipment, safety, context).",
    )
    parser.add_argument(
        "--reencode",
        action="store_true",
        help="Re-encode video with ffmpeg (H.264 30fps, main profile) before upload. Use if you get 'video_file_broken'.",
    )
    args = parser.parse_args()
    if not args.video and not args.video_url:
        parser.error("Provide either --video (local path) or --video-url (public URL).")
    if args.video and args.video_url:
        parser.error("Provide only one of --video or --video-url.")
    if args.reencode and args.video_url:
        parser.error("--reencode only applies to --video (local file), not --video-url.")

    video_path = Path(args.video) if args.video else None
    if args.reencode and video_path:
        video_path = reencode_for_pegasus(video_path)
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    client = get_client(args.api_key)
    index_id = ensure_index(client, args.index_id)
    video_id = upload_and_wait(client, index_id, video_path, args.video_url)
    prompt = args.prompt or DEFAULT_PROMPT
    text = analyze_video(client, video_id, prompt)

    if not text or not text.strip():
        print("No text returned from Pegasus.", file=sys.stderr)
        sys.exit(1)

    output_path.write_text(text.strip(), encoding="utf-8")
    print(f"Wrote description to {output_path}")


if __name__ == "__main__":
    main()
