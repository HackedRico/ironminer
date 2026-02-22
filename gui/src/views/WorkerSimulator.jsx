import { useState, useRef, useEffect } from 'react'
import {
  Room,
  RoomEvent,
  ConnectionState,
  Track,
  createLocalVideoTrack,
  createLocalAudioTrack,
} from 'livekit-client'
import { fetchWorkerToken } from '../api/streaming'
import { fetchSites } from '../api/sites'
import { fetchSiteWorkers } from '../api/teams'
import { MOCK_SITES, MOCK_WORKERS } from '../utils/mockData'

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880'

function getLiveKitWsUrl(apiUrl) {
  if (typeof window === 'undefined') return apiUrl || LIVEKIT_URL
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  return isLocal ? 'ws://localhost:7880' : (apiUrl || LIVEKIT_URL)
}

const TRADE_COLORS = {
  Concrete: '#3B82F6', Electrical: '#EAB308', Plumbing: '#10B981',
  Framing: '#F97316', HVAC: '#8B5CF6', 'Crane Ops': '#EC4899',
  Delivery: '#64748B', Staging: '#06B6D4', 'Steel Erection': '#EF4444',
  Cladding: '#84CC16',
}

const inputStyle = {
  width: '100%', padding: '12px 14px', borderRadius: 10,
  border: '1px solid rgba(255,255,255,0.08)',
  background: 'rgba(255,255,255,0.04)',
  color: '#E2E8F0', fontSize: 15, fontFamily: 'inherit',
  outline: 'none', boxSizing: 'border-box',
  colorScheme: 'dark', cursor: 'pointer',
}

