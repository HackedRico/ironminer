import { useRef, useEffect } from 'react'

/**
 * LiveWorkerFeedCard — small card for the sidebar showing a live worker's video thumbnail.
 * Clicking selects that worker in the main view.
 */
export default function LiveWorkerFeedCard({
  identity,
  participant,
  videoTrack,
  selected,
  onClick,
  noteCount = 0,
  noteSnippet = '',
}) {
  const videoRef = useRef(null)

  useEffect(() => {
    const el = videoRef.current
    if (!el || !videoTrack) return
    videoTrack.attach(el)
    const p = el.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
    return () => { videoTrack.detach(el) }
  }, [videoTrack])

  const displayName = participant?.name || identity

  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: '100%',
        aspectRatio: '16/10',
        borderRadius: 10,
        overflow: 'hidden',
        border: `2px solid ${selected ? '#F97316' : 'rgba(255,255,255,0.08)'}`,
        background: '#0C0F14',
        position: 'relative',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
      }}
    >
      {videoTrack ? (
        <video
          ref={videoRef}
          muted
          autoPlay
          playsInline
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
          }}
        />
      ) : (
        <div style={{
            position: 'absolute', inset: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.5)',
          }}>
          <span style={{ fontSize: 20 }}>⛑️</span>
        </div>
      )}
      <div style={{
        position: 'absolute', top: 6, left: 6,
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: 4,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#22C55E' }} />
        <span style={{ fontSize: 8, fontWeight: 700, color: '#86EFAC', fontFamily: 'var(--mono)' }}>LIVE</span>
      </div>
      {noteCount > 0 && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(0,0,0,0.75)', padding: '2px 6px', borderRadius: 4,
        }}>
          <span style={{ fontSize: 8, fontWeight: 700, color: '#FDBA74', fontFamily: 'var(--mono)' }}>
            {noteCount} NOTE{noteCount === 1 ? '' : 'S'}
          </span>
        </div>
      )}
      {noteSnippet && (
        <div style={{
          position: 'absolute', left: 6, right: 6, bottom: 24,
          background: 'rgba(0,0,0,0.75)', padding: '4px 6px', borderRadius: 6,
          color: '#FDE68A', fontSize: 9, lineHeight: 1.3,
          maxHeight: 28, overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {noteSnippet}
        </div>
      )}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '6px 8px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.9))',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#E2E8F0' }}>{displayName}</div>
      </div>
    </button>
  )
}
