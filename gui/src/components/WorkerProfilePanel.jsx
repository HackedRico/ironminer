import { useState, useEffect, useCallback } from 'react'
import { fetchWorkerHistory } from '../api/teams'
import { fetchWorkerNotes } from '../api/streaming'
import { fetchWorkerEmbeddings } from '../api/embeddings'
import { MOCK_WORKER_HISTORY } from '../utils/mockData'
import GlbViewer from './GlbViewer'

const SITE_MAP_URL = '/worlds/modern-office.glb'

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

const SEVERITY_COLOR = { high: '#ef4444', medium: '#f59e0b', low: '#60a5fa' }

const FLAG_CONFIG = {
  reward:         { icon: '🏆', label: 'Reward',         color: '#22c55e', bg: 'rgba(34,197,94,0.12)',  border: 'rgba(34,197,94,0.2)'  },
  needs_training: { icon: '⚠',  label: 'Needs Training', color: '#f59e0b', bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.2)' },
  neutral:        { icon: null,  label: 'Clean record',   color: '#475569', bg: 'rgba(71,85,105,0.12)',  border: 'rgba(71,85,105,0.2)'  },
}

function shortDate(isoStr) {
  return new Date(isoStr + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  })
}

function synthNeutral(worker) {
  return {
    worker,
    history: Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i)
      return { date: d.toISOString().split('T')[0], team_name: '', zone: '', task: '', alert_count: 0, alerts: [] }
    }),
    signals: { days_assigned: 0, total_alerts: 0, safety_alerts: 0, productivity_alerts: 0, flag: 'neutral' },
  }
}

