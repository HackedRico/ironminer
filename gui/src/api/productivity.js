import { api } from './client'

export const runProductivityAnalysis = (siteId, videoJobId) =>
  api('/api/productivity/analyze', { method: 'POST', body: JSON.stringify({ site_id: siteId, video_job_id: videoJobId }) })

export const fetchProductivityReport = (siteId) => api(`/api/productivity/report/${siteId}`)
export const fetchZones = (siteId) => api(`/api/productivity/report/${siteId}/zones`)
export const fetchOverlaps = (siteId) => api(`/api/productivity/report/${siteId}/overlaps`)
export const fetchSuggestions = (siteId) => api(`/api/productivity/report/${siteId}/suggestions`)
export const fetchTrend = (siteId, hours = 24) => api(`/api/productivity/trend/${siteId}?hours=${hours}`)
