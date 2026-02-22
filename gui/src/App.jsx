import { useState, useEffect } from 'react'
import NavBar from './components/NavBar'
import ReviewMode from './views/ReviewMode'
import TeamsMode from './views/TeamsMode'
import LiveMode from './views/LiveMode'
import { fetchAlerts } from './api/alerts'
import { fetchSites } from './api/sites'
import { MOCK_ALERTS, MOCK_SITES } from './utils/mockData'

export default function App() {
  const [mode, setMode] = useState('review')
  const [urgentCount, setUrgentCount] = useState(0)
  const [totalFrames, setTotalFrames] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    fetchAlerts({ severity: 'high' })
      .then(a => setUrgentCount(a.length))
      .catch(() => setUrgentCount(MOCK_ALERTS.filter(a => a.severity === 'high').length))

    fetchSites()
      .then(sites => setTotalFrames(sites.reduce((sum, s) => sum + s.frames, 0)))
      .catch(() => setTotalFrames(MOCK_SITES.reduce((sum, s) => sum + s.frames, 0)))
  }, [])

  return (
    <div style={{ minHeight: '100vh', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s' }}>
      <NavBar mode={mode} setMode={setMode} urgentCount={urgentCount} totalFrames={totalFrames} />
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
      {mode === 'review' && <ReviewMode />}
      {mode === 'live' && <LiveMode />}
      {mode === 'teams' && <TeamsMode />}
      </main>
    </div>
  )
}
