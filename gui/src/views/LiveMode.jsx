import { useState, useEffect } from 'react'
import LiveStreamView from '../components/LiveStreamView'
import LiveWorkerFeedCard from '../components/LiveStreamView/LiveWorkerFeedCard'
import { fetchFeeds } from '../api/streaming'
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

function WorkerRow({ worker, isLive, selected, onClick }) {
  const tradeColor = TRADE_COLORS[worker.trade] || '#64748B'
  return (
    <button
      onClick={onClick}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '8px 6px', background: selected ? 'rgba(249,115,22,0.07)' : 'none',
        border: 'none', borderRadius: 7, cursor: 'pointer',
        textAlign: 'left', transition: 'background 0.15s',
      }}
    >
      <div style={{
        width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
        background: isLive ? '#22C55E' : 'rgba(255,255,255,0.12)',
        boxShadow: isLive ? '0 0 6px #22C55E' : 'none',
        transition: 'background 0.2s',
      }} />
      <span style={{ fontSize: 13, fontWeight: 500, color: '#cbd5e1', flex: 1, letterSpacing: '-0.01em' }}>
        {worker.name}
      </span>
      <span style={{
        fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
        color: tradeColor, background: `${tradeColor}18`,
        padding: '2px 6px', borderRadius: 4, flexShrink: 0,
        letterSpacing: '0.05em',
      }}>
        {worker.trade.toUpperCase()}
      </span>
      {isLive && (
        <span style={{
          fontSize: 9, fontWeight: 700, fontFamily: 'var(--mono)',
          color: '#86EFAC', letterSpacing: '0.1em',
        }}>
          LIVE
        </span>
      )}
    </button>
  )
}

