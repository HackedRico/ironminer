import { useState, useCallback, useEffect, useRef } from 'react'
import FrameInspector from './FrameInspector'
import { ConnectionState } from 'livekit-client'
import { C } from '../../utils/colors'
import useLiveStream from '../../hooks/useLiveStream'
import useAudioControls from '../../hooks/useAudioControls'
import { createFeedNote } from '../../api/streaming'
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
const iconInspect = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
)
const iconNote = (
  <svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 7a2 2 0 0 1 2-2h9l5 5v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
    <path d="M14 5v5h5" />
    <line x1="7" y1="13" x2="15" y2="13" />
    <line x1="7" y1="16" x2="12" y2="16" />
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
  onNoteSaved,
  workerDbId,
}) {
  const [internalSelectedWorker, setInternalSelectedWorker] = useState(null)
  const [noteState, setNoteState] = useState('idle') // idle | recording | saving | saved | error
  const [noteMessage, setNoteMessage] = useState('')
  const [inspectorFrame, setInspectorFrame] = useState(null) // null = closed, data URI = open
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])
  const idleTimerRef = useRef(null)
  const activeVideoRef = useRef(null) // ref to the currently-displayed worker's <video> element

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

  // Auto-select the only worker stream if nothing is selected yet
  useEffect(() => {
    if (selectedWorkerIdentity) return
    if (workerStreams.size === 1) {
      const onlyId = Array.from(workerStreams.keys())[0]
      handleSelectWorker(onlyId)
    }
  }, [workerStreams, selectedWorkerIdentity, handleSelectWorker])

  // Auto-connect when we have a site so sidebar shows live thumbnails before user clicks Connect
  useEffect(() => {
    if (roomName && connectionState === ConnectionState.Disconnected) connect()
  }, [roomName, connectionState])

  // Cleanup recorder + stream on unmount
  useEffect(() => {
    return () => {
      clearTimeout(idleTimerRef.current)
      try { recorderRef.current?.stop() } catch {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    }
  }, [])

  const selectedStream = selectedWorkerIdentity ? workerStreams.get(selectedWorkerIdentity) : null
  const canSaveNote = !!selectedFeed?.id && !!site?.id && !!selectedWorkerIdentity


  const startNoteRecording = useCallback(async () => {
    if (noteState === 'recording' || noteState === 'saving') return
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setNoteState('error')
      setNoteMessage('Audio recording not supported in this browser')
      return
    }
    if (!canSaveNote) {
      setNoteState('error')
      setNoteMessage('Select a worker feed first')
      return
    }

    // Clear any pending idle reset from a previous save
    clearTimeout(idleTimerRef.current)

    // Tear down any leftover recorder/stream from a previous session
    try { recorderRef.current?.stop() } catch {}
    try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    recorderRef.current = null
    streamRef.current = null

    setNoteMessage('')
    audioChunksRef.current = []

    try {
      // Disable browser audio processing so it doesn't conflict with LiveKit's mic pipeline
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onerror = (e) => {
        setNoteState('error')
        setNoteMessage(`Recording error: ${e.error?.message || 'unknown'}`)
        try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
        streamRef.current = null
        recorderRef.current = null
      }

      recorder.onstop = async () => {
        setNoteState('saving')
        try {
          const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
          const base64 = await new Promise((resolve) => {
            const reader = new FileReader()
            reader.onloadend = () => {
              const res = reader.result || ''
              const b64 = typeof res === 'string' ? res.split(',')[1] : ''
              resolve(b64)
            }
            reader.readAsDataURL(blob)
          })

          await createFeedNote(selectedFeed.id, {
            feed_id: selectedFeed.id,
            site_id: site.id,
            worker_identity: selectedWorkerIdentity,
            transcript: null,
            audio_base64: base64 || null,
          })
          if (typeof onNoteSaved === 'function') onNoteSaved(selectedFeed.id, '')
          setNoteState('saved')
          setNoteMessage('Note saved')
          idleTimerRef.current = setTimeout(() => setNoteState('idle'), 1500)
        } catch (err) {
          setNoteState('error')
          setNoteMessage(err.message || 'Failed to save note')
        } finally {
          try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
          streamRef.current = null
          recorderRef.current = null
        }
      }

      recorder.start(250)
      setNoteState('recording')
    } catch (err) {
      setNoteState('error')
      setNoteMessage(err.message || 'Mic access failed')
    }
  }, [noteState, canSaveNote, selectedFeed, selectedWorkerIdentity, site])

  const stopNoteRecording = useCallback(() => {
    if (noteState !== 'recording') return
    try { recorderRef.current?.stop() } catch {}
  }, [noteState])

  const toggleNoteRecording = useCallback(() => {
    if (noteState === 'recording') stopNoteRecording()
    else startNoteRecording()
  }, [noteState, startNoteRecording, stopNoteRecording])

  // ── Frame inspection: capture current video frame → open FrameInspector ──
  const handleInspect = useCallback(() => {
    const v = activeVideoRef.current
    if (!v) return
    const w = v.videoWidth || 640
    const h = v.videoHeight || 480
    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    canvas.getContext('2d').drawImage(v, 0, 0, w, h)
    setInspectorFrame(canvas.toDataURL('image/jpeg', 0.85))
  }, [])

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
              videoRef={activeVideoRef}
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
            <button
              onClick={toggleNoteRecording}
              title={canSaveNote ? (noteState === 'recording' ? 'Stop and save note' : 'Start recording note') : 'Select a worker feed first'}
              style={{
                ...iconBtnStyle(noteState === 'recording'),
                color: noteState === 'recording' ? C.orangeLight : C.subtle,
                opacity: canSaveNote ? 1 : 0.5,
                cursor: canSaveNote ? 'pointer' : 'not-allowed',
              }}
            >
              {iconNote}
            </button>
            <button
              onClick={handleInspect}
              title={selectedStream ? 'Inspect frame — embed object with note' : 'Select a worker stream first'}
              disabled={!selectedStream}
              style={{
                ...iconBtnStyle(false),
                opacity: selectedStream ? 1 : 0.4,
                cursor: selectedStream ? 'pointer' : 'not-allowed',
              }}
            >
              {iconInspect}
            </button>
            <button title="Flag issue" style={iconBtnStyle(false, true)}>
              {iconFlag}
            </button>
          </>
        )}
      </div>

      {noteState !== 'idle' && (
        <div style={{
          padding: '8px 12px', borderRadius: 8, marginBottom: 12,
          background: noteState === 'error' ? 'rgba(239,68,68,0.08)' : 'rgba(249,115,22,0.08)',
          border: noteState === 'error' ? '1px solid rgba(239,68,68,0.2)' : '1px solid rgba(249,115,22,0.2)',
          fontSize: 12, color: noteState === 'error' ? '#FCA5A5' : '#FDBA74',
        }}>
          {noteMessage || (noteState === 'recording' ? 'Recording… Parakeet will transcribe on save' : 'Saving note…')}
        </div>
      )}

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

      {/* ── Frame Inspector modal ─────────────────────────────────────────── */}
      {inspectorFrame && (
        <FrameInspector
          frame={inspectorFrame}
          feedId={selectedFeed?.id || 'unknown'}
          siteId={site?.id || 'unknown'}
          workerIdentity={selectedWorkerIdentity}
          workerId={workerDbId}
          onClose={() => setInspectorFrame(null)}
          onSaved={(obj) => {
            setInspectorFrame(null)
            // Surface a note count bump so the sidebar badge updates
            if (typeof onNoteSaved === 'function') {
              onNoteSaved(selectedFeed?.id || 'unknown', `[embedded: ${obj.label}]`)
            }
          }}
        />
      )}
    </div>
  )
}
