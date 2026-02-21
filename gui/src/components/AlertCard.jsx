import { severityStyle } from '../utils/colors'

export default function AlertCard({ alert, expanded, onToggle }) {
  const s = severityStyle[alert.severity]
  return (
    <div style={{
      borderRadius: 10, border: `1px solid ${s.border}`, background: s.bg,
      marginBottom: 8, overflow: 'hidden', transition: 'all 0.2s',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', textAlign: 'left', padding: '14px 16px', cursor: 'pointer',
        display: 'flex', alignItems: 'center', gap: 12, background: 'none', border: 'none', color: 'inherit',
      }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: s.dot, flexShrink: 0, boxShadow: `0 0 8px ${s.dot}40` }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0', lineHeight: 1.3 }}>{alert.title}</div>
          <div style={{ fontSize: 11, color: '#64748B', marginTop: 3, fontFamily: 'var(--mono)' }}>{alert.site_name} · {alert.source_agent}</div>
        </div>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M4 6L8 10L12 6" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
      {expanded && (
        <div style={{ padding: '0 16px 16px 38px', fontSize: 13, color: '#94A3B8', lineHeight: 1.6 }}>
          {alert.detail}
        </div>
      )}
    </div>
  )
}
