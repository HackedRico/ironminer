import { useState, useEffect } from 'react'
import LiveStreamView from '../components/LiveStreamView'
import LiveWorkerFeedCard from '../components/LiveStreamView/LiveWorkerFeedCard'
import { fetchFeeds, fetchSiteNotes, fetchWorkers as fetchLiveWorkers, submitSiteWorld, submitWorldFromFrames, fetchWorldStatus } from '../api/streaming'
import { fetchSites } from '../api/sites'
import { fetchSiteWorkers, fetchTeams } from '../api/teams'
import { MOCK_FEEDS, MOCK_SITES, MOCK_WORKERS } from '../utils/mockData'

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

const TRADE_COLORS = {
  Concrete: '#3B82F6', Electrical: '#EAB308', Plumbing: '#10B981',
  Framing: '#F97316', HVAC: '#8B5CF6', 'Crane Ops': '#EC4899',
  Delivery: '#64748B', Staging: '#06B6D4', 'Steel Erection': '#EF4444',
  Cladding: '#84CC16',
}

const TEAM_COLORS = ['#F97316','#3B82F6','#8B5CF6','#10B981','#F59E0B','#EC4899','#06B6D4','#84CC16']

const CAPTURE_ANGLES = [
  'Face forward (0°)',
  'Turn right 60°',
  'Turn right 120°',
  'Face opposite (180°)',
  'Turn left 120°',
  'Turn left 60°',
]

function getLiveIdentityForWorker(worker, liveWorkerStreams) {
  if (!worker || !liveWorkerStreams?.size) return null
  for (const [identity, stream] of liveWorkerStreams.entries()) {
    const name = stream?.participant?.name
    if (name === worker.name || identity === worker.id) return identity
  }
  return null
}

