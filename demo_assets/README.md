# Demo Assets

Canned VLM (video-language model) zone analysis files for demo uploads.

## How it works

When a video is uploaded, the VideoAgent checks this folder for a JSON file matching the uploaded filename (minus extension and UUID prefix). If found, it loads pre-built zone data from the JSON instead of re-analyzing.

**Example**: Upload `site_walkthrough.mp4` → agent finds `demo_assets/site_walkthrough.json` → uses canned zones.

## Files

- `site_walkthrough.json` — Masonry/exterior construction scenario with different trades and hazards than the default Riverside Tower analysis

## Adding new scenarios

Create a JSON file with this structure:

```json
{
  "zones": [
    {
      "zone_id": "z1",
      "zone_name": "Zone A — Description",
      "trades_present": ["trade1", "trade2"],
      "area_sqft": 800,
      "workers": [ ... WorkerDetection objects ... ],
      "equipment": [],
      "hazards": [],
      "egress": [],
      "material_stacks": []
    }
  ],
  "briefing": "Plain-English summary of what was observed..."
}
```

Name the file to match the MP4 filename you'll upload (e.g., `my_video.json` for `my_video.mp4`).