export default function WorkerProfilePanel({ worker, siteId, onClose }) {
  const [data, setData]       = useState(null)
  const [loading, setLoading] = useState(true)
  const [notes, setNotes]     = useState([])
  const [embeds, setEmbeds]   = useState([])
  const [showMap, setShowMap] = useState(false)

  const handleKey = useCallback((e) => { if (e.key === 'Escape') onClose() }, [onClose])

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    if (!worker || !siteId) return
    setLoading(true)
    setData(null)
    fetchWorkerHistory(worker.id, siteId)
      .then(d => { setData(d); setLoading(false) })
      .catch(() => {
        setData(MOCK_WORKER_HISTORY[worker.id] || synthNeutral(worker))
        setLoading(false)
      })
    fetchWorkerNotes(worker.id, siteId)
      .then(setNotes)
      .catch(() => setNotes([]))
    fetchWorkerEmbeddings(worker.id)
      .then(setEmbeds)
      .catch(() => setEmbeds([]))
  }, [worker?.id, siteId])

  const tradeColor = TRADE_COLORS[worker.trade] || { bg: 'rgba(255,255,255,0.08)', text: '#94a3b8' }
  const today      = data?.history?.[0]
  const signals    = data?.signals
  const flagCfg    = FLAG_CONFIG[signals?.flag] || FLAG_CONFIG.neutral
  const initials   = worker.name.split('.')[0]

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(2px)',
          zIndex: 100,
        }}
      />

      {/* Panel */}
      <div style={{
        position: 'fixed', top: 0, right: 0,
        width: 420, height: '100vh',
        background: '#0B0E13',
        borderLeft: '1px solid rgba(255,255,255,0.08)',
        zIndex: 101,
        display: 'flex', flexDirection: 'column',
        boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
        animation: 'panelSlideIn 0.22s ease-out',
      }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '20px 20px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          flexShrink: 0,
        }}>
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: tradeColor.bg,
            border: `1px solid ${tradeColor.text}33`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 16, fontWeight: 700, color: tradeColor.text,
          }}>
            {initials}
          </div>

          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#f1f5f9' }}>{worker.name}</div>
            <div style={{
              display: 'inline-block', marginTop: 3,
              fontSize: 10, fontWeight: 500, padding: '2px 7px', borderRadius: 4,
              background: tradeColor.bg, color: tradeColor.text,
              fontFamily: 'var(--mono)', letterSpacing: '0.04em',
            }}>
              {worker.trade}
            </div>
          </div>

          <button
            onClick={onClose}
            title="Close (Esc)"
            style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.08)',
              cursor: 'pointer', color: '#94a3b8', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'color 0.15s, background 0.15s',
            }}
            onMouseOver={e => { e.currentTarget.style.color = '#f1f5f9'; e.currentTarget.style.background = 'rgba(255,255,255,0.09)' }}
            onMouseOut={e =>  { e.currentTarget.style.color = '#94a3b8'; e.currentTarget.style.background = 'rgba(255,255,255,0.05)' }}
          >
            ✕
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 32px' }}>
          {loading && (
            <div style={{ textAlign: 'center', padding: '48px 0', color: '#475569', fontSize: 13 }}>
              Loading history…
            </div>
          )}

          {!loading && data && (
            <>
              {/* Today */}
              <div style={{ marginTop: 20 }}>
                <SectionLabel>Today</SectionLabel>
                {today?.team_name ? (
                  <div style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#f1f5f9', marginBottom: 8 }}>
                      {today.team_name}
                    </div>
                    {today.zone && <MetaRow label="Zone" value={today.zone} />}
                    {today.task && <MetaRow label="Task" value={today.task} />}
                    {today.alerts.map(a => <AlertPill key={a.id} alert={a} />)}
                  </div>
                ) : (
                  <div style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.06)',
                    fontSize: 13, color: '#334155', fontStyle: 'italic',
                  }}>
                    Not assigned today
                  </div>
                )}
              </div>

              {/* Signal */}
              <div style={{ marginTop: 24 }}>
                <SectionLabel>7-Day Signal</SectionLabel>
                <div style={{
                  padding: '14px 16px', borderRadius: 10,
                  background: flagCfg.bg, border: `1px solid ${flagCfg.border}`,
                  display: 'flex', alignItems: 'center', gap: 12,
                }}>
                  {flagCfg.icon && <div style={{ fontSize: 22, lineHeight: 1 }}>{flagCfg.icon}</div>}
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: flagCfg.color }}>
                      {flagCfg.label}
                    </div>
                    <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>
                      {signals.days_assigned} days assigned · {signals.total_alerts} alert{signals.total_alerts !== 1 ? 's' : ''}
                      {signals.safety_alerts > 0 ? ` (${signals.safety_alerts} safety)` : ''}
                    </div>
                  </div>
                </div>
              </div>

              {/* 7-day history */}
              <div style={{ marginTop: 24 }}>
                <SectionLabel>Last 7 Days</SectionLabel>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {data.history.map((h, i) => <HistoryRow key={h.date} day={h} isToday={i === 0} />)}
                </div>
              </div>

              {/* Field notes */}
              <div style={{ marginTop: 24 }}>
                <SectionLabel>Field Notes {notes.length > 0 && `· ${notes.length}`}</SectionLabel>
                {notes.length === 0 ? (
                  <div style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.06)',
                    fontSize: 13, color: '#334155', fontStyle: 'italic',
                  }}>
                    No notes recorded
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                    {notes.map(n => <NoteItem key={n.id} note={n} />)}
                  </div>
                )}
              </div>

              {/* Embedded objects */}
              <div style={{ marginTop: 24 }}>
                <SectionLabel>Embedded Objects {embeds.length > 0 && `· ${embeds.length}`}</SectionLabel>
                {embeds.length === 0 ? (
                  <div style={{
                    padding: '14px 16px', borderRadius: 10,
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px dashed rgba(255,255,255,0.06)',
                    fontSize: 13, color: '#334155', fontStyle: 'italic',
                  }}>
                    No embedded objects — use Inspect Frame in LiveMode
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {embeds.map(obj => <EmbedItem key={obj.id} obj={obj} />)}
                  </div>
                )}
              </div>

              {/* 3D Site Map */}
              <div style={{ marginTop: 24 }}>
                <button
                  onClick={() => setShowMap(v => !v)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: 0, marginBottom: showMap ? 10 : 0,
                  }}
                >
                  <span style={{
                    fontSize: 9, color: '#475569', textTransform: 'uppercase',
                    letterSpacing: '0.1em', fontFamily: 'var(--mono)',
                  }}>
                    3D Site Map
                  </span>
                  <span style={{ fontSize: 10, color: '#334155' }}>{showMap ? '▲' : '▼'}</span>
                </button>
                {showMap && <GlbViewer url={SITE_MAP_URL} height={300} />}
              </div>
            </>
          )}
        </div>

        <style>{`
          @keyframes panelSlideIn {
            from { transform: translateX(100%); opacity: 0; }
            to   { transform: translateX(0);    opacity: 1; }
          }
        `}</style>
      </div>
    </>
  )
}

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

function MetaRow({ label, value }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 5, alignItems: 'baseline' }}>
      <span style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--mono)', flexShrink: 0, width: 38 }}>
        {label}
      </span>
      <span style={{ fontSize: 12, color: '#94a3b8', lineHeight: 1.4 }}>{value}</span>
    </div>
  )
}

