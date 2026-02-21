# Update 2 — UI: Video Persistence, Media Gallery & Zone Expansion

> Shipped on `ui-timeline` branch. All changes backward-compatible.

---

## What Changed

### 1. Video Persistence (Backend)

Uploaded videos are now **saved to disk** instead of being discarded.

| Layer | Change |
|-------|--------|
| `app/models/video.py` | Added `filename`, `uploaded_by`, `file_path` fields to `VideoJob` |
| `app/services/job_queue.py` | `create_job()` accepts and stores the new fields |
| `app/routers/video.py` | Writes file to `uploads/<uuid>_<name>`, accepts `uploaded_by` form field |
| `app/main.py` | Mounts `StaticFiles` at `/uploads` so the frontend can fetch videos directly |
| `.gitignore` | Added `uploads/` — user files stay out of the repo |

**How it works:** On upload, the file is written to `uploads/` with a UUID prefix to prevent collisions. The `VideoJob` response now includes the original filename, who uploaded it, and the relative path on disk.

---

### 2. Media Gallery Tab (Frontend)

New **"Media"** tab in ReviewMode — a responsive grid of every video uploaded for the selected site.

**File:** `gui/src/components/MediaGallery.jsx` (new)

- **Live mode:** Fetches jobs from `/api/video/jobs`, renders a `<video controls>` player for each file
- **Mock mode:** Pulls from `MOCK_TIMELINE` entries where `source === 'upload'`, shows placeholder cards with play icon
- **Empty state:** Message directing user to upload from the Briefing tab
- **Card layout:** 16:9 video area → filename → uploader + timestamp → AI summary (if available)

**Wired in:** `gui/src/views/ReviewMode.jsx` — added `'media'` to the tab list, renders `<MediaGallery>` when active.

---

### 3. Expandable Zone Rows

`ZoneRow` is now **clickable and toggleable**. Clicking a zone row expands it to show every worker in that zone as chips with name and trade.

**File:** `gui/src/components/ZoneRow.jsx`

- Added `expanded` / `onToggle` props — controlled by `ReviewMode`
- Expand chevron matches the AlertCard pattern
- Worker chips show a colored dot (matches zone congestion color), worker name, and trade label
- Mock worker names are generated per-trade from a realistic pool, distributed proportionally to match the zone's `workers` count
- If the backend provides a `workerList` array on the zone, it uses that instead

---

### 4. Tab Context Strips

Each tab (Zones, Alerts, Media) now has a **context description strip** below the header — a subtle orange-accented bar explaining what the tab shows:

- **Zones:** "Real-time worker density by zone. Bars show congestion level — red zones have overlapping trades that may cause delays or safety conflicts."
- **Alerts:** "AI-detected safety and scheduling issues from uploaded footage. Expand an alert to see details and recommended actions."
- **Media:** "All video footage uploaded for this site. Click play to review clips, or upload new footage from the Briefing tab."

---

## Files Touched

```
app/models/video.py          — 3 new fields on VideoJob
app/services/job_queue.py    — extended create_job() signature
app/routers/video.py         — disk persistence + uploaded_by param
app/main.py                  — static file mount
.gitignore                   — uploads/
gui/src/api/video.js         — uploadedBy param
gui/src/components/BriefingView.jsx   — passes noteWho to upload
gui/src/components/MediaGallery.jsx   — NEW: gallery grid
gui/src/components/ZoneRow.jsx        — expandable with worker list
gui/src/views/ReviewMode.jsx          — media tab + zone toggle state + context strips
```

---

## How to Test

1. **Upload flow:** Go to Briefing tab → enter your name → drop a video → check `uploads/` directory → response should include `filename`, `uploaded_by`, `file_path`
2. **Static serving:** `curl http://localhost:8000/uploads/<filename>` returns the file
3. **Media tab (mock):** Switch to Media tab with demo data → 3 placeholder cards for Riverside Tower with uploader names and AI summaries
4. **Media tab (live):** Upload a video → switch to Media tab → card appears with playable `<video>` element
5. **Zone expansion:** Click any zone row → worker chips appear → click again to collapse
6. **Context strips:** Each tab shows a description bar below the header
