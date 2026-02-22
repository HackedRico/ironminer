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

function getLiveIdentityForWorker(worker, liveWorkerStreams) {
  if (!worker || !liveWorkerStreams?.size) return null
  for (const [identity, stream] of liveWorkerStreams.entries()) {
    const name = stream?.participant?.name
    if (name === worker.name || identity === worker.id) return identity
  }
  return null
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

  const [tab, setTab] = useState('all')
  const [selectedSite, setSelectedSite] = useState(null)
  const [siteWorkers, setSiteWorkers] = useState([])
  const [siteTeams, setSiteTeams] = useState([])

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
    fetchSiteWorkers(selectedSite)
      .then(setSiteWorkers)
      .catch(() => setSiteWorkers(MOCK_WORKERS[selectedSite] || []))
    fetchTeams(selectedSite, today)
      .then(setSiteTeams)
      .catch(() => setSiteTeams([]))
  }, [selectedSite])

  const feed = feeds.find(f => f.id === selectedFeed)
  const site = feed ? sites.find(s => s.id === feed.site_id) || null : null
  const assignedIds = new Set(siteTeams.flatMap(t => t.worker_ids))
  const unassignedWorkers = siteWorkers.filter(w => !assignedIds.has(w.id))

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 20 }}>

      {/* ── Main feed ──────────────────────────────────────────────────────── */}
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
          {[['all', `All · ${siteWorkers.length}`], ['teams', 'Teams']].map(([id, label]) => {
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
