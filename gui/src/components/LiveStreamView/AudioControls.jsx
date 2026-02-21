import { useCallback } from 'react'
import { C } from '../../utils/colors'

/**
 * AudioControls — push-to-talk button + mic toggle.
 * Slots into the comms bar below the main video area.
 */
export default function AudioControls({
  isPTTActive,
  isMicEnabled,
  onPTTStart,
  onPTTStop,
  onToggleMic,
  targetLabel = 'Site Broadcast',
  disabled = false,
}) {
  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    if (!disabled) onPTTStart()
  }, [disabled, onPTTStart])

  const handleRelease = useCallback(() => {
    if (isPTTActive) onPTTStop()
  }, [isPTTActive, onPTTStop])

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 12,
      background: 'rgba(255,255,255,0.03)',
      border: `1px solid ${isPTTActive ? 'rgba(249,115,22,0.4)' : 'rgba(255,255,255,0.06)'}`,
      borderRadius: 12, padding: '12px 20px',
      transition: 'border-color 0.15s',
    }}>
      {/* Push-to-talk button */}
      <button
        onMouseDown={handleMouseDown}
        onMouseUp={handleRelease}
        onMouseLeave={handleRelease}
        onTouchStart={handleMouseDown}
        onTouchEnd={handleRelease}
        disabled={disabled}
        style={{
          width: 48, height: 48, borderRadius: '50%', border: 'none', flexShrink: 0,
          background: isPTTActive
            ? 'linear-gradient(135deg, #EF4444, #DC2626)'
            : 'linear-gradient(135deg, #F97316, #EA580C)',
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isPTTActive
            ? '0 4px 20px rgba(239,68,68,0.5)'
            : '0 4px 16px rgba(249,115,22,0.3)',
          fontSize: 20,
          animation: isPTTActive ? 'pulse 0.8s infinite' : 'none',
          transition: 'background 0.15s, box-shadow 0.15s',
          opacity: disabled ? 0.4 : 1,
        }}
      >
        🎙️
      </button>

      {/* Label */}
      <div>
        <div style={{ fontSize: 14, fontWeight: 600, color: C.text }}>
          {isPTTActive ? 'Transmitting...' : `Talk to ${targetLabel}`}
        </div>
        <div style={{ fontSize: 11, color: C.muted }}>
          {disabled ? 'Connect to a room to use comms' : 'Press and hold to talk'}
        </div>
      </div>

      {/* Mic toggle on the right */}
      <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
        <button
          onClick={onToggleMic}
          disabled={disabled}
          style={{
            padding: '8px 14px', borderRadius: 8,
            border: `1px solid ${isMicEnabled ? 'rgba(34,197,94,0.3)' : 'rgba(255,255,255,0.1)'}`,
            background: isMicEnabled ? 'rgba(34,197,94,0.08)' : 'rgba(255,255,255,0.04)',
            cursor: disabled ? 'not-allowed' : 'pointer',
            fontSize: 12, fontWeight: 500,
            color: isMicEnabled ? C.green : C.subtle,
            opacity: disabled ? 0.4 : 1,
            transition: 'all 0.15s',
          }}
        >
          {isMicEnabled ? 'Mic On' : 'Mic Off'}
        </button>
        <button style={{
          padding: '8px 16px', borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(255,255,255,0.04)',
          cursor: 'pointer', fontSize: 12, fontWeight: 500, color: C.subtle,
        }}>Snapshot</button>
        <button style={{
          padding: '8px 16px', borderRadius: 8,
          border: '1px solid rgba(239,68,68,0.2)',
          background: 'rgba(239,68,68,0.08)',
          cursor: 'pointer', fontSize: 12, fontWeight: 500, color: '#FCA5A5',
        }}>Flag Issue</button>
      </div>
    </div>
  )
}
