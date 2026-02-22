import { useState, useEffect } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import WorkerPool from '../components/TeamBoard/WorkerPool'
import TeamCard from '../components/TeamBoard/TeamCard'
import WorkerCard from '../components/TeamBoard/WorkerCard'
import { fetchSiteWorkers, fetchTeams, createTeam, updateTeam, deleteTeam, autoAssignWorkers } from '../api/teams'
import { fetchSites } from '../api/sites'
import { MOCK_WORKERS, MOCK_SITES } from '../utils/mockData'
import WorkerProfilePanel from '../components/WorkerProfilePanel'

function todayISO() {
  return new Date().toISOString().split('T')[0]
}

function formatDate(iso) {
  return new Date(iso + 'T00:00:00').toLocaleDateString('en-US', {
    weekday: 'long', month: 'short', day: 'numeric',
  })
}

export default function TeamsMode() {
  const [sites, setSites] = useState([])
  const [selectedSite, setSelectedSite] = useState(null)
  const [workers, setWorkers] = useState([])     // SiteWorker[]
  const [teams, setTeams] = useState([])         // Team[]
  const [usingMock, setUsingMock] = useState(false)
  const [activeWorker, setActiveWorker] = useState(null) // being dragged right now
  const [selectedWorker, setSelectedWorker] = useState(null) // locker room panel
  const [autoAssigning, setAutoAssigning] = useState(false)
  const [autoAssignPlan, setAutoAssignPlan] = useState(null)
  // teamsReady gates localStorage writes — prevents wiping the cache during the
  // initial reset before the fetch (or localStorage read) has completed.
  const [teamsReady, setTeamsReady] = useState(false)
  const today = todayISO()

  // Pointer sensor (desktop) + Touch sensor (tablet/mobile)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  // ── Load sites ────────────────────────────────────────────────────────────
  useEffect(() => {
    fetchSites()
      .then(data => {
        setSites(data)
        if (data.length) setSelectedSite(data[0].id)
      })
      .catch(() => {
        setSites(MOCK_SITES)
        setSelectedSite(MOCK_SITES[0].id)
      })
  }, [])

  // ── Load workers + teams when site changes ────────────────────────────────
  useEffect(() => {
    if (!selectedSite) return
    setWorkers([])
    setTeams([])
    setTeamsReady(false)

    fetchSiteWorkers(selectedSite)
      .then(setWorkers)
      .catch(() => {
        setUsingMock(true)
        setWorkers(MOCK_WORKERS[selectedSite] || [])
      })

    const cacheKey = `ironsite_teams_${selectedSite}_${today}`
    fetchTeams(selectedSite, today)
      .then(serverTeams => {
        setTeams(serverTeams)
      })
      .catch(() => {
        try {
          const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null')
          if (cached) setTeams(cached)
        } catch {}
      })
      .finally(() => setTeamsReady(true))
  }, [selectedSite])

  // ── Persist teams to localStorage whenever they change ────────────────────
  useEffect(() => {
    if (!teamsReady || !selectedSite) return
    localStorage.setItem(`ironsite_teams_${selectedSite}_${today}`, JSON.stringify(teams))
  }, [teams, teamsReady, selectedSite])

  // ── Derived: which workers are unassigned; which teams are empty ───────────
  const assignedIds = new Set(teams.flatMap(t => t.worker_ids))
  const unassigned = workers.filter(w => !assignedIds.has(w.id))
  const emptyTeams = teams.filter(t => !t.worker_ids?.length)
  const workerById = Object.fromEntries(workers.map(w => [w.id, w]))

  // ── Team CRUD helpers (optimistic) ────────────────────────────────────────

  function handleCreateTeam() {
    const optimistic = {
      id: `tmp-${Date.now()}`,
      site_id: selectedSite,
      date: today,
      name: `Team ${teams.length + 1}`,
      task: '', zone: '', worker_ids: [],
      color_index: teams.length % 8,
    }
    setTeams(prev => [...prev, optimistic])
    createTeam({ site_id: selectedSite, name: optimistic.name }, today)
      .then(created => setTeams(prev => prev.map(t => t.id === optimistic.id ? created : t)))
      .catch(() => setTeams(prev => prev.filter(t => t.id !== optimistic.id)))
  }

  function handleUpdateTeam(teamId, patch) {
    // Optimistic
    setTeams(prev => prev.map(t => t.id === teamId ? { ...t, ...patch } : t))
    updateTeam(teamId, patch).catch(() => {
      // Revert on failure — refetch
      fetchTeams(selectedSite, today).then(setTeams).catch(() => {})
    })
  }

  function handleDeleteTeam(teamId) {
    setTeams(prev => prev.filter(t => t.id !== teamId))
    deleteTeam(teamId)
  }

  function handleRemoveWorker(teamId, workerId) {
    const team = teams.find(t => t.id === teamId)
    if (!team) return
    const newIds = team.worker_ids.filter(id => id !== workerId)
    handleUpdateTeam(teamId, { worker_ids: newIds })
  }

  // ── Auto-assign (all empty teams, or a single team when teamId is passed) ───

  async function handleAutoAssign(teamId = null) {
    setAutoAssigning(true)
    try {
      const plan = await autoAssignWorkers(selectedSite, today, teamId || undefined)
      setAutoAssignPlan(plan)
    } catch (e) {
      console.error('Auto-assign failed', e)
    } finally {
      setAutoAssigning(false)
    }
  }

  async function applyAutoAssign() {
    if (!autoAssignPlan) return
    const byTeam = {}
    for (const a of autoAssignPlan.assignments) {
      if (!byTeam[a.team_id]) byTeam[a.team_id] = []
      byTeam[a.team_id].push(a.worker_id)
    }
    const currentIds = (t) => t.worker_ids ?? []
    for (const [teamId, newIds] of Object.entries(byTeam)) {
      const team = teams.find(t => t.id === teamId)
      if (!team) continue
      const merged = [...new Set([...currentIds(team), ...newIds])]
      await updateTeam(teamId, { worker_ids: merged })
    }
    const fresh = await fetchTeams(selectedSite, today).catch(() => null)
    if (fresh) setTeams(fresh)
    setAutoAssignPlan(null)
  }

  // ── Drag handlers ─────────────────────────────────────────────────────────

  function onDragStart({ active }) {
    const worker = workerById[active.id]
    if (worker) setActiveWorker(worker)
  }

  function onDragEnd({ active, over }) {
    setActiveWorker(null)
    if (!over) return

    const workerId = active.id
    const srcTeam = teams.find(t => t.worker_ids.includes(workerId))

    if (over.id === 'pool') {
      // Return to unassigned
      if (srcTeam) {
        handleUpdateTeam(srcTeam.id, {
          worker_ids: srcTeam.worker_ids.filter(id => id !== workerId),
        })
      }
    } else {
      // Drop onto a team
      const destTeamId = over.id.replace('team-', '')
      if (srcTeam?.id === destTeamId) return   // same team — no-op
      const destTeam = teams.find(t => t.id === destTeamId)
      if (!destTeam) return
      // Remove from old team
      if (srcTeam) {
        handleUpdateTeam(srcTeam.id, {
          worker_ids: srcTeam.worker_ids.filter(id => id !== workerId),
        })
      }
      // Add to new team (skip if already there)
      if (!destTeam.worker_ids.includes(workerId)) {
        handleUpdateTeam(destTeamId, {
          worker_ids: [...destTeam.worker_ids, workerId],
        })
      }
    }
  }

  const currentSite = sites.find(s => s.id === selectedSite)

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd}>

      {/* ── Header bar (full width) ────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 12,
        marginBottom: 20,
      }}>
        {/* Site selector */}
        <select
          value={selectedSite || ''}
          onChange={e => setSelectedSite(e.target.value)}
          style={{
            background: '#141924',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8, padding: '10px 14px',
            fontSize: 15, fontWeight: 600, color: '#f1f5f9',
            fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
            colorScheme: 'dark',
          }}
        >
          {sites.map(s => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>

        {/* Date */}
        <div style={{ fontSize: 13, color: '#64748b', fontFamily: 'var(--mono)' }}>
          {formatDate(today)}
        </div>

        {/* Demo badge */}
        {usingMock && (
          <span style={{
            fontSize: 9, color: '#f59e0b', fontFamily: 'var(--mono)',
            background: 'rgba(245,158,11,0.1)', padding: '3px 8px', borderRadius: 4,
            letterSpacing: '0.06em',
          }}>
            DEMO DATA
          </span>
        )}

        {/* Assigned counter */}
        <div style={{ marginLeft: 'auto', fontSize: 13, color: '#64748b', fontFamily: 'var(--mono)' }}>
          <span style={{ color: '#f1f5f9', fontWeight: 700 }}>
            {workers.length - unassigned.length}
          </span>
          /{workers.length} assigned
        </div>
      </div>

      {/* ── Side-by-side layout ────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 24, alignItems: 'start' }}>

        {/* ── Left: Worker pool (sticky) ─────────────────────────────────── */}
        <div style={{
          position: 'sticky',
          top: 88,   /* below the 64px NavBar + 24px page padding */
          maxHeight: 'calc(100vh - 120px)',
          overflowY: 'auto',
        }}>
          <WorkerPool workers={unassigned} onWorkerClick={setSelectedWorker} />
        </div>

        {/* ── Right: Teams ───────────────────────────────────────────────── */}
        <div>
          {/* New team + Auto-assign buttons */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginBottom: 16 }}>
            <button
              onClick={() => handleAutoAssign()}
              disabled={autoAssigning || unassigned.length === 0 || emptyTeams.length === 0}
              title={emptyTeams.length === 0 ? 'No empty teams to fill' : 'Suggest workers for all empty teams'}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '10px 16px', borderRadius: 10, border: 'none',
                background: 'rgba(139,92,246,0.15)', color: '#a78bfa',
                cursor: (autoAssigning || unassigned.length === 0 || emptyTeams.length === 0) ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600,
                opacity: (unassigned.length === 0 || emptyTeams.length === 0) ? 0.4 : 1,
                transition: 'background 0.15s',
              }}
              onMouseOver={e => { if (!autoAssigning && unassigned.length > 0 && emptyTeams.length > 0) e.currentTarget.style.background = 'rgba(139,92,246,0.25)' }}
              onMouseOut={e => e.currentTarget.style.background = 'rgba(139,92,246,0.15)'}
            >
              {autoAssigning ? '…' : '✦'} Auto-assign empty teams
            </button>
            <button
              onClick={handleCreateTeam}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '10px 20px', borderRadius: 10,
                background: 'linear-gradient(135deg, #F97316, #EA580C)',
                border: 'none', cursor: 'pointer',
                fontSize: 14, fontWeight: 700, color: '#fff',
                boxShadow: '0 4px 16px rgba(249,115,22,0.3)',
                transition: 'opacity 0.15s',
              }}
              onMouseOver={e => e.currentTarget.style.opacity = '0.88'}
              onMouseOut={e => e.currentTarget.style.opacity = '1'}
            >
              <span style={{ fontSize: 18, lineHeight: 1 }}>+</span> New Team
            </button>
          </div>

          <AutoAssignBanner
            plan={autoAssignPlan}
            onApply={applyAutoAssign}
            onDismiss={() => setAutoAssignPlan(null)}
          />

          {teams.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 0',
              border: '1.5px dashed rgba(255,255,255,0.05)',
              borderRadius: 12,
            }}>
              <div style={{ fontWeight: 600, color: '#475569', fontSize: 14 }}>No teams yet for today</div>
              <div style={{ marginTop: 6, fontSize: 13, color: '#334155' }}>
                Click <strong style={{ color: '#f97316' }}>+ New Team</strong> to start building your crew plan
              </div>
            </div>
          ) : (
            teams.map(team => (
              <TeamCard
                key={team.id}
                team={team}
                workers={team.worker_ids.map(id => workerById[id]).filter(Boolean)}
                zones={currentSite?.zones || []}
                onUpdate={patch => handleUpdateTeam(team.id, patch)}
                onDelete={() => handleDeleteTeam(team.id)}
                onRemoveWorker={workerId => handleRemoveWorker(team.id, workerId)}
                onWorkerClick={setSelectedWorker}
                onAutoAssign={emptyTeams.some(t => t.id === team.id) ? () => handleAutoAssign(team.id) : undefined}
                autoAssigning={autoAssigning}
              />
            ))
          )}
        </div>
      </div>

      {/* ── Drag overlay (floating card while dragging) ──────────────────── */}
      <DragOverlay>
        {activeWorker ? (
          <div style={{ transform: 'rotate(2deg)', opacity: 0.95 }}>
            <WorkerCard worker={activeWorker} />
          </div>
        ) : null}
      </DragOverlay>

      {selectedWorker && (
        <WorkerProfilePanel
          worker={selectedWorker}
          siteId={selectedSite}
          onClose={() => setSelectedWorker(null)}
        />
      )}
    </DndContext>
  )
}

