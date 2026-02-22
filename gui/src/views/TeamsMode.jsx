import { useState, useEffect } from 'react'
import { DndContext, DragOverlay, PointerSensor, TouchSensor, useSensor, useSensors } from '@dnd-kit/core'
import WorkerPool from '../components/TeamBoard/WorkerPool'
import TeamCard from '../components/TeamBoard/TeamCard'
import WorkerCard from '../components/TeamBoard/WorkerCard'
import { fetchSiteWorkers, fetchTeams, createTeam, updateTeam, deleteTeam } from '../api/teams'
import { fetchSites } from '../api/sites'
import { MOCK_WORKERS, MOCK_SITES } from '../utils/mockData'

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

  // ── Derived: which workers are unassigned ─────────────────────────────────
  const assignedIds = new Set(teams.flatMap(t => t.worker_ids))
  const unassigned = workers.filter(w => !assignedIds.has(w.id))
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
          <WorkerPool workers={unassigned} />
        </div>

        {/* ── Right: Teams ───────────────────────────────────────────────── */}
        <div>
          {/* New team button sits at the top of the team column */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
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
    </DndContext>
  )
}
