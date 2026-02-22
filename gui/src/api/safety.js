import { api } from './client'

export const runSafetyAnalysis = (siteId, videoJobId) =>
  api('/api/safety/analyze', {
    method: 'POST',
    body: JSON.stringify({ site_id: siteId, video_job_id: videoJobId }),
    signal: AbortSignal.timeout(90000),
  })

export const fetchSafetyReport = (siteId) => api(`/api/safety/report/${siteId}`)
export const fetchViolations = (siteId, severity) => {
  const params = severity ? `?severity=${severity}` : ''
  return api(`/api/safety/report/${siteId}/violations${params}`)
}
