import { useState, useEffect } from 'react'
import { fetchTeams, fetchBenchmark, fetchBenchmarkVersions, saveBenchmark, runEvaluation } from '../api/productivity'

// ── Mock teams for offline fallback ─────────────────────────────────────────
const MOCK_TEAMS = [
  { id: 'team_alpha', name: 'Alpha Crew', zone_ids: ['Zone A — Ground Level West', 'Zone D — South Parking / Staging'] },
  { id: 'team_beta', name: 'Beta Crew', zone_ids: ['Zone B — Level 3 East Scaffolding', 'Zone C — North Exterior'] },
  { id: 'team_gamma', name: 'Gamma Crew', zone_ids: ['Zone E — Level 2 Interior'] },
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

// ── SVG Donut Pie Chart ─────────────────────────────────────────────────────
function PieChart({ completed, incomplete }) {
  const total = completed + incomplete || 1
  const pct = Math.round((completed / total) * 100)
  const radius = 54
  const circumference = 2 * Math.PI * radius
  const completedLen = (completed / total) * circumference
  const scoreColor = pct >= 70 ? '#22C55E' : pct >= 40 ? '#F59E0B' : '#EF4444'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <svg width="140" height="140" viewBox="0 0 140 140">
        {/* Background circle (incomplete) */}
        <circle cx="70" cy="70" r={radius} fill="none"
          stroke="rgba(239,68,68,0.3)" strokeWidth="14" />
        {/* Completed arc */}
        <circle cx="70" cy="70" r={radius} fill="none"
          stroke={scoreColor} strokeWidth="14"
          strokeDasharray={`${completedLen} ${circumference}`}
          strokeDashoffset={circumference * 0.25}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }} />
        {/* Center text */}
        <text x="70" y="66" textAnchor="middle" fill="#F1F5F9"
          fontSize="28" fontWeight="800" fontFamily="var(--body)">
          {pct}%
        </text>
        <text x="70" y="84" textAnchor="middle" fill="#64748B"
          fontSize="10" fontFamily="var(--mono)" letterSpacing="0.08em">
          COMPLETE
        </text>
      </svg>
      <div style={{ display: 'flex', gap: 16, fontSize: 11, color: '#94A3B8' }}>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: scoreColor, marginRight: 4 }} />Completed ({completed.toFixed(1)})</span>
        <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: 'rgba(239,68,68,0.5)', marginRight: 4 }} />Incomplete ({incomplete.toFixed(1)})</span>
      </div>
    </div>
  )
}

// ── Team Card ───────────────────────────────────────────────────────────────
function TeamCard({ team, selected, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        padding: '14px 18px', borderRadius: 12, cursor: 'pointer',
        background: selected ? 'rgba(249,115,22,0.1)' : 'rgba(255,255,255,0.02)',
        border: `1px solid ${selected ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.06)'}`,
        marginBottom: 8, transition: 'all 0.2s',
      }}
    >
      <div style={{ fontSize: 15, fontWeight: selected ? 700 : 500, color: selected ? '#FB923C' : '#F1F5F9' }}>
        {team.name}
      </div>
      <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontFamily: 'var(--mono)' }}>
        {team.zone_ids.length} zone{team.zone_ids.length !== 1 ? 's' : ''}
      </div>
    </div>
  )
}

// ── Category options ────────────────────────────────────────────────────────
const CATEGORIES = ['General', 'Safety', 'Cleanup', 'Materials', 'Install', 'Inspection']

