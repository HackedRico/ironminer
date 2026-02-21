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
