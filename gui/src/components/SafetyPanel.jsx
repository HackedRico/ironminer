import { useState } from 'react'
import { runSafetyAnalysis, fetchSafetyReport } from '../api/safety'
import { severityStyle, C } from '../utils/colors'

const riskColor = {
  critical: { bg: 'rgba(239,68,68,0.18)', border: '#EF4444', text: '#FCA5A5' },
  high:     { bg: 'rgba(239,68,68,0.14)', border: '#EF4444', text: '#FCA5A5' },
  medium:   { bg: 'rgba(245,158,11,0.14)', border: '#F59E0B', text: '#FCD34D' },
  low:      { bg: 'rgba(34,197,94,0.14)', border: '#22C55E', text: '#86EFAC' },
}

// Mock safety report for demo mode (mirrors deterministic Phase 1 output)
const MOCK_SAFETY_REPORT = {
  s1: {
    site_id: 's1',
    overall_risk: 'critical',
    summary: 'The Riverside Tower site presents critical safety concerns across multiple zones. Zone B on Level 3 is the highest priority — three trades are packed into 400 sqft with blocked egress, and two electricians are working at scaffold edge without harness tie-off (29 CFR 1926.502). Zone C has two workers in the crane swing radius without hard hats, a repeat violation. Zone E has active hot work without fire watch near stacked insulation, and electrical work on a live panel without LOTO signage. Immediate action required on fall protection and fire watch.',
    violations: [
      { zone: 'Zone A — Ground Level West', type: 'ppe_missing', severity: 'medium', description: 'Worker w_a3 (concrete) missing safety glasses and hi-vis vest near roadway. 29 CFR 1926.100 + 1926.201.', workers_affected: 1 },
      { zone: 'Zone A — Ground Level West', type: 'ppe_missing', severity: 'medium', description: 'Worker w_a4 (concrete) missing hi-vis vest near roadway edge. 29 CFR 1926.201.', workers_affected: 1 },
      { zone: 'Zone B — Level 3 East Scaffolding', type: 'ppe_missing', severity: 'medium', description: 'Worker w_b1 (electrical) missing hard hat at 30 ft on scaffold. 29 CFR 1926.100.', workers_affected: 1 },
      { zone: 'Zone B — Level 3 East Scaffolding', type: 'zone_breach', severity: 'high', description: 'Worker w_b1 (electrical) at 30 ft with harness not tied off near edge. 29 CFR 1926.502(d) — PFAS must be anchored.', workers_affected: 1 },
      { zone: 'Zone B — Level 3 East Scaffolding', type: 'zone_breach', severity: 'high', description: 'Worker w_b2 (electrical) at 30 ft with harness not tied off near edge. 29 CFR 1926.502(d).', workers_affected: 1 },
      { zone: 'Zone B — Level 3 East Scaffolding', type: 'ppe_missing', severity: 'medium', description: 'Worker w_b4 (plumbing) missing hard hat at 30 ft on scaffold. 29 CFR 1926.100.', workers_affected: 1 },
      { zone: 'Zone B — Level 3 East Scaffolding', type: 'zone_breach', severity: 'high', description: '3 trades (electrical, plumbing, framing) in 400 sqft area. Multi-trade congestion creates coordination hazards. OSHA multi-employer worksite doctrine applies.', workers_affected: 9 },
      { zone: 'Zone B — Level 3 East Scaffolding', type: 'blocked_corridor', severity: 'medium', description: 'Egress path blocked by staged conduit bundles and pipe sections. 29 CFR 1926.34 — means of egress must remain clear.', workers_affected: 9 },
      { zone: 'Zone C — North Exterior', type: 'ppe_missing', severity: 'high', description: 'Worker w_c1 (framing) in crane swing radius without hard hat. 29 CFR 1926.100 + 1926.1400 — struck-by + PPE violation.', workers_affected: 1 },
      { zone: 'Zone C — North Exterior', type: 'ppe_missing', severity: 'high', description: 'Worker w_c2 (framing) in crane swing radius without hard hat. 29 CFR 1926.100 + 1926.1400.', workers_affected: 1 },
      { zone: 'Zone C — North Exterior', type: 'clearance_issue', severity: 'high', description: 'Worker w_c3 standing under suspended crane load. 29 CFR 1926.1431 — no workers permitted under suspended loads.', workers_affected: 1 },
      { zone: 'Zone C — North Exterior', type: 'clearance_issue', severity: 'high', description: 'Crane signal person lacks clear line of sight to operator. 29 CFR 1926.1419.', workers_affected: 1 },
      { zone: 'Zone D — South Parking / Staging', type: 'blocked_corridor', severity: 'high', description: 'Delivery truck blocking emergency vehicle access lane. 29 CFR 1926.34 — means of egress must remain clear.', workers_affected: 2 },
      { zone: 'Zone D — South Parking / Staging', type: 'clearance_issue', severity: 'medium', description: 'Lumber stack at 8 ft without cross-bracing. 29 CFR 1926.250(a)(1) — stacked materials must be stable.', workers_affected: 2 },
      { zone: 'Zone E — Level 2 Interior', type: 'clearance_issue', severity: 'high', description: 'Hot work (angle grinder) without fire watch — sparks near stacked insulation. 29 CFR 1926.352(e).', workers_affected: 5 },
      { zone: 'Zone E — Level 2 Interior', type: 'clearance_issue', severity: 'high', description: 'Work on live electrical panel without LOTO signage. 29 CFR 1926.417 — lockout/tagout required.', workers_affected: 5 },
      { zone: 'Zone E — Level 2 Interior', type: 'zone_breach', severity: 'medium', description: 'Worker w_e5 on ladder without 3-point contact. 29 CFR 1926.1053(b)(1).', workers_affected: 1 },
    ],
    ppe_compliance: {
      'Zone A — Ground Level West': false,
      'Zone B — Level 3 East Scaffolding': false,
      'Zone C — North Exterior': false,
      'Zone D — South Parking / Staging': true,
      'Zone E — Level 2 Interior': true,
    },
    zone_adherence: {
      'Zone A — Ground Level West': false,
      'Zone B — Level 3 East Scaffolding': false,
      'Zone C — North Exterior': false,
      'Zone D — South Parking / Staging': false,
      'Zone E — Level 2 Interior': false,
    },
  },
}