function TeamSection({ team, workers, liveWorkerStreams, selectedWorkerIdentity, onSelectWorker }) {
  const color = TEAM_COLORS[team.color_index % 8]
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 7,
        paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)',
        marginBottom: 2,
      }}>
        <div style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{
          fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
          color: '#475569', letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          {team.name}
        </span>
        {team.task && (
          <span style={{
            fontSize: 10, color: '#334155', marginLeft: 'auto',
            maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {team.task}
          </span>
        )}
      </div>
      {workers.length === 0 ? (
        <div style={{ fontSize: 11, color: '#334155', padding: '8px 6px' }}>No workers assigned</div>
      ) : (
        workers.map(w => (
          <WorkerRow
            key={w.id}
            worker={w}
            isLive={liveWorkerStreams.has(w.id)}
            selected={selectedWorkerIdentity === w.id}
            onClick={() => onSelectWorker(w.id)}
          />
        ))
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

  // Roster
  const [tab, setTab] = useState('all')
  const [selectedSite, setSelectedSite] = useState(null)
  const [siteWorkers, setSiteWorkers] = useState([])
  const [siteTeams, setSiteTeams] = useState([])

  const today = todayISO()

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

    fetchSites()
      .then(data => {
        setSites(data)
        if (data.length) setSelectedSite(data[0].id)
      })
      .catch(() => {
        setSites(MOCK_SITES)
        setSelectedSite(MOCK_SITES[0].id)
      })

    fetch('/api/streaming/livekit/rooms', { signal: AbortSignal.timeout(2000) })
      .then(r => setLivekitAvailable(r.ok))
      .catch(() => setLivekitAvailable(false))
  }, [])

  // Load workers + teams for sidebar
  useEffect(() => {
    if (!selectedSite) return
    fetchSiteWorkers(selectedSite)
      .then(setSiteWorkers)
      .catch(() => setSiteWorkers(MOCK_WORKERS[selectedSite] || []))
    fetchTeams(selectedSite, today)
      .then(setSiteTeams)
      .catch(() => setSiteTeams([]))
  }, [selectedSite])

  const feed = feeds.find(f => f.id === selectedFeed)
  const site = feed ? sites.find(s => s.id === feed.site_id) || null : null

  // Workers in teams tab
  const assignedIds = new Set(siteTeams.flatMap(t => t.worker_ids))
  const unassignedWorkers = siteWorkers.filter(w => !assignedIds.has(w.id))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 24 }}>

      {/* ── Main feed viewer ───────────────────────────────────────────────── */}
      <div>
        {livekitAvailable ? (
          <LiveStreamView
            site={site}
            selectedFeed={feed}
            onWorkerStreamsChange={setLiveWorkerStreams}
            selectedWorkerIdentity={selectedWorkerIdentity}
            onSelectWorker={setSelectedWorkerIdentity}
          />
        ) : (
          <>
            <div style={{
              aspectRatio: '16/9', borderRadius: 14, overflow: 'hidden',
              border: '2px solid rgba(249,115,22,0.18)', background: '#0C0F14',
              position: 'relative', marginBottom: 16,
            }}>
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(255,255,255,0.008) 1px, rgba(255,255,255,0.008) 2px)' }} />
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
                <div style={{ fontSize: 13, color: '#334155' }}>
                  {selectedWorkerIdentity ? `Viewing ${selectedWorkerIdentity}` : 'Select a worker to view their stream'}
                </div>
              </div>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'linear-gradient(rgba(0,0,0,0.6), transparent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#EF4444', animation: 'pulse 1.5s infinite' }} />
                  <span style={{ fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)', color: '#FCA5A5', letterSpacing: '0.1em' }}>LIVE</span>
                </div>
                <span style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#475569' }}>
                  {usingMock ? 'DEMO DATA' : 'LIVEKIT OFFLINE'}
                </span>
              </div>
            </div>

            {/* Comms bar */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 14,
              background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)',
              borderRadius: 12, padding: '12px 20px',
            }}>
              <button style={{
                width: 42, height: 42, borderRadius: '50%', border: 'none', flexShrink: 0,
                background: 'linear-gradient(135deg, #F97316, #EA580C)', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(249,115,22,0.25)',
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="9" y="2" width="6" height="12" rx="3" fill="white" />
                  <path d="M5 10a7 7 0 0 0 14 0" stroke="white" strokeWidth="2" strokeLinecap="round" />
                  <line x1="12" y1="19" x2="12" y2="22" stroke="white" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </button>
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>Site broadcast</div>
                <div style={{ fontSize: 11, color: '#475569' }}>Start LiveKit to enable real audio</div>
              </div>
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button style={{
                  padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'none', cursor: 'pointer', fontSize: 12, color: '#64748B',
                }}>Snapshot</button>
                <button style={{
                  padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(239,68,68,0.15)',
                  background: 'rgba(239,68,68,0.06)', cursor: 'pointer', fontSize: 12, color: '#FCA5A5',
                }}>Flag Issue</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* ── Right sidebar: Worker roster ───────────────────────────────────── */}
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}>

        {/* Tab bar + site selector */}
        <div style={{
          display: 'flex', alignItems: 'center',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 12, paddingBottom: 0,
        }}>
          {[['all', `All  ${siteWorkers.length}`], ['teams', 'Teams']].map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background: 'none', border: 'none', cursor: 'pointer',
              padding: '8px 14px 10px 0',
              fontSize: 12, fontWeight: tab === id ? 600 : 400,
              color: tab === id ? '#f1f5f9' : '#475569',
              borderBottom: `2px solid ${tab === id ? '#F97316' : 'transparent'}`,
              marginBottom: -1,
              fontFamily: 'inherit', transition: 'color 0.15s',
            }}>
              {label}
            </button>
          ))}
          <select
            value={selectedSite || ''}
            onChange={e => setSelectedSite(e.target.value)}
            style={{
              marginLeft: 'auto', background: 'transparent',
              border: 'none', outline: 'none', cursor: 'pointer',
              fontSize: 10, color: '#475569', fontFamily: 'inherit',
              colorScheme: 'dark', maxWidth: 110,
            }}
          >
            {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>

        {/* Live worker streams (LiveKit only) */}
        {liveWorkerStreams.size > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 9, fontFamily: 'var(--mono)', color: '#22C55E', letterSpacing: '0.12em', marginBottom: 8, paddingLeft: 6 }}>
              LIVE NOW  {liveWorkerStreams.size}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {Array.from(liveWorkerStreams.entries()).map(([identity, stream]) => (
                <LiveWorkerFeedCard
                  key={identity}
                  identity={identity}
                  participant={stream.participant}
                  videoTrack={stream.videoTrack}
                  selected={selectedWorkerIdentity === identity}
                  onClick={() => setSelectedWorkerIdentity(identity)}
                />
              ))}
            </div>
            <div style={{ height: 1, background: 'rgba(255,255,255,0.05)', margin: '16px 0 4px' }} />
          </div>
        )}

        {/* Worker list */}
        <div style={{ overflowY: 'auto', flex: 1, maxHeight: 'calc(100vh - 220px)' }}>
          {tab === 'all' ? (
            siteWorkers.length === 0 ? (
              <div style={{ fontSize: 12, color: '#334155', textAlign: 'center', padding: '48px 0' }}>No workers</div>
            ) : (
              siteWorkers.map(w => (
                <WorkerRow
                  key={w.id}
                  worker={w}
                  isLive={liveWorkerStreams.has(w.id)}
                  selected={selectedWorkerIdentity === w.id}
                  onClick={() => setSelectedWorkerIdentity(w.id)}
                />
              ))
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
                  <div style={{ marginBottom: 20 }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 7,
                      paddingBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.05)', marginBottom: 2,
                    }}>
                      <div style={{ width: 5, height: 5, borderRadius: '50%', background: '#334155', flexShrink: 0 }} />
                      <span style={{
                        fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
                        color: '#334155', letterSpacing: '0.1em', textTransform: 'uppercase',
                      }}>
                        Unassigned
                      </span>
                    </div>
                    {unassignedWorkers.map(w => (
                      <WorkerRow
                        key={w.id}
                        worker={w}
                        isLive={liveWorkerStreams.has(w.id)}
                        selected={selectedWorkerIdentity === w.id}
                        onClick={() => setSelectedWorkerIdentity(w.id)}
                      />
                    ))}
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
