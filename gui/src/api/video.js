import { api } from './client'

export const uploadVideo = async (file, siteId, frameInterval = 5.0) => {
  const form = new FormData()
  form.append('file', file)
  if (siteId) form.append('site_id', siteId)
  form.append('frame_interval', frameInterval.toString())
  const res = await fetch('/api/video/upload', { method: 'POST', body: form })
  if (!res.ok) throw new Error(`Upload failed: ${res.status}`)
  return res.json()
}

export const fetchJobs = (siteId, status) => {
  const params = new URLSearchParams()
  if (siteId) params.set('site_id', siteId)
  if (status) params.set('status', status)
  return api(`/api/video/jobs?${params}`)
}

export const fetchJob = (jobId) => api(`/api/video/jobs/${jobId}`)
export const fetchJobResult = (jobId) => api(`/api/video/jobs/${jobId}/result`)
