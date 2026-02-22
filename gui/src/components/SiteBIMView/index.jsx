import { Suspense, useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { OrbitControls, Edges } from '@react-three/drei'
import ZoneBox from './ZoneBox'
import { SITE_LAYOUTS } from './siteLayouts'

const CONGESTION_COLORS = ['#22c55e', '#86efac', '#eab308', '#f97316', '#ef4444']
const CONGESTION_LABELS = ['Clear', 'Low', 'Moderate', 'High', 'Critical']

/** Wireframe + faint-fill box for the building structure */
function BuildingShell({ position, size, isSlab }) {
  return (
    <mesh position={position}>
      <boxGeometry args={size} />
      <meshStandardMaterial
        color={isSlab ? '#1e3a5f' : '#0d1f35'}
        transparent
        opacity={isSlab ? 0.45 : 0.08}
      />
      <Edges color={isSlab ? '#2d4f7a' : '#1e3a5f'} />
    </mesh>
  )
}

/** All Three.js objects live inside this component (must be inside Canvas) */
function Scene({ layout, zones, selectedIdx, onSelect }) {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[15, 20, 10]} intensity={0.9} />
      <directionalLight position={[-10, 10, -10]} intensity={0.3} color="#6ea8ff" />

      {layout.buildings.map((b, i) => (
        <BuildingShell key={i} position={b.position} size={b.size} isSlab={b.isSlab} />
      ))}

      {zones.map((zone, i) => {
        const layoutZone = layout.zones[i]
        if (!layoutZone) return null
        return (
          <ZoneBox
            key={i}
            zone={zone}
            position={layoutZone.position}
            size={layoutZone.size}
            selected={selectedIdx === i}
            onClick={() => onSelect(i)}
          />
        )
      })}

      <OrbitControls
        makeDefault
        target={layout.orbitTarget}
        minDistance={8}
        maxDistance={60}
        maxPolarAngle={Math.PI / 2}
      />
      <gridHelper args={[60, 30, '#1e293b', '#0f172a']} />
    </>
  )
}

/**
 * SiteBIMView — procedural 3D BIM viewer for a construction site.
 *
 * Renders zone boxes coloured by congestion level.
 * Clicking a zone shows its details in a side panel and calls onSelectZone.
 */
