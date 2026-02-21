import { useState, useCallback } from 'react'
import { C } from '../../utils/colors'
import useLiveStream from '../../hooks/useLiveStream'
import useAudioControls from '../../hooks/useAudioControls'
import WorkerVideoGrid from './WorkerVideoGrid'
import AudioControls from './AudioControls'
import ConnectionStatus from './ConnectionStatus'
import WorkerSelector from './WorkerSelector'

/**
 * LiveStreamView — real-time video + push-to-talk container.
 * Slots into the left column of LiveMode.jsx when LiveKit is available.
 *
 * @param {{ site: {id, name}|null, selectedFeed: FeedConfig|null }} props
 */
export default function LiveStreamView({ site, selectedFeed }) {
  const [selectedWorkerIdentity, setSelectedWorkerIdentity] = useState(null)

  const roomName = site ? `site-${site.id}` : null
  const { connect, disconnect, workerStreams, isConnected, connectionState, room, error } =
    useLiveStream(roomName, 'manager-1')

  const { isMicEnabled, isPTTActive, startTalking, stopTalking, toggleMic } =
    useAudioControls(room)

  const handleSelectWorker = useCallback((identity) => {
    setSelectedWorkerIdentity(identity)
  }, [])

  const selectedStream = selectedWorkerIdentity ? workerStreams.get(selectedWorkerIdentity) : null
  const pttTarget = selectedStream?.participant?.name || 'Site Broadcast'

  return (
    <div>
      {/* ── Video area ────────────────────────────────────────────────────── */}
      <div style={{
        borderRadius: 14, overflow: 'hidden',
        border: `2px solid ${isConnected ? 'rgba(34,197,94,0.3)' : 'rgba(249,115,22,0.3)'}`,
        background: C.surface, position: 'relative', marginBottom: 16,
        transition: 'border-color 0.3s',
      }}>
        {/* Scanline overlay */}
        <div style={{
          position: 'absolute', inset: 0, zIndex: 1, pointerEvents: 'none',
          background: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.01) 1px, rgba(255,255,255,0.01) 2px)',
        }} />

        {/* Top bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 2,
          padding: '12px 16px',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          background: 'linear-gradient(rgba(0,0,0,0.7), transparent)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{
              width: 8, height: 8, borderRadius: '50%',
              background: '#EF4444', animation: 'pulse 1.5s infinite',
            }} />
            <span style={{
              fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)',
              color: '#FCA5A5', letterSpacing: '0.1em',
            }}>LIVE</span>
            <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: '#94A3B8' }}>
              {site?.name || 'No site selected'}
            </span>
          </div>
          <ConnectionStatus connectionState={connectionState} participantCount={workerStreams.size} />
        </div>

        {/* Video grid — padded to clear the top bar */}
        <div style={{ padding: '52px 12px 12px', position: 'relative', zIndex: 0 }}>
          <WorkerVideoGrid
            workerStreams={workerStreams}
            selectedIdentity={selectedWorkerIdentity}
            onSelectWorker={handleSelectWorker}
          />
        </div>
      </div>

      {/* ── Worker simulator link ────────────────────────────────────────── */}
      <div style={{ marginBottom: 12 }}>
        <a
          href="/worker"
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: 12,
            color: '#94A3B8',
            textDecoration: 'none',
          }}
        >
          Simulate worker (open in new tab) →
        </a>
      </div>

      {/* ── Connect / Disconnect ──────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        {!isConnected ? (
          <button
            onClick={connect}
            disabled={!roomName}
            style={{
              flex: 1, padding: '10px 20px', borderRadius: 8, border: 'none',
              background: roomName
                ? 'linear-gradient(135deg, #F97316, #EA580C)'
                : 'rgba(255,255,255,0.05)',
              cursor: roomName ? 'pointer' : 'not-allowed',
              fontSize: 13, fontWeight: 600, color: '#fff',
              boxShadow: roomName ? '0 4px 16px rgba(249,115,22,0.3)' : 'none',
            }}
          >
            Connect to Site Room
          </button>
        ) : (
          <button
            onClick={disconnect}
            style={{
              flex: 1, padding: '10px 20px', borderRadius: 8,
              border: '1px solid rgba(239,68,68,0.2)',
              background: 'rgba(239,68,68,0.08)', cursor: 'pointer',
              fontSize: 13, fontWeight: 600, color: '#FCA5A5',
            }}
          >
            Disconnect
          </button>
        )}
      </div>

      {/* Error message */}
      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
          fontSize: 12, color: '#FCA5A5',
        }}>
          {error}
        </div>
      )}

      {/* ── Comms bar ─────────────────────────────────────────────────────── */}
      <AudioControls
        isPTTActive={isPTTActive}
        isMicEnabled={isMicEnabled}
        onPTTStart={startTalking}
        onPTTStop={stopTalking}
        onToggleMic={toggleMic}
        targetLabel={pttTarget}
        disabled={!isConnected}
      />

      {/* Unlock worker audio (browsers block autoplay until user gesture) */}
      {isConnected && workerStreams.size > 0 && (
        <button
          type="button"
          onClick={() => {
            document.querySelectorAll('audio.worker-audio').forEach((el) => {
              el.play().catch(() => {})
            })
          }}
          style={{
            marginTop: 8,
            padding: '6px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.15)',
            background: 'rgba(255,255,255,0.06)',
            color: '#94A3B8',
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          🔊 Hear workers
        </button>
      )}

      {/* ── Worker list (shown once connected) ───────────────────────────── */}
      {isConnected && (
        <div style={{ marginTop: 16 }}>
          <WorkerSelector
            siteId={site?.id || null}
            selectedIdentity={selectedWorkerIdentity}
            workerStreams={workerStreams}
            onSelectWorker={handleSelectWorker}
          />
        </div>
      )}
    </div>
  )
}
