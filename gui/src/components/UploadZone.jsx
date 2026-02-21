import { useState, useRef } from 'react'

export default function UploadZone({ onFiles }) {
  const [dragOver, setDragOver] = useState(false)
  const ref = useRef(null)
  return (
    <div
      onClick={() => ref.current?.click()}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); const f = Array.from(e.dataTransfer.files); if (f.length) onFiles(f) }}
      style={{
        border: `2px dashed ${dragOver ? '#F97316' : 'rgba(255,255,255,0.1)'}`,
        borderRadius: 12, padding: '32px 20px', textAlign: 'center', cursor: 'pointer',
        background: dragOver ? 'rgba(249,115,22,0.05)' : 'transparent', transition: 'all 0.2s',
      }}
    >
      <input ref={ref} type="file" multiple accept="video/*,image/*" style={{ display: 'none' }} onChange={(e) => { const f = Array.from(e.target.files); if (f.length) onFiles(f) }} />
      <div style={{ fontSize: 28, marginBottom: 8 }}>📂</div>
      <div style={{ fontSize: 15, fontWeight: 600, color: '#CBD5E1', marginBottom: 4 }}>Drop site footage here</div>
      <div style={{ fontSize: 12, color: '#64748B' }}>Video files or image frames</div>
    </div>
  )
}