function SiteScanPanel({ worldJob, liveWorkerStream, workerName, selectedWorkerIdentity, onSubmitFrames, onUpload, onReset }) {
  const [dragOver, setDragOver] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [capturing, setCapturing] = useState(false)
  const [capturedFrames, setCapturedFrames] = useState([])

  const status = worldJob?.status
  const hasLiveWorker = !!liveWorkerStream
  const step = capturedFrames.length
  const allCaptured = step >= 6

  const captureFrame = () => {
    const video = liveWorkerStream?.videoTrack?.attachedElements?.[0]
    if (!video) return null
    const canvas = document.createElement('canvas')
    canvas.width = video.videoWidth || 640
    canvas.height = video.videoHeight || 480
    canvas.getContext('2d').drawImage(video, 0, 0)
    return canvas.toDataURL('image/jpeg', 0.85)
  }

  const handleCapture = () => {
    const frame = captureFrame()
    if (!frame) return
    setCapturedFrames(prev => [...prev, frame])
  }

  const handleGenerate = async () => {
    if (capturedFrames.length < 2) return
    setSubmitting(true)
    await onSubmitFrames(capturedFrames)
    setSubmitting(false)
    setCapturing(false)
    setCapturedFrames([])
  }

  const handleFile = async (file) => {
    if (!file) return
    setSubmitting(true)
    await onUpload(file)
    setSubmitting(false)
  }

  const resetCapture = () => {
    setCapturing(false)
    setCapturedFrames([])
  }

  return (
    <div style={{
      marginTop: 12,
      borderRadius: 10,
      border: `1px solid ${status === 'done' ? 'rgba(34,197,94,0.25)' : status === 'error' ? 'rgba(239,68,68,0.25)' : 'rgba(255,255,255,0.07)'}`,
      background: 'rgba(255,255,255,0.03)',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '10px 14px',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}>
        <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#475569', letterSpacing: '0.1em', flex: 1 }}>
          3D SITE WORLD
        </span>
        {(worldJob || capturing) && (
          <button onClick={() => { onReset(); resetCapture() }} title="Clear" style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: '#475569', fontSize: 14, lineHeight: 1, padding: 0,
          }}>✕</button>
        )}
      </div>

      {/* Body */}
      <div style={{ padding: '12px 14px' }}>

        {/* ── Idle state ── */}
        {!worldJob && !capturing && (
          hasLiveWorker ? (
            // Live worker selected — offer guided capture
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, alignItems: 'center' }}>
              <div style={{ fontSize: 11, color: '#64748b', textAlign: 'center', lineHeight: 1.5 }}>
                Ask <strong style={{ color: '#94a3b8' }}>{workerName || selectedWorkerIdentity}</strong> to
                slowly turn 360° while you capture 6 angles.
              </div>
              <button
                onClick={() => setCapturing(true)}
                style={{
                  padding: '9px 20px', borderRadius: 7, border: 'none',
                  background: '#F97316', color: '#0a0a0a', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer', letterSpacing: '-0.01em',
                }}
              >
                Start 3D Capture
              </button>
            </div>
          ) : (
            // No live worker — file drop fallback
            <label
              onDragOver={e => { e.preventDefault(); setDragOver(true) }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]) }}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                padding: '18px 12px', borderRadius: 8, cursor: submitting ? 'default' : 'pointer',
                border: `1px dashed ${dragOver ? '#F97316' : 'rgba(255,255,255,0.1)'}`,
                background: dragOver ? 'rgba(249,115,22,0.06)' : 'transparent',
                transition: 'border-color 0.15s, background 0.15s',
              }}
            >
              <input type="file" accept="video/*,image/*" style={{ display: 'none' }}
                onChange={e => handleFile(e.target.files[0])} disabled={submitting} />
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={dragOver ? '#F97316' : '#475569'} strokeWidth="1.5">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="17 8 12 3 7 8"/>
                <line x1="12" y1="3" x2="12" y2="15"/>
              </svg>
              <span style={{ fontSize: 11, color: dragOver ? '#F97316' : '#475569', textAlign: 'center', lineHeight: 1.4 }}>
                {submitting ? 'Uploading…' : 'Drop video or image\nto generate 3D world'}
              </span>
            </label>
          )
        )}

        {/* ── Capture flow ── */}
        {!worldJob && capturing && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {/* Current angle instruction */}
            {!allCaptured && (
              <div style={{
                background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)',
                borderRadius: 7, padding: '8px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#F97316', letterSpacing: '0.1em', marginBottom: 3 }}>
                  ANGLE {step + 1} OF 6
                </div>
                <div style={{ fontSize: 12, color: '#f1f5f9', fontWeight: 600 }}>
                  {CAPTURE_ANGLES[step]}
                </div>
              </div>
            )}

            {/* Frame thumbnail strip */}
            <div style={{ display: 'flex', gap: 4 }}>
              {capturedFrames.map((frame, i) => (
                <img
                  key={i}
                  src={frame}
                  alt={`Frame ${i + 1}`}
                  style={{
                    width: 44, height: 33, borderRadius: 4, objectFit: 'cover',
                    border: '1px solid rgba(34,197,94,0.35)', flexShrink: 0,
                  }}
                />
              ))}
              {Array.from({ length: Math.max(0, 6 - step) }).map((_, i) => (
                <div key={`ph-${i}`} style={{
                  width: 44, height: 33, borderRadius: 4, flexShrink: 0,
                  border: '1px dashed rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.02)',
                }} />
              ))}
            </div>

            {/* Action button */}
            {!allCaptured ? (
              <button
                onClick={handleCapture}
                style={{
                  padding: '9px 0', borderRadius: 7,
                  border: '1px solid rgba(249,115,22,0.3)',
                  background: 'rgba(249,115,22,0.12)', color: '#F97316',
                  fontSize: 12, fontWeight: 700, cursor: 'pointer',
                }}
              >
                Capture
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={submitting}
                style={{
                  padding: '9px 0', borderRadius: 7, border: 'none',
                  background: submitting ? '#374151' : '#F97316',
                  color: submitting ? '#9ca3af' : '#0a0a0a',
                  fontSize: 12, fontWeight: 700, cursor: submitting ? 'default' : 'pointer',
                }}
              >
                {submitting ? 'Submitting…' : 'Generate 3D World'}
              </button>
            )}
          </div>
        )}

        {/* ── Generating ── */}
        {worldJob && status === 'generating' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', background: '#F97316', flexShrink: 0,
                animation: 'pulse 1.5s infinite',
              }} />
              <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>Generating…</span>
            </div>
            {worldJob.progress && (
              <p style={{ margin: 0, fontSize: 11, color: '#475569', lineHeight: 1.4 }}>
                {worldJob.progress}
              </p>
            )}
            <p style={{ margin: 0, fontSize: 10, color: '#334155', fontFamily: 'var(--mono)' }}>
              World Labs is building your 3D site model. This typically takes 5–10 minutes.
            </p>
          </div>
        )}

        {/* ── Done ── */}
        {worldJob && status === 'done' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <span style={{ fontSize: 11, color: '#22c55e', fontWeight: 600, fontFamily: 'var(--mono)' }}>
              ✓ 3D world ready
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={() => window.open(worldJob.marble_url, '_blank')}
                style={{
                  flex: 1, padding: '8px 10px', borderRadius: 7, border: 'none',
                  background: '#22c55e', color: '#0a0f0a', fontSize: 12, fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                Open 3D World
              </button>
              <button
                onClick={() => window.open(worldJob.worldvr_url, '_blank')}
                title="Open in WebVR"
                style={{
                  padding: '8px 10px', borderRadius: 7,
                  border: '1px solid rgba(34,197,94,0.3)',
                  background: 'rgba(34,197,94,0.08)', color: '#22c55e',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer',
                }}
              >
                VR
              </button>
            </div>
          </div>
        )}

        {/* ── Error ── */}
        {worldJob && status === 'error' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11, color: '#ef4444', fontWeight: 600 }}>Generation failed</span>
            <p style={{ margin: 0, fontSize: 11, color: '#64748b', lineHeight: 1.4 }}>
              {worldJob.error || 'Unknown error'}
            </p>
            <button onClick={onReset} style={{
              padding: '6px 12px', borderRadius: 6, border: '1px solid rgba(239,68,68,0.3)',
              background: 'rgba(239,68,68,0.08)', color: '#ef4444', fontSize: 12,
              cursor: 'pointer', alignSelf: 'flex-start',
            }}>
              Try again
            </button>
          </div>
        )}

      </div>
    </div>
  )
}

