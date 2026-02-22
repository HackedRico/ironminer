import { useState } from 'react'
import { useDroppable } from '@dnd-kit/core'
import WorkerCard from './WorkerCard'

/**
 * WorkerPool — the unassigned worker area on the left of the Teams page.
 *
 * Workers are displayed grouped by trade. A search box filters by name
 * or trade — useful when a superintendent needs to find someone quickly.
 */
export default function WorkerPool({ workers }) {
  const [query, setQuery] = useState('')
  const { setNodeRef, isOver } = useDroppable({ id: 'pool' })

  const q = query.trim().toLowerCase()
  const filtered = q
    ? workers.filter(w =>
        w.name.toLowerCase().includes(q) ||
        w.trade.toLowerCase().includes(q)
      )
    : workers

  // Group filtered workers by trade
  const byTrade = filtered.reduce((acc, w) => {
    if (!acc[w.trade]) acc[w.trade] = []
    acc[w.trade].push(w)
    return acc
  }, {})

  return (
    <div
      ref={setNodeRef}
      style={{
        borderRadius: 12,
        border: isOver
          ? '1.5px solid rgba(249,115,22,0.5)'
          : '1.5px dashed rgba(255,255,255,0.08)',
        background: isOver
          ? 'rgba(249,115,22,0.04)'
          : 'rgba(255,255,255,0.015)',
        padding: 16,
        transition: 'border-color 0.15s, background 0.15s',
        minHeight: 80,
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{
          fontSize: 10, fontFamily: 'var(--mono)', color: '#64748b',
          letterSpacing: '0.1em', textTransform: 'uppercase',
        }}>
          Unassigned
        </span>
        <span style={{
          fontSize: 11, fontFamily: 'var(--mono)', fontWeight: 700,
          color: workers.length === 0 ? '#22c55e' : '#f59e0b',
          background: workers.length === 0
            ? 'rgba(34,197,94,0.12)'
            : 'rgba(245,158,11,0.12)',
          padding: '2px 7px', borderRadius: 4,
        }}>
          {workers.length}
        </span>
      </div>

      {/* Search input */}
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <svg
          width="14" height="14" viewBox="0 0 16 16" fill="none"
          style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
        >
          <circle cx="6.5" cy="6.5" r="5" stroke="#475569" strokeWidth="1.5" />
          <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="#475569" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <input
          type="text"
          placeholder="Search name or trade…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#141924',
            border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 8,
            padding: '8px 10px 8px 32px',
            fontSize: 13,
            color: '#e2e8f0',
            fontFamily: 'inherit',
            outline: 'none',
            transition: 'border-color 0.15s',
          }}
          onFocus={e => e.target.style.borderColor = 'rgba(249,115,22,0.4)'}
          onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#475569', fontSize: 14, lineHeight: 1, padding: 2,
            }}
          >
            ✕
          </button>
        )}
      </div>

      {/* Worker list */}
      {workers.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#22c55e', fontSize: 13 }}>
          All workers assigned
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '12px 0', color: '#475569', fontSize: 13 }}>
          No match for "{query}"
        </div>
      ) : (
        Object.entries(byTrade).map(([trade, tradeWorkers]) => (
          <div key={trade} style={{ marginBottom: 12 }}>
            <div style={{
              fontSize: 9, color: '#475569', fontFamily: 'var(--mono)',
              letterSpacing: '0.08em', textTransform: 'uppercase',
              marginBottom: 6,
            }}>
              {trade}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {tradeWorkers.map(w => (
                <WorkerCard key={w.id} worker={w} compact />
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  )
}