export default function SiteBIMView({ zones, siteId, onSelectZone }) {
  const [selectedIdx, setSelectedIdx] = useState(null)
  const layout = SITE_LAYOUTS[siteId]

  // Reset selection when site changes
  useEffect(() => {
    setSelectedIdx(null)
    onSelectZone?.(null)
  }, [siteId])

  const handleSelect = (i) => {
    const next = selectedIdx === i ? null : i
    setSelectedIdx(next)
    onSelectZone?.(next !== null ? zones[next] : null)
  }

  if (!layout) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: 400, color: '#64748b', fontSize: 14,
      }}>
        No 3D layout available for this site.
      </div>
    )
  }

  const selectedZone = selectedIdx !== null ? zones[selectedIdx] : null

  return (
    <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>

      {/* ── 3D Canvas ───────────────────────────────────────────────────────── */}
      <div style={{
        flex: 1,
        position: 'relative',
        height: 520,
        borderRadius: 14,
        overflow: 'hidden',
        border: '1px solid rgba(255,255,255,0.06)',
        background: 'radial-gradient(ellipse at 30% 40%, #0d1b2e 0%, #050709 100%)',
      }}>
        {/* Header bar */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
          padding: '12px 16px',
          background: 'linear-gradient(rgba(0,0,0,0.65), transparent)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          pointerEvents: 'none',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{
              fontSize: 10, fontFamily: 'var(--mono)', color: '#64748b',
              letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
              3D Site Model
            </span>
            <span style={{
              fontSize: 9, background: 'rgba(249,115,22,0.15)', color: '#fb923c',
              padding: '2px 6px', borderRadius: 3,
              fontFamily: 'var(--mono)', letterSpacing: '0.05em',
            }}>
              PROCEDURAL
            </span>
          </div>
          <span style={{ fontSize: 10, color: '#475569', fontFamily: 'var(--mono)' }}>
            Drag to orbit · Scroll to zoom
          </span>
        </div>

        {/* Canvas — key=siteId so camera resets on site change */}
        <Canvas
          key={siteId}
          camera={{ position: layout.camera.position, fov: 45, near: 0.1, far: 500 }}
          gl={{ antialias: true }}
        >
          <Suspense fallback={null}>
            <Scene
              layout={layout}
              zones={zones}
              selectedIdx={selectedIdx}
              onSelect={handleSelect}
            />
          </Suspense>
        </Canvas>

        {/* Congestion legend */}
        <div style={{
          position: 'absolute', bottom: 16, left: 16, zIndex: 10,
          display: 'flex', gap: 10,
          background: 'rgba(0,0,0,0.72)',
          padding: '7px 12px', borderRadius: 8,
          border: '1px solid rgba(255,255,255,0.06)',
          pointerEvents: 'none',
        }}>
          {CONGESTION_COLORS.map((color, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: color }} />
              <span style={{ fontSize: 9, color: '#64748b', fontFamily: 'var(--mono)' }}>
                {CONGESTION_LABELS[i]}
              </span>
            </div>
          ))}
        </div>

        {/* Click hint (shown until something is selected) */}
        {selectedIdx === null && (
          <div style={{
            position: 'absolute', bottom: 16, right: 16, zIndex: 10,
            fontSize: 10, color: '#475569', fontFamily: 'var(--mono)',
            pointerEvents: 'none',
          }}>
            Click a zone to inspect
          </div>
        )}
      </div>

      {/* ── Zone detail panel (right sidebar) ──────────────────────────────── */}
      {selectedZone && (
        <div style={{
          width: 216,
          flexShrink: 0,
          background: 'rgba(255,255,255,0.02)',
          border: '1px solid rgba(255,255,255,0.06)',
          borderRadius: 12,
          padding: 16,
        }}>
          <div style={{
            fontSize: 10, fontFamily: 'var(--mono)', color: '#64748b',
            letterSpacing: '0.1em', marginBottom: 12,
          }}>
            ZONE DETAIL
          </div>

          <div style={{ fontSize: 13, fontWeight: 700, color: '#f8fafc', marginBottom: 10, lineHeight: 1.4 }}>
            {selectedZone.zone}
          </div>

          {/* Congestion meter */}
          <div style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontSize: 10, color: '#64748b' }}>Congestion</span>
              <span style={{ fontSize: 10, color: '#f8fafc', fontFamily: 'var(--mono)' }}>
                {selectedZone.congestion}/5
              </span>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <div key={n} style={{
                  flex: 1, height: 6, borderRadius: 2,
                  background: n <= selectedZone.congestion
                    ? CONGESTION_COLORS[selectedZone.congestion - 1]
                    : '#1e293b',
                }} />
              ))}
            </div>
          </div>

          {/* Status badge */}
          <div style={{
            display: 'inline-block', padding: '3px 8px', borderRadius: 4,
            fontSize: 10, fontFamily: 'var(--mono)', fontWeight: 700, letterSpacing: '0.06em',
            background: selectedZone.status === 'critical' ? 'rgba(239,68,68,0.15)'
                      : selectedZone.status === 'warning'  ? 'rgba(234,179,8,0.15)'
                      : 'rgba(34,197,94,0.15)',
            color: selectedZone.status === 'critical' ? '#fca5a5'
                 : selectedZone.status === 'warning'  ? '#fef08a'
                 : '#bbf7d0',
            marginBottom: 14,
          }}>
            {selectedZone.status.toUpperCase()}
          </div>

          {/* Stats */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 2 }}>Workers on site</div>
              <div style={{
                fontSize: 20, fontWeight: 700, color: '#e2e8f0', fontFamily: 'var(--mono)',
              }}>
                {selectedZone.workers}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: '#64748b', marginBottom: 5 }}>Active trades</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                {selectedZone.trades.map((t, i) => (
                  <span key={i} style={{
                    fontSize: 10, padding: '2px 7px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.06)', color: '#94a3b8',
                  }}>
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <button
            onClick={() => { setSelectedIdx(null); onSelectZone?.(null) }}
            style={{
              marginTop: 16, width: '100%', padding: '8px 0', borderRadius: 8,
              border: '1px solid rgba(255,255,255,0.08)',
              background: 'rgba(255,255,255,0.03)',
              cursor: 'pointer', fontSize: 12, color: '#64748b',
            }}
          >
            Clear selection
          </button>
        </div>
      )}
    </div>
  )
}