function WorkerRow({ worker, isLive, selected, onClick }) {
  const tradeColor = TRADE_COLORS[worker.trade] || '#64748B'
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '7px 10px',
        background: selected ? 'rgba(255,255,255,0.04)' : 'transparent',
        border: selected ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
        borderRadius: 8, cursor: 'pointer',
        textAlign: 'left', transition: 'background 0.12s, border-color 0.12s',
        marginBottom: 2,
      }}
      onMouseOver={e => { if (!selected) e.currentTarget.style.background = 'rgba(255,255,255,0.03)' }}
      onMouseOut={e =>  { if (!selected) e.currentTarget.style.background = 'transparent' }}
    >
      {/* Live indicator dot */}
      <div style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: isLive ? '#22C55E' : 'rgba(255,255,255,0.1)',
        boxShadow: isLive ? '0 0 8px rgba(34,197,94,0.6)' : 'none',
        transition: 'background 0.2s',
      }} />

      {/* Name — slightly darker than Teams for Live list */}
      <span style={{
        fontSize: 13, fontWeight: selected ? 600 : 400,
        color: '#cbd5e1',
        flex: 1, letterSpacing: '-0.01em',
        transition: 'color 0.12s',
      }}>
        {worker.name}
      </span>

      {/* Trade label — only if live (to reduce noise) */}
      {isLive ? (
        <span style={{
          fontSize: 9, fontFamily: 'var(--mono)', fontWeight: 700,
          color: '#22C55E', letterSpacing: '0.1em',
        }}>
          LIVE
        </span>
      ) : (
        <span style={{
          fontSize: 9, fontFamily: 'var(--mono)',
          color: `${tradeColor}99`,
          letterSpacing: '0.02em',
        }}>
          {worker.trade}
        </span>
      )}
    </button>
  )
}

