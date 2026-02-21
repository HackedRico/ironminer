import { useState, useEffect } from 'react'
import SiteCard from '../components/SiteCard'
import ZoneRow from '../components/ZoneRow'
import AlertCard from '../components/AlertCard'
import BriefingView from '../components/BriefingView'
import UploadZone from '../components/UploadZone'
import { fetchSites, fetchBriefing } from '../api/sites'
import { fetchAlerts } from '../api/alerts'
import { fetchZones } from '../api/productivity'
import { uploadVideo } from '../api/video'
import { MOCK_SITES, MOCK_ALERTS, MOCK_BRIEFINGS, MOCK_ZONES } from '../utils/mockData'

export default function ReviewMode() {
  const [sites, setSites] = useState([])
  const [selectedSite, setSelectedSite] = useState(null)
  const [tab, setTab] = useState('briefing')
  const [briefing, setBriefing] = useState(null)
  const [zones, setZones] = useState([])
  const [alerts, setAlerts] = useState([])
  const [expandedAlert, setExpandedAlert] = useState(null)
  const [usingMock, setUsingMock] = useState(false)

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
      fetchZones(selectedSite).then(setZones).catch(() => {
        const site = sites.find(s => s.id === selectedSite)
        setZones(site?.zones || [])
      })
    }
  }, [selectedSite, usingMock])

  const site = sites.find(s => s.id === selectedSite)

  const handleUpload = async (files) => {
    for (const file of files) {
      try {
        await uploadVideo(file, selectedSite)
      } catch (e) {
        console.error('Upload failed:', e)
      }
    }
  }

  return (
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
          <UploadZone onFiles={handleUpload} />
        </div>
      </div>

      {/* ── Right content: Briefing / Zones / Alerts tabs ────────────────── */}
      <div className="anim-in anim-d2">
        {site && (
          <>
            {/* Site header + tab buttons */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#F8FAFC' }}>{site.name}</h2>
                <p style={{ fontSize: 13, color: '#64748B', marginTop: 2 }}>{site.address}</p>
              </div>
              <div style={{ display: 'flex', gap: 4 }}>
                {['briefing', 'zones', 'alerts'].map(t => (
                  <button key={t} onClick={() => setTab(t)} style={{
                    padding: '8px 18px', borderRadius: 8, border: '1px solid',
                    borderColor: tab === t ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.06)',
                    background: tab === t ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.02)',
                    cursor: 'pointer', fontSize: 13, fontWeight: tab === t ? 600 : 400,
                    color: tab === t ? '#FB923C' : '#94A3B8', transition: 'all 0.2s',
                    textTransform: 'capitalize',
                  }}>
                    {t === 'alerts' ? `Alerts (${alerts.length})` : t}
                  </button>
                ))}
              </div>
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
                <BriefingView text={briefing} />
              </div>
            )}

            {/* ── TAB: Zones ─────────────────────────────────────────────── */}
            {tab === 'zones' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zone Congestion Map</span>
                </div>
                {zones.length > 0
                  ? zones.map((z, i) => <ZoneRow key={i} zone={z} />)
                  : <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 14 }}>No zone data available for this site yet.</div>
                }
              </div>
            )}

            {/* ── TAB: Alerts ────────────────────────────────────────────── */}
            {tab === 'alerts' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Spatial Alerts</span>
                </div>
                {alerts.length === 0
                  ? <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 14 }}>No alerts for this site. Everything looks good.</div>
                  : alerts.map(a => (
                    <AlertCard key={a.id} alert={a} expanded={expandedAlert === a.id} onToggle={() => setExpandedAlert(expandedAlert === a.id ? null : a.id)} />
                  ))
                }
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
