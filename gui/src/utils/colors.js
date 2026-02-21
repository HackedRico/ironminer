export const C = {
  bg: '#0B0E13',
  surface: '#0F1219',
  surface2: '#1A1F2E',
  border: '#2A3040',
  text: '#F1F5F9',
  muted: '#64748B',
  subtle: '#94A3B8',
  orange: '#F97316',
  orangeLight: '#FB923C',
  green: '#22C55E',
  greenLight: '#86EFAC',
  yellow: '#F59E0B',
  yellowLight: '#FCD34D',
  red: '#EF4444',
  redLight: '#FCA5A5',
  blue: '#3B82F6',
  blueLight: '#93C5FD',
}

export const congestionColor = (level) => {
  if (level >= 4) return { bg: 'rgba(239,68,68,0.15)', border: '#EF4444', text: '#FCA5A5', label: 'Critical' }
  if (level >= 3) return { bg: 'rgba(245,158,11,0.15)', border: '#F59E0B', text: '#FCD34D', label: 'Busy' }
  return { bg: 'rgba(34,197,94,0.12)', border: '#22C55E', text: '#86EFAC', label: 'Clear' }
}

export const severityStyle = {
  high:   { dot: '#EF4444', bg: 'rgba(239,68,68,0.12)', text: '#FCA5A5', border: 'rgba(239,68,68,0.25)' },
  medium: { dot: '#F59E0B', bg: 'rgba(245,158,11,0.1)',  text: '#FCD34D', border: 'rgba(245,158,11,0.2)' },
  low:    { dot: '#3B82F6', bg: 'rgba(59,130,246,0.1)',  text: '#93C5FD', border: 'rgba(59,130,246,0.2)' },
}