export default function WorkerSimulator() {
  const [sites, setSites] = useState([])
  const [siteId, setSiteId] = useState('')
  const [siteWorkers, setSiteWorkers] = useState([])
  const [selectedWorkerId, setSelectedWorkerId] = useState('')

  const [status, setStatus] = useState('') // '' | 'connecting' | 'connected' | 'error'
  const [error, setError] = useState(null)

  const videoRef = useRef(null)
  const managerAudioRef = useRef(null)
  const roomRef = useRef(null)
  const localVideoTrackRef = useRef(null)

  // Load sites
  useEffect(() => {
    fetchSites()
      .then(data => {
        setSites(data)
        if (data.length) setSiteId(data[0].id)
      })
      .catch(() => {
        setSites(MOCK_SITES)
        setSiteId(MOCK_SITES[0].id)
      })
  }, [])

  // Load workers when site changes
  useEffect(() => {
    if (!siteId) return
    setSelectedWorkerId('')
    fetchSiteWorkers(siteId)
      .then(workers => {
        setSiteWorkers(workers)
        if (workers.length) setSelectedWorkerId(workers[0].id)
      })
      .catch(() => {
        const mock = MOCK_WORKERS[siteId] || []
        setSiteWorkers(mock)
        if (mock.length) setSelectedWorkerId(mock[0].id)
      })
  }, [siteId])

  // Derived from selection — no manual input needed
  const selectedWorker = siteWorkers.find(w => w.id === selectedWorkerId)
  const roomName = `site-${siteId}`

  // Group workers by trade for the <optgroup> select
  const byTrade = siteWorkers.reduce((acc, w) => {
    if (!acc[w.trade]) acc[w.trade] = []
    acc[w.trade].push(w)
    return acc
  }, {})

  const connect = async () => {
    if (!selectedWorkerId || !siteId) return
    setError(null)
    setStatus('connecting')
    try {
      const [videoTrack, audioTrack] = await Promise.all([
        createLocalVideoTrack(),
        createLocalAudioTrack(),
      ])
      localVideoTrackRef.current = videoTrack

      const { token, livekit_url } = await fetchWorkerToken(roomName, selectedWorkerId, selectedWorker?.name || selectedWorkerId)
      const wsTarget = getLiveKitWsUrl(livekit_url)

      const room = new Room({ adaptiveStream: true })
      roomRef.current = room

      room.on(RoomEvent.ConnectionStateChanged, (state) => {
        if (state === ConnectionState.Disconnected) {
          setStatus('')
          localVideoTrackRef.current = null
        }
      })

      await room.connect(wsTarget, token)
      await room.localParticipant.publishTrack(videoTrack, { name: 'camera', source: Track.Source.Camera })
      await room.localParticipant.publishTrack(audioTrack, { name: 'microphone', source: Track.Source.Microphone })

      setStatus('connected')
    } catch (err) {
      if (roomRef.current) {
        roomRef.current.disconnect()
        roomRef.current = null
      }
      localVideoTrackRef.current = null
      setStatus('error')
      setError(err.message || 'Failed to connect. Allow camera and microphone when prompted.')
    }
  }

  const disconnect = () => {
    if (roomRef.current) {
      roomRef.current.disconnect()
      roomRef.current = null
    }
    localVideoTrackRef.current = null
    setStatus('')
    setError(null)
  }

  // Attach local video to preview
  useEffect(() => {
    const track = localVideoTrackRef.current
    const el = videoRef.current
    if (!track || !el || status !== 'connected') return
    track.attach(el)
    return () => { track.detach(el) }
  }, [status])

  // Subscribe to remote audio (manager PTT)
  useEffect(() => {
    const room = roomRef.current
    const el = managerAudioRef.current
    if (!room || !el || status !== 'connected') return

    const attachAudio = (track) => {
      if (track.kind === Track.Kind.Audio) {
        track.attach(el)
        el.play().catch(() => {})
      }
    }

    const onTrackSubscribed = (track, _pub, participant) => {
      if (participant.identity !== room.localParticipant.identity) attachAudio(track)
    }

    room.remoteParticipants.forEach(p => {
      p.trackPublications.forEach(pub => {
        if (pub.track && pub.kind === 'audio') attachAudio(pub.track)
      })
    })

    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed)
    return () => room.off(RoomEvent.TrackSubscribed, onTrackSubscribed)
  }, [status])

  useEffect(() => () => roomRef.current?.disconnect(), [])

  const tradeColor = TRADE_COLORS[selectedWorker?.trade] || '#64748B'

  // ── Connected view ───────────────────────────────────────────────────────
  if (status === 'connected') {
    return (
      <div style={{ minHeight: '100vh', background: '#090C12', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--body)', color: '#E2E8F0' }}>
        <div style={{ width: '100%', maxWidth: 440 }}>
          {/* Worker identity */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E', boxShadow: '0 0 8px #22C55E' }} />
            <span style={{ fontSize: 16, fontWeight: 700 }}>{selectedWorker?.name}</span>
            <span style={{
              fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
              color: tradeColor, background: `${tradeColor}20`,
              padding: '3px 8px', borderRadius: 4, letterSpacing: '0.05em',
            }}>
              {selectedWorker?.trade?.toUpperCase()}
            </span>
            <span style={{ marginLeft: 'auto', fontSize: 11, color: '#475569', fontFamily: 'var(--mono)' }}>{roomName}</span>
          </div>

          {/* Camera preview */}
          <div style={{ aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden', background: '#0C0F14', marginBottom: 16, position: 'relative', border: '1.5px solid rgba(34,197,94,0.2)' }}>
            <video ref={videoRef} autoPlay muted playsInline style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            <div style={{ position: 'absolute', top: 10, left: 10, display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(0,0,0,0.7)', padding: '3px 8px', borderRadius: 5 }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite' }} />
              <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)', color: '#FCA5A5', letterSpacing: '0.1em' }}>LIVE</span>
            </div>
            <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '8px 12px', background: 'linear-gradient(transparent, rgba(0,0,0,0.85))', fontSize: 12, color: '#64748B' }}>
              Streaming to dashboard — manager can see this feed
            </div>
          </div>

          <audio ref={managerAudioRef} autoPlay playsInline style={{ display: 'none' }} />

          <button
            type="button"
            onClick={() => managerAudioRef.current?.play().catch(() => {})}
            style={{ width: '100%', marginBottom: 12, padding: '11px', borderRadius: 10, border: '1px solid rgba(255,255,255,0.07)', background: 'rgba(255,255,255,0.03)', color: '#94A3B8', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Tap to hear manager
          </button>

          <button
            onClick={disconnect}
            style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', background: 'rgba(239,68,68,0.07)', color: '#FCA5A5', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Disconnect
          </button>
        </div>
      </div>
    )
  }

  // ── Setup form ───────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#090C12', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'var(--body)', color: '#E2E8F0' }}>
      <div style={{ width: '100%', maxWidth: 400 }}>
        <div style={{ marginBottom: 32 }}>
          <div style={{ fontSize: 11, fontFamily: 'var(--mono)', color: '#F97316', letterSpacing: '0.12em', marginBottom: 8 }}>IRONSITE</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>Worker Stream</h1>
          <p style={{ fontSize: 13, color: '#475569', marginTop: 6, marginBottom: 0 }}>
            Select your site and name, then connect to go live.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Site */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Site</div>
            <select
              value={siteId}
              onChange={e => setSiteId(e.target.value)}
              style={inputStyle}
            >
              {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>

          {/* Worker */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#475569', marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Who are you?</div>
            <select
              value={selectedWorkerId}
              onChange={e => setSelectedWorkerId(e.target.value)}
              style={inputStyle}
              disabled={siteWorkers.length === 0}
            >
              {Object.entries(byTrade).map(([trade, workers]) => (
                <optgroup key={trade} label={trade}>
                  {workers.map(w => (
                    <option key={w.id} value={w.id}>{w.name}</option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Selected worker preview */}
          {selectedWorker && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div style={{ width: 7, height: 7, borderRadius: '50%', background: 'rgba(255,255,255,0.15)', flexShrink: 0 }} />
              <span style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{selectedWorker.name}</span>
              <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', color: tradeColor, background: `${tradeColor}18`, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.05em' }}>
                {selectedWorker.trade.toUpperCase()}
              </span>
              <span style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--mono)' }}>{roomName}</span>
            </div>
          )}

          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.18)', fontSize: 13, color: '#FCA5A5' }}>
              {error}
            </div>
          )}

          <button
            onClick={connect}
            disabled={!selectedWorkerId || status === 'connecting'}
            style={{
              padding: '14px', borderRadius: 10, border: 'none',
              background: (!selectedWorkerId || status === 'connecting') ? 'rgba(34,197,94,0.3)' : 'linear-gradient(135deg, #22C55E, #16A34A)',
              color: '#fff', fontSize: 15, fontWeight: 700,
              cursor: (!selectedWorkerId || status === 'connecting') ? 'not-allowed' : 'pointer',
              marginTop: 4, fontFamily: 'inherit',
              boxShadow: selectedWorkerId ? '0 4px 20px rgba(34,197,94,0.2)' : 'none',
              transition: 'box-shadow 0.2s',
            }}
          >
            {status === 'connecting' ? 'Connecting…' : 'Connect & go live'}
          </button>
        </div>

        <div style={{ marginTop: 32, padding: '14px 16px', borderRadius: 12, background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#FB923C', marginBottom: 8, fontFamily: 'var(--mono)', letterSpacing: '0.1em' }}>
            CONNECT FROM YOUR PHONE
          </div>
          <ol style={{ fontSize: 12, color: '#475569', lineHeight: 1.8, margin: 0, paddingLeft: 18 }}>
            <li>Phone and computer on the same Wi-Fi.</li>
            <li>Find your computer IP (e.g. 192.168.1.100).</li>
            <li>In <code style={{ color: '#94A3B8' }}>.env</code> add <code style={{ color: '#94A3B8' }}>LIVEKIT_PUBLIC_WS_URL=ws://YOUR_IP:7880</code>, restart backend.</li>
            <li>On phone open <code style={{ color: '#94A3B8' }}>http://YOUR_IP:5173/worker</code>, select your name, connect.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
