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

const LIVEKIT_URL = import.meta.env.VITE_LIVEKIT_URL || 'ws://localhost:7880'

/** Use localhost for LiveKit when we're on localhost (web-to-web dev); else use API's URL (e.g. phone). */
function getLiveKitWsUrl(apiUrl) {
  if (typeof window === 'undefined') return apiUrl || LIVEKIT_URL
  const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
  return isLocal ? 'ws://localhost:7880' : (apiUrl || LIVEKIT_URL)
}

/**
 * Worker Simulator — join a LiveKit room as a worker and publish camera + mic.
 * Open this page in a second tab/window; then in the main app Live tab, connect
 * to the same site room to see this worker's video.
 */
export default function WorkerSimulator() {
  const [roomName, setRoomName] = useState('site-s1')
  const [identity, setIdentity] = useState('worker1')
  const [displayName, setDisplayName] = useState('Test Worker')
  const [status, setStatus] = useState('') // '' | 'connecting' | 'connected' | 'error'
  const [error, setError] = useState(null)
  const videoRef = useRef(null)
  const roomRef = useRef(null)
  const localVideoTrackRef = useRef(null)

  const connect = async () => {
    setError(null)
    setStatus('connecting')

    try {
      // 1. Get camera and mic first (browser will prompt) — we keep a ref to video for preview
      const [videoTrack, audioTrack] = await Promise.all([
        createLocalVideoTrack(),
        createLocalAudioTrack(),
      ])
      localVideoTrackRef.current = videoTrack

      const { token, livekit_url } = await fetchWorkerToken(roomName, identity, displayName)
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

      // 2. Publish the tracks we already created
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
      setError(err.message || 'Failed to connect. Allow camera and microphone when the browser prompts.')
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

  // Attach our local video track to the preview element (we own the track ref)
  useEffect(() => {
    const track = localVideoTrackRef.current
    const el = videoRef.current
    if (!track || !el || status !== 'connected') return
    track.attach(el)
    return () => { track.detach(el) }
  }, [status])

  // Cleanup on unmount
  useEffect(() => {
    return () => roomRef.current?.disconnect()
  }, [])

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--slate-950)',
      padding: 24,
      fontFamily: 'var(--body)',
      color: '#E2E8F0',
    }}>
      <div style={{ maxWidth: 480, margin: '0 auto' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>
          Worker Simulator
        </h1>
        <p style={{ fontSize: 13, color: '#94A3B8', marginBottom: 24 }}>
          Join as a worker with camera + mic. Then open the main app → Live tab → connect to the same site room to see this feed.
        </p>

        {!status || status === 'error' ? (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>
                Room name (must match site, e.g. site-s1)
              </label>
              <input
                type="text"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                placeholder="site-s1"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#E2E8F0',
                  fontSize: 14,
                }}
              />
              <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>Identity</label>
              <input
                type="text"
                value={identity}
                onChange={(e) => setIdentity(e.target.value)}
                placeholder="worker1"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#E2E8F0',
                  fontSize: 14,
                }}
              />
              <label style={{ fontSize: 12, fontWeight: 600, color: '#94A3B8' }}>Display name</label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Test Worker"
                style={{
                  padding: '10px 14px',
                  borderRadius: 8,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.05)',
                  color: '#E2E8F0',
                  fontSize: 14,
                }}
              />
            </div>

            {error && (
              <div style={{
                padding: '10px 14px',
                borderRadius: 8,
                marginBottom: 16,
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.2)',
                fontSize: 13,
                color: '#FCA5A5',
              }}>
                {error}
              </div>
            )}

            <button
              onClick={connect}
              disabled={status === 'connecting'}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: 8,
                border: 'none',
                background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: status === 'connecting' ? 'wait' : 'pointer',
              }}
            >
              {status === 'connecting' ? 'Connecting…' : 'Connect & share camera'}
            </button>
          </>
        ) : (
          <>
            <div style={{
              aspectRatio: '16/9',
              borderRadius: 12,
              overflow: 'hidden',
              background: '#0C0F14',
              marginBottom: 16,
              position: 'relative',
            }}>
              <video
                ref={videoRef}
                autoPlay
                muted
                playsInline
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <div style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                padding: '8px 12px',
                background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
                fontSize: 12,
                color: '#94A3B8',
              }}>
                Your camera — visible in dashboard when manager connects to {roomName}
              </div>
            </div>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              marginBottom: 16,
              padding: '10px 14px',
              borderRadius: 8,
              background: 'rgba(34,197,94,0.1)',
              border: '1px solid rgba(34,197,94,0.2)',
            }}>
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#22C55E' }} />
              <span style={{ fontSize: 13, color: '#86EFAC' }}>Connected as worker</span>
            </div>
            <button
              onClick={disconnect}
              style={{
                width: '100%',
                padding: '12px 20px',
                borderRadius: 8,
                border: '1px solid rgba(239,68,68,0.2)',
                background: 'rgba(239,68,68,0.08)',
                color: '#FCA5A5',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Disconnect
            </button>
          </>
        )}

        <p style={{ marginTop: 24, fontSize: 12, color: '#64748B' }}>
          Tip: Use the same room as in the dashboard. For "Riverside Tower" (site s1) use room For “Riverside Tower” (site s1) use room <strong>site-s1</strong>.
        </p>

        <div style={{
          marginTop: 32,
          padding: 16,
          borderRadius: 12,
          background: 'rgba(249,115,22,0.08)',
          border: '1px solid rgba(249,115,22,0.2)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#FB923C', marginBottom: 8, fontFamily: 'var(--mono)' }}>
            CONNECT FROM YOUR PHONE (DEMO)
          </div>
          <ol style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.7, margin: 0, paddingLeft: 18 }}>
            <li>Phone and computer on the <strong style={{ color: '#E2E8F0' }}>same Wi-Fi</strong>.</li>
            <li>Find your computer IP (e.g. 192.168.1.100).</li>
            <li>In project .env add: LIVEKIT_PUBLIC_WS_URL=ws://YOUR_IP:7880 (replace YOUR_IP), then restart the backend.</li>
            <li>On your phone browser open: http://YOUR_IP:5173/worker</li>
            <li>Allow camera and mic, then connect. Your feed will appear in the dashboard.</li>
          </ol>
        </div>
      </div>
    </div>
  )
}
