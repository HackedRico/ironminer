const API_BASE = import.meta.env.VITE_API_URL || ''

export async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options.headers },
    ...options,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.detail || `API error ${res.status}`)
  }
  return res.json()
}

export function wsUrl(path) {
  const base = API_BASE || window.location.origin
  return base.replace(/^http/, 'ws') + path
}
