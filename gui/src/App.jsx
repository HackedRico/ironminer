import { useState, useEffect } from 'react'
import NavBar from './components/NavBar'
import ReviewMode from './views/ReviewMode'
import TeamsMode from './views/TeamsMode'
import LiveMode from './views/LiveMode'
import CrewMode from './views/CrewMode'
import { fetchAlerts } from './api/alerts'
import { MOCK_ALERTS } from './utils/mockData'

export default function App() {
  const [mode, setMode] = useState('review')
  const [urgentCount, setUrgentCount] = useState(0)
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    fetchAlerts({ severity: 'high' })
      .then(a => setUrgentCount(a.length))
      .catch(() => setUrgentCount(MOCK_ALERTS.filter(a => a.severity === 'high').length))
  }, [])

  return (
    <div style={{ minHeight: '100vh', opacity: mounted ? 1 : 0, transition: 'opacity 0.5s' }}>
      <NavBar mode={mode} setMode={setMode} urgentCount={urgentCount} />
      <main style={{ maxWidth: 1400, margin: '0 auto', padding: '24px 32px' }}>
      {mode === 'review' && <ReviewMode />}
      {mode === 'live' && <LiveMode />}
      {mode === 'teams' && <TeamsMode />}
      {mode === 'crew' && <CrewMode />}
      </main>
    </div>
  )
}
