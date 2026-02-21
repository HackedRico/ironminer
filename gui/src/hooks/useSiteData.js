import { useState, useEffect } from 'react'
import { fetchSites, fetchSite } from '../api/sites'

export default function useSiteData() {
  const [sites, setSites] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSites()
      .then(setSites)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const refresh = () => {
    setLoading(true)
    fetchSites()
      .then(setSites)
      .catch(() => {})
      .finally(() => setLoading(false))
  }

  return { sites, loading, refresh }
}
