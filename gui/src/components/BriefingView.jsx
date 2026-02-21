export default function BriefingView({ text }) {
  if (!text) return null
  return (
    <div style={{
      background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
      borderRadius: 12, padding: 24, fontSize: 15, color: '#CBD5E1', lineHeight: 1.75,
      whiteSpace: 'pre-wrap', fontFamily: 'var(--body)',
    }}>
      {text.split('\n').map((line, i) => {
        if (line.startsWith('Recommendation:')) return <p key={i} style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, color: '#FB923C', fontWeight: 600, fontSize: 14 }}>{line}</p>
        if (line === '') return <br key={i} />
        return <p key={i} style={{ marginBottom: 4 }}>{line}</p>
      })}
    </div>
  )
}
