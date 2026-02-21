import { congestionColor } from '../utils/colors'

export default function CongestionBar({ level, max = 5 }) {
  const c = congestionColor(level)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 3 }}>
        {Array.from({ length: max }).map((_, i) => (
          <div key={i} style={{
            width: 6, height: 20, borderRadius: 2,
            background: i < level ? c.border : 'rgba(255,255,255,0.06)',
            transition: 'background 0.3s',
          }} />
        ))}
      </div>
      <span style={{ fontSize: 11, fontWeight: 600, color: c.text, fontFamily: 'var(--mono)' }}>{c.label}</span>
    </div>
  )
}
