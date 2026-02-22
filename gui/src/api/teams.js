import { api } from './client'

export const fetchSiteWorkers = (siteId) =>
  api(`/api/teams/workers?site_id=${siteId}`)

export const fetchTeams = (siteId, date) =>
  api(`/api/teams?site_id=${siteId}&date=${date}`)

/** Create a team. Pass date (ISO string) so it's stored under the same day you're viewing. */
export const createTeam = (data, date) =>
  api(`/api/teams?date=${date || new Date().toISOString().split('T')[0]}`, { method: 'POST', body: JSON.stringify(data) })

export const updateTeam = (teamId, patch) =>
  api(`/api/teams/${teamId}`, { method: 'PUT', body: JSON.stringify(patch) })

export const deleteTeam = (teamId) =>
  api(`/api/teams/${teamId}`, { method: 'DELETE' }).catch(() => {})
  // 204 No Content — api() will try to parse JSON and fail; swallow that error

export const fetchWorkerHistory = (workerId, siteId, days = 7) =>
  api(`/api/teams/workers/${workerId}/history?site_id=${siteId}&days=${days}`)

// Auto-assign can call the LLM — use a long timeout (default api is 3s)
export const autoAssignWorkers = (siteId, date, teamId = null) => {
  const params = new URLSearchParams({ site_id: siteId, date })
  if (teamId) params.set('team_id', teamId)
  return api(`/api/teams/auto-assign?${params}`, {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
  })
}
