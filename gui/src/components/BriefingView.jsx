import { useState, useEffect } from 'react'
import UploadZone from './UploadZone'
import AlertCard from './AlertCard'
import { fetchTimeline } from '../api/sites'
import { fetchJobs, uploadVideo } from '../api/video'
import { C } from '../utils/colors'
import { MOCK_TIMELINE } from '../utils/mockData'

const LOCAL_KEY = (siteId) => `ironsite_timeline_${siteId}`

const SOURCE_COLOR = { manual: C.blue, upload: C.orange, agent: C.green }

const JOB_STATUS_COLOR = {
  pending:    C.muted,
  processing: C.orange,
  completed:  C.green,
  failed:     C.red,
}
const JOB_STATUS_TEXT = {
  pending:    'Processing...',
  processing: 'Analyzing...',
  completed:  'Done',
  failed:     'Failed',
}

const fmt = (iso) => {
  const d = new Date(iso)
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) +
    ' · ' + d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 700, color: C.muted, textTransform: 'uppercase',
      letterSpacing: '0.12em', marginBottom: 12, fontFamily: 'var(--mono)',
    }}>
      {children}
    </div>
  )
}

export default function BriefingView({ text, siteId, usingMock }) {
  const [localEntries, setLocalEntries] = useState([])
  const [apiEntries, setApiEntries]     = useState([])
  const [noteWho, setNoteWho]           = useState('')
  const [noteText, setNoteText]         = useState('')
  const [jobs, setJobs]                 = useState([])
  const [expandedEntry, setExpandedEntry] = useState(null)

  // ── Load local entries ────────────────────────────────────────────────────
  useEffect(() => {
    if (!siteId) return
    try {
      const raw = localStorage.getItem(LOCAL_KEY(siteId))
      setLocalEntries(raw ? JSON.parse(raw) : [])
    } catch { setLocalEntries([]) }
  }, [siteId])

  // ── Fetch API timeline ────────────────────────────────────────────────────
  useEffect(() => {
    if (!siteId || usingMock) return
    fetchTimeline(siteId)
      .then(data => setApiEntries(Array.isArray(data) ? data : []))
      .catch(() => setApiEntries([]))
  }, [siteId, usingMock])

  // ── Fetch jobs ────────────────────────────────────────────────────────────
  const refreshJobs = () => {
    if (!siteId || usingMock) return
    fetchJobs(siteId)
      .then(data => setJobs(Array.isArray(data) ? data : []))
      .catch(() => setJobs([]))
  }
  useEffect(() => { refreshJobs() }, [siteId, usingMock])

  // ── Persist local entry ───────────────────────────────────────────────────
  const pushLocal = (entry) => {
    setLocalEntries(prev => {
      const next = [entry, ...prev]
      try { localStorage.setItem(LOCAL_KEY(siteId), JSON.stringify(next)) } catch {}
      return next
    })
  }

  const handleLog = () => {
    if (!noteText.trim()) return
    pushLocal({
      id: `local_${Date.now()}`,
      who: noteWho.trim() || 'Site Manager',
      timestamp: new Date().toISOString(),
      source: 'manual',
      video: null,
      action: noteText.trim(),
      ai_summary: null,
    })
    setNoteText('')
  }

  const handleUpload = async (files) => {
    for (const file of files) {
      try {
        await uploadVideo(file, siteId, noteWho.trim() || 'Site Manager')
        pushLocal({
          id: `upload_${Date.now()}_${file.name}`,
          who: noteWho.trim() || 'Site Manager',
          timestamp: new Date().toISOString(),
          source: 'upload',
          video: file.name,
          action: `Uploaded footage: ${file.name}`,
          ai_summary: null,
        })
      } catch (e) { console.error('Upload failed:', e) }
    }
    refreshJobs()
  }

  // ── Merge all timeline entries newest-first ───────────────────────────────
  const mockEntries = usingMock ? (MOCK_TIMELINE[siteId] || []) : []
  const allEntries = [
    ...localEntries,
    ...apiEntries.map(e => ({ ...e, source: e.source || 'agent' })),
    ...mockEntries,
  ].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))

  if (!siteId) return null

  return (
    <div>
      {/* ── AI Summary ──────────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        {text ? (
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)',
            borderRadius: 12, padding: 24, fontSize: 15, color: '#CBD5E1', lineHeight: 1.75,
            whiteSpace: 'pre-wrap', fontFamily: 'var(--body)',
          }}>
            {text.split('\n').map((line, i) => {
              if (line.startsWith('Recommendation:'))
                return <p key={i} style={{ marginTop: 16, padding: '12px 16px', background: 'rgba(249,115,22,0.08)', border: '1px solid rgba(249,115,22,0.2)', borderRadius: 8, color: '#FB923C', fontWeight: 600, fontSize: 14 }}>{line}</p>
              if (line === '') return <br key={i} />
              return <p key={i} style={{ marginBottom: 4 }}>{line}</p>
            })}
          </div>
        ) : (
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '28px 24px', textAlign: 'center',
            color: C.muted, fontSize: 14,
          }}>
            No AI briefing available yet — upload footage to generate one.
          </div>
        )}
      </div>

      {/* ── Upload Footage ──────────────────────────────────────────────────── */}
      <div style={{ marginBottom: 28 }}>
        <SectionLabel>Upload Footage</SectionLabel>

        {/* Who input + drop zone */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, alignItems: 'center' }}>
          <input
            value={noteWho}
            onChange={e => setNoteWho(e.target.value)}
            placeholder="Your name"
            style={{
              width: 140, padding: '9px 12px', borderRadius: 8, flexShrink: 0,
              background: C.surface2, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 13, outline: 'none', fontFamily: 'var(--body)',
              boxSizing: 'border-box',
            }}
          />
          <div style={{ flex: 1, display: 'flex', gap: 8 }}>
            <input
              value={noteText}
              onChange={e => setNoteText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLog() }}
              placeholder="Log a manual update…"
              style={{
                flex: 1, padding: '9px 12px', borderRadius: 8,
                background: C.surface2, border: `1px solid ${C.border}`,
                color: C.text, fontSize: 13, outline: 'none', fontFamily: 'var(--body)',
                boxSizing: 'border-box',
              }}
            />
            <button
              onClick={handleLog}
              disabled={!noteText.trim()}
              style={{
                padding: '9px 16px', borderRadius: 8, border: 'none', flexShrink: 0,
                background: noteText.trim() ? C.orange : C.surface2,
                color: noteText.trim() ? '#fff' : C.muted,
                fontSize: 13, fontWeight: 600,
                cursor: noteText.trim() ? 'pointer' : 'default',
                transition: 'all 0.2s',
              }}
            >
              Log
            </button>
          </div>
        </div>

        <UploadZone onFiles={handleUpload} />

        {/* Upload job status rows */}
        {jobs.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {jobs.map(job => (
              <div key={job.job_id} style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 14px', marginBottom: 6,
                background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
                borderRadius: 8,
              }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: JOB_STATUS_COLOR[job.status] || C.muted,
                  animation: job.status === 'processing' ? 'pulse 1.5s infinite' : 'none',
                }} />
                <div style={{ flex: 1, fontSize: 13, color: '#CBD5E1', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {job.filename || job.job_id}
                </div>
                <div style={{ fontSize: 11, color: JOB_STATUS_COLOR[job.status] || C.muted, fontFamily: 'var(--mono)', flexShrink: 0 }}>
                  {JOB_STATUS_TEXT[job.status] || job.status}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── Activity Timeline ────────────────────────────────────────────────── */}
      <div>
        <SectionLabel>Activity Log ({allEntries.length})</SectionLabel>
        {allEntries.length === 0 ? (
          <div style={{
            background: 'rgba(255,255,255,0.02)', border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '28px 24px', textAlign: 'center',
            color: C.muted, fontSize: 14,
          }}>
            No activity yet — log an update or upload footage to start tracking progress.
          </div>
        ) : (
          allEntries.map(entry => (
            <AlertCard
              key={entry.id}
              mode="timeline"
              entry={entry}
              expanded={expandedEntry === entry.id}
              onToggle={() => setExpandedEntry(expandedEntry === entry.id ? null : entry.id)}
            />
          ))
        )}
      </div>
    </div>
  )
}
