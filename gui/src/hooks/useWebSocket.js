import { useEffect, useRef, useState, useCallback } from 'react'

export default function useWebSocket(url, { onMessage, autoConnect = true } = {}) {
  const wsRef = useRef(null)
  const [connected, setConnected] = useState(false)

  const connect = useCallback(() => {
    if (wsRef.current) wsRef.current.close()
    const ws = new WebSocket(url)
    ws.onopen = () => setConnected(true)
    ws.onclose = () => setConnected(false)
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data)
        onMessage?.(data)
      } catch {}
    }
    wsRef.current = ws
  }, [url, onMessage])

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data))
    }
  }, [])

  useEffect(() => {
    if (autoConnect) connect()
    return () => wsRef.current?.close()
  }, [autoConnect, connect])

  return { connected, send, connect }
}
