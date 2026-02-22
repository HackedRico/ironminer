import { useState, useEffect } from 'react'
import { runSafetyAnalysis, fetchSafetyReport } from '../api/safety'
import { connectPipeline } from '../api/streaming'
import { severityStyle } from '../utils/colors'

const riskColor = {
  critical: { bg: 'rgba(239,68,68,0.18)', border: '#EF4444', text: '#FCA5A5' },
  high: { bg: 'rgba(239,68,68,0.14)', border: '#EF4444', text: '#FCA5A5' },
  medium: { bg: 'rgba(245,158,11,0.14)', border: '#F59E0B', text: '#FCD34D' },
  low: { bg: 'rgba(34,197,94,0.14)', border: '#22C55E', text: '#86EFAC' },
}

/**
 * Defensively parse the summary field — the LLM sometimes returns
 * the raw JSON string {"summary": "..."} instead of just the text.
 * Also splits into paragraphs on double-newlines or numbered markers.
 */
function parseSummary(raw) {
  if (!raw) return []
  let text = raw.trim()
  // Strip JSON wrapper if present
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      text = parsed.summary ?? parsed.text ?? Object.values(parsed)[0] ?? text
    } catch {
      // Not valid JSON — strip leading/trailing braces and quotes as best effort
      text = text.replace(/^\{\s*"summary"\s*:\s*"/, '').replace(/"\s*\}$/, '')
    }
  }
  // Split on double newlines, or on the numbered paragraph pattern ("1. ", "2. ", "3. ")
  const parts = text
    .split(/\n{2,}|(?=\b[1-3]\.\s)/)
    .map(p => p.trim())
    .filter(Boolean)
  return parts.length > 1 ? parts : [text]
}


export default function SafetyPanel({ siteId }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [dismissed, setDismissed] = useState({}) // index -> true
  const [expanded, setExpanded] = useState(null)

  // ── Auto-load existing report on mount / site change ──────────────────────
  const loadReport = async () => {
    try {
      const data = await fetchSafetyReport(siteId)
      setReport(data)
    } catch {
      // No report yet — that's fine
    }
  }

  useEffect(() => {
    if (!siteId) return
    loadReport()
  }, [siteId])

  // ── Listen for pipeline WebSocket updates ────────────────────────────────
  useEffect(() => {
    if (!siteId) return
    let ws
    try {
      ws = connectPipeline(siteId)
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.stage === 'safety_complete') {
            loadReport()
          }
        } catch {}
      }
    } catch {}
    return () => { ws?.close() }
  }, [siteId])

  const handleRun = async () => {
    setLoading(true)
    setError(null)
    setDismissed({})
    try {
      await runSafetyAnalysis(siteId, 'mock_vj_001')
      const data = await fetchSafetyReport(siteId)
      setReport(data)
    } catch (err) {
      setError('Backend unavailable — make sure the server is running.')
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
      {loading ? 'Running analysis...' : report ? 'Re-run Safety Analysis' : 'Run Safety Analysis'}
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
        fontSize: 13, color: '#F1F5F9', lineHeight: 1.75, marginBottom: 24,
        padding: '14px 18px', background: 'rgba(249,115,22,0.04)',
        border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8,
        borderLeft: '3px solid rgba(249,115,22,0.4)',
      }}>
        {parseSummary(report.summary).map((para, i) => (
          <p key={i} style={{ margin: i === 0 ? 0 : '10px 0 0 0' }}>{para}</p>
        ))}
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
