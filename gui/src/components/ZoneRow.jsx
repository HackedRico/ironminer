import { congestionColor } from '../utils/colors'
import CongestionBar from './CongestionBar'

export default function ZoneRow({ zone }) {
  const c = congestionColor(zone.congestion)
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 16, padding: '12px 16px',
      borderLeft: `3px solid ${c.border}`, background: c.bg, borderRadius: '0 8px 8px 0', marginBottom: 6,
      transition: 'all 0.2s',
    }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', marginBottom: 2 }}>{zone.zone}</div>
        <div style={{ fontSize: 12, color: '#94A3B8' }}>
          {zone.trades.join(' · ')} — {zone.workers} workers
        </div>
      </div>
      <CongestionBar level={zone.congestion} />
    </div>
  )
}
