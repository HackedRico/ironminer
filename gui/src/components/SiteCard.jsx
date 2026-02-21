import { congestionColor } from '../utils/colors'

export default function SiteCard({ site, selected, onClick }) {
  const cong = congestionColor(site.congestion === 'high' ? 4 : site.congestion === 'medium' ? 3 : 1)
  return (
    <button onClick={onClick} style={{
      width: '100%', textAlign: 'left', border: `1.5px solid ${selected ? '#F97316' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 12, padding: 20, background: selected ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.02)',
      cursor: 'pointer', transition: 'all 0.25s', marginBottom: 10, position: 'relative', overflow: 'hidden',
    }}>
      {selected && <div style={{ position: 'absolute', top: 0, left: 0, width: 4, height: '100%', background: '#F97316', borderRadius: '4px 0 0 4px' }} />}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: site.status === 'active' ? '#22C55E' : '#F59E0B', boxShadow: site.status === 'active' ? '0 0 8px rgba(34,197,94,0.4)' : 'none' }} />
            <span style={{ fontSize: 17, fontWeight: 700, color: '#F1F5F9', letterSpacing: '-0.01em' }}>{site.name}</span>
          </div>
          <div style={{ fontSize: 12, color: '#64748B', paddingLeft: 16 }}>{site.address}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#F97316', fontFamily: 'var(--mono)', lineHeight: 1 }}>{site.progress}%</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 20, fontSize: 12, color: '#94A3B8' }}>
        <span><strong style={{ color: '#CBD5E1' }}>{site.trades}</strong> trades</span>
        <span><strong style={{ color: '#CBD5E1' }}>{site.workers}</strong> workers</span>
        <span><strong style={{ color: '#CBD5E1' }}>{site.frames}</strong> frames</span>
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 11, color: '#94A3B8' }}>
          <span>Congestion:</span>
          <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{
              height: 4, borderRadius: 2, transition: 'width 0.6s ease',
              width: `${site.congestion === 'high' ? 80 : site.congestion === 'medium' ? 50 : 20}%`,
              background: cong.border,
            }} />
          </div>
          <span style={{ color: cong.text, fontWeight: 600, fontFamily: 'var(--mono)' }}>{cong.label}</span>
        </div>
      </div>
    </button>
  )
}
