import { useState, useEffect, useRef, useCallback } from 'react'
import { detectObjects, embedObject } from '../../api/embeddings'

const iconCrosshair = (
  <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth={2} strokeLinecap="round">
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
  </svg>
)

const iconMic = (
  <svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
    <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
  </svg>
)

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, color: '#475569', textTransform: 'uppercase',
      letterSpacing: '0.1em', fontFamily: 'var(--mono)', marginBottom: 8,
    }}>
      {children}
    </div>
  )
}

/**
 * FrameInspector — full-screen overlay modal for embedding objects in a captured video frame.
 *
 * Flow:
 *  1. Calls detectObjects() on mount → NVIDIA Grounding DINO draws bboxes
 *  2. Superintendent clicks a bbox to select an object
 *  3. Types a text note and/or records a voice note (Parakeet transcribes on save)
 *  4. Clicks "Embed Note" → saves EmbeddedObject to backend
 *
 * @param {{
 *   frame: string,                — data URI (JPEG) captured from the video element
 *   feedId: string,
 *   siteId: string,
 *   workerIdentity: string|null,
 *   onClose: () => void,
 *   onSaved: (EmbeddedObject) => void,
 * }} props
 */
export default function FrameInspector({ frame, feedId, siteId, workerIdentity, onClose, onSaved }) {
  // Detection + selection
  const [detections, setDetections] = useState([])
  const [selected, setSelected] = useState(null)

  // Note input
  const [noteText, setNoteText] = useState('')

  // Phase: detecting | ready | recording | saving | error
  const [phase, setPhase] = useState('detecting')
  const [errorMsg, setErrorMsg] = useState('')

  // Voice note
  const [hasAudio, setHasAudio] = useState(false)
  const [audiob64, setAudiob64] = useState(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])

  // Image scaling: track rendered container width + image natural dims
  const imgRef = useRef(null)
  const containerRef = useRef(null)
  const [imgNat, setImgNat] = useState({ w: 1, h: 1 })
  const [containerW, setContainerW] = useState(0)

  // ── Detection on mount ──────────────────────────────────────────────────────
  useEffect(() => {
    const b64 = frame.replace(/^data:[^;]+;base64,/, '')
    detectObjects(b64)
      .then(dets => {
        setDetections(dets)
        if (dets.length === 1) setSelected(dets[0])  // auto-select only object
        setPhase('ready')
      })
      .catch(err => {
        setErrorMsg(err.message || 'Detection failed')
        setPhase('error')
      })
  }, [frame])

  // ── Track container width for bbox scaling ──────────────────────────────────
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => {
      setContainerW(entry.contentRect.width)
    })
    ro.observe(el)
    // Initial read
    setContainerW(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

  // ── Keyboard: Escape closes ─────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  // ── Scale bbox pixels from natural image coords → rendered display coords ───
  const scaleBbox = useCallback((bbox) => {
    if (!imgNat.w || !containerW) return bbox
    const scale = containerW / imgNat.w
    return [bbox[0] * scale, bbox[1] * scale, bbox[2] * scale, bbox[3] * scale]
  }, [imgNat.w, containerW])

  // ── Voice recording ─────────────────────────────────────────────────────────
  const startRecording = useCallback(async () => {
    if (phase === 'recording') return
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      recorderRef.current = recorder
      audioChunksRef.current = []

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) audioChunksRef.current.push(e.data)
      }

      recorder.onstop = async () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/webm' })
        const b64 = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onloadend = () => resolve(reader.result.split(',')[1] || '')
          reader.readAsDataURL(blob)
        })
        setAudiob64(b64)
        setHasAudio(true)
        try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
        streamRef.current = null
        setPhase('ready')
      }

      recorder.start(250)
      setPhase('recording')
    } catch (err) {
      setErrorMsg(err.message || 'Mic access failed')
    }
  }, [phase])

  const stopRecording = useCallback(() => {
    if (phase !== 'recording') return
    try { recorderRef.current?.stop() } catch {}
    recorderRef.current = null
  }, [phase])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop() } catch {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    }
  }, [])

  // ── Submit ──────────────────────────────────────────────────────────────────
  const canEmbed = !!selected && phase === 'ready'

  const handleEmbed = useCallback(async () => {
    if (!canEmbed) return
    setPhase('saving')
    const b64 = frame.replace(/^data:[^;]+;base64,/, '')
    try {
      const result = await embedObject({
        feed_id: feedId,
        site_id: siteId,
        worker_identity: workerIdentity || null,
        frame_b64: b64,
        bbox: selected.bbox,
        label: selected.label,
        note: noteText.trim() || null,
        audio_b64: audiob64 || null,
      })
      onSaved(result)
      onClose()
    } catch (err) {
      setErrorMsg(err.message || 'Embed failed')
      setPhase('error')
    }
  }, [canEmbed, frame, feedId, siteId, workerIdentity, selected, noteText, audiob64, onSaved, onClose])

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.78)',
          backdropFilter: 'blur(4px)',
          zIndex: 200,
        }}
      />

      {/* Modal */}
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 'min(92vw, 980px)',
        maxHeight: '90vh',
        background: '#0B0E13',
        border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16,
        boxShadow: '0 32px 96px rgba(0,0,0,0.85)',
        zIndex: 201,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}>

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 28, height: 28, borderRadius: 8,
              background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              {iconCrosshair}
            </div>
            <span style={{
              fontSize: 13, fontWeight: 700, color: '#f1f5f9',
              fontFamily: 'var(--mono)', letterSpacing: '0.06em',
            }}>
              INSPECT FRAME
            </span>
            {workerIdentity && (
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--mono)' }}>
                · {workerIdentity}
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            style={{
              width: 32, height: 32, borderRadius: 8,
              background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer', color: '#94a3b8', fontSize: 15,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            ✕
          </button>
        </div>

        {/* ── Body ────────────────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left: frame + bbox overlay */}
          <div style={{
            flex: '0 0 60%',
            padding: 16,
            overflowY: 'auto',
            borderRight: '1px solid rgba(255,255,255,0.06)',
          }}>
            {/* Status banner */}
            {phase === 'detecting' && (
              <div style={{
                marginBottom: 10, padding: '7px 12px', borderRadius: 8,
                background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)',
                fontSize: 11, color: '#FDBA74', fontFamily: 'var(--mono)',
              }}>
                Detecting objects...
              </div>
            )}
            {phase !== 'detecting' && detections.length > 0 && (
              <div style={{
                marginBottom: 10, padding: '7px 12px', borderRadius: 8,
                background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)',
                fontSize: 11, color: '#86efac',
              }}>
                {detections.length} object{detections.length !== 1 ? 's' : ''} detected — click a box to select
              </div>
            )}
            {phase !== 'detecting' && detections.length === 0 && (
              <div style={{
                marginBottom: 10, padding: '7px 12px', borderRadius: 8,
                background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.15)',
                fontSize: 11, color: '#64748b',
              }}>
                {errorMsg || 'No objects detected (mock mode). Shown bbox is selectable.'}
              </div>
            )}

            {/* Image + bbox overlays */}
            <div ref={containerRef} style={{ position: 'relative', lineHeight: 0 }}>
              <img
                ref={imgRef}
                src={frame}
                alt="Captured frame"
                draggable={false}
                style={{ width: '100%', display: 'block', borderRadius: 8 }}
                onLoad={() => {
                  const el = imgRef.current
                  if (el) setImgNat({ w: el.naturalWidth, h: el.naturalHeight })
                }}
              />

              {/* Bounding box overlays */}
              {containerW > 0 && imgNat.w > 0 && detections.map((det, i) => {
                const [x1, y1, x2, y2] = scaleBbox(det.bbox)
                const isActive = selected === det
                return (
                  <div
                    key={i}
                    onClick={() => setSelected(det)}
                    style={{
                      position: 'absolute',
                      left: x1, top: y1,
                      width: Math.max(x2 - x1, 20), height: Math.max(y2 - y1, 20),
                      border: `2px ${isActive ? 'solid' : 'dashed'} ${isActive ? '#F97316' : 'rgba(249,115,22,0.55)'}`,
                      borderRadius: 4,
                      background: isActive ? 'rgba(249,115,22,0.10)' : 'transparent',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      boxShadow: isActive ? '0 0 0 3px rgba(249,115,22,0.18)' : 'none',
                    }}
                  >
                    {/* Label badge above the box */}
                    <div style={{
                      position: 'absolute',
                      top: -19, left: -2,
                      background: isActive ? '#F97316' : 'rgba(10,16,28,0.88)',
                      color: isActive ? '#fff' : '#FDBA74',
                      fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
                      padding: '2px 6px', borderRadius: '4px 4px 0 0',
                      whiteSpace: 'nowrap', lineHeight: '15px',
                      letterSpacing: '0.04em', pointerEvents: 'none',
                    }}>
                      {det.label} {Math.round(det.confidence * 100)}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right: object list + note controls */}
          <div style={{
            flex: '0 0 40%',
            display: 'flex', flexDirection: 'column',
            padding: '20px 20px 16px',
            gap: 18, overflowY: 'auto',
          }}>

            {/* Detected objects list */}
            <div>
              <SectionLabel>Detected Objects</SectionLabel>
              {detections.length === 0 ? (
                <div style={{
                  padding: '10px 14px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)',
                  fontSize: 12, color: '#334155', fontStyle: 'italic',
                }}>
                  {phase === 'detecting' ? 'Running detection...' : 'No objects found'}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {detections.map((det, i) => {
                    const isActive = selected === det
                    return (
                      <button
                        key={i}
                        onClick={() => setSelected(det)}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                          background: isActive ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.03)',
                          border: isActive ? '1px solid rgba(249,115,22,0.35)' : '1px solid rgba(255,255,255,0.06)',
                          color: isActive ? '#FDBA74' : '#94a3b8',
                          fontSize: 12, fontWeight: isActive ? 600 : 400,
                          transition: 'all 0.12s', textAlign: 'left',
                        }}
                      >
                        <span>{det.label}</span>
                        <span style={{ fontSize: 10, fontFamily: 'var(--mono)', opacity: 0.6 }}>
                          {Math.round(det.confidence * 100)}%
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

            {/* Note input */}
            <div>
              <SectionLabel>
                {selected ? `Note for: ${selected.label}` : 'Attach Note'}
              </SectionLabel>
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                placeholder={selected ? `Note about "${selected.label}"...` : 'Select an object first'}
                rows={3}
                disabled={!selected || phase === 'saving'}
                style={{
                  width: '100%', boxSizing: 'border-box',
                  padding: '10px 12px', borderRadius: 8,
                  background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                  color: '#e2e8f0', fontSize: 12, lineHeight: 1.6,
                  resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                  opacity: !selected ? 0.5 : 1,
                  transition: 'opacity 0.15s',
                }}
              />
            </div>

            {/* Voice note button */}
            <div>
              <SectionLabel>Voice Note</SectionLabel>
              <button
                onClick={phase === 'recording' ? stopRecording : startRecording}
                disabled={!selected || phase === 'saving'}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7,
                  padding: '9px 14px', borderRadius: 8,
                  cursor: (!selected || phase === 'saving') ? 'not-allowed' : 'pointer',
                  background: phase === 'recording'
                    ? 'rgba(239,68,68,0.12)'
                    : hasAudio
                      ? 'rgba(34,197,94,0.1)'
                      : 'rgba(255,255,255,0.05)',
                  border: phase === 'recording'
                    ? '1px solid rgba(239,68,68,0.3)'
                    : hasAudio
                      ? '1px solid rgba(34,197,94,0.25)'
                      : '1px solid rgba(255,255,255,0.1)',
                  color: phase === 'recording'
                    ? '#fca5a5'
                    : hasAudio ? '#86efac' : '#94a3b8',
                  fontSize: 12, fontWeight: 500,
                  opacity: (!selected || phase === 'saving') ? 0.45 : 1,
                  transition: 'all 0.15s',
                }}
              >
                {iconMic}
                {phase === 'recording'
                  ? 'Stop Recording'
                  : hasAudio
                    ? 'Voice Captured — Re-record'
                    : 'Record Voice Note'}
              </button>
              {phase === 'recording' && (
                <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 5, fontFamily: 'var(--mono)' }}>
                  Recording... Parakeet will transcribe on save
                </div>
              )}
              {hasAudio && phase !== 'recording' && (
                <div style={{ fontSize: 10, color: '#86efac', marginTop: 5, fontFamily: 'var(--mono)' }}>
                  Voice note ready — transcript generated on save
                </div>
              )}
            </div>

            {/* Error */}
            {phase === 'error' && errorMsg && (
              <div style={{
                padding: '8px 12px', borderRadius: 8,
                background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)',
                fontSize: 12, color: '#fca5a5',
              }}>
                {errorMsg}
              </div>
            )}

            {/* Spacer pushes submit to bottom */}
            <div style={{ flex: 1 }} />

            {/* Hint text */}
            {!selected && (
              <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', fontStyle: 'italic' }}>
                Select an object above to continue
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleEmbed}
              disabled={!canEmbed}
              style={{
                padding: '12px 20px', borderRadius: 10,
                cursor: canEmbed ? 'pointer' : 'not-allowed',
                background: canEmbed
                  ? 'linear-gradient(135deg, #F97316, #EA580C)'
                  : 'rgba(255,255,255,0.05)',
                border: canEmbed ? 'none' : '1px solid rgba(255,255,255,0.08)',
                color: canEmbed ? '#fff' : '#334155',
                fontSize: 13, fontWeight: 700,
                opacity: canEmbed ? 1 : 0.55,
                transition: 'all 0.2s',
              }}
            >
              {phase === 'saving' ? 'Embedding...' : '✦ Embed Note'}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
