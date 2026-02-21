# Progress Update 2 — UI Enhancements (Planned)

> Branch: `ui-timeline`
> Baseline: commit `299f4b9` (Add project modal and redesign BriefingView)

---

## Current State

The frontend and backend are fully functional with mock data fallback. ReviewMode has three tabs (Briefing, Zones, Alerts), a site sidebar, and an upload zone. BriefingView renders plain text with recommendation highlighting. All components are extracted and styled.

### What's been simplified since doc 1

| Component | Before | Now |
|-----------|--------|-----|
| `BriefingView` | Full component with timeline, upload handling, job status, activity log | Slim text renderer — just displays briefing text |
| `ReviewMode` | Had `AddProjectModal`, `MediaGallery`, context strips | 3-tab layout with `UploadZone` in sidebar |
| `ZoneRow` | Static display only | Same — static display only |
| Backend video | Had file persistence, `uploaded_by` field | Upload endpoint creates job but discards file |

---

## Features Ready to Implement

### 1. Expandable Zone Rows (ZoneRow.jsx)

**Goal:** Click a zone row to expand and see worker list for that zone.

**Design:**
- Add `expanded` / `onToggle` props to `ZoneRow`
- Expand chevron (matches AlertCard pattern)
- Worker chips: colored dot (congestion color) + name + trade label
- Mock worker names generated per-trade from realistic pool, distributed proportionally to zone's `workers` count
- If backend provides `workerList` array, use that instead

**Files:** `gui/src/components/ZoneRow.jsx`, `gui/src/views/ReviewMode.jsx` (add `expandedZone` state)

### 2. Video Persistence (Backend)

**Goal:** Save uploaded files to disk instead of discarding them.

**Design:**
- Add `filename`, `uploaded_by`, `file_path` to `VideoJob` model
- Write files to `uploads/<uuid8>_<sanitized_name>`
- Mount `StaticFiles` at `/uploads` in `app/main.py`
- Accept `uploaded_by` form field in upload endpoint

**Files:** `app/models/video.py`, `app/services/job_queue.py`, `app/routers/video.py`, `app/main.py`, `.gitignore`

### 3. Media Gallery Tab

**Goal:** New "Media" tab in ReviewMode showing a grid of uploaded video cards per site.

**Design:**
- New component `gui/src/components/MediaGallery.jsx`
- Props: `{ siteId, usingMock }`
- Live mode: `fetchJobs(siteId)` → filter jobs with `filename` → `<video controls>` player
- Mock mode: `MOCK_TIMELINE[siteId]` → filter `source === 'upload'` → placeholder cards
- Card layout: 16:9 video area → filename → uploader + timestamp → AI summary
- Empty state: message directing to Briefing tab

**Files:** `gui/src/components/MediaGallery.jsx` (new), `gui/src/views/ReviewMode.jsx` (add tab)

### 4. Tab Context Strips

**Goal:** Description bar below each tab header explaining what the tab shows.

**Design:**
- Orange-accented strip (`borderLeft: 3px solid rgba(249,115,22,0.4)`, text `#94A3B8`)
- Zones: "Real-time worker density by zone..."
- Alerts: "AI-detected safety and scheduling issues..."
- Media: "All video footage uploaded for this site..."

**Files:** `gui/src/views/ReviewMode.jsx`

---

## File Map (current)

```
gui/src/
├── components/
│   ├── AlertCard.jsx        ✅ Dual-mode: alert + timeline, expandable
│   ├── BriefingView.jsx     ✅ Slim text renderer with Recommendation highlight
│   ├── CongestionBar.jsx    ✅ 5-segment visual bar
│   ├── LiveFeedCard.jsx     ✅ Camera feed card with LIVE badge
│   ├── NavBar.jsx           ✅ Top bar with mode toggle
│   ├── SiteCard.jsx         ✅ Site summary with progress bar
│   ├── UploadZone.jsx       ✅ Drag-and-drop file upload
│   └── ZoneRow.jsx          ✅ Static zone row (expansion planned)
├── views/
│   ├── ReviewMode.jsx       ✅ 3 tabs: briefing/zones/alerts
│   └── LiveMode.jsx         ✅ Live feed grid + alerts
├── api/
│   ├── client.js            ✅ api() helper
│   ├── video.js             ✅ uploadVideo, fetchJobs (uploadedBy param planned)
│   ├── sites.js             ✅ fetchSites, fetchBriefing, fetchTimeline
│   ├── safety.js            ✅ safety analysis wrappers
│   ├── productivity.js      ✅ zone/overlap/suggestion wrappers
│   ├── alerts.js            ✅ fetchAlerts, acknowledge
│   └── streaming.js         ✅ feed + WebSocket wrappers
└── utils/
    ├── colors.js            ✅ C palette, congestionColor, severityStyle
    ├── mockData.js          ✅ Sites, alerts, briefings, zones, feeds, timeline
    ├── frameExtractor.js    ✅ Browser-side video→frames
    └── alertLevel.js        ✅ Text→severity classifier
```

---

## Dependencies Between Features

```
Video Persistence ──→ Media Gallery Tab
        │                    │
        └── uploadedBy ──→ worker name on cards
                             │
Zone Expansion ──────────→ stands alone (no backend dependency)
Tab Context Strips ──────→ stands alone (ReviewMode only)
```

Zone expansion and context strips can ship independently. Media gallery depends on video persistence being in place for live mode (mock mode works without it).
