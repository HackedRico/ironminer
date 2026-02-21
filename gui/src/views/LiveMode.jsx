import { useState, useEffect } from 'react'
import LiveFeedCard from '../components/LiveFeedCard'
import LiveStreamView from '../components/LiveStreamView'
import { fetchFeeds } from '../api/streaming'
import { fetchAlerts } from '../api/alerts'
import { fetchSites } from '../api/sites'
import { MOCK_FEEDS, MOCK_ALERTS, MOCK_SITES } from '../utils/mockData'

export default function LiveMode() {
  const [feeds, setFeeds] = useState([])
  const [selectedFeed, setSelectedFeed] = useState(null)
  const [alerts, setAlerts] = useState([])
  const [sites, setSites] = useState([])
  const [usingMock, setUsingMock] = useState(false)
  const [livekitAvailable, setLivekitAvailable] = useState(false)

  useEffect(() => {
    fetchFeeds()
      .then(data => {
        setFeeds(data)
        if (data.length && !selectedFeed) setSelectedFeed(data[0].id)
      })
      .catch(() => {
        setUsingMock(true)
        setFeeds(MOCK_FEEDS)
        setSelectedFeed(MOCK_FEEDS[0].id)
      })

    fetchAlerts({ severity: 'high' })
      .then(setAlerts)
      .catch(() => setAlerts(MOCK_ALERTS.filter(a => a.severity === 'high')))

    fetchSites()
      .then(setSites)
      .catch(() => setSites(MOCK_SITES))

    // Probe LiveKit availability via the rooms endpoint.
    // 200 OK → LiveKit is up → show real streaming UI.
    // Any error (503, network fail, timeout) → show mock UI.
    fetch('/api/streaming/livekit/rooms', { signal: AbortSignal.timeout(2000) })
      .then(r => setLivekitAvailable(r.ok))
      .catch(() => setLivekitAvailable(false))
  }, [])

  const feed = feeds.find(f => f.id === selectedFeed)
  const site = feed ? sites.find(s => s.id === feed.site_id) || null : null

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 24 }}>

      {/* ── Main feed viewer (left column) ─────────────────────────────────── */}
      <div>
        {livekitAvailable ? (
          // Real LiveKit stream — shows video grid + push-to-talk
          <LiveStreamView site={site} selectedFeed={feed} />
        ) : (
          // Mock fallback — original UI preserved exactly
          <>
            <div style={{
              aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden',
              border: '2px solid rgba(249,115,22,0.3)', background: '#0C0F14',
              position: 'relative', marginBottom: 16,
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.01) 1px, rgba(255,255,255,0.01) 2px)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 48 }}>{feed?.type === 'helmet' ? '⛑️' : '📹'}</div>
                <div style={{ fontSize: 14, color: '#64748B' }}>Live feed simulation</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: '#E2E8F0' }}>{feed?.label}</div>
              </div>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(rgba(0,0,0,0.7), transparent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite' }} />
                  <span style={{ fontSize: 11, fontWeight: 700, fontFamily: 'var(--mono)', color: '#FCA5A5', letterSpacing: '0.1em' }}>LIVE</span>
                  <span style={{ fontSize: 11, fontFamily: 'var(--mono)', color: '#94A3B8' }}>{feed?.site_name}</span>
                </div>
                <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#F59E0B' }}>
                  {usingMock ? 'DEMO DATA' : 'LIVEKIT OFFLINE'}
                </span>
              </div>
            </div>

            {/* Mock comms bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12,
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
              borderRadius: 12, padding: '12px 20px',
            }}>
              <button style={{
                width: 48, height: 48, borderRadius: '50%', border: 'none',
                background: 'linear-gradient(135deg, #F97316, #EA580C)',
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 16px rgba(249,115,22,0.3)', fontSize: 20,
              }}>🎙️</button>
              <div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#E2E8F0' }}>
                  {feed?.worker ? `Talk to ${feed.worker}` : 'Site broadcast'}
                </div>
                <div style={{ fontSize: 11, color: '#64748B' }}>
                  Start LiveKit to enable real audio
                </div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#94A3B8',
                }}>Snapshot</button>
                <button style={{
                  padding: '8px 16px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                  background: 'rgba(239,68,68,0.08)', cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#FCA5A5',
                }}>Flag Issue</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Right sidebar: Feed grid + Active alerts (unchanged) ───────────── */}
      <div>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, paddingLeft: 4 }}>
          Camera Feeds ({feeds.length})
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {feeds.map(f => (
            <LiveFeedCard key={f.id} feed={f} selected={selectedFeed === f.id} onClick={() => setSelectedFeed(f.id)} />
          ))}
        </div>

        <div style={{ marginTop: 20 }}>
          <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 10, paddingLeft: 4 }}>
            Active Alerts
          </div>
          {alerts.map(a => (
            <div key={a.id} style={{
              padding: '10px 12px', borderRadius: 8, marginBottom: 6,
              background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#EF4444', flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: '#FCA5A5', lineHeight: 1.3 }}>{a.title}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
