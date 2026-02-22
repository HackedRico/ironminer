import { useState, useCallback, useEffect } from 'react'
import { ConnectionState } from 'livekit-client'
import { C } from '../../utils/colors'
import useLiveStream from '../../hooks/useLiveStream'
import useAudioControls from '../../hooks/useAudioControls'
import WorkerVideoGrid from './WorkerVideoGrid'
import ConnectionStatus from './ConnectionStatus'
import WorkerSelector from './WorkerSelector'

const ICON_SIZE = 22
const BTN_SIZE = 44

const iconConnect = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    <circle cx="12" cy="12" r="3" />
  </svg>
)
const iconDisconnect = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
  </svg>
)
const iconMic = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
  </svg>
)
const iconMicOff = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="1" y1="1" x2="23" y2="23" />
    <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V4a3 3 0 0 0-5.94-.6" />
    <path d="M17 16.95A7 7 0 0 1 5 12v-2m14 0v2a7 7 0 0 1-.11 1.23" />
    <line x1="12" y1="19" x2="12" y2="23" />
    <line x1="8" y1="23" x2="16" y2="23" />
  </svg>
)
const iconSnapshot = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
    <circle cx="12" cy="13" r="4" />
  </svg>
)
const iconFlag = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" y1="22" x2="4" y2="15" />
  </svg>
)

function iconBtnStyle(active, danger = false) {
  return {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: 10,
    border: danger ? '1px solid rgba(239,68,68,0.25)' : (active ? '1px solid rgba(249,115,22,0.3)' : '1px solid rgba(255,255,255,0.08)'),
    flexShrink: 0,
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: danger ? C.redLight : (active ? C.orangeLight : C.subtle),
    background: danger ? 'rgba(239,68,68,0.12)' : (active ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.06)'),
    transition: 'all 0.15s',
  }
}

/**
 * LiveStreamView — real-time video + push-to-talk container.
 * Slots into the left column of LiveMode.jsx when LiveKit is available.
 *
 * @param {{ site, selectedFeed, onWorkerStreamsChange, selectedWorkerIdentity, onSelectWorker }} props
 */
export default function LiveStreamView({
  site,
  selectedFeed,
  onWorkerStreamsChange,
  selectedWorkerIdentity: controlledSelectedWorker,
  onSelectWorker,
}) {
  const [internalSelectedWorker, setInternalSelectedWorker] = useState(null)

  const roomName = site ? `site-${site.id}` : null
  const { connect, disconnect, workerStreams, isConnected, connectionState, room, error } =
    useLiveStream(roomName, 'manager-1')

  const { isMicEnabled, toggleMic } = useAudioControls(room)

  const isControlled = typeof onSelectWorker === 'function'
  const selectedWorkerIdentity = isControlled ? controlledSelectedWorker : internalSelectedWorker

  const handleSelectWorker = useCallback((identity) => {
    if (isControlled) onSelectWorker(identity)
    else setInternalSelectedWorker(identity)
  }, [isControlled, onSelectWorker])

  useEffect(() => {
    if (typeof onWorkerStreamsChange === 'function') onWorkerStreamsChange(workerStreams)
  }, [workerStreams, onWorkerStreamsChange])

  // Auto-connect when we have a site so sidebar shows live thumbnails before user clicks Connect
  useEffect(() => {
    if (roomName && connectionState === ConnectionState.Disconnected) connect()
  }, [roomName, connectionState])

  const selectedStream = selectedWorkerIdentity ? workerStreams.get(selectedWorkerIdentity) : null

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

        {/* Main stream — one feed only: the selected worker, or placeholder */}
        <div style={{ padding: '52px 12px 12px', position: 'relative', zIndex: 0 }}>
          {selectedStream ? (
            <WorkerVideoGrid
              workerStreams={new Map([[selectedWorkerIdentity, selectedStream]])}
              selectedIdentity={selectedWorkerIdentity}
              onSelectWorker={handleSelectWorker}
            />
          ) : workerStreams.size === 0 ? (
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexDirection: 'column', gap: 12,
              background: C.surface, borderRadius: 12,
              border: `1px dashed ${C.border}`,
              aspectRatio: '16/9',
            }}>
              <img src="/Icons/no_wifi.svg" alt="" style={{ width: 48, height: 48, opacity: 0.7 }} />
              <div style={{ fontSize: 14, color: C.muted }}>Waiting for workers to join...</div>
              <div style={{ fontSize: 11, color: C.border, fontFamily: 'var(--mono)' }}>
                Workers connect via the headset app
              </div>
            </div>
          ) : (
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 12,
                background: C.surface, borderRadius: 12,
                border: `1px dashed ${C.border}`,
                aspectRatio: '16/9',
                color: C.muted, fontSize: 14,
              }}
            >
              <div style={{ fontSize: 36 }}>👤</div>
              Select a worker from the list to view their stream
            </div>
          )}
        </div>
      </div>

      {/* ── Icon control bar: Connect when disconnected; Disconnect, Mic, Snapshot, Flag when connected ── */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        marginBottom: 12,
      }}>
        {!isConnected ? (
          <button
            onClick={connect}
            disabled={!roomName}
            title="Connect to site room"
            style={{
              ...iconBtnStyle(true),
              opacity: roomName ? 1 : 0.4,
              cursor: roomName ? 'pointer' : 'not-allowed',
              color: '#fff',
              background: roomName ? 'linear-gradient(135deg, #F97316, #EA580C)' : 'rgba(255,255,255,0.06)',
            }}
          >
            {iconConnect}
          </button>
        ) : (
          <>
            <button
              onClick={disconnect}
              title="Disconnect"
              style={iconBtnStyle(false, true)}
            >
              {iconDisconnect}
            </button>
            <button
              onClick={toggleMic}
              title={isMicEnabled ? 'Mic on' : 'Mic off'}
              style={{
                ...iconBtnStyle(false),
                color: isMicEnabled ? C.green : C.redLight,
                border: isMicEnabled ? '1px solid rgba(34,197,94,0.35)' : '1px solid rgba(239,68,68,0.35)',
                background: isMicEnabled ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
              }}
            >
              {isMicEnabled ? iconMic : iconMicOff}
            </button>
            <button title="Snapshot" style={iconBtnStyle(false)}>
              {iconSnapshot}
            </button>
            <button title="Flag issue" style={iconBtnStyle(false, true)}>
              {iconFlag}
            </button>
          </>
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
