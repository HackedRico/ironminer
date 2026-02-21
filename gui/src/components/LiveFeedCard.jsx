export default function LiveFeedCard({ feed, selected, onClick }) {
  const isHelmet = feed.type === 'helmet'
  return (
    <button onClick={onClick} style={{
      width: '100%', aspectRatio: '16/10', borderRadius: 10, overflow: 'hidden',
      border: `2px solid ${selected ? '#F97316' : 'rgba(255,255,255,0.08)'}`,
      background: '#0C0F14', position: 'relative', cursor: 'pointer', transition: 'border-color 0.2s',
    }}>
      <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.015) 2px, rgba(255,255,255,0.015) 4px)', opacity: 0.8 }} />
      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 24, marginBottom: 4 }}>{isHelmet ? '\u26D1\uFE0F' : '\uD83D\uDCF9'}</div>
          <div style={{ fontSize: 11, color: '#64748B', fontFamily: 'var(--mono)' }}>FEED</div>
        </div>
      </div>
      <div style={{ position: 'absolute', top: 8, left: 8, display: 'flex', alignItems: 'center', gap: 4, background: 'rgba(0,0,0,0.7)', padding: '3px 8px', borderRadius: 4 }}>
        <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', animation: 'pulse 2s infinite' }} />
        <span style={{ fontSize: 9, fontWeight: 700, color: '#FCA5A5', fontFamily: 'var(--mono)', letterSpacing: '0.08em' }}>LIVE</span>
      </div>
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 10px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))' }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: '#E2E8F0' }}>{feed.label}</div>
        <div style={{ fontSize: 10, color: '#64748B' }}>{feed.site_name}</div>
      </div>
    </button>
  )
}
