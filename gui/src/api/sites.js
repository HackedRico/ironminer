import { api } from './client'

export const fetchSites = () => api('/api/sites')
export const fetchSite = (id) => api(`/api/sites/${id}`)
export const createSite = (data) => api('/api/sites', { method: 'POST', body: JSON.stringify(data) })
export const fetchFrames = (id, limit = 50) => api(`/api/sites/${id}/frames?limit=${limit}`)
export const fetchBriefing = (id) => api(`/api/sites/${id}/briefing`)
export const fetchTimeline = (id) => api(`/api/sites/${id}/timeline`)
