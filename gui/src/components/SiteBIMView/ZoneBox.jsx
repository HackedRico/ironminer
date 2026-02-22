import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Edges, Html } from '@react-three/drei'

function congestionColor(level) {
  if (level <= 1) return '#22c55e'  // green
  if (level === 2) return '#86efac'  // light green
  if (level === 3) return '#eab308'  // yellow
  if (level === 4) return '#f97316'  // orange
  return '#ef4444'                   // red (5 — critical)
}

/**
 * ZoneBox — one interactive zone in the 3D BIM scene.
 *
 * Renders as a semi-transparent colored box with an edge wireframe.
 * Critical zones pulse their emissive glow via useFrame.
 * Hover/selected state shows an Html tooltip with zone details.
 */
export default function ZoneBox({ zone, position, size, selected, onClick }) {
  const meshRef = useRef(null)
  const [hovered, setHovered] = useState(false)

  const color = congestionColor(zone.congestion)
  const isCritical = zone.status === 'critical'
  const edgeColor = selected ? '#ffffff' : hovered ? color : '#334155'

  useFrame(({ clock }) => {
    if (!meshRef.current?.material) return
    const mat = meshRef.current.material
    // Pulse emissive for critical zones, static glow for hover/selected
    if (isCritical) {
      mat.emissiveIntensity = 0.18 + Math.sin(clock.elapsedTime * 2.5) * 0.18
    } else if (selected || hovered) {
      mat.emissiveIntensity = 0.12
    } else {
      mat.emissiveIntensity = 0
    }
    mat.opacity = selected ? 0.8 : hovered ? 0.72 : 0.52
  })

  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={e => { e.stopPropagation(); onClick() }}
        onPointerOver={e => {
          e.stopPropagation()
          setHovered(true)
          document.body.style.cursor = 'pointer'
        }}
        onPointerOut={() => {
          setHovered(false)
          document.body.style.cursor = 'default'
        }}
      >
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={0}
          transparent
          opacity={0.52}
        />
        <Edges color={edgeColor} />
      </mesh>

      {/* Tooltip — shown on hover or when selected */}
      {(hovered || selected) && (
        <Html
          position={[0, size[1] / 2 + 0.5, 0]}
          center
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            background: 'rgba(8,10,16,0.96)',
            border: `1px solid ${color}`,
            borderRadius: 8,
            padding: '8px 12px',
            fontSize: 12,
            color: '#e2e8f0',
            minWidth: 170,
            maxWidth: 230,
            boxShadow: `0 4px 24px ${color}55`,
            whiteSpace: 'nowrap',
          }}>
            <div style={{ fontWeight: 700, color, marginBottom: 4, fontSize: 11 }}>
              {zone.zone}
            </div>
            <div style={{ display: 'flex', gap: 10, fontSize: 10, color: '#94a3b8', marginBottom: 6 }}>
              <span>{zone.workers} workers</span>
              <span>{zone.trades.join(', ')}</span>
            </div>
            {/* Congestion bar */}
            <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} style={{
                  width: 18, height: 5, borderRadius: 2,
                  background: n <= zone.congestion ? color : '#1e293b',
                }} />
              ))}
              <span style={{
                marginLeft: 4, fontSize: 9, color: '#64748b',
                fontFamily: 'var(--mono)', letterSpacing: '0.05em',
              }}>
                {zone.status.toUpperCase()}
              </span>
            </div>
          </div>
        </Html>
      )}
    </group>
  )
}
