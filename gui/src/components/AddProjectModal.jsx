import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { createSite } from '../api/sites'
import { C } from '../utils/colors'

export default function AddProjectModal({ isOpen, onClose, onSuccess }) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!isOpen) return
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isOpen, onClose])

  const handleSubmit = async () => {
    if (!name.trim()) return
    setSubmitting(true)
    setError(null)
    try {
      const newSite = await createSite({ name: name.trim(), address: address.trim() || undefined })
      setName('')
      setAddress('')
      onSuccess(newSite)
    } catch (e) {
      setError(e.message || 'Failed to create project. Is the backend running?')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const modal = (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.72)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 480, background: C.surface,
          border: `1px solid ${C.border}`, borderRadius: 16,
          padding: 32, boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <h2 style={{ fontSize: 20, fontWeight: 800, color: C.text, letterSpacing: '-0.02em', margin: 0 }}>
            Add Project
          </h2>
          <button
            onClick={onClose}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.muted, fontSize: 20, lineHeight: 1, padding: 4,
            }}
          >×</button>
        </div>

        {/* Project Name */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Project Name <span style={{ color: C.orange }}>*</span>
          </label>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="e.g. Riverside Tower"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 14px', borderRadius: 8,
              background: C.surface2, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 14, outline: 'none',
              fontFamily: 'var(--body)',
            }}
          />
        </div>

        {/* Address */}
        <div style={{ marginBottom: 24 }}>
          <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: C.subtle, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>
            Address <span style={{ fontSize: 11, color: C.muted, textTransform: 'none', fontWeight: 400 }}>(optional)</span>
          </label>
          <input
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit() }}
            placeholder="e.g. 1400 River Rd, Block C"
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '10px 14px', borderRadius: 8,
              background: C.surface2, border: `1px solid ${C.border}`,
              color: C.text, fontSize: 14, outline: 'none',
              fontFamily: 'var(--body)',
            }}
          />
        </div>

        {/* Metrics placeholder */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.muted, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            Initial Metrics
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
            {[
              { label: 'Frames', value: '0' },
              { label: 'Workers', value: '0' },
              { label: 'Trades', value: '0' },
              { label: 'Status', value: 'active', dot: C.green },
            ].map(({ label, value, dot }) => (
              <div key={label} style={{
                background: C.surface2, border: `1px solid ${C.border}`,
                borderRadius: 8, padding: '10px 12px', textAlign: 'center',
              }}>
                <div style={{ fontSize: 11, color: C.muted, marginBottom: 4 }}>{label}</div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                  {dot && <div style={{ width: 7, height: 7, borderRadius: '50%', background: dot }} />}
                  <span style={{ fontSize: 13, fontWeight: 700, color: dot ? C.greenLight : C.text }}>{value}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{
            marginBottom: 16, padding: '10px 14px', borderRadius: 8,
            background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
            color: C.redLight, fontSize: 13,
          }}>
            {error}
          </div>
        )}

        {/* Footer */}
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={onClose}
            style={{
              padding: '10px 20px', borderRadius: 8,
              border: `1px solid ${C.border}`, background: 'transparent',
              cursor: 'pointer', color: C.subtle, fontSize: 14, fontWeight: 500,
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!name.trim() || submitting}
            style={{
              padding: '10px 24px', borderRadius: 8, border: 'none',
              background: C.orange, color: '#fff', fontSize: 14, fontWeight: 700,
              cursor: !name.trim() || submitting ? 'not-allowed' : 'pointer',
              opacity: !name.trim() || submitting ? 0.45 : 1,
              transition: 'opacity 0.2s',
            }}
          >
            {submitting ? 'Creating...' : 'Create Project'}
          </button>
        </div>
      </div>
    </div>
  )

  return createPortal(modal, document.body)
}
