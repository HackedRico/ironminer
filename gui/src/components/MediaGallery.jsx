import { useState, useEffect } from 'react'
import { fetchJobs } from '../api/video'
import { C } from '../utils/colors'
import { MOCK_TIMELINE } from '../utils/mockData'

const fmt = (iso) => {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' \u00b7 ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function MediaCard({ item, isLive }) {
  const videoUrl = isLive && item.file_path
    ? `/${item.file_path}`
    : null

  return (
    <div style={{
      background: C.surface, border: `1px solid ${C.border}`, borderRadius: 12,
      overflow: 'hidden', display: 'flex', flexDirection: 'column',
    }}>
      {/* Video / placeholder area */}
      <div style={{
        aspectRatio: '16/9', background: C.surface2,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        position: 'relative', overflow: 'hidden',
      }}>
        {videoUrl ? (
          <video
            controls
            preload="metadata"
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            src={videoUrl}
          />
        ) : (
          <div style={{ textAlign: 'center', color: C.muted }}>
            <div style={{ fontSize: 28, marginBottom: 6 }}>&#9654;</div>
            <div style={{ fontSize: 11, fontFamily: 'var(--mono)' }}>
              {item.filename || item.video || 'video'}
            </div>
          </div>
        )}
      </div>

      {/* Info area */}
      <div style={{ padding: '12px 14px' }}>
        <div style={{
          fontSize: 13, color: C.text, fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {item.filename || item.video || item.job_id || 'Untitled'}
        </div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', marginTop: 4,
          fontSize: 11, fontFamily: 'var(--mono)', color: C.muted,
        }}>
          <span>{item.uploaded_by || item.who || 'Unknown'}</span>
          <span>{fmt(item.created_at || item.timestamp)}</span>
        </div>

        {(item.ai_summary) && (
          <div style={{
            marginTop: 8, paddingTop: 8,
            borderTop: `1px solid ${C.border}`,
            fontSize: 12, color: C.subtle, lineHeight: 1.5,
          }}>
            {item.ai_summary}
          </div>
        )}
      </div>
    </div>
  )
}

export default function MediaGallery({ siteId, usingMock }) {
  const [items, setItems] = useState([])

  useEffect(() => {
    if (!siteId) return

    if (usingMock) {
      const entries = (MOCK_TIMELINE[siteId] || []).filter(e => e.source === 'upload')
      setItems(entries)
    } else {
      fetchJobs(siteId)
        .then(jobs => setItems(jobs.filter(j => j.filename)))
        .catch(() => setItems([]))
    }
  }, [siteId, usingMock])

  if (items.length === 0) {
    return (
      <div style={{
        background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
        borderRadius: 12, padding: '28px 24px', textAlign: 'center',
        color: C.muted, fontSize: 14,
      }}>
        No media uploaded yet — upload footage from the Briefing tab to see it here.
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
      gap: 16,
    }}>
      {items.map((item, i) => (
        <MediaCard key={item.job_id || item.id || i} item={item} isLive={!usingMock} />
      ))}
    </div>
  )
}
