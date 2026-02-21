import { api } from './client'

export const fetchAlerts = (filters = {}) => {
  const params = new URLSearchParams()
  if (filters.site_id) params.set('site_id', filters.site_id)
  if (filters.severity) params.set('severity', filters.severity)
  if (filters.acknowledged !== undefined) params.set('acknowledged', filters.acknowledged)
  if (filters.limit) params.set('limit', filters.limit)
  return api(`/api/alerts?${params}`)
}

export const fetchAlert = (id) => api(`/api/alerts/${id}`)
export const acknowledgeAlert = (id) => api(`/api/alerts/${id}/acknowledge`, { method: 'PATCH' })