// ── Main Component ──────────────────────────────────────────────────────────
export default function ProductivityMode() {
  // Teams
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [usingMock, setUsingMock] = useState(false)

  // Benchmark
  const [benchmarkItems, setBenchmarkItems] = useState([])
  const [benchmarkVersions, setBenchmarkVersions] = useState([])
  const [selectedVersionId, setSelectedVersionId] = useState(null)
  const [benchmarkDate, setBenchmarkDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)
  const [saveMsg, setSaveMsg] = useState(null)

  // VLM input
  const [vlmJson, setVlmJson] = useState(null)
  const [vlmFileName, setVlmFileName] = useState(null)
  const [vlmPasteOpen, setVlmPasteOpen] = useState(false)
  const [vlmPasteText, setVlmPasteText] = useState('')

  // Evaluation
  const [evalResult, setEvalResult] = useState(null)
  const [evaluating, setEvaluating] = useState(false)
  const [evalError, setEvalError] = useState(null)

  // ── Load teams ──────────────────────────────────────────────────────────
  useEffect(() => {
    fetchTeams()
      .then(data => {
        setTeams(data)
        if (data.length && !selectedTeam) setSelectedTeam(data[0].id)
      })
      .catch(() => {
        setUsingMock(true)
        setTeams(MOCK_TEAMS)
        setSelectedTeam(MOCK_TEAMS[0].id)
      })
  }, [])

  // ── Load benchmark when team or date changes ───────────────────────────
  useEffect(() => {
    if (!selectedTeam) return
    setEvalResult(null)
    setEvalError(null)

    // Load latest benchmark
    fetchBenchmark(selectedTeam, benchmarkDate)
      .then(data => {
        setBenchmarkItems(data.items || [])
        setSelectedVersionId(data.version_id)
      })
      .catch(() => {
        setBenchmarkItems([])
        setSelectedVersionId(null)
      })

    // Load all versions
    fetchBenchmarkVersions(selectedTeam, benchmarkDate)
      .then(data => setBenchmarkVersions(data || []))
      .catch(() => setBenchmarkVersions([]))
  }, [selectedTeam, benchmarkDate])

  // ── Benchmark editing ──────────────────────────────────────────────────
  const addItem = () => {
    setBenchmarkItems(prev => [
      ...prev,
      { id: `item_${Date.now()}`, text: '', weight: 1.0, category: 'General' },
    ])
  }

  const updateItem = (idx, field, value) => {
    setBenchmarkItems(prev => prev.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    ))
  }

  const removeItem = (idx) => {
    setBenchmarkItems(prev => prev.filter((_, i) => i !== idx))
  }

  const handleSaveBenchmark = async () => {
    if (benchmarkItems.length === 0 || benchmarkItems.every(i => !i.text.trim())) return
    setSaving(true)
    setSaveMsg(null)
    try {
      const valid = benchmarkItems.filter(i => i.text.trim())
      const result = await saveBenchmark(selectedTeam, {
        items: valid,
        date: benchmarkDate,
        author: 'manager',
      })
      setSelectedVersionId(result.version_id)
      setSaveMsg('Benchmark saved')
      // Refresh versions list
      fetchBenchmarkVersions(selectedTeam, benchmarkDate)
        .then(data => setBenchmarkVersions(data || []))
        .catch(() => {})
    } catch (err) {
      setSaveMsg(`Error: ${err.message}`)
    } finally {
      setSaving(false)
      setTimeout(() => setSaveMsg(null), 3000)
    }
  }

  const handleVersionSelect = (versionId) => {
    const version = benchmarkVersions.find(v => v.version_id === versionId)
    if (version) {
      setBenchmarkItems(version.items)
      setSelectedVersionId(version.version_id)
    }
  }

  // ── VLM JSON input ────────────────────────────────────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result)
        setVlmJson(parsed)
        setVlmFileName(file.name)
        setEvalError(null)
      } catch {
        setEvalError('Invalid JSON file')
      }
    }
    reader.readAsText(file)
  }

  const handlePasteConfirm = () => {
    try {
      const parsed = JSON.parse(vlmPasteText)
      setVlmJson(parsed)
      setVlmFileName('(pasted)')
      setVlmPasteOpen(false)
      setVlmPasteText('')
      setEvalError(null)
    } catch {
      setEvalError('Invalid JSON — check your paste')
    }
  }

  // ── Run evaluation ────────────────────────────────────────────────────
  const handleEvaluate = async () => {
    if (!vlmJson) {
      setEvalError('Upload or paste VLM JSON first')
      return
    }
    if (!selectedVersionId) {
      setEvalError('Save a benchmark first')
      return
    }
    setEvaluating(true)
    setEvalError(null)
    setEvalResult(null)
    try {
      const result = await runEvaluation(selectedTeam, {
        vlm_json: vlmJson,
        pass_threshold: 0.55,
        benchmark_version_id: selectedVersionId,
      })
      setEvalResult(result)
    } catch (err) {
      setEvalError(err.message)
    } finally {
      setEvaluating(false)
    }
  }

  const team = teams.find(t => t.id === selectedTeam)

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', gap: 24 }}>
      {/* ── Left: Team List ──────────────────────────────────────────────── */}
      <div>
        <div style={{ fontSize: 10, fontFamily: 'var(--mono)', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 12, paddingLeft: 4 }}>
          Teams ({teams.length})
          {usingMock && <span style={{ marginLeft: 8, color: '#F59E0B', fontSize: 9 }}>DEMO</span>}
        </div>
        {teams.map(t => (
          <TeamCard
            key={t.id}
            team={t}
            selected={selectedTeam === t.id}
            onClick={() => setSelectedTeam(t.id)}
          />
        ))}
      </div>

      {/* ── Right: Team Detail ───────────────────────────────────────────── */}
      <div className="anim-in anim-d2">
        {team ? (
          <>
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: 20 }}>
              <div>
                <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.02em', color: '#F8FAFC' }}>{team.name}</h2>
                <p style={{ fontSize: 12, color: '#64748B', marginTop: 2, fontFamily: 'var(--mono)' }}>
                  Zones: {team.zone_ids.join(', ')}
                </p>
              </div>
              <input
                type="date"
                value={benchmarkDate}
                onChange={e => setBenchmarkDate(e.target.value)}
                style={{
                  padding: '8px 12px', borderRadius: 8, fontSize: 13,
                  border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)', color: '#F1F5F9',
                  fontFamily: 'var(--mono)',
                }}
              />
            </div>

            {/* ── Benchmark Editor ─────────────────────────────────────────── */}
            <div style={{ marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Benchmark Goals
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  {benchmarkVersions.length > 0 && (
                    <select
                      value={selectedVersionId || ''}
                      onChange={e => handleVersionSelect(e.target.value)}
                      style={{
                        padding: '6px 10px', borderRadius: 6, fontSize: 11,
                        border: '1px solid rgba(255,255,255,0.1)',
                        background: 'rgba(255,255,255,0.04)', color: '#94A3B8',
                        fontFamily: 'var(--mono)',
                      }}
                    >
                      {benchmarkVersions.map(v => (
                        <option key={v.version_id} value={v.version_id}>
                          v{v.version_id.slice(0, 4)} — {new Date(v.created_at).toLocaleTimeString()}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>

              <div style={{
                fontSize: 12, color: '#94A3B8', lineHeight: 1.5, marginBottom: 14,
                padding: '10px 14px', background: 'rgba(249,115,22,0.04)',
                border: '1px solid rgba(249,115,22,0.12)', borderRadius: 8,
                borderLeft: '3px solid rgba(249,115,22,0.4)',
              }}>
                Define what "done" looks like for this team today. Each goal becomes a standard the VLM results are scored against.
              </div>

              {benchmarkItems.map((item, i) => (
                <div key={item.id || i} style={{
                  display: 'grid', gridTemplateColumns: '1fr 120px 70px 32px', gap: 8,
                  marginBottom: 6, alignItems: 'center',
                }}>
                  <input
                    value={item.text}
                    onChange={e => updateItem(i, 'text', e.target.value)}
                    placeholder="e.g. Rebar installed and tied according to plan"
                    style={{
                      padding: '10px 14px', borderRadius: 8, fontSize: 13,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)', color: '#F1F5F9',
                    }}
                  />
                  <select
                    value={item.category}
                    onChange={e => updateItem(i, 'category', e.target.value)}
                    style={{
                      padding: '10px 8px', borderRadius: 8, fontSize: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)', color: '#94A3B8',
                    }}
                  >
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <input
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={item.weight}
                    onChange={e => updateItem(i, 'weight', parseFloat(e.target.value) || 1)}
                    title="Weight"
                    style={{
                      padding: '10px 8px', borderRadius: 8, fontSize: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)', color: '#94A3B8',
                      textAlign: 'center',
                    }}
                  />
                  <button
                    onClick={() => removeItem(i)}
                    title="Remove"
                    style={{
                      padding: '8px', borderRadius: 8, border: 'none',
                      background: 'rgba(239,68,68,0.1)', color: '#FCA5A5',
                      cursor: 'pointer', fontSize: 16, lineHeight: 1,
                    }}
                  >
                    x
                  </button>
                </div>
              ))}

              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <button
                  onClick={addItem}
                  style={{
                    padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1px dashed rgba(249,115,22,0.35)',
                    background: 'rgba(249,115,22,0.04)', color: '#FB923C',
                    cursor: 'pointer',
                  }}
                >
                  + Add Goal
                </button>
                <button
                  onClick={handleSaveBenchmark}
                  disabled={saving || benchmarkItems.length === 0}
                  style={{
                    padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1px solid rgba(34,197,94,0.3)',
                    background: 'rgba(34,197,94,0.1)', color: '#86EFAC',
                    cursor: saving ? 'wait' : 'pointer',
                    opacity: benchmarkItems.length === 0 ? 0.4 : 1,
                  }}
                >
                  {saving ? 'Saving...' : 'Save Benchmark'}
                </button>
                {saveMsg && (
                  <span style={{ fontSize: 12, color: saveMsg.startsWith('Error') ? '#FCA5A5' : '#86EFAC', alignSelf: 'center' }}>
                    {saveMsg}
                  </span>
                )}
              </div>
            </div>

            {/* ── VLM JSON Input ────────────────────────────────────────────── */}
            <div style={{ marginBottom: 24 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 10 }}>
                VLM Analysis Data
              </span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <label style={{
                  padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                  border: '1px solid rgba(59,130,246,0.3)',
                  background: 'rgba(59,130,246,0.1)', color: '#93C5FD',
                  cursor: 'pointer',
                }}>
                  Upload JSON
                  <input type="file" accept=".json" onChange={handleFileUpload} style={{ display: 'none' }} />
                </label>
                <button
                  onClick={() => setVlmPasteOpen(!vlmPasteOpen)}
                  style={{
                    padding: '10px 20px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                    border: '1px solid rgba(255,255,255,0.1)',
                    background: 'rgba(255,255,255,0.04)', color: '#94A3B8',
                    cursor: 'pointer',
                  }}
                >
                  Paste JSON
                </button>
                {vlmFileName && (
                  <span style={{ fontSize: 12, color: '#86EFAC', fontFamily: 'var(--mono)' }}>
                    Loaded: {vlmFileName}
                  </span>
                )}
              </div>

              {vlmPasteOpen && (
                <div style={{ marginTop: 10 }}>
                  <textarea
                    value={vlmPasteText}
                    onChange={e => setVlmPasteText(e.target.value)}
                    placeholder='{"zone_analyses": {"Zone A": "..."}, "entity_relationships": {}}'
                    rows={6}
                    style={{
                      width: '100%', padding: '12px 14px', borderRadius: 8, fontSize: 12,
                      border: '1px solid rgba(255,255,255,0.08)',
                      background: 'rgba(255,255,255,0.03)', color: '#F1F5F9',
                      fontFamily: 'var(--mono)', resize: 'vertical',
                    }}
                  />
                  <button
                    onClick={handlePasteConfirm}
                    style={{
                      marginTop: 6, padding: '8px 16px', borderRadius: 6, fontSize: 12, fontWeight: 600,
                      border: '1px solid rgba(59,130,246,0.3)',
                      background: 'rgba(59,130,246,0.1)', color: '#93C5FD',
                      cursor: 'pointer',
                    }}
                  >
                    Confirm
                  </button>
                </div>
              )}
            </div>

            {/* ── Run Evaluation ────────────────────────────────────────────── */}
            <div style={{ marginBottom: 24 }}>
              <button
                onClick={handleEvaluate}
                disabled={evaluating}
                style={{
                  padding: '12px 28px', borderRadius: 10,
                  border: '1px solid rgba(249,115,22,0.4)',
                  background: evaluating ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.14)',
                  color: '#FB923C', fontSize: 14, fontWeight: 600,
                  cursor: evaluating ? 'wait' : 'pointer',
                  transition: 'all 0.2s',
                }}
              >
                {evaluating ? 'Running evaluation...' : 'Run Evaluation'}
              </button>
              {evalError && (
                <div style={{
                  marginTop: 10, color: '#FCA5A5', fontSize: 13,
                  padding: '10px 14px', background: 'rgba(239,68,68,0.08)',
                  borderRadius: 8, border: '1px solid rgba(239,68,68,0.2)',
                }}>
                  {evalError}
                </div>
              )}
            </div>

            {/* ── Results ───────────────────────────────────────────────────── */}
            {evalResult && (
              <div className="anim-in">
                {/* Score + Pie */}
                <div style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24,
                  marginBottom: 24, padding: '20px', borderRadius: 12,
                  background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
                }}>
                  <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Overall Productivity Score
                    </div>
                    <div style={{
                      fontSize: 48, fontWeight: 800, letterSpacing: '-0.03em',
                      color: evalResult.completion_score >= 0.7 ? '#22C55E'
                        : evalResult.completion_score >= 0.4 ? '#F59E0B' : '#EF4444',
                    }}>
                      {Math.round(evalResult.completion_score * 100)}%
                    </div>
                    <div style={{ fontSize: 12, color: '#64748B', marginTop: 4 }}>
                      {evalResult.completed_count}/{evalResult.items.length} goals met
                    </div>
                  </div>
                  <PieChart
                    completed={evalResult.completed_weight}
                    incomplete={evalResult.incomplete_weight}
                  />
                </div>

                {/* Gaps callout */}
                {evalResult.top_gaps.length > 0 && (
                  <div style={{
                    marginBottom: 20, padding: '14px 18px', borderRadius: 10,
                    background: 'rgba(239,68,68,0.06)',
                    border: '1px solid rgba(239,68,68,0.15)',
                    borderLeft: '3px solid rgba(239,68,68,0.4)',
                  }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#FCA5A5', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
                      Top Gaps
                    </div>
                    {evalResult.top_gaps.map((gap, i) => (
                      <div key={gap.id || i} style={{ fontSize: 13, color: '#F1F5F9', marginBottom: 4, display: 'flex', gap: 8 }}>
                        <span style={{ color: '#EF4444', fontWeight: 700, minWidth: 44, fontFamily: 'var(--mono)', fontSize: 11 }}>
                          {Math.round(gap.best_similarity * 100)}%
                        </span>
                        <span>{gap.text}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Items table */}
                <div style={{ marginBottom: 24 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                    Goal Results ({evalResult.items.length})
                  </div>
                  {evalResult.items.map((item, i) => (
                    <div
                      key={item.id || i}
                      style={{
                        display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px',
                        gap: 12, alignItems: 'start',
                        padding: '12px 16px', marginBottom: 6, borderRadius: 10,
                        background: item.passed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
                        border: `1px solid ${item.passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
                      }}
                    >
                      <span style={{
                        fontSize: 11, fontWeight: 700, padding: '4px 8px', borderRadius: 4,
                        textAlign: 'center',
                        background: item.passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                        color: item.passed ? '#86EFAC' : '#FCA5A5',
                      }}>
                        {item.passed ? 'PASS' : 'FAIL'}
                      </span>
                      <div>
                        <div style={{ fontSize: 13, color: '#F1F5F9', lineHeight: 1.5 }}>{item.text}</div>
                        <div style={{ fontSize: 11, color: '#64748B', marginTop: 4, fontFamily: 'var(--mono)' }}>
                          Evidence: {item.evidence_snippet.slice(0, 120)}...
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase' }}>Similarity</div>
                        <div style={{ fontSize: 14, fontWeight: 700, fontFamily: 'var(--mono)', color: item.passed ? '#86EFAC' : '#FCA5A5' }}>
                          {Math.round(item.best_similarity * 100)}%
                        </div>
                      </div>
                      <div style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: 10, color: '#64748B', textTransform: 'uppercase' }}>Category</div>
                        <div style={{ fontSize: 11, color: '#94A3B8' }}>{item.category}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div style={{ textAlign: 'center', padding: 60, color: '#475569', fontSize: 14 }}>
            Select a team to view productivity
          </div>
        )}
      </div>
    </div>
  )
}
