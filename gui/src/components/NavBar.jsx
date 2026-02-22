export default function NavBar({ mode, setMode, urgentCount, totalFrames }) {
  return (
    <header style={{
      borderBottom: '1px solid rgba(255,255,255,0.06)',
      background: 'rgba(11,14,19,0.85)',
      backdropFilter: 'blur(20px)',
      position: 'sticky', top: 0, zIndex: 50,
      padding: '0 32px',
    }}>
      <div style={{ maxWidth: 1400, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 64 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 8,
            background: 'linear-gradient(135deg, #F97316, #EA580C)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontWeight: 800, fontSize: 14, color: '#fff',
            boxShadow: '0 4px 16px rgba(249,115,22,0.25)',
          }}>IS</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>IronSite Manager</div>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#64748B', letterSpacing: '0.12em', textTransform: 'uppercase' }}>Spatial Intelligence</div>
          </div>
        </div>

        <div style={{
          display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 10, padding: 3,
          border: '1px solid rgba(255,255,255,0.06)',
        }}>
          {[
            { id: 'review', label: 'Review', desc: 'Video summaries & planning' },
            { id: 'live', label: 'Live', desc: 'Streams & comms' },
          ].map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              padding: '10px 24px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: mode === m.id ? 'rgba(249,115,22,0.15)' : 'transparent',
              transition: 'all 0.2s',
            }}>
              <div style={{ fontSize: 14, fontWeight: mode === m.id ? 700 : 500, color: mode === m.id ? '#FB923C' : '#94A3B8' }}>{m.label}</div>
              <div style={{ fontSize: 10, color: '#64748B', marginTop: 1 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          {urgentCount > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.2)',
              padding: '6px 12px', borderRadius: 8,
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', animation: 'pulse 2s infinite' }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: '#FCA5A5', fontFamily: 'var(--mono)' }}>{urgentCount} urgent</span>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}
