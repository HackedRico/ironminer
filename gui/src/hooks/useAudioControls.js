import { useState, useRef, useCallback, useEffect } from 'react'

/**
 * useAudioControls — wraps LiveKit Room mic publish/unpublish.
 *
 * @param {Room|null} room  The LiveKit Room object from useLiveStream
 */
export default function useAudioControls(room) {
  const [isMicEnabled, setIsMicEnabled] = useState(false)
  const [isPTTActive, setIsPTTActive] = useState(false)
  const pttActiveRef = useRef(false)   // prevents re-entrancy during async

  useEffect(() => {
    if (!room) {
      setIsMicEnabled(false)
      setIsPTTActive(false)
      pttActiveRef.current = false
    }
  }, [room])

  const startTalking = useCallback(async () => {
    if (!room?.localParticipant || pttActiveRef.current) return
    try {
      await room.localParticipant.setMicrophoneEnabled(true)
      pttActiveRef.current = true
      setIsPTTActive(true)
      setIsMicEnabled(true)
    } catch (err) {
      console.warn('PTT start failed:', err)
    }
  }, [room])

  const stopTalking = useCallback(async () => {
    if (!room?.localParticipant || !pttActiveRef.current) return
    try {
      await room.localParticipant.setMicrophoneEnabled(false)
      pttActiveRef.current = false
      setIsPTTActive(false)
      setIsMicEnabled(false)
    } catch (err) {
      console.warn('PTT stop failed:', err)
    }
  }, [room])

  const toggleMic = useCallback(async () => {
    if (!room?.localParticipant) return
    try {
      const next = !isMicEnabled
      await room.localParticipant.setMicrophoneEnabled(next)
      setIsMicEnabled(next)
    } catch (err) {
      console.warn('Mic toggle failed:', err)
    }
  }, [room, isMicEnabled])

  return { isMicEnabled, isPTTActive, startTalking, stopTalking, toggleMic }
}
