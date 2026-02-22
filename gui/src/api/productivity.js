import { api } from './client'

// ── Existing site-based endpoints ───────────────────────────────────────────
export const runProductivityAnalysis = (siteId, videoJobId) =>
  api('/api/productivity/analyze', { method: 'POST', body: JSON.stringify({ site_id: siteId, video_job_id: videoJobId }) })

export const fetchProductivityReport = (siteId) => api(`/api/productivity/report/${siteId}`)
export const fetchZones = (siteId) => api(`/api/productivity/report/${siteId}/zones`)
export const fetchOverlaps = (siteId) => api(`/api/productivity/report/${siteId}/overlaps`)
export const fetchSuggestions = (siteId) => api(`/api/productivity/report/${siteId}/suggestions`)
export const fetchTrend = (siteId, hours = 24) => api(`/api/productivity/trend/${siteId}?hours=${hours}`)

// ── Teams ───────────────────────────────────────────────────────────────────
export const fetchTeams = (siteId) => api(`/api/productivity/teams${siteId ? `?site_id=${siteId}` : ''}`)
export const fetchTeam = (teamId) => api(`/api/productivity/teams/${teamId}`)

// ── Benchmarks ──────────────────────────────────────────────────────────────
export const fetchBenchmark = (teamId, date) =>
  api(`/api/productivity/teams/${teamId}/benchmark?date=${date}`)

export const fetchBenchmarkVersions = (teamId, date) =>
  api(`/api/productivity/teams/${teamId}/benchmark/versions?date=${date}`)

export const saveBenchmark = (teamId, body) =>
  api(`/api/productivity/teams/${teamId}/benchmark`, {
    method: 'POST',
    body: JSON.stringify(body),
  })

// ── Evaluation (longer timeout — embedding model may take time) ─────────────
export const runEvaluation = (teamId, body) =>
  api(`/api/productivity/teams/${teamId}/evaluate`, {
    method: 'POST',
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60000),
  })
