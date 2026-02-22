import { useDraggable } from '@dnd-kit/core'
import { CSS } from '@dnd-kit/utilities'

// Trade → subtle colour for the badge pill
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

/**
 * WorkerCard — a draggable worker tile.
 *
 * Used in both the unassigned pool (WorkerPool) and inside team cards.
 * When isDragging, the source card fades to 30% so the drop zone is visible.
 */
export default function WorkerCard({ worker, compact = false }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: worker.id,
    data: { worker },
  })

  const tradeColor = TRADE_COLORS[worker.trade] || { bg: 'rgba(255,255,255,0.08)', text: '#94a3b8' }

  return (
    <div
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      style={{
        transform: CSS.Translate.toString(transform),
        opacity: isDragging ? 0.3 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
        // Card shell
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: compact ? '6px 10px' : '10px 14px',
        borderRadius: 10,
        background: 'rgba(255,255,255,0.04)',
        border: '1px solid rgba(255,255,255,0.08)',
        minHeight: compact ? 40 : 56,
        userSelect: 'none',
        touchAction: 'none',   // required for dnd-kit touch events
        transition: 'opacity 0.15s, box-shadow 0.15s',
        boxShadow: isDragging ? 'none' : '0 1px 4px rgba(0,0,0,0.3)',
      }}
    >
      {/* Trade colour dot */}
      <div style={{
        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
        background: tradeColor.text,
        boxShadow: `0 0 6px ${tradeColor.text}88`,
      }} />

      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Name */}
        <div style={{
          fontSize: compact ? 13 : 15,
          fontWeight: 600,
          color: '#f1f5f9',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}>
          {worker.name}
        </div>

        {/* Trade badge */}
        <div style={{
          display: 'inline-block',
          marginTop: 2,
          fontSize: 10,
          fontWeight: 500,
          padding: '1px 6px',
          borderRadius: 4,
          background: tradeColor.bg,
          color: tradeColor.text,
          fontFamily: 'var(--mono)',
          letterSpacing: '0.04em',
        }}>
          {worker.trade}
        </div>
      </div>
    </div>
  )
}
