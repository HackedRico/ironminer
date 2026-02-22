import { api, wsUrl } from './client'

export const fetchFeeds = (siteId) => {
  const params = siteId ? `?site_id=${siteId}` : ''
  return api(`/api/streaming/feeds${params}`)
}

export const registerFeed = (data) =>
  api('/api/streaming/feeds', { method: 'POST', body: JSON.stringify(data) })

export const scanFeed = (feedId) =>
  api(`/api/streaming/feeds/${feedId}/scan`, { method: 'POST' })

export const toggleAutoScan = (feedId, enabled, intervalSeconds = 30) =>
  api(`/api/streaming/feeds/${feedId}/auto-scan`, {
    method: 'POST',
    body: JSON.stringify({ enabled, interval_seconds: intervalSeconds }),
  })

export const connectLiveFeed = (feedId) => new WebSocket(wsUrl(`/api/streaming/ws/live/${feedId}`))
export const connectAlerts = () => new WebSocket(wsUrl('/api/streaming/ws/alerts'))
export const connectComms = (feedId) => new WebSocket(wsUrl(`/api/streaming/ws/comms/${feedId}`))
export const connectPipeline = (siteId) => new WebSocket(wsUrl(`/api/streaming/ws/pipeline/${siteId}`))

// ── LiveKit API calls ─────────────────────────────────────────────────────────

export const fetchManagerToken = (roomName, identity, displayName = '') =>
  api('/api/streaming/livekit/token/manager', {
    method: 'POST',
    body: JSON.stringify({ room_name: roomName, identity, display_name: displayName }),
  })

export const fetchWorkerToken = (roomName, identity, displayName = '') =>
  api('/api/streaming/livekit/token/worker', {
    method: 'POST',
    body: JSON.stringify({ room_name: roomName, identity, display_name: displayName }),
  })

export const fetchWorkers = (siteId) => {
  const params = siteId ? `?site_id=${siteId}` : ''
  return api(`/api/workers${params}`)
}
export const fetchSiteNotes = (siteId) =>
  api(`/api/streaming/notes?site_id=${siteId}`)

export const fetchWorkerNotes = (workerId, siteId) =>
  api(`/api/streaming/notes?site_id=${siteId}&worker_identity=${workerId}`)

export const fetchFeedNotes = (feedId) =>
  api(`/api/streaming/feeds/${feedId}/notes`)

export const createFeedNote = (feedId, payload) =>
  api(`/api/streaming/feeds/${feedId}/notes`, {
    method: 'POST',
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(90_000),  // Parakeet needs ffmpeg + gRPC time
  })

// ── World Labs 3D generation ──────────────────────────────────────────────────

// Uses raw fetch — no Content-Type header so browser sets multipart boundary
export const submitSiteWorld = (formData) =>
  fetch('/api/streaming/worlds', { method: 'POST', body: formData })
    .then(r => { if (!r.ok) throw new Error(r.statusText); return r.json() })

export const fetchSiteWorlds = (siteId) =>
  api(`/api/streaming/worlds?site_id=${siteId}`)

export const fetchWorldStatus = (worldId) =>
  api(`/api/streaming/worlds/${worldId}`)

export const submitWorldFromFrames = (siteId, framesBase64, workerIdentity, displayName) =>
  api('/api/streaming/worlds/from-frames', {
    method: 'POST',
    body: JSON.stringify({
      site_id: siteId,
      frames_base64: framesBase64,
      worker_identity: workerIdentity || null,
      display_name: displayName || 'Site 3D Scan',
    }),
    signal: AbortSignal.timeout(30_000),
  })

