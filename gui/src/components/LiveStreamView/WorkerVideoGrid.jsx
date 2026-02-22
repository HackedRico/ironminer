import { C } from '../../utils/colors'
import WorkerVideoTile from './WorkerVideoTile'

/**
 * WorkerVideoGrid — responsive grid of worker video tiles.
 *
 * Layout logic:
 *   0 workers → empty state
 *   1 worker  → full width
 *   2+ workers → 2-column grid
 */
export default function WorkerVideoGrid({ workerStreams, selectedIdentity, onSelectWorker, videoRef }) {
  const entries = Array.from(workerStreams.entries())
  const count = entries.length

  if (count === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexDirection: 'column', gap: 12,
        background: C.surface, borderRadius: 12,
        border: `1px dashed ${C.border}`,
        aspectRatio: '16/9',
      }}>
        <img src="/Icons/no_wifi.svg" alt="" style={{ width: 48, height: 48, opacity: 0.7 }} />
        <div style={{ fontSize: 14, color: C.muted }}>Waiting for workers to join...</div>
        <div style={{ fontSize: 11, color: C.border, fontFamily: 'var(--mono)' }}>
          Workers connect via the headset app
        </div>
      </div>
    )
  }

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: count === 1 ? '1fr' : '1fr 1fr',
      gap: 8,
    }}>
      {entries.map(([identity, stream]) => (
        <WorkerVideoTile
          key={identity}
          ref={identity === selectedIdentity ? videoRef : null}
          identity={identity}
          participant={stream.participant}
          videoTrack={stream.videoTrack}
          audioTrack={stream.audioTrack}
          isSelected={selectedIdentity === identity}
          onClick={() => onSelectWorker(identity)}
        />
      ))}
    </div>
  )
}