export default function SafetyPanel({ siteId }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [usingMock, setUsingMock] = useState(false)
  const [dismissed, setDismissed] = useState({}) // index -> true
  const [expanded, setExpanded] = useState(null)

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    setDismissed({})
    setUsingMock(false)
    try {
      await runSafetyAnalysis(siteId, 'mock_vj_001')
      const data = await fetchSafetyReport(siteId)
      setReport(data)
    } catch (e) {
      // Backend unavailable — fall back to mock report
      const mock = MOCK_SAFETY_REPORT[siteId]
      if (mock) {
        setReport(mock)
        setUsingMock(true)
      } else {
        setError(e.message || 'Analysis failed')
      }
    } finally {
      setLoading(false)
    }
  }

  // ── Run button (always visible) ──────────────────────────────────────────
  const runButton = (
    <button
      onClick={handleRun}
      disabled={loading}
      style={{
        padding: '12px 28px', borderRadius: 10,
        border: '1px solid rgba(249,115,22,0.4)',
        background: loading ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.14)',
        color: '#FB923C', fontSize: 14, fontWeight: 600, cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.2s', marginBottom: 20,
      }}
    >
      {loading ? 'Running analysis...' : 'Run Safety Analysis'}
    </button>
  )

  if (error) {
    return (
      <div>
        {runButton}
        <div style={{ color: '#FCA5A5', fontSize: 13, padding: '12px 16px', background: 'rgba(239,68,68,0.08)', borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      </div>
    )
  }

  if (!report) {
    return (
      <div>
        {runButton}
        <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 14 }}>
          No safety report yet. Click above to run an analysis.
        </div>
      </div>
    )
  }

  const rc = riskColor[report.overall_risk] || riskColor.low

  return (
    <div>
      {runButton}

      {usingMock && (
        <div style={{ fontSize: 11, color: '#F59E0B', marginBottom: 12, fontFamily: 'var(--mono)', letterSpacing: '0.05em' }}>
          DEMO DATA — backend unavailable, showing mock safety report
        </div>
      )}

      {/* ── Overall Risk Badge ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Overall Risk</span>
        <span style={{
          padding: '6px 18px', borderRadius: 20, fontSize: 14, fontWeight: 700,
          textTransform: 'uppercase', letterSpacing: '0.06em',
          background: rc.bg, border: `1px solid ${rc.border}`, color: rc.text,
        }}>
          {report.overall_risk}
        </span>
      </div>

      {/* ── Executive Summary ─────────────────────────────────────────────── */}
      <div style={{
        fontSize: 13, color: '#F1F5F9', lineHeight: 1.7, marginBottom: 24,
        padding: '14px 18px', background: 'rgba(249,115,22,0.04)',
        border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8,
        borderLeft: '3px solid rgba(249,115,22,0.4)',
      }}>
        {report.summary}
      </div>

      {/* ── Violations ────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Violations ({report.violations?.length || 0})
        </div>
        {(report.violations || []).map((v, i) => {
          const sty = severityStyle[v.severity] || severityStyle.low
          const isDismissed = dismissed[i]
          const isExpanded = expanded === i
          return (
            <div
              key={i}
              style={{
                background: sty.bg, border: `1px solid ${sty.border}`, borderRadius: 10,
                padding: '12px 16px', marginBottom: 8, cursor: 'pointer',
                opacity: isDismissed ? 0.4 : 1,
                textDecoration: isDismissed ? 'line-through' : 'none',
                transition: 'all 0.2s',
              }}
              onClick={() => setExpanded(isExpanded ? null : i)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: sty.dot, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: '#94A3B8' }}>{v.zone}</span>
                  <span style={{
                    fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                    background: 'rgba(255,255,255,0.06)', color: '#CBD5E1', textTransform: 'uppercase',
                  }}>
                    {v.type}
                  </span>
                </div>
                <span style={{ fontSize: 11, color: '#64748B' }}>{v.workers_affected} worker{v.workers_affected !== 1 ? 's' : ''}</span>
              </div>
              {isExpanded && (
                <div style={{ marginTop: 10 }}>
                  <div style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6, marginBottom: 10 }}>
                    {v.description}
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setDismissed(d => ({ ...d, [i]: !d[i] })) }}
                    style={{
                      padding: '4px 14px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: isDismissed ? 'rgba(34,197,94,0.1)' : 'rgba(255,255,255,0.04)',
                      color: isDismissed ? '#86EFAC' : '#94A3B8', cursor: 'pointer',
                    }}
                  >
                    {isDismissed ? 'Restore' : 'Dismiss'}
                  </button>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── PPE Compliance Grid ───────────────────────────────────────────── */}
      {report.ppe_compliance && Object.keys(report.ppe_compliance).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            PPE Compliance
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {Object.entries(report.ppe_compliance).map(([zone, ok]) => (
              <div key={zone} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 16 }}>{ok ? '\u2705' : '\u274C'}</span>
                <span style={{ fontSize: 12, color: '#CBD5E1' }}>{zone}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Zone Adherence Grid ───────────────────────────────────────────── */}
      {report.zone_adherence && Object.keys(report.zone_adherence).length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Zone Adherence
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
            {Object.entries(report.zone_adherence).map(([zone, ok]) => (
              <div key={zone} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '8px 14px', borderRadius: 8,
                background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
              }}>
                <span style={{ fontSize: 16 }}>{ok ? '\u2705' : '\u274C'}</span>
                <span style={{ fontSize: 12, color: '#CBD5E1' }}>{zone}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
