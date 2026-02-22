export default function NavBar({ mode, setMode, urgentCount }) {
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
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.02em' }}>IronSite Manager</div>
        </div>

        <nav style={{ display: 'flex', alignItems: 'flex-end', gap: 0 }}>
          {[
            { id: 'review', label: 'Review' },
            { id: 'teams', label: 'Teams' },
            { id: 'crew', label: 'Crew' },
            { id: 'live', label: 'Live' },
          ].map(m => {
            const active = mode === m.id
            return (
              <button
                key={m.id}
                onClick={() => setMode(m.id)}
                style={{
                  padding: '12px 20px 14px',
                  marginBottom: -1,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  position: 'relative',
                  font: 'inherit',
                  fontSize: 14,
                  fontWeight: active ? 600 : 400,
                  color: active ? '#F8FAFC' : '#64748B',
                  transition: 'color 0.2s',
                }}
              >
                {m.label}
                {active && (
                  <span
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '50%',
                      transform: 'translateX(-50%)',
                      width: 'calc(100% - 16px)',
                      maxWidth: 80,
                      height: 2,
                      background: '#D97706',
                      borderRadius: 1,
                    }}
                  />
                )}
              </button>
            )
          })}
        </nav>

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
