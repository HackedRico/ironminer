import { useRef, useEffect } from 'react'
import { C } from '../../utils/colors'

/**
 * WorkerVideoTile — renders one worker's camera feed.
 *
 * Imperatively attaches a LiveKit VideoTrack to a <video> element via useRef.
 * Audio is routed through a separate hidden <audio> element.
 */
export default function WorkerVideoTile({
  identity,
  participant,
  videoTrack,
  audioTrack,
  isSelected,
  onClick,
}) {
  const videoRef = useRef(null)
  const audioRef = useRef(null)

  // Attach/detach video track imperatively — never use track.attach() without
  // passing the element, as that creates orphaned elements outside React's tree.
  useEffect(() => {
    const el = videoRef.current
    if (!el || !videoTrack) return
    videoTrack.attach(el)
    return () => { videoTrack.detach(el) }
  }, [videoTrack])

  // Separate audio element — <video> is muted for autoplay policy compliance,
  // audio is routed here instead so it plays through the system speaker.
  useEffect(() => {
    const el = audioRef.current
    if (!el || !audioTrack) return
    audioTrack.attach(el)
    return () => { audioTrack.detach(el) }
  }, [audioTrack])

  const displayName = participant?.name || identity
  const isMuted = participant?.isMicrophoneEnabled === false

  return (
    <div
      onClick={onClick}
      style={{
        position: 'relative',
        borderRadius: 10,
        overflow: 'hidden',
        border: `2px solid ${isSelected ? C.orange : C.border}`,
        background: C.surface,
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        aspectRatio: '16/9',
      }}
    >
      {/* Video — muted so autoplay policy allows it; audio is separate */}
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: videoTrack ? 'block' : 'none',
        }}
      />

      {/* Hidden audio element — plays manager-subscribed worker audio */}
      <audio ref={audioRef} autoPlay style={{ display: 'none' }} />

      {/* Placeholder when no video track yet */}
      {!videoTrack && (
        <div style={{
          position: 'absolute', inset: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 6,
        }}>
          <div style={{ fontSize: 28 }}>⛑️</div>
          <div style={{ fontSize: 11, color: C.muted, fontFamily: 'var(--mono)' }}>
            CONNECTING...
          </div>
        </div>
      )}

      {/* LIVE / WAIT badge */}
      <div style={{
        position: 'absolute', top: 8, left: 8,
        display: 'flex', alignItems: 'center', gap: 4,
        background: 'rgba(0,0,0,0.7)', padding: '3px 8px', borderRadius: 4,
      }}>
        <div style={{
          width: 6, height: 6, borderRadius: '50%',
          background: videoTrack ? C.red : C.muted,
          animation: videoTrack ? 'pulse 1.5s infinite' : 'none',
        }} />
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
          color: videoTrack ? '#FCA5A5' : C.muted,
          letterSpacing: '0.08em',
        }}>
          {videoTrack ? 'LIVE' : 'WAIT'}
        </span>
      </div>

      {/* Mic muted indicator */}
      {isMuted && (
        <div style={{
          position: 'absolute', top: 8, right: 8,
          background: 'rgba(0,0,0,0.7)', padding: '3px 6px', borderRadius: 4,
          fontSize: 11,
        }}>
          🔇
        </div>
      )}

      {/* Name overlay at bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '8px 10px',
        background: 'linear-gradient(transparent, rgba(0,0,0,0.85))',
      }}>
        <div style={{ fontSize: 12, fontWeight: 600, color: C.text }}>{displayName}</div>
        <div style={{ fontSize: 10, color: C.muted }}>Helmet Cam</div>
      </div>
    </div>
  )
}
