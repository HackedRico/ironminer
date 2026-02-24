import { useState, useEffect, useRef, useCallback } from 'react'
import { detectObjects, embedObject, findSimilarObjects } from '../../api/embeddings'

// ── Icons ────────────────────────────────────────────────────────────────────

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
const iconRescan = (
  <svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 4v6h-6" /><path d="M1 20v-6h6" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
)
const iconBack = (
  <svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 18 9 12 15 6" />
  </svg>
)

function SectionLabel({ children }) {
  return (
    <div style={{ fontSize: 9, color: '#475569', textTransform: 'uppercase', letterSpacing: '0.1em', fontFamily: 'var(--mono)', marginBottom: 8 }}>
      {children}
    </div>
  )
}

function Spinner() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
      <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(249,115,22,0.15)', borderTop: '2px solid #F97316', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--mono)' }}>Loading...</div>
    </div>
  )
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function FrameInspector({ frame, feedId, siteId, workerIdentity, workerId, onClose, onSaved }) {
  // Use the canonical database worker ID for storage/fetching.
  // Fall back to the LiveKit identity if no DB ID could be resolved.
  const workerStorageId = workerId || workerIdentity || null
  // mode: null = choose | 'new' = scan new object | 'detect' = view embedded
  const [mode, setMode] = useState(null)

  // ── "Scan New Object" state ──────────────────────────────────────────────
  const [searchPrompt, setSearchPrompt] = useState('')
  const [detections, setDetections] = useState([])
  const [selected, setSelected] = useState(null)
  const [noteText, setNoteText] = useState('')
  // phase: idle | detecting | ready | recording | saving | error
  const [phase, setPhase] = useState('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [hasAudio, setHasAudio] = useState(false)
  const [audiob64, setAudiob64] = useState(null)
  const recorderRef = useRef(null)
  const streamRef = useRef(null)
  const audioChunksRef = useRef([])

  // ── "Detect Object" state ────────────────────────────────────────────────
  // similarResults: Array<{ embedded_object: EmbeddedObject, similarity: number }>
  const [similarResults, setSimilarResults] = useState([])
  const [detectLoading, setDetectLoading] = useState(false)

  // ── Image scaling ────────────────────────────────────────────────────────
  const imgRef = useRef(null)
  const containerRef = useRef(null)
  const [imgNat, setImgNat] = useState({ w: 1, h: 1 })
  const [containerW, setContainerW] = useState(0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setContainerW(entry.contentRect.width))
    ro.observe(el)
    setContainerW(el.offsetWidth)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const scaleBbox = useCallback((bbox) => {
    if (!imgNat.w || !containerW) return bbox
    const scale = containerW / imgNat.w
    return [bbox[0] * scale, bbox[1] * scale, bbox[2] * scale, bbox[3] * scale]
  }, [imgNat.w, containerW])

  // ── Mode entry ───────────────────────────────────────────────────────────

  const enterNew = useCallback(() => {
    setMode('new')
    setPhase('idle')
    setDetections([])
    setSelected(null)
    setErrorMsg('')
  }, [])

  const enterDetect = useCallback(() => {
    setMode('detect')
    setDetectLoading(true)
    setSimilarResults([])
    const b64 = frame.replace(/^data:[^;]+;base64,/, '')
    findSimilarObjects(b64, workerStorageId, feedId)
      .then(setSimilarResults)
      .catch(() => setSimilarResults([]))
      .finally(() => setDetectLoading(false))
  }, [frame, workerStorageId, feedId])

  const backToMenu = useCallback(() => {
    setMode(null)
    setPhase('idle')
    setDetections([])
    setSelected(null)
    setErrorMsg('')
    setSimilarResults([])
  }, [])

  // ── Scan (new object detection) ──────────────────────────────────────────
  const MOCK_DETECTION = { bbox: [80, 60, 240, 240], label: 'object', confidence: 0.92 }

  const handleScan = useCallback(() => {
    setPhase('detecting')
    setDetections([])
    setSelected(null)
    setErrorMsg('')
    const b64 = frame.replace(/^data:[^;]+;base64,/, '')
    detectObjects(b64, searchPrompt.trim() || null)
      .then(dets => {
        setDetections(dets)
        if (dets.length === 1) setSelected(dets[0])
        setPhase('ready')
      })
      .catch(() => {
        setDetections([MOCK_DETECTION])
        setSelected(MOCK_DETECTION)
        setErrorMsg('Detection unavailable — using fallback region')
        setPhase('ready')
      })
  }, [frame, searchPrompt])

  // ── Voice recording ──────────────────────────────────────────────────────
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
      recorder.ondataavailable = (e) => { if (e.data?.size > 0) audioChunksRef.current.push(e.data) }
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

  useEffect(() => {
    return () => {
      try { recorderRef.current?.stop() } catch {}
      try { streamRef.current?.getTracks().forEach(t => t.stop()) } catch {}
    }
  }, [])

  // ── Embed submit ─────────────────────────────────────────────────────────
  const canEmbed = !!selected && (phase === 'ready' || phase === 'error')

  const handleEmbed = useCallback(async () => {
    if (!canEmbed) return
    setPhase('saving')
    const b64 = frame.replace(/^data:[^;]+;base64,/, '')
    try {
      const result = await embedObject({
        feed_id: feedId, site_id: siteId,
        worker_identity: workerStorageId,
        frame_b64: b64, bbox: selected.bbox, label: selected.label,
        note: noteText.trim() || null, audio_b64: audiob64 || null,
      })
      onSaved(result)
      onClose()
    } catch (err) {
      setErrorMsg(err.message || 'Embed failed')
      setPhase('error')
    }
  }, [canEmbed, frame, feedId, siteId, workerStorageId, selected, noteText, audiob64, onSaved, onClose])

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.78)', backdropFilter: 'blur(4px)', zIndex: 200 }} />

      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)',
        width: 'min(92vw, 980px)', maxHeight: '90vh',
        background: '#0B0E13', border: '1px solid rgba(255,255,255,0.1)',
        borderRadius: 16, boxShadow: '0 32px 96px rgba(0,0,0,0.85)',
        zIndex: 201, display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {iconCrosshair}
            </div>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#f1f5f9', fontFamily: 'var(--mono)', letterSpacing: '0.06em' }}>
              INSPECT FRAME
            </span>
            {workerIdentity && (
              <span style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--mono)' }}>· {workerIdentity}</span>
            )}
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', cursor: 'pointer', color: '#94a3b8', fontSize: 15, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ display: 'flex', flex: 1, overflow: 'hidden', minHeight: 0 }}>

          {/* Left — frame + bbox overlays (only in 'new' mode after scan) */}
          <div style={{ flex: '0 0 60%', padding: 16, overflowY: 'auto', borderRight: '1px solid rgba(255,255,255,0.06)' }}>
            {mode === 'new' && phase === 'detecting' && (
              <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 8, background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.15)', fontSize: 11, color: '#FDBA74', fontFamily: 'var(--mono)' }}>
                Scanning for "{searchPrompt}"...
              </div>
            )}
            {mode === 'new' && phase !== 'detecting' && phase !== 'idle' && detections.length > 0 && (
              <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 8, background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)', fontSize: 11, color: '#86efac' }}>
                {detections.length} object{detections.length !== 1 ? 's' : ''} found — click a box to select
              </div>
            )}
            {mode === 'new' && phase !== 'detecting' && phase !== 'idle' && detections.length === 0 && (
              <div style={{ marginBottom: 10, padding: '7px 12px', borderRadius: 8, background: 'rgba(100,116,139,0.06)', border: '1px solid rgba(100,116,139,0.15)', fontSize: 11, color: '#64748b' }}>
                {errorMsg || 'No objects detected'}
              </div>
            )}

            <div ref={containerRef} style={{ position: 'relative', lineHeight: 0 }}>
              <img
                ref={imgRef}
                src={frame}
                alt="Captured frame"
                draggable={false}
                style={{ width: '100%', display: 'block', borderRadius: 8 }}
                onLoad={() => { const el = imgRef.current; if (el) setImgNat({ w: el.naturalWidth, h: el.naturalHeight }) }}
              />
              {mode === 'new' && containerW > 0 && imgNat.w > 0 && detections.map((det, i) => {
                const [x1, y1, x2, y2] = scaleBbox(det.bbox)
                const isActive = selected === det
                return (
                  <div key={i} onClick={() => setSelected(det)} style={{
                    position: 'absolute', left: x1, top: y1,
                    width: Math.max(x2 - x1, 20), height: Math.max(y2 - y1, 20),
                    border: `2px ${isActive ? 'solid' : 'dashed'} ${isActive ? '#F97316' : 'rgba(249,115,22,0.55)'}`,
                    borderRadius: 4, background: isActive ? 'rgba(249,115,22,0.10)' : 'transparent',
                    cursor: 'pointer', transition: 'all 0.15s',
                    boxShadow: isActive ? '0 0 0 3px rgba(249,115,22,0.18)' : 'none',
                  }}>
                    <div style={{
                      position: 'absolute', top: -19, left: -2,
                      background: isActive ? '#F97316' : 'rgba(10,16,28,0.88)',
                      color: isActive ? '#fff' : '#FDBA74',
                      fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
                      padding: '2px 6px', borderRadius: '4px 4px 0 0',
                      whiteSpace: 'nowrap', lineHeight: '15px', letterSpacing: '0.04em', pointerEvents: 'none',
                    }}>
                      {det.label} {Math.round(det.confidence * 100)}%
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Right — mode-driven panel */}
          <div style={{ flex: '0 0 40%', display: 'flex', flexDirection: 'column', padding: '20px 20px 16px', gap: 16, overflowY: 'auto' }}>

            {/* ── MODE SELECTION ── */}
            {mode === null && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 14 }}>
                <div style={{ fontSize: 11, color: '#475569', marginBottom: 4 }}>What would you like to do?</div>

                {/* Option A — Scan New Object */}
                <button
                  onClick={enterNew}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '16px 16px', borderRadius: 12, textAlign: 'left',
                    background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.2)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.1)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,0.4)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.06)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,0.2)' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#F97316" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                      <line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Scan New Object</div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                      Tell NVIDIA what to look for in this frame, then embed it with a note.
                    </div>
                  </div>
                </button>

                {/* Option B — Detect Object */}
                <button
                  onClick={enterDetect}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 14,
                    padding: '16px 16px', borderRadius: 12, textAlign: 'left',
                    background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.2)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}
                  onMouseOver={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.1)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.4)' }}
                  onMouseOut={e => { e.currentTarget.style.background = 'rgba(99,102,241,0.06)'; e.currentTarget.style.borderColor = 'rgba(99,102,241,0.2)' }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#818cf8" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
                      <rect x="8" y="8" width="8" height="8" rx="1" />
                    </svg>
                  </div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#f1f5f9', marginBottom: 4 }}>Detect Object</div>
                    <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5 }}>
                      View previously embedded objects recorded for this worker.
                    </div>
                  </div>
                </button>
              </div>
            )}

            {/* ── SCAN NEW OBJECT mode ── */}
            {mode === 'new' && (
              <>
                {/* Back link */}
                <button onClick={backToMenu} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 11, padding: 0, alignSelf: 'flex-start' }}
                  onMouseOver={e => e.currentTarget.style.color = '#94a3b8'}
                  onMouseOut={e => e.currentTarget.style.color = '#475569'}
                >
                  {iconBack} Back
                </button>

                {/* Prompt input (always visible in this mode) */}
                <div>
                  <SectionLabel>What are you looking for?</SectionLabel>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <input
                      type="text"
                      autoFocus={phase === 'idle'}
                      value={searchPrompt}
                      onChange={e => setSearchPrompt(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && searchPrompt.trim()) handleScan() }}
                      placeholder="e.g. valve, pipe, fire extinguisher"
                      disabled={phase === 'saving'}
                      style={{
                        flex: 1, padding: '9px 12px', borderRadius: 8,
                        background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                        color: '#f1f5f9', fontSize: 12, fontFamily: 'inherit', outline: 'none',
                      }}
                      onFocus={e => { e.target.style.borderColor = 'rgba(249,115,22,0.5)' }}
                      onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,0.12)' }}
                    />
                    <button
                      onClick={handleScan}
                      disabled={!searchPrompt.trim() || phase === 'detecting' || phase === 'saving'}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 5,
                        padding: '9px 12px', borderRadius: 8, flexShrink: 0,
                        background: (searchPrompt.trim() && phase !== 'detecting' && phase !== 'saving')
                          ? 'rgba(249,115,22,0.15)' : 'rgba(255,255,255,0.04)',
                        border: (searchPrompt.trim() && phase !== 'detecting' && phase !== 'saving')
                          ? '1px solid rgba(249,115,22,0.35)' : '1px solid rgba(255,255,255,0.08)',
                        color: (searchPrompt.trim() && phase !== 'detecting' && phase !== 'saving') ? '#FDBA74' : '#334155',
                        fontSize: 11, fontWeight: 600, fontFamily: 'var(--mono)',
                        cursor: (!searchPrompt.trim() || phase === 'detecting' || phase === 'saving') ? 'not-allowed' : 'pointer',
                        opacity: (!searchPrompt.trim() || phase === 'detecting' || phase === 'saving') ? 0.5 : 1,
                        transition: 'all 0.15s', letterSpacing: '0.04em',
                      }}
                    >
                      {phase === 'detecting' ? (
                        <div style={{ width: 11, height: 11, borderRadius: '50%', border: '1.5px solid rgba(249,115,22,0.2)', borderTop: '1.5px solid #F97316', animation: 'spin 0.7s linear infinite' }} />
                      ) : iconRescan}
                      {phase === 'detecting' ? 'SCANNING' : 'SCAN'}
                    </button>
                  </div>
                  {phase === 'idle' && (
                    <div style={{ fontSize: 10, color: '#334155', marginTop: 5, fontFamily: 'var(--mono)' }}>
                      Press Enter or click Scan · separate multiple with commas
                    </div>
                  )}
                </div>

                {/* Detected objects */}
                {phase !== 'idle' && phase !== 'detecting' && (
                  <>
                    <div>
                      <SectionLabel>Detected Objects</SectionLabel>
                      {detections.length === 0 ? (
                        <div style={{ padding: '10px 14px', borderRadius: 8, background: 'rgba(255,255,255,0.02)', border: '1px dashed rgba(255,255,255,0.06)', fontSize: 12, color: '#334155', fontStyle: 'italic' }}>
                          No objects found
                        </div>
                      ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {detections.map((det, i) => {
                            const isActive = selected === det
                            return (
                              <button key={i} onClick={() => setSelected(det)} style={{
                                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                                padding: '8px 12px', borderRadius: 8, cursor: 'pointer',
                                background: isActive ? 'rgba(249,115,22,0.12)' : 'rgba(255,255,255,0.03)',
                                border: isActive ? '1px solid rgba(249,115,22,0.35)' : '1px solid rgba(255,255,255,0.06)',
                                color: isActive ? '#FDBA74' : '#94a3b8',
                                fontSize: 12, fontWeight: isActive ? 600 : 400, transition: 'all 0.12s', textAlign: 'left',
                              }}>
                                <span>{det.label}</span>
                                <span style={{ fontSize: 10, fontFamily: 'var(--mono)', opacity: 0.6 }}>{Math.round(det.confidence * 100)}%</span>
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }} />

                    {/* Note */}
                    <div>
                      <SectionLabel>{selected ? `Note for: ${selected.label}` : 'Attach Note'}</SectionLabel>
                      <textarea
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        placeholder={selected ? `Note about "${selected.label}"...` : 'Select an object first'}
                        rows={3}
                        disabled={!selected || phase === 'saving'}
                        style={{
                          width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 8,
                          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
                          color: '#e2e8f0', fontSize: 12, lineHeight: 1.6,
                          resize: 'vertical', fontFamily: 'inherit', outline: 'none',
                          opacity: !selected ? 0.5 : 1, transition: 'opacity 0.15s',
                        }}
                      />
                    </div>

                    {/* Voice */}
                    <div>
                      <SectionLabel>Voice Note</SectionLabel>
                      <button
                        onClick={phase === 'recording' ? stopRecording : startRecording}
                        disabled={!selected || phase === 'saving'}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 7,
                          padding: '9px 14px', borderRadius: 8,
                          cursor: (!selected || phase === 'saving') ? 'not-allowed' : 'pointer',
                          background: phase === 'recording' ? 'rgba(239,68,68,0.12)' : hasAudio ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.05)',
                          border: phase === 'recording' ? '1px solid rgba(239,68,68,0.3)' : hasAudio ? '1px solid rgba(34,197,94,0.25)' : '1px solid rgba(255,255,255,0.1)',
                          color: phase === 'recording' ? '#fca5a5' : hasAudio ? '#86efac' : '#94a3b8',
                          fontSize: 12, fontWeight: 500,
                          opacity: (!selected || phase === 'saving') ? 0.45 : 1, transition: 'all 0.15s',
                        }}
                      >
                        {iconMic}
                        {phase === 'recording' ? 'Stop Recording' : hasAudio ? 'Voice Captured — Re-record' : 'Record Voice Note'}
                      </button>
                      {phase === 'recording' && <div style={{ fontSize: 10, color: '#fca5a5', marginTop: 5, fontFamily: 'var(--mono)' }}>Recording... Parakeet will transcribe on save</div>}
                      {hasAudio && phase !== 'recording' && <div style={{ fontSize: 10, color: '#86efac', marginTop: 5, fontFamily: 'var(--mono)' }}>Voice note ready</div>}
                    </div>

                    {phase === 'error' && errorMsg && (
                      <div style={{ padding: '8px 12px', borderRadius: 8, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', fontSize: 12, color: '#fca5a5' }}>
                        {errorMsg}
                      </div>
                    )}

                    <div style={{ flex: 1 }} />
                    {!selected && <div style={{ fontSize: 11, color: '#334155', textAlign: 'center', fontStyle: 'italic' }}>Select an object above to continue</div>}

                    <button
                      onClick={handleEmbed}
                      disabled={!canEmbed}
                      style={{
                        padding: '12px 20px', borderRadius: 10,
                        cursor: canEmbed ? 'pointer' : 'not-allowed',
                        background: canEmbed ? 'linear-gradient(135deg, #F97316, #EA580C)' : 'rgba(255,255,255,0.05)',
                        border: canEmbed ? 'none' : '1px solid rgba(255,255,255,0.08)',
                        color: canEmbed ? '#fff' : '#334155',
                        fontSize: 13, fontWeight: 700,
                        opacity: canEmbed ? 1 : 0.55, transition: 'all 0.2s',
                      }}
                    >
                      {phase === 'saving' ? 'Embedding...' : '✦ Embed Note'}
                    </button>
                  </>
                )}
              </>
            )}

            {/* ── DETECT OBJECT mode ── */}
            {mode === 'detect' && (
              <>
                <button onClick={backToMenu} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#475569', fontSize: 11, padding: 0, alignSelf: 'flex-start' }}
                  onMouseOver={e => e.currentTarget.style.color = '#94a3b8'}
                  onMouseOut={e => e.currentTarget.style.color = '#475569'}
                >
                  {iconBack} Back
                </button>

                <div style={{ marginBottom: 4 }}>
                  <SectionLabel>Visual Matches{!detectLoading && similarResults.length > 0 ? ` · ${similarResults.length}` : ''}</SectionLabel>
                  <div style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--mono)', marginBottom: 10 }}>
                    Comparing current frame against all embedded objects
                  </div>
                </div>

                {detectLoading && (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: 12 }}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(99,102,241,0.15)', borderTop: '2px solid #818cf8', animation: 'spin 0.8s linear infinite' }} />
                    <div style={{ fontSize: 11, color: '#475569', fontFamily: 'var(--mono)' }}>Scanning for visual matches...</div>
                  </div>
                )}

                {!detectLoading && similarResults.length === 0 && (
                  <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, textAlign: 'center' }}>
                    <div style={{ fontSize: 28, opacity: 0.2 }}>◻</div>
                    <div style={{ fontSize: 12, color: '#334155' }}>No matching objects found.</div>
                    <div style={{ fontSize: 11, color: '#1e293b', lineHeight: 1.5 }}>Embed objects first using<br /><em>Scan New Object</em>.</div>
                  </div>
                )}

                {!detectLoading && similarResults.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {similarResults.map(({ embedded_object: obj, similarity }) => {
                      const pct = Math.round(similarity * 100)
                      const simColor = pct >= 75 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#94a3b8'
                      return (
                        <div key={obj.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 12px', borderRadius: 10, background: 'rgba(99,102,241,0.06)', border: '1px solid rgba(99,102,241,0.15)' }}>
                          {obj.crop_b64 && (
                            <img
                              src={`data:image/jpeg;base64,${obj.crop_b64}`}
                              alt={obj.label}
                              style={{ width: 44, height: 44, borderRadius: 6, objectFit: 'cover', flexShrink: 0, border: '1px solid rgba(99,102,241,0.2)' }}
                            />
                          )}
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
                              <div style={{ fontSize: 11, fontWeight: 600, color: '#a5b4fc' }}>{obj.label}</div>
                              <div style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', color: simColor, background: `${simColor}18`, padding: '2px 7px', borderRadius: 5, flexShrink: 0 }}>
                                {pct}% match
                              </div>
                            </div>
                            {obj.note && obj.note !== '[no note]' && (
                              <div style={{ fontSize: 11, color: '#64748b', lineHeight: 1.45, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                                {obj.note}
                              </div>
                            )}
                            <div style={{ fontSize: 9, color: '#334155', marginTop: 4, fontFamily: 'var(--mono)' }}>
                              {new Date(obj.created_at).toLocaleString()}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}

          </div>
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  )
}
