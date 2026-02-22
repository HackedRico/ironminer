import { useState, useEffect } from 'react'
import { fetchProductivityReport } from '../api/productivity'
import { connectPipeline } from '../api/streaming'

const trendColor = {
  improving: { bg: 'rgba(34,197,94,0.14)', border: '#22C55E', text: '#86EFAC' },
  stable:    { bg: 'rgba(59,130,246,0.14)', border: '#3B82F6', text: '#93C5FD' },
  worsening: { bg: 'rgba(239,68,68,0.14)', border: '#EF4444', text: '#FCA5A5' },
}

const congestionBar = (score) => {
  const colors = ['#22C55E', '#84CC16', '#F59E0B', '#F97316', '#EF4444']
  return colors[Math.min(score, 5) - 1] || '#64748B'
}

const severityBadge = {
  minor:    { bg: 'rgba(59,130,246,0.12)', border: 'rgba(59,130,246,0.25)', text: '#93C5FD' },
  moderate: { bg: 'rgba(245,158,11,0.12)', border: 'rgba(245,158,11,0.25)', text: '#FCD34D' },
  severe:   { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.25)', text: '#FCA5A5' },
}

function parseSummary(raw) {
  if (!raw) return []
  let text = raw.trim()
  if (text.startsWith('{')) {
    try {
      const parsed = JSON.parse(text)
      text = parsed.summary ?? parsed.text ?? Object.values(parsed)[0] ?? text
    } catch {
      text = text.replace(/^\{\s*"summary"\s*:\s*"/, '').replace(/"\s*\}$/, '')
    }
  }
  return text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
}

export default function ProductivityPanel({ siteId }) {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [expandedZone, setExpandedZone] = useState(null)
  const [expandedOverlap, setExpandedOverlap] = useState(null)

  const loadReport = async () => {
    try {
      const data = await fetchProductivityReport(siteId)
      setReport(data)
    } catch {
      setReport(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!siteId) return
    setLoading(true)
    loadReport()
  }, [siteId])

  // Listen for pipeline updates
  useEffect(() => {
    if (!siteId) return
    let ws
    try {
      ws = connectPipeline(siteId)
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.stage === 'productivity_complete') {
            loadReport()
          }
        } catch {}
      }
    } catch {}
    return () => { ws?.close() }
  }, [siteId])

  if (loading) {
    return <div style={{ textAlign: 'center', padding: 40, color: '#64748B', fontSize: 14 }}>Loading productivity data...</div>
  }

  if (!report) {
    return (
      <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 14 }}>
        No productivity report yet. Upload footage to generate one.
      </div>
    )
  }

  const tc = trendColor[report.congestion_trend] || trendColor.stable

  return (
    <div>
      {/* ── Trend + Stats Row ───────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <div style={{
          padding: '14px 22px', borderRadius: 12,
          background: tc.bg, border: `1px solid ${tc.border}`,
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Congestion Trend
          </span>
          <span style={{
            padding: '4px 14px', borderRadius: 16, fontSize: 13, fontWeight: 700,
            textTransform: 'uppercase', letterSpacing: '0.04em', color: tc.text,
            background: 'rgba(0,0,0,0.2)',
          }}>
            {report.congestion_trend}
          </span>
        </div>
        <div style={{
          padding: '14px 22px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Zones</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#F1F5F9' }}>{report.zones?.length || 0}</span>
        </div>
        <div style={{
          padding: '14px 22px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <span style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase' }}>Overlaps</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: '#F1F5F9' }}>{report.trade_overlaps?.length || 0}</span>
        </div>
      </div>

      {/* ── Executive Summary ─────────────────────────────────────────── */}
      {report.summary && (
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
      )}

      {/* ── Zone Congestion ──────────────────────────────────────────── */}
      {report.zones?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Zone Congestion ({report.zones.length})
          </div>
          {report.zones.map((z, i) => {
            const barColor = congestionBar(z.congestion)
            const isExpanded = expandedZone === i
            return (
              <div
                key={i}
                onClick={() => setExpandedZone(isExpanded ? null : i)}
                style={{
                  padding: '12px 16px', marginBottom: 8, borderRadius: 10, cursor: 'pointer',
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: '#F1F5F9', marginBottom: 6 }}>{z.zone}</div>
                    <div style={{ display: 'flex', gap: 4, height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.06)' }}>
                      <div style={{ width: `${(z.congestion / 5) * 100}%`, background: barColor, borderRadius: 3, transition: 'width 0.4s ease' }} />
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', minWidth: 60 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: barColor }}>{z.congestion}/5</div>
                    <div style={{ fontSize: 10, color: '#64748B' }}>{z.workers} workers</div>
                  </div>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {(z.trades || []).map(t => (
                        <span key={t} style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 4,
                          background: 'rgba(249,115,22,0.1)', color: '#FB923C',
                          fontFamily: 'var(--mono)',
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: '#64748B', marginTop: 6 }}>
                      Status: <span style={{ color: z.status === 'critical' ? '#FCA5A5' : z.status === 'warning' ? '#FCD34D' : '#86EFAC' }}>{z.status}</span>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Trade Overlaps ───────────────────────────────────────────── */}
      {report.trade_overlaps?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Trade Overlaps ({report.trade_overlaps.length})
          </div>
          {report.trade_overlaps.map((o, i) => {
            const sty = severityBadge[o.severity] || severityBadge.minor
            const isExpanded = expandedOverlap === i
            return (
              <div
                key={i}
                onClick={() => setExpandedOverlap(isExpanded ? null : i)}
                style={{
                  padding: '12px 16px', marginBottom: 8, borderRadius: 10, cursor: 'pointer',
                  background: sty.bg, border: `1px solid ${sty.border}`,
                  transition: 'all 0.2s',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: sty.text, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, color: '#94A3B8' }}>{o.zone}</span>
                    <span style={{
                      fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                      background: 'rgba(255,255,255,0.06)', color: sty.text, textTransform: 'uppercase',
                    }}>
                      {o.severity}
                    </span>
                  </div>
                  <span style={{ fontSize: 11, color: '#64748B' }}>{o.trades?.length || 0} trades</span>
                </div>
                {isExpanded && (
                  <div style={{ marginTop: 10 }}>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                      {(o.trades || []).map(t => (
                        <span key={t} style={{
                          fontSize: 11, padding: '3px 10px', borderRadius: 4,
                          background: 'rgba(255,255,255,0.06)', color: '#CBD5E1',
                        }}>
                          {t}
                        </span>
                      ))}
                    </div>
                    <div style={{ fontSize: 13, color: '#CBD5E1', lineHeight: 1.6 }}>
                      {o.recommendation}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ── Resource Suggestions ──────────────────────────────────────── */}
      {report.resource_suggestions?.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Recommendations
          </div>
          {report.resource_suggestions.map((s, i) => (
            <div key={i} style={{
              padding: '10px 16px', marginBottom: 6, borderRadius: 8,
              background: 'rgba(249,115,22,0.06)', border: '1px solid rgba(249,115,22,0.15)',
              fontSize: 13, color: '#FB923C', lineHeight: 1.6,
            }}>
              {s}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
