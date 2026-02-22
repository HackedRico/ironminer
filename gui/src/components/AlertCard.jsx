import { severityStyle, C } from '../utils/colors'

const SOURCE_COLOR = {
  manual: { dot: C.blue,   bg: 'rgba(59,130,246,0.08)',  border: 'rgba(59,130,246,0.2)',  text: C.blueLight  },
  upload: { dot: C.orange, bg: 'rgba(249,115,22,0.08)',  border: 'rgba(249,115,22,0.2)',  text: C.orangeLight },
  agent:  { dot: C.green,  bg: 'rgba(34,197,94,0.08)',   border: 'rgba(34,197,94,0.2)',   text: C.greenLight  },
}

const fmt = (iso) => {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

// ── Alert mode (existing) ─────────────────────────────────────────────────────
function AlertMode({ alert, expanded, onToggle }) {
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

// ── Timeline mode (new) ───────────────────────────────────────────────────────
function TimelineMode({ entry, expanded, onToggle }) {
  const s = SOURCE_COLOR[entry.source] || SOURCE_COLOR.manual
  const hasDetail = entry.ai_summary || entry.video

  return (
    <div style={{
      borderRadius: 10, border: `1px solid ${s.border}`, background: s.bg,
      marginBottom: 8, overflow: 'hidden', transition: 'all 0.2s',
    }}>
      <button
        onClick={hasDetail ? onToggle : undefined}
        style={{
          width: '100%', textAlign: 'left', padding: '13px 16px',
          cursor: hasDetail ? 'pointer' : 'default',
          display: 'flex', alignItems: 'flex-start', gap: 12,
          background: 'none', border: 'none', color: 'inherit',
        }}
      >
        {/* Source dot */}
        <div style={{
          width: 10, height: 10, borderRadius: '50%', background: s.dot,
          flexShrink: 0, marginTop: 3, boxShadow: `0 0 8px ${s.dot}40`,
        }} />

        {/* Main content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Who + timestamp */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 3 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: C.text }}>{entry.who || 'Agent'}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: C.muted }}>{fmt(entry.timestamp)}</span>
            <span style={{
              fontSize: 10, fontFamily: 'var(--mono)', color: s.dot,
              background: `${s.dot}18`, padding: '1px 6px', borderRadius: 4,
            }}>
              {entry.source}
            </span>
          </div>
          {/* Action text */}
          <div style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.5 }}>{entry.action}</div>
        </div>

        {/* Chevron — only if there's detail to expand */}
        {hasDetail && (
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ flexShrink: 0, marginTop: 2, transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
            <path d="M4 6L8 10L12 6" stroke="#64748B" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        )}
      </button>

      {/* Expanded detail: video badge + summary */}
      {expanded && hasDetail && (
        <div style={{ padding: '0 16px 14px 38px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {entry.video && (
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'flex-start',
              fontSize: 11, fontFamily: 'var(--mono)', color: C.orangeLight,
              background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)',
              borderRadius: 5, padding: '3px 9px',
            }}>
              ▶ {entry.video}
            </div>
          )}
          {entry.ai_summary && (
            <div style={{
              padding: '10px 12px', borderRadius: 8,
              background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.18)',
              fontSize: 12, color: C.greenLight, lineHeight: 1.6,
            }}>
              {entry.ai_summary}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Unified export ────────────────────────────────────────────────────────────
export default function AlertCard({ mode = 'alert', alert, entry, expanded, onToggle }) {
  if (mode === 'timeline') {
    return <TimelineMode entry={entry} expanded={expanded} onToggle={onToggle} />
  }
  return <AlertMode alert={alert} expanded={expanded} onToggle={onToggle} />
}