function TeamSection({ team, workers, liveWorkerStreams, selectedWorkerIdentity, onSelectWorker }) {
  const color = TEAM_COLORS[team.color_index % 8]
  const liveCount = workers.filter(w => getLiveIdentityForWorker(w, liveWorkerStreams)).length

  return (
    <div style={{ marginBottom: 18 }}>
      {/* Section header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        marginBottom: 4, paddingLeft: 2,
      }}>
        <div style={{
          width: 3, height: 14, borderRadius: 2,
          background: color, flexShrink: 0,
        }} />
        <span style={{
          fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
          color: '#64748b', letterSpacing: '0.08em', textTransform: 'uppercase', flex: 1,
        }}>
          {team.name}
        </span>
        {liveCount > 0 && (
          <span style={{
            fontSize: 9, fontFamily: 'var(--mono)', color: '#22C55E',
            background: 'rgba(34,197,94,0.1)', padding: '1px 6px', borderRadius: 3,
          }}>
            {liveCount} live
          </span>
        )}
      </div>

      {team.task && (
        <div style={{
          fontSize: 10, color: '#334155', paddingLeft: 11,
          marginBottom: 6, fontStyle: 'italic',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {team.task}
        </div>
      )}

      {workers.length === 0 ? (
        <div style={{ fontSize: 11, color: '#334155', padding: '6px 10px' }}>No workers assigned</div>
      ) : (
        workers.map(w => {
          const liveId = getLiveIdentityForWorker(w, liveWorkerStreams)
          return (
            <WorkerRow
              key={w.id}
              worker={w}
              isLive={!!liveId}
              selected={liveId === selectedWorkerIdentity}
              onClick={() => onSelectWorker(liveId ?? null)}
            />
          )
        })
      )}
    </div>
  )
}

export default function LiveMode() {
  const [feeds, setFeeds] = useState([])
  const [selectedFeed, setSelectedFeed] = useState(null)
  const [sites, setSites] = useState([])
  const [usingMock, setUsingMock] = useState(false)
  const [livekitAvailable, setLivekitAvailable] = useState(false)
  const [liveWorkerStreams, setLiveWorkerStreams] = useState(new Map())
  const [selectedWorkerIdentity, setSelectedWorkerIdentity] = useState(null)
  const [feedNoteCounts, setFeedNoteCounts] = useState({})
  const [feedNoteSnippets, setFeedNoteSnippets] = useState({})
  const [workerFeedMap, setWorkerFeedMap] = useState({})

  const [tab, setTab] = useState('all')
  const [selectedSite, setSelectedSite] = useState(null)
  const [siteWorkers, setSiteWorkers] = useState([])
  const [siteTeams, setSiteTeams] = useState([])
  const [worldJob, setWorldJob] = useState(null)
  const [worldPolling, setWorldPolling] = useState(false)

  const today = todayISO()

  useEffect(() => {
    fetchFeeds()
      .then(data => { setFeeds(data); if (data.length && !selectedFeed) setSelectedFeed(data[0].id) })
      .catch(() => { setUsingMock(true); setFeeds(MOCK_FEEDS); setSelectedFeed(MOCK_FEEDS[0].id) })

    fetchSites()
      .then(data => { setSites(data); if (data.length) setSelectedSite(data[0].id) })
      .catch(() => { setSites(MOCK_SITES); setSelectedSite(MOCK_SITES[0].id) })

    fetch('/api/streaming/livekit/rooms', { signal: AbortSignal.timeout(2000) })
      .then(r => setLivekitAvailable(r.ok))
      .catch(() => setLivekitAvailable(false))
  }, [])

  useEffect(() => {
    if (!selectedSite) return
    let cancelled = false
    fetchLiveWorkers(selectedSite)
      .then(list => {
        if (cancelled) return
        const map = {}
        list.forEach(w => {
          if (w?.identity && w?.feed_id) map[w.identity] = w.feed_id
        })
        setWorkerFeedMap(map)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedSite])

  useEffect(() => {
    if (!selectedSite) return
    let cancelled = false
    fetchSiteNotes(selectedSite)
      .then(notes => {
        if (cancelled) return
        // Compute per-feed counts/snippets for the Live Now cards
        const counts = {}
        const snippets = {}
        for (const n of notes) {
          if (!n.feed_id) continue
          counts[n.feed_id] = (counts[n.feed_id] || 0) + 1
          if (!snippets[n.feed_id]) snippets[n.feed_id] = n.transcript
        }
        setFeedNoteCounts(counts)
        setFeedNoteSnippets(snippets)
      })
      .catch(() => {})
    return () => { cancelled = true }
  }, [selectedSite])

  useEffect(() => {
    if (!selectedSite) return
    fetchSiteWorkers(selectedSite)
      .then(setSiteWorkers)
      .catch(() => setSiteWorkers(MOCK_WORKERS[selectedSite] || []))
    fetchTeams(selectedSite, today)
      .then(setSiteTeams)
      .catch(() => setSiteTeams([]))
  }, [selectedSite])

  // Poll world generation status every 15s
  useEffect(() => {
    if (!worldPolling || !worldJob) return
    const id = setInterval(async () => {
      try {
        const updated = await fetchWorldStatus(worldJob.id)
        setWorldJob(updated)
        if (updated.status === 'done' || updated.status === 'error') setWorldPolling(false)
      } catch { setWorldPolling(false) }
    }, 15_000)
    return () => clearInterval(id)
  }, [worldPolling, worldJob?.id])

  const handleSiteWorldUpload = async (file) => {
    const fd = new FormData()
    fd.append('site_id', selectedSite || 's1')
    fd.append('file', file)
    fd.append('input_type', file.type.startsWith('image/') ? 'image' : 'video')
    fd.append('display_name', `${site?.name || 'Site'} — ${new Date().toLocaleDateString()}`)
    try {
      const job = await submitSiteWorld(fd)
      setWorldJob(job)
      setWorldPolling(true)
    } catch (e) {
      setWorldJob({ id: 'err', status: 'error', error: e.message || 'Submission failed' })
    }
  }

  const handleSubmitFrames = async (frames) => {
    const stream = selectedWorkerIdentity ? liveWorkerStreams.get(selectedWorkerIdentity) : null
    const wName = stream?.participant?.name || selectedWorkerIdentity || 'Worker'
    const displayName = `${site?.name || 'Site'} — ${wName} — ${new Date().toLocaleDateString()}`
    try {
      const job = await submitWorldFromFrames(selectedSite || 's1', frames, selectedWorkerIdentity, displayName)
      setWorldJob(job)
      setWorldPolling(true)
    } catch (e) {
      setWorldJob({ id: 'err', status: 'error', error: e.message || 'Submission failed' })
    }
  }

  const feed = feeds.find(f => f.id === selectedFeed)
  const site = feed ? sites.find(s => s.id === feed.site_id) || null : null
  const assignedIds = new Set(siteTeams.flatMap(t => t.worker_ids))
  const unassignedWorkers = siteWorkers.filter(w => !assignedIds.has(w.id))

  const feedIdForParticipant = (participant) => {
    const identity = participant?.identity
    if (identity && workerFeedMap[identity]) return workerFeedMap[identity]
    const name = participant?.name
    if (!name) return null
    const byWorker = feeds.find(f => (f.worker || '') === name)
    return byWorker?.id || null
  }

  const handleNoteSaved = (feedId, transcript = '') => {
    if (!feedId) return
    setFeedNoteCounts(prev => ({ ...prev, [feedId]: (prev[feedId] || 0) + 1 }))
    if (transcript) {
      setFeedNoteSnippets(prev => ({ ...prev, [feedId]: transcript }))
    }
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>

      {/* ── Main feed ──────────────────────────────────────────────────────── */}
      <div>
        {livekitAvailable ? (
          <>
            <LiveStreamView
              site={site}
              selectedFeed={feed}
              onWorkerStreamsChange={setLiveWorkerStreams}
              selectedWorkerIdentity={selectedWorkerIdentity}
              onSelectWorker={setSelectedWorkerIdentity}
              onNoteSaved={handleNoteSaved}
            />
            <SiteScanPanel
              worldJob={worldJob}
              liveWorkerStream={selectedWorkerIdentity ? liveWorkerStreams.get(selectedWorkerIdentity) : null}
              workerName={selectedWorkerIdentity ? liveWorkerStreams.get(selectedWorkerIdentity)?.participant?.name : null}
              selectedWorkerIdentity={selectedWorkerIdentity}
              onSubmitFrames={handleSubmitFrames}
              onUpload={handleSiteWorldUpload}
              onReset={() => { setWorldJob(null); setWorldPolling(false) }}
            />
          </>
        ) : (
          <>
            {/* Video placeholder */}
            <div style={{
              aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden',
              background: '#080B10',
              border: '1px solid rgba(255,255,255,0.06)',
              position: 'relative', marginBottom: 12,
            }}>
              {/* Subtle dot grid */}
              <div style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                backgroundSize: '24px 24px',
              }} />

              {/* Center content */}
              <div style={{
                position: 'absolute', inset: 0,
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8,
              }}>
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  border: '1px solid rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <rect x="9" y="2" width="6" height="12" rx="3" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5"/>
                    <path d="M5 10a7 7 0 0 0 14 0" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                    <line x1="12" y1="19" x2="12" y2="22" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                </div>
                <div style={{ fontSize: 12, color: '#334155', fontFamily: 'var(--mono)' }}>
                  {selectedWorkerIdentity ? selectedWorkerIdentity : 'No stream selected'}
                </div>
              </div>

              {/* Top-left badges */}
              <div style={{
                position: 'absolute', top: 12, left: 14,
                display: 'flex', alignItems: 'center', gap: 6,
              }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite' }} />
                <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', color: '#FCA5A5', letterSpacing: '0.1em' }}>LIVE</span>
              </div>

              {/* Top-right status */}
              <div style={{ position: 'absolute', top: 12, right: 14 }}>
                <span style={{
                  fontSize: 9, fontFamily: 'var(--mono)', color: '#334155',
                  background: 'rgba(0,0,0,0.4)', padding: '3px 8px', borderRadius: 4,
                  letterSpacing: '0.06em',
                }}>
                  {usingMock ? 'DEMO' : 'OFFLINE'}
                </span>
              </div>
            </div>

            {/* Icon control bar (Snapshot + Flag; mic disabled when LiveKit off) */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              marginBottom: 12,
            }}>
              <button
                disabled
                title="Connect to enable"
                style={{
                  width: 44, height: 44, borderRadius: 10, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.04)', cursor: 'not-allowed',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#475569', opacity: 0.6,
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8" />
                </svg>
              </button>
              <button
                title="Snapshot"
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#94a3b8',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
              </button>
              <button
                title="Flag issue"
                style={{
                  width: 44, height: 44, borderRadius: 10,
                  border: '1px solid rgba(239,68,68,0.25)',
                  background: 'rgba(239,68,68,0.12)', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#FCA5A5',
                }}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
                  <line x1="4" y1="22" x2="4" y2="15" />
                </svg>
              </button>
            </div>
            <SiteScanPanel
              worldJob={worldJob}
              liveWorkerStream={selectedWorkerIdentity ? liveWorkerStreams.get(selectedWorkerIdentity) : null}
              workerName={selectedWorkerIdentity ? liveWorkerStreams.get(selectedWorkerIdentity)?.participant?.name : null}
              selectedWorkerIdentity={selectedWorkerIdentity}
              onSubmitFrames={handleSubmitFrames}
              onUpload={handleSiteWorldUpload}
              onReset={() => { setWorldJob(null); setWorldPolling(false) }}
            />
          </>
        )}
      </div>

      {/* ── Sidebar ────────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Tab bar */}
        <div style={{
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 14,
        }}>
          {[['all', 'All'], ['teams', 'Teams']].map(([id, label]) => {
            const active = tab === id
            return (
              <button
                key={id}
                onClick={() => setTab(id)}
                style={{
                  padding: '10px 14px 12px',
                  marginBottom: -1,
                  border: 'none', background: 'none',
                  cursor: 'pointer', position: 'relative',
                  font: 'inherit', fontSize: 12,
                  fontWeight: active ? 600 : 400,
                  color: active ? '#f1f5f9' : '#475569',
                  transition: 'color 0.15s',
                  letterSpacing: active ? '-0.01em' : '0',
                }}
              >
                {label}
                {active && (
                  <span style={{
                    position: 'absolute', bottom: 0,
                    left: '50%', transform: 'translateX(-50%)',
                    width: 'calc(100% - 16px)', maxWidth: 48,
                    height: 2, background: '#D97706', borderRadius: 1,
                  }} />
                )}
              </button>
            )
          })}
          <select
            className="select-dark"
            value={selectedSite || ''}
            onChange={e => setSelectedSite(e.target.value)}
            style={{
              marginLeft: 'auto',
              border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 6,
              padding: '6px 8px',
              cursor: 'pointer',
              fontSize: 11,
              fontFamily: 'inherit',
              maxWidth: 120,
            }}
          >
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Live Now strip */}
        {liveWorkerStreams.size > 0 && (
          <div style={{ marginBottom: 18 }}>
            <div style={{
              fontSize: 9, fontFamily: 'var(--mono)', color: '#22C55E',
              letterSpacing: '0.12em', marginBottom: 8,
            }}>
              LIVE NOW  ·  {liveWorkerStreams.size}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 5 }}>
              {Array.from(liveWorkerStreams.entries()).map(([identity, stream]) => (
                <LiveWorkerFeedCard
                  key={identity}
                  identity={identity}
                  participant={stream.participant}
                  videoTrack={stream.videoTrack}
                  selected={selectedWorkerIdentity === identity}
                  onClick={() => setSelectedWorkerIdentity(identity)}
                  noteCount={feedNoteCounts[feedIdForParticipant(stream.participant)] || 0}
                  noteSnippet={feedNoteSnippets[feedIdForParticipant(stream.participant)] || ''}
                />
              ))}
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.04)', margin: '14px 0 0' }} />
          </div>
        )}

        {/* Worker list */}
        <div style={{ overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 220px)' }}>
          {tab === 'all' ? (
            siteWorkers.length === 0 ? (
              <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: '48px 0' }}>
                No workers
              </div>
            ) : (
              siteWorkers.map(w => {
                const liveId = getLiveIdentityForWorker(w, liveWorkerStreams)
                return (
                  <WorkerRow
                    key={w.id}
                    worker={w}
                    isLive={!!liveId}
                    selected={liveId === selectedWorkerIdentity}
                    onClick={() => setSelectedWorkerIdentity(liveId ?? null)}
                  />
                )
              })
            )
          ) : (
            siteTeams.length === 0 ? (
              <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: '48px 0' }}>
                No teams planned today
              </div>
            ) : (
              <>
                {siteTeams.map(team => (
                  <TeamSection
                    key={team.id}
                    team={team}
                    workers={team.worker_ids.map(id => siteWorkers.find(w => w.id === id)).filter(Boolean)}
                    liveWorkerStreams={liveWorkerStreams}
                    selectedWorkerIdentity={selectedWorkerIdentity}
                    onSelectWorker={setSelectedWorkerIdentity}
                  />
                ))}
                {unassignedWorkers.length > 0 && (
                  <div style={{ marginBottom: 18 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, paddingLeft: 2 }}>
                      <div style={{ width: 3, height: 14, borderRadius: 2, background: '#1e293b', flexShrink: 0 }} />
                      <span style={{
                        fontSize: 10, fontWeight: 600, fontFamily: 'var(--mono)',
                        color: '#334155', letterSpacing: '0.08em', textTransform: 'uppercase',
                      }}>
                        Unassigned
                      </span>
                    </div>
                    {unassignedWorkers.map(w => {
                      const liveId = getLiveIdentityForWorker(w, liveWorkerStreams)
                      return (
                        <WorkerRow
                          key={w.id}
                          worker={w}
                          isLive={!!liveId}
                          selected={liveId === selectedWorkerIdentity}
                          onClick={() => setSelectedWorkerIdentity(liveId ?? null)}
                        />
                      )
                    })}
                  </div>
                )}
              </>
            )
          )}
        </div>
      </div>
    </div>
  )
}
