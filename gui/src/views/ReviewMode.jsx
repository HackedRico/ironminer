import { useState, useEffect } from 'react'
import SiteCard from '../components/SiteCard'
import ZoneRow from '../components/ZoneRow'
import AlertCard from '../components/AlertCard'
import BriefingView from '../components/BriefingView'
import MediaGallery from '../components/MediaGallery'
import SafetyPanel from '../components/SafetyPanel'
import ProductivityPanel from '../components/ProductivityPanel'
import AddProjectModal from '../components/AddProjectModal'
import SiteBIMView from '../components/SiteBIMView'
import { fetchSites, fetchBriefing, createSite } from '../api/sites'
import { fetchAlerts } from '../api/alerts'
import { fetchZones, fetchProductivityReport } from '../api/productivity'
import { connectPipeline } from '../api/streaming'
import { MOCK_SITES, MOCK_ALERTS, MOCK_BRIEFINGS, MOCK_ZONES } from '../utils/mockData'

export default function ReviewMode() {
  const [sites, setSites] = useState([])
  const [selectedSite, setSelectedSite] = useState(null)
  const [tab, setTab] = useState('briefing')
  const [briefing, setBriefing] = useState(null)
  const [zones, setZones] = useState([])
  const [alerts, setAlerts] = useState([])
  const [expandedAlert, setExpandedAlert] = useState(null)
  const [expandedZone, setExpandedZone] = useState(null)
  const [usingMock, setUsingMock] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)

  // ── Load sites (API → mock fallback) ──────────────────────────────────────
  useEffect(() => {
    fetchSites()
      .then(data => {
        setSites(data)
        if (data.length && !selectedSite) setSelectedSite(data[0].id)
      })
      .catch(() => {
        // Backend unavailable — use mock data
        setUsingMock(true)
        setSites(MOCK_SITES)
        setSelectedSite(MOCK_SITES[0].id)
      })
  }, [])

  // ── Load site detail data when selection changes ──────────────────────────
  useEffect(() => {
    if (!selectedSite) return

    if (usingMock) {
      // ── MOCK: pull from local constants ──
      setBriefing(MOCK_BRIEFINGS[selectedSite] || null)
      setAlerts(MOCK_ALERTS.filter(a => a.site_id === selectedSite))
      setZones(MOCK_ZONES[selectedSite] || [])
    } else {
      // ── LIVE: fetch from backend API ──
      fetchBriefing(selectedSite).then(b => setBriefing(b.text)).catch(() => setBriefing(null))
      fetchAlerts({ site_id: selectedSite }).then(setAlerts).catch(() => setAlerts([]))
      const currentSite = sites.find(s => s.id === selectedSite)
      // Skip productivity fetch for sites with no processed footage (avoids 404 noise)
      if (currentSite && currentSite.frames === 0 && (!currentSite.zones || currentSite.zones.length === 0)) {
        setZones([])
      } else {
        fetchProductivityReport(selectedSite)
          .then(report => { if (report?.zones?.length) setZones(report.zones); else throw new Error('no zones') })
          .catch(() => {
            fetchZones(selectedSite).then(setZones).catch(() => {
              setZones(currentSite?.zones || [])
            })
          })
      }
    }
  }, [selectedSite, usingMock])

  // ── Listen for pipeline WebSocket updates → refresh data ──────────────────
  useEffect(() => {
    if (!selectedSite || usingMock) return
    let ws
    try {
      ws = connectPipeline(selectedSite)
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.stage === 'video_complete') {
            fetchBriefing(selectedSite).then(b => setBriefing(b.text)).catch(() => {})
          }
          if (msg.stage === 'productivity_complete') {
            fetchProductivityReport(selectedSite)
              .then(report => { if (report?.zones) setZones(report.zones) })
              .catch(() => {})
          }
          if (msg.stage === 'pipeline_complete') {
            // Refresh site list so frame counts / hasFootage update
            fetchSites().then(data => setSites(data)).catch(() => {})
          }
        } catch {}
      }
    } catch {}
    return () => { ws?.close() }
  }, [selectedSite, usingMock])

  const site = sites.find(s => s.id === selectedSite)

  const handleModalSuccess = (newSite) => {
    fetchSites()
      .then(data => { setSites(data); setSelectedSite(newSite.id) })
      .catch(() => { setSites(prev => [...prev, newSite]); setSelectedSite(newSite.id) })
    setModalOpen(false)
    setTab('briefing')
  }

  return (
    <>
    <div style={{ display: 'grid', gridTemplateColumns: '340px 1fr', gap: 24 }}>
      {/* ── Left sidebar: Site list + Upload ─────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, paddingLeft: 4 }}>
          Job Sites ({sites.length})
          {usingMock && <span style={{ marginLeft: 8, color: '#F59E0B', fontSize: 9, letterSpacing: '0.05em' }}>DEMO DATA</span>}
        </div>
        {sites.map((s, i) => (
          <div key={s.id} className={`anim-in anim-d${Math.min(i + 1, 3)}`}>
            <SiteCard site={s} selected={selectedSite === s.id} onClick={() => { setSelectedSite(s.id); setExpandedAlert(null) }} />
          </div>
        ))}
        <div style={{ marginTop: 16 }}>
          <button
            onClick={() => setModalOpen(true)}
            style={{
              width: '100%', padding: '14px 20px', borderRadius: 12,
              border: '1.5px dashed rgba(249,115,22,0.35)',
              background: 'rgba(249,115,22,0.04)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              gap: 8, color: '#FB923C', fontSize: 14, fontWeight: 600,
              transition: 'all 0.2s',
            }}
          >
            <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> Add Project
          </button>
        </div>
      </div>

      {/* ── Right content: Briefing / Zones / Alerts tabs ────────────────── */}
      <div className="anim-in anim-d2">
        {site && (
          <>
            {/* Site header + tab buttons (same aesthetic as main nav) */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#F8FAFC' }}>{site.name}</h2>
              </div>
              <nav style={{ display: 'flex', alignItems: 'flex-end', gap: 0 }}>
                {['briefing', 'zones', 'alerts', 'media', 'bim', 'safety', 'productivity'].map(t => {
                  const active = tab === t
                  const label = t === 'alerts' ? 'Alerts' : t === 'bim' ? '3D' : t === 'safety' ? 'Safety' : t
                  return (
                    <button
                      key={t}
                      onClick={() => setTab(t)}
                      style={{
                        padding: '10px 14px 12px',
                        marginBottom: -1,
                        border: 'none',
                        background: 'none',
                        cursor: 'pointer',
                        position: 'relative',
                        font: 'inherit',
                        fontSize: 13,
                        fontWeight: active ? 600 : 400,
                        color: active ? '#F8FAFC' : '#64748B',
                        transition: 'color 0.2s',
                        textTransform: (t === 'bim' || t === 'safety') ? 'none' : 'capitalize',
                      }}
                    >
                      {label}
                      {active && (
                        <span
                          style={{
                            position: 'absolute',
                            bottom: 0,
                            left: '50%',
                            transform: 'translateX(-50%)',
                            width: 'calc(100% - 12px)',
                            maxWidth: 72,
                            height: 2,
                            background: '#D97706',
                            borderRadius: 1,
                          }}
                        />
                      )}
                    </button>
                  )
                })}
              </nav>
            </div>

            {/* ── TAB: Briefing ──────────────────────────────────────────── */}
            {tab === 'briefing' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Today's Briefing</span>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#475569', background: 'rgba(255,255,255,0.04)', padding: '4px 10px', borderRadius: 4 }}>
                    AI-generated from {site.frames} frames
                  </span>
                </div>
                <BriefingView text={briefing} siteId={selectedSite} usingMock={usingMock} />
              </div>
            )}

            {/* ── TAB: Zones ─────────────────────────────────────────────── */}
            {tab === 'zones' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zone Congestion Map</span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5, marginBottom: 14, padding: '10px 14px', background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8, borderLeft: '3px solid rgba(249,115,22,0.4)' }}>
                  Real-time worker density by zone. Bars show congestion level — red zones have overlapping trades that may cause delays or safety conflicts.
                </div>
                {zones.length > 0
                  ? zones.map((z, i) => <ZoneRow key={i} zone={z} expanded={expandedZone === i} onToggle={() => setExpandedZone(expandedZone === i ? null : i)} />)
                  : <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 14 }}>No zone data available for this site yet.</div>
                }
              </div>
            )}

            {/* ── TAB: Alerts ────────────────────────────────────────────── */}
            {tab === 'alerts' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Spatial Alerts</span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5, marginBottom: 14, padding: '10px 14px', background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8, borderLeft: '3px solid rgba(249,115,22,0.4)' }}>
                  AI-detected safety and scheduling issues from uploaded footage. Expand an alert to see details and recommended actions.
                </div>
                {alerts.length === 0
                  ? <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 14 }}>No alerts for this site. Everything looks good.</div>
                  : alerts.map(a => (
                    <AlertCard key={a.id} alert={a} expanded={expandedAlert === a.id} onToggle={() => setExpandedAlert(expandedAlert === a.id ? null : a.id)} />
                  ))
                }
              </div>
            )}

            {/* ── TAB: Media ─────────────────────────────────────────────── */}
            {tab === 'media' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Uploaded Media
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5, marginBottom: 14, padding: '10px 14px', background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8, borderLeft: '3px solid rgba(249,115,22,0.4)' }}>
                  All video footage uploaded for this site. Click play to review clips, or upload new footage from the Briefing tab.
                </div>
                <MediaGallery siteId={selectedSite} usingMock={usingMock} />
              </div>
            )}

            {/* ── TAB: 3D BIM ────────────────────────────────────────────── */}
            {tab === 'bim' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>3D Site Model</span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5, marginBottom: 14, padding: '10px 14px', background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8, borderLeft: '3px solid rgba(249,115,22,0.4)' }}>
                  Procedural 3D layout with zone congestion heatmap. Click any zone to inspect workers and trades. Drag to orbit, scroll to zoom.
                </div>
                <SiteBIMView zones={zones} siteId={selectedSite} />
              </div>
            )}

            {/* ── TAB: Safety ─────────────────────────────────────────────── */}
            {tab === 'safety' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Safety Analysis
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(249,115,22,0.15)', color: '#FB923C', letterSpacing: '0.08em' }}>
                    PoC
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5, marginBottom: 14, padding: '10px 14px', background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8, borderLeft: '3px solid rgba(249,115,22,0.4)' }}>
                  Human-in-the-loop safety review. Run AI analysis on video data, review flagged violations, and dismiss false positives before they become alerts.
                </div>
                <SafetyPanel siteId={selectedSite} />
              </div>
            )}

            {/* ── TAB: Productivity ────────────────────────────────────────── */}
            {tab === 'productivity' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Productivity Analysis
                  </span>
                  <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(249,115,22,0.15)', color: '#FB923C', letterSpacing: '0.08em' }}>
                    PoC
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#94A3B8', lineHeight: 1.5, marginBottom: 14, padding: '10px 14px', background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8, borderLeft: '3px solid rgba(249,115,22,0.4)' }}>
                  Zone congestion scoring, trade overlap detection, and resource optimization recommendations — auto-generated from video analysis pipeline.
                </div>
                <ProductivityPanel siteId={selectedSite} hasFootage={site?.frames > 0} />
              </div>
            )}
          </>
        )}
      </div>
    </div>

    <AddProjectModal
      isOpen={modalOpen}
      onClose={() => setModalOpen(false)}
      onSuccess={handleModalSuccess}
    />
    </>
  )
}
