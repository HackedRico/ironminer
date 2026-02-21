import { congestionColor, C } from '../utils/colors'
import CongestionBar from './CongestionBar'

// ── Mock worker names by trade (used when zone.workerList isn't provided) ────
const TRADE_WORKERS = {
  Concrete:        ['M. Rivera', 'D. Nguyen', 'J. Brooks', 'P. Gutierrez', 'S. Patel'],
  Electrical:      ['K. Johnson', 'R. Thompson', 'A. Garcia', 'L. Kim', 'T. Davis'],
  Plumbing:        ['B. Wilson', 'C. Martinez', 'F. Lopez', 'H. Brown', 'N. Clark'],
  Framing:         ['E. Anderson', 'G. Taylor', 'I. Thomas', 'Q. Robinson', 'W. Lee'],
  'Crane Ops':     ['V. Harris', 'Z. Walker', 'O. Hall'],
  Delivery:        ['U. Allen', 'X. Young'],
  HVAC:            ['Y. Wright', 'J. King', 'D. Scott', 'R. Adams'],
  'Steel Erection':['L. Turner', 'M. Phillips', 'S. Campbell', 'A. Evans', 'P. Mitchell'],
  Staging:         ['C. Roberts', 'F. Carter'],
  Cladding:        ['H. Perez', 'N. Morgan', 'T. Bailey'],
}

function getWorkerList(zone) {
  if (zone.workerList) return zone.workerList
  const list = []
  for (const trade of zone.trades) {
    const pool = TRADE_WORKERS[trade] || ['Worker']
    const count = Math.max(1, Math.round(zone.workers / zone.trades.length))
    for (let i = 0; i < count && list.length < zone.workers; i++) {
      list.push({ name: pool[i % pool.length], trade })
    }
  }
  return list.slice(0, zone.workers)
}

export default function ZoneRow({ zone, expanded, onToggle }) {
  const c = congestionColor(zone.congestion)
  const workers = getWorkerList(zone)

  return (
    <div style={{
      borderLeft: `3px solid ${c.border}`, background: c.bg,
      borderRadius: '0 8px 8px 0', marginBottom: 6,
      transition: 'all 0.2s', overflow: 'hidden',
    }}>
      {/* Clickable header */}
      <button
        onClick={onToggle}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 16,
          padding: '12px 16px', background: 'none', border: 'none',
          cursor: 'pointer', color: 'inherit', textAlign: 'left',
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', marginBottom: 2 }}>{zone.zone}</div>
          <div style={{ fontSize: 12, color: '#94A3B8' }}>
            {zone.trades.join(' · ')} — {zone.workers} workers
          </div>
        </div>
        <CongestionBar level={zone.congestion} />
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{
          flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none',
          transition: 'transform 0.2s',
        }}>
          <path d="M4 6L8 10L12 6" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>

      {/* Expanded worker list */}
      {expanded && (
        <div style={{ padding: '0 16px 14px 20px' }}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
            letterSpacing: '0.1em', marginBottom: 8, fontFamily: 'var(--mono)',
          }}>
            Workers on site ({workers.length})
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {workers.map((w, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 10px', borderRadius: 6,
                background: 'rgba(255,255,255,0.04)',
                border: `1px solid rgba(255,255,255,0.06)`,
              }}>
                <div style={{
                  width: 6, height: 6, borderRadius: '50%',
                  background: c.border, flexShrink: 0,
                }} />
                <span style={{ fontSize: 12, color: C.text, fontWeight: 500 }}>{w.name}</span>
                <span style={{ fontSize: 10, color: C.muted, fontFamily: 'var(--mono)' }}>{w.trade}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
