import { useState, useEffect } from 'react'
import { fetchSites } from '../api/sites'
import { fetchSiteWorkers, fetchTeams } from '../api/teams'
import WorkerProfilePanel from '../components/WorkerProfilePanel'
import { MOCK_SITES, MOCK_WORKERS } from '../utils/mockData'

const TRADE_COLORS = {
  'Concrete':       { bg: 'rgba(96,165,250,0.14)',  text: '#93c5fd' },
  'Electrical':     { bg: 'rgba(250,204,21,0.14)',  text: '#fde047' },
  'Plumbing':       { bg: 'rgba(52,211,153,0.14)',  text: '#6ee7b7' },
  'Framing':        { bg: 'rgba(251,146,60,0.14)',  text: '#fdba74' },
  'HVAC':           { bg: 'rgba(167,139,250,0.14)', text: '#c4b5fd' },
  'Crane Ops':      { bg: 'rgba(251,191,36,0.14)',  text: '#fcd34d' },
  'Delivery':       { bg: 'rgba(148,163,184,0.14)', text: '#cbd5e1' },
  'Steel Erection': { bg: 'rgba(239,68,68,0.14)',   text: '#fca5a5' },
  'Staging':        { bg: 'rgba(156,163,175,0.14)', text: '#d1d5db' },
  'Cladding':       { bg: 'rgba(20,184,166,0.14)',  text: '#5eead4' },
}

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

export default function CrewMode() {
  const [sites, setSites]               = useState([])
  const [selectedSite, setSelectedSite] = useState(null)
  const [workers, setWorkers]           = useState([])
  const [todayTeams, setTodayTeams]     = useState([])
  const [tradeFilter, setTradeFilter]   = useState('all')
  const [selectedWorker, setSelectedWorker] = useState(null)
  const [usingMock, setUsingMock]       = useState(false)
  const today = todayISO()

  // Load sites
  useEffect(() => {
    fetchSites()
      .then(data => { setSites(data); if (data.length) setSelectedSite(data[0].id) })
      .catch(() => { setSites(MOCK_SITES); setSelectedSite(MOCK_SITES[0].id) })
  }, [])

  // Load workers + today's teams when site changes
  useEffect(() => {
    if (!selectedSite) return
    setWorkers([])
    setTodayTeams([])
    setTradeFilter('all')
    setUsingMock(false)

    fetchSiteWorkers(selectedSite)
      .then(setWorkers)
      .catch(() => { setUsingMock(true); setWorkers(MOCK_WORKERS[selectedSite] || []) })

    fetchTeams(selectedSite, today)
      .then(setTodayTeams)
      .catch(() => setTodayTeams([]))
  }, [selectedSite])

  // Build worker → today's assignment lookup
  const assignmentMap = {}
  for (const team of todayTeams) {
    for (const wid of team.worker_ids) {
      assignmentMap[wid] = { team_name: team.name, zone: team.zone, task: team.task }
    }
  }

  const trades = ['all', ...Array.from(new Set(workers.map(w => w.trade))).sort()]
  const visible = tradeFilter === 'all' ? workers : workers.filter(w => w.trade === tradeFilter)

  const selectStyle = {
    background: '#141924', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '10px 14px',
    fontSize: 14, color: '#94a3b8',
    fontFamily: 'inherit', outline: 'none', cursor: 'pointer', colorScheme: 'dark',
  }

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <select
          value={selectedSite || ''}
          onChange={e => setSelectedSite(e.target.value)}
          style={{ ...selectStyle, fontSize: 15, fontWeight: 600, color: '#f1f5f9' }}
        >
          {sites.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>

        <select value={tradeFilter} onChange={e => setTradeFilter(e.target.value)} style={selectStyle}>
          {trades.map(t => <option key={t} value={t}>{t === 'all' ? 'All trades' : t}</option>)}
        </select>

        {usingMock && (
          <span style={{
            fontSize: 9, color: '#f59e0b', fontFamily: 'var(--mono)',
            background: 'rgba(245,158,11,0.1)', padding: '3px 8px', borderRadius: 4,
            letterSpacing: '0.06em',
          }}>
            DEMO DATA
          </span>
        )}

        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b', fontFamily: 'var(--mono)' }}>
          <span style={{ color: '#f1f5f9', fontWeight: 700 }}>{visible.length}</span> workers
        </div>
      </div>

      {/* Grid */}
      {visible.length === 0 ? (
        <div style={{
          textAlign: 'center', padding: '80px 0',
          border: '1.5px dashed rgba(255,255,255,0.05)', borderRadius: 12,
          color: '#475569', fontSize: 14,
        }}>
          No workers for this site
        </div>
      ) : (
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          gap: 14,
        }}>
          {visible.map(w => (
            <WorkerSummaryCard
              key={w.id}
              worker={w}
              assignment={assignmentMap[w.id] || null}
              onClick={() => setSelectedWorker(w)}
            />
          ))}
        </div>
      )}

      {selectedWorker && (
        <WorkerProfilePanel
          worker={selectedWorker}
          siteId={selectedSite}
          onClose={() => setSelectedWorker(null)}
        />
      )}
    </div>
  )
}

function WorkerSummaryCard({ worker, assignment, onClick }) {
  const tradeColor = TRADE_COLORS[worker.trade] || { bg: 'rgba(255,255,255,0.08)', text: '#94a3b8' }

  return (
    <button
      onClick={onClick}
      style={{
        all: 'unset', display: 'block', width: '100%', boxSizing: 'border-box',
        padding: '16px 18px', borderRadius: 12,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        cursor: 'pointer', textAlign: 'left', minHeight: 96,
        transition: 'border-color 0.15s, background 0.15s',
      }}
      onMouseOver={e => {
        e.currentTarget.style.borderColor = 'rgba(249,115,22,0.35)'
        e.currentTarget.style.background  = 'rgba(249,115,22,0.04)'
      }}
      onMouseOut={e => {
        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)'
        e.currentTarget.style.background  = 'rgba(255,255,255,0.04)'
      }}
    >
      {/* Name row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <div style={{
          width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
          background: tradeColor.text, boxShadow: `0 0 6px ${tradeColor.text}88`,
        }} />
        <div style={{ fontSize: 15, fontWeight: 700, color: '#f1f5f9', flex: 1 }}>
          {worker.name}
        </div>
      </div>

      {/* Trade badge */}
      <div style={{
        display: 'inline-block', marginBottom: 10,
        fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
        background: tradeColor.bg, color: tradeColor.text,
        fontFamily: 'var(--mono)', letterSpacing: '0.04em',
      }}>
        {worker.trade}
      </div>

      {/* Today's assignment */}
      {assignment ? (
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 2 }}>{assignment.team_name}</div>
          {assignment.zone && (
            <div style={{
              fontSize: 11, color: '#475569', fontFamily: 'var(--mono)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {assignment.zone.split('—')[0].trim()}
            </div>
          )}
        </div>
      ) : (
        <div style={{ fontSize: 12, color: '#334155', fontStyle: 'italic' }}>Unassigned today</div>
      )}
    </button>
  )
}