function AutoAssignBanner({ plan, onApply, onDismiss }) {
  if (!plan) return null
  return (
    <div style={{
      marginBottom: 16, borderRadius: 10,
      border: '1px solid rgba(139,92,246,0.25)',
      background: 'rgba(139,92,246,0.06)', padding: '14px 16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <span style={{ fontSize: 13, color: '#a78bfa', fontWeight: 700 }}>
          {plan.used_ai ? '✦ AI Suggestion' : '⚡ Smart Match'}
        </span>
        {!plan.used_ai && (
          <span style={{
            fontSize: 10, color: '#64748b', fontFamily: 'var(--mono)',
            background: 'rgba(255,255,255,0.05)', padding: '1px 6px', borderRadius: 4,
          }}>
            FALLBACK
          </span>
        )}
      </div>
      <p style={{ margin: '0 0 12px', fontSize: 13, color: '#94a3b8', lineHeight: 1.6 }}>
        {plan.summary}
      </p>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
        {plan.assignments.length === 0
          ? <span style={{ fontSize: 13, color: '#475569' }}>No assignments suggested.</span>
          : plan.assignments.map(a => (
              <span
                key={a.worker_id}
                title={a.reason}
                style={{
                  fontSize: 12, padding: '3px 10px', borderRadius: 20,
                  background: 'rgba(139,92,246,0.12)', color: '#c4b5fd',
                  border: '1px solid rgba(139,92,246,0.2)',
                  cursor: 'default',
                }}
              >
                {a.worker_name} → {a.team_name}
              </span>
            ))
        }
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onApply}
          disabled={plan.assignments.length === 0}
          style={{
            padding: '7px 16px', borderRadius: 7, border: 'none',
            background: '#7c3aed', color: '#fff', fontSize: 13, fontWeight: 600,
            cursor: plan.assignments.length === 0 ? 'not-allowed' : 'pointer',
            opacity: plan.assignments.length === 0 ? 0.5 : 1,
          }}
        >
          Apply All
        </button>
        <button
          onClick={onDismiss}
          style={{
            padding: '7px 14px', borderRadius: 7,
            border: '1px solid rgba(255,255,255,0.08)',
            background: 'none', color: '#64748b', fontSize: 13, cursor: 'pointer',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  )
}