function AlertPill({ alert }) {
  const color = SEVERITY_COLOR[alert.severity] || '#94a3b8'
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 6,
      padding: '6px 8px', borderRadius: 6, marginTop: 8,
      background: `${color}11`, border: `1px solid ${color}33`,
    }}>
      <div style={{ width: 6, height: 6, borderRadius: '50%', background: color, marginTop: 4, flexShrink: 0 }} />
      <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.4 }}>
        <span style={{ color, fontWeight: 600 }}>{alert.severity} · </span>
        {alert.title}
      </div>
    </div>
  )
}

function noteTime(isoStr) {
  const d = new Date(isoStr)
  const now = new Date()
  const isToday = d.toDateString() === now.toDateString()
  const time = d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })
  return isToday
    ? time
    : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + '  ' + time
}

function NoteItem({ note }) {
  return (
    <div style={{
      padding: '10px 0',
      borderBottom: '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        fontSize: 10, fontFamily: 'var(--mono)', color: '#334155',
        marginBottom: 4,
      }}>
        {noteTime(note.created_at)}
      </div>
      <p style={{ margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.55 }}>
        {note.transcript || <em style={{ color: '#334155' }}>No transcript</em>}
      </p>
    </div>
  )
}

function embedTime(isoStr) {
  const d = new Date(isoStr)
  const now = new Date()
  const diffMs = now - d
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHrs = Math.floor(diffMin / 60)
  if (diffHrs < 24) return `${diffHrs}h ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function EmbedItem({ obj }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 12px', borderRadius: 10,
      background: 'rgba(249,115,22,0.04)',
      border: '1px solid rgba(249,115,22,0.12)',
    }}>
      {/* Thumbnail */}
      {obj.crop_b64 && (
        <img
          src={`data:image/jpeg;base64,${obj.crop_b64}`}
          alt={obj.label}
          style={{
            width: 48, height: 48, borderRadius: 6, objectFit: 'cover',
            flexShrink: 0, border: '1px solid rgba(249,115,22,0.2)',
          }}
        />
      )}
      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          <span style={{
            fontSize: 10, fontWeight: 700, fontFamily: 'var(--mono)',
            color: '#FDBA74', textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            {obj.label}
          </span>
          <span style={{ fontSize: 10, color: '#334155', fontFamily: 'var(--mono)' }}>
            · {embedTime(obj.created_at)}
          </span>
        </div>
        <p style={{
          margin: 0, fontSize: 12, color: '#94a3b8', lineHeight: 1.5,
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {obj.note === '[no note]'
            ? <em style={{ color: '#334155' }}>No note</em>
            : obj.note}
        </p>
      </div>
    </div>
  )
}

function HistoryRow({ day, isToday }) {
  const assigned = Boolean(day.team_name)
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '90px 1fr auto',
      gap: 10, alignItems: 'center',
      padding: '8px 10px', borderRadius: 8,
      background: isToday ? 'rgba(249,115,22,0.06)' : 'rgba(255,255,255,0.02)',
      border:     isToday ? '1px solid rgba(249,115,22,0.15)' : '1px solid rgba(255,255,255,0.04)',
    }}>
      <div style={{
        fontSize: 11, fontFamily: 'var(--mono)',
        color: isToday ? '#fb923c' : '#64748b',
        fontWeight: isToday ? 700 : 400,
      }}>
        {shortDate(day.date)}
      </div>

      <div style={{ minWidth: 0 }}>
        {assigned ? (
          <>
            <div style={{
              fontSize: 12, fontWeight: 600, color: '#e2e8f0',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {day.team_name}
            </div>
            {day.zone && (
              <div style={{
                fontSize: 10, color: '#475569', fontFamily: 'var(--mono)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {day.zone.split('—')[0].trim()}
              </div>
            )}
          </>
        ) : (
          <div style={{ fontSize: 12, color: '#334155', fontStyle: 'italic' }}>—</div>
        )}
      </div>

      {day.alert_count > 0 ? (
        <div style={{
          fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700,
          color: '#fca5a5', background: 'rgba(239,68,68,0.12)',
          border: '1px solid rgba(239,68,68,0.2)',
          padding: '2px 7px', borderRadius: 4, flexShrink: 0,
        }}>
          {day.alert_count} alert{day.alert_count !== 1 ? 's' : ''}
        </div>
      ) : assigned ? (
        <div style={{
          fontSize: 10, fontFamily: 'var(--mono)',
          color: '#22c55e', background: 'rgba(34,197,94,0.08)',
          padding: '2px 7px', borderRadius: 4, flexShrink: 0,
        }}>
          clear
        </div>
      ) : (
        <div style={{ width: 50 }} />
      )}
    </div>
  )
}
