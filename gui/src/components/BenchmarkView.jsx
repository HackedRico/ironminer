import { useState, useEffect } from 'react'
import {
  fetchTeams, fetchBenchmark, saveBenchmark, runEvaluation,
} from '../api/productivity'

/* ── Pie Chart ─────────────────────────────────────────────────────────────── */
function PieChart({ completed, total }) {
  const pct = total > 0 ? (completed / total) * 100 : 0
  const r = 40
  const circumference = 2 * Math.PI * r
  return (
    <svg width="110" height="110" viewBox="0 0 110 110">
      <circle cx="55" cy="55" r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="10" />
      <circle cx="55" cy="55" r={r} fill="none"
        stroke="#22C55E" strokeWidth="10"
        strokeDasharray={`${(pct / 100) * circumference} ${circumference}`}
        strokeLinecap="round" transform="rotate(-90 55 55)"
        style={{ transition: 'stroke-dasharray 0.6s ease' }}
      />
      <text x="55" y="55" textAnchor="middle" dy="0.35em" fill="#F1F5F9" fontSize="20" fontWeight="800">
        {Math.round(pct)}%
      </text>
    </svg>
  )
}

/* ── Main Component ────────────────────────────────────────────────────────── */
export default function BenchmarkView({ siteId }) {
  const [teams, setTeams] = useState([])
  const [selectedTeam, setSelectedTeam] = useState(null)
  const [benchmark, setBenchmark] = useState(null)
  const [goals, setGoals] = useState([])
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [error, setError] = useState(null)

  const today = new Date().toISOString().split('T')[0]

  // Load teams
  useEffect(() => {
    if (!siteId) return
    setLoading(true)
    fetchTeams(siteId)
      .then(data => {
        const filtered = (data || []).filter(t => t.site_id === siteId)
        setTeams(filtered)
      })
      .catch(() => setTeams([]))
      .finally(() => setLoading(false))
  }, [siteId])

  // Load benchmark when team selected
  useEffect(() => {
    if (!selectedTeam) { setBenchmark(null); setGoals([]); setEvaluation(null); return }
    fetchBenchmark(selectedTeam.id, today)
      .then(bm => {
        setBenchmark(bm)
        setGoals((bm.goals || []).map(g => ({ ...g })))
      })
      .catch(() => { setBenchmark(null); setGoals([]) })
    setEvaluation(null)
  }, [selectedTeam])

  const handleAddGoal = () => {
    setGoals([...goals, { id: `new_${Date.now()}`, description: '', category: 'general' }])
  }

  const handleRemoveGoal = (idx) => {
    setGoals(goals.filter((_, i) => i !== idx))
  }

  const handleGoalChange = (idx, value) => {
    const updated = [...goals]
    updated[idx] = { ...updated[idx], description: value }
    setGoals(updated)
  }

  const handleSave = async () => {
    if (!selectedTeam) return
    setSaving(true)
    setError(null)
    try {
      const validGoals = goals.filter(g => g.description.trim())
      const bm = await saveBenchmark(selectedTeam.id, { date: today, goals: validGoals })
      setBenchmark(bm)
      setGoals((bm.goals || []).map(g => ({ ...g })))
    } catch (e) {
      setError('Failed to save benchmarks')
    } finally {
      setSaving(false)
    }
  }

  const handleEvaluate = async () => {
    if (!selectedTeam) return
    setEvaluating(true)
    setError(null)
    try {
      const result = await runEvaluation(selectedTeam.id, { date: today, site_id: siteId })
      setEvaluation(result)
    } catch (e) {
      setError('Failed to run evaluation')
    } finally {
      setEvaluating(false)
    }
  }

  // ── Team List View ────────────────────────────────────────────────────────
  if (!selectedTeam) {
    if (loading) {
      return <div style={{ textAlign: 'center', padding: 40, color: '#64748B', fontSize: 14 }}>Loading teams...</div>
    }
    if (teams.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: '#475569', fontSize: 14 }}>
          No teams found for this site. Create teams in the Teams tab first.
        </div>
      )
    }
    return (
      <div>
        <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
          Select a Team ({teams.length})
        </div>
        {teams.map(t => (
          <div
            key={t.id}
            onClick={() => setSelectedTeam(t)}
            style={{
              padding: '14px 18px', marginBottom: 8, borderRadius: 10, cursor: 'pointer',
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              transition: 'all 0.2s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(249,115,22,0.06)'; e.currentTarget.style.borderColor = 'rgba(249,115,22,0.2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.03)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.08)' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#F1F5F9' }}>{t.name}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>
                  {t.zone || 'No zone'} &middot; {(t.worker_ids || []).length} workers
                </div>
              </div>
              <div style={{ fontSize: 11, color: '#64748B' }}>{t.task || ''}</div>
            </div>
          </div>
        ))}
      </div>
    )
  }

  // ── Team Dashboard View ───────────────────────────────────────────────────
  return (
    <div>
      {/* Back + Team Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
        <button
          onClick={() => setSelectedTeam(null)}
          style={{
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: '#94A3B8', borderRadius: 8, padding: '6px 14px', fontSize: 12, cursor: 'pointer',
          }}
        >
          Back
        </button>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#F1F5F9' }}>{selectedTeam.name}</div>
          <div style={{ fontSize: 11, color: '#64748B' }}>
            {selectedTeam.zone} &middot; {selectedTeam.task}
          </div>
        </div>
      </div>

      {/* ── Benchmark Editor ─────────────────────────────────────────────── */}
      <div style={{
        padding: '16px 18px', borderRadius: 10, marginBottom: 20,
        background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Daily Benchmarks
            {benchmark && <span style={{ fontSize: 10, color: '#475569', marginLeft: 8 }}>v{benchmark.version}</span>}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleAddGoal}
              style={{
                background: 'rgba(34,197,94,0.1)', border: '1px solid rgba(34,197,94,0.25)',
                color: '#86EFAC', borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer',
              }}
            >
              + Add Goal
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                background: 'rgba(249,115,22,0.15)', border: '1px solid rgba(249,115,22,0.3)',
                color: '#FB923C', borderRadius: 6, padding: '4px 14px', fontSize: 11,
                fontWeight: 600, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1,
              }}
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>

        {goals.length === 0 && (
          <div style={{ fontSize: 12, color: '#475569', padding: '10px 0' }}>
            No goals yet. Click "+ Add Goal" to create benchmarks.
          </div>
        )}

        {goals.map((g, i) => (
          <div key={g.id || i} style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#475569', minWidth: 20 }}>{i + 1}.</span>
            <input
              value={g.description}
              onChange={e => handleGoalChange(i, e.target.value)}
              placeholder="Describe the goal/standard..."
              style={{
                flex: 1, background: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.08)',
                color: '#F1F5F9', borderRadius: 6, padding: '8px 12px', fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              onClick={() => handleRemoveGoal(i)}
              style={{
                background: 'none', border: 'none', color: '#475569', cursor: 'pointer',
                fontSize: 16, padding: '0 6px', lineHeight: 1,
              }}
            >
              x
            </button>
          </div>
        ))}
      </div>

      {/* ── Run Evaluation Button ────────────────────────────────────────── */}
      <button
        onClick={handleEvaluate}
        disabled={evaluating || goals.length === 0}
        style={{
          width: '100%', padding: '12px 0', marginBottom: 20, borderRadius: 10,
          background: evaluating ? 'rgba(249,115,22,0.08)' : 'rgba(249,115,22,0.15)',
          border: '1px solid rgba(249,115,22,0.3)',
          color: '#FB923C', fontSize: 13, fontWeight: 700, cursor: evaluating ? 'wait' : 'pointer',
          transition: 'all 0.2s', opacity: goals.length === 0 ? 0.4 : 1,
        }}
      >
        {evaluating ? 'Running Evaluation...' : 'Run Evaluation'}
      </button>

      {error && (
        <div style={{ fontSize: 12, color: '#FCA5A5', marginBottom: 16, padding: '8px 14px', borderRadius: 6, background: 'rgba(239,68,68,0.1)' }}>
          {error}
        </div>
      )}

      {/* ── Evaluation Results ────────────────────────────────────────────── */}
      {evaluation && (
        <div style={{
          padding: '20px', borderRadius: 12,
          background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.08)',
        }}>
          {/* Score + Pie */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 20 }}>
            <PieChart completed={evaluation.completed_count} total={evaluation.total_goals} />
            <div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#F1F5F9' }}>
                {Math.round(evaluation.overall_score * 100)}%
              </div>
              <div style={{ fontSize: 12, color: '#64748B' }}>Overall Productivity Score</div>
              <div style={{ display: 'flex', gap: 16, marginTop: 8 }}>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#22C55E' }}>{evaluation.completed_count}</span>
                  <span style={{ fontSize: 11, color: '#64748B', marginLeft: 4 }}>completed</span>
                </div>
                <div>
                  <span style={{ fontSize: 18, fontWeight: 700, color: '#EF4444' }}>{evaluation.incomplete_count}</span>
                  <span style={{ fontSize: 11, color: '#64748B', marginLeft: 4 }}>incomplete</span>
                </div>
              </div>
            </div>
          </div>

          {/* Goal Results */}
          <div style={{ fontSize: 13, fontWeight: 600, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Goal Results
          </div>
          {(evaluation.goal_results || []).map((g, i) => (
            <div key={g.goal_id || i} style={{
              display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', marginBottom: 6,
              borderRadius: 8, background: g.passed ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)',
              border: `1px solid ${g.passed ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'}`,
            }}>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, flexShrink: 0, marginTop: 1,
                background: g.passed ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)',
                color: g.passed ? '#86EFAC' : '#FCA5A5',
              }}>
                {g.passed ? 'PASS' : 'FAIL'}
              </span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, color: '#F1F5F9', lineHeight: 1.5 }}>{g.goal_text}</div>
                {g.best_evidence && (
                  <div style={{ fontSize: 11, color: '#475569', marginTop: 4, fontStyle: 'italic' }}>
                    Evidence: {g.best_evidence.slice(0, 120)}...
                  </div>
                )}
              </div>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#64748B', fontFamily: 'var(--mono)', flexShrink: 0 }}>
                {(g.score * 100).toFixed(0)}%
              </span>
            </div>
          ))}

          {/* Gap Summary */}
          {evaluation.gap_summary && (
            <div style={{
              marginTop: 16, padding: '12px 16px', borderRadius: 8,
              background: 'rgba(249,115,22,0.04)', border: '1px solid rgba(249,115,22,0.12)',
              borderLeft: '3px solid rgba(249,115,22,0.4)',
              fontSize: 12, color: '#CBD5E1', lineHeight: 1.7, whiteSpace: 'pre-line',
            }}>
              {evaluation.gap_summary}
            </div>
          )}

          <div style={{ fontSize: 10, color: '#475569', marginTop: 12 }}>
            Evaluated at {new Date(evaluation.evaluated_at).toLocaleTimeString()} &middot; Benchmark v{evaluation.benchmark_version}
          </div>
        </div>
      )}
    </div>
  )
}
