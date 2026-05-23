// MediaRecorder-based audio recording hook.
//
// Returns:
//   {
//     state:    'idle' | 'recording' | 'paused' | 'stopping'
//     elapsed:  number          — ms recorded (excluding paused time)
//     start({ deviceId, bitsPerSecond, mimeType }) → Promise
//     pause()  // toggles paused/recording
//     stop()   → Promise<{ blob, mimeType, bitRate, durationMs, startedAt, endedAt, deviceLabel }>
//     addMarkerNow(label) → { offsetMs, label, kind:'manual' }  — captures current offset
//     reset()
//     devices: MediaDeviceInfo[]      — audio input devices, refreshed on enumerate()
//     enumerate() → Promise           — re-fetch the device list (requires permission)
//     selectedDeviceId: string | null
//     setSelectedDeviceId(id): void
//     error: string | null
//   }
//
// Quality defaults: webm/opus at 256 kbps stereo (browser-supported "highest practical" for voice).

import { useCallback, useEffect, useRef, useState } from 'react'

const DEFAULT_MIME = (() => {
  if (typeof MediaRecorder === 'undefined') return ''
  // Prefer opus in webm. Some browsers may not support — try ordered fallbacks.
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
    'audio/mp4',
  ]
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || ''
})()

const DEFAULT_BITRATE = 256000   // 256 kbps stereo

export function useAudioRecorder() {
  const [state, setState] = useState('idle')
  const [elapsed, setElapsed] = useState(0)
  const [devices, setDevices] = useState([])
  const [selectedDeviceId, setSelectedDeviceId] = useState(null)
  const [error, setError] = useState(null)

  // Refs for objects that shouldn't trigger re-renders
  const recorderRef = useRef(null)
  const streamRef   = useRef(null)
  const chunksRef   = useRef([])
  const tickRef     = useRef(null)        // setInterval id
  const startedAtRef = useRef(0)          // wall-clock ms at start
  const pauseAccumRef = useRef(0)         // total paused ms
  const pauseStartRef = useRef(0)         // wall-clock ms at pause start
  const elapsedAtPauseRef = useRef(0)     // elapsed at last pause-resume (for display)
  const stopResolverRef = useRef(null)
  const deviceLabelRef  = useRef('default')
  const mimeUsedRef     = useRef('')
  const bitRateUsedRef  = useRef(0)

  // Cleanup on unmount
  useEffect(() => () => {
    cleanupStream()
    stopTick()
  }, [])

  function cleanupStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop())
      streamRef.current = null
    }
  }
  function stopTick() {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null }
  }
  function startTick() {
    stopTick()
    tickRef.current = setInterval(() => {
      const now = Date.now()
      const rawElapsed = now - startedAtRef.current - pauseAccumRef.current
      setElapsed(rawElapsed)
    }, 200)
  }

  const enumerate = useCallback(async () => {
    try {
      if (!navigator.mediaDevices?.enumerateDevices) {
        setError('Browser does not support audio device enumeration.')
        return []
      }
      const all = await navigator.mediaDevices.enumerateDevices()
      const mics = all.filter(d => d.kind === 'audioinput')
      setDevices(mics)
      // If selected device is no longer available, reset.
      if (selectedDeviceId && !mics.some(m => m.deviceId === selectedDeviceId)) {
        setSelectedDeviceId(null)
      }
      return mics
    } catch (e) {
      setError(e.message || 'enumerateDevices failed')
      return []
    }
  }, [selectedDeviceId])

  // Refresh device list on mount (note: labels are empty without prior permission)
  useEffect(() => {
    enumerate()
    const onChange = () => enumerate()
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange)
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const start = useCallback(async (opts = {}) => {
    if (state !== 'idle') return
    setError(null)
    chunksRef.current = []
    try {
      if (typeof MediaRecorder === 'undefined') {
        throw new Error('MediaRecorder not supported in this browser.')
      }

      const constraints = {
        audio: {
          deviceId: opts.deviceId || selectedDeviceId
            ? { exact: opts.deviceId || selectedDeviceId }
            : undefined,
          echoCancellation: false,    // preserve room ambiance for game sessions
          noiseSuppression: false,
          autoGainControl: false,
          channelCount: 2,             // stereo if device supports
          sampleRate: 48000,
        },
        video: false,
      }
      const stream = await navigator.mediaDevices.getUserMedia(constraints)
      streamRef.current = stream

      // Capture device label (now that we have permission, labels are populated)
      const track = stream.getAudioTracks()[0]
      deviceLabelRef.current = track?.label || 'unknown'
      // Re-enumerate so the UI dropdown shows real device names
      enumerate()

      const mimeType = opts.mimeType || DEFAULT_MIME
      const bitsPerSecond = opts.bitsPerSecond || DEFAULT_BITRATE
      mimeUsedRef.current = mimeType
      bitRateUsedRef.current = bitsPerSecond

      const recorder = new MediaRecorder(stream, mimeType
        ? { mimeType, audioBitsPerSecond: bitsPerSecond }
        : { audioBitsPerSecond: bitsPerSecond }
      )
      recorderRef.current = recorder

      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeUsedRef.current || 'audio/webm' })
        const endedAt = Date.now()
        const durationMs = endedAt - startedAtRef.current - pauseAccumRef.current
        const result = {
          blob,
          mimeType: mimeUsedRef.current,
          bitRate: bitRateUsedRef.current,
          durationMs,
          startedAt: startedAtRef.current,
          endedAt,
          deviceLabel: deviceLabelRef.current,
        }
        cleanupStream()
        stopTick()
        setState('idle')
        setElapsed(0)
        const resolve = stopResolverRef.current
        stopResolverRef.current = null
        if (resolve) resolve(result)
      }
      recorder.onerror = (e) => {
        setError(e.error?.message || 'MediaRecorder error')
        cleanupStream()
        stopTick()
        setState('idle')
      }

      startedAtRef.current = Date.now()
      pauseAccumRef.current = 0
      pauseStartRef.current = 0
      elapsedAtPauseRef.current = 0
      recorder.start(1000)   // emit data chunks every 1s
      setState('recording')
      startTick()
    } catch (e) {
      setError(e.message || 'getUserMedia failed')
      cleanupStream()
      setState('idle')
    }
  }, [state, selectedDeviceId, enumerate])

  const pause = useCallback(() => {
    const rec = recorderRef.current
    if (!rec) return
    if (state === 'recording') {
      rec.pause()
      pauseStartRef.current = Date.now()
      elapsedAtPauseRef.current = elapsed
      stopTick()
      setState('paused')
    } else if (state === 'paused') {
      rec.resume()
      pauseAccumRef.current += Date.now() - pauseStartRef.current
      pauseStartRef.current = 0
      setState('recording')
      startTick()
    }
  }, [state, elapsed])

  const stop = useCallback(() => {
    return new Promise((resolve) => {
      const rec = recorderRef.current
      if (!rec) { resolve(null); return }
      stopResolverRef.current = resolve
      setState('stopping')
      // If paused, flush the accumulated pause time first
      if (rec.state === 'paused') {
        pauseAccumRef.current += Date.now() - pauseStartRef.current
        pauseStartRef.current = 0
      }
      try {
        rec.stop()
      } catch (e) {
        setError(e.message || 'stop failed')
        cleanupStream()
        stopTick()
        setState('idle')
        resolve(null)
      }
    })
  }, [])

  const addMarkerNow = useCallback((label) => {
    if (state === 'idle') return null
    const offsetMs = Date.now() - startedAtRef.current - pauseAccumRef.current
    return { offsetMs, label: label || '', kind: 'manual' }
  }, [state])

  const reset = useCallback(() => {
    cleanupStream()
    stopTick()
    chunksRef.current = []
    recorderRef.current = null
    startedAtRef.current = 0
    pauseAccumRef.current = 0
    pauseStartRef.current = 0
    setState('idle')
    setElapsed(0)
    setError(null)
  }, [])

  return {
    state, elapsed,
    start, pause, stop, addMarkerNow, reset,
    devices, enumerate, selectedDeviceId, setSelectedDeviceId,
    error,
    supportedMime: DEFAULT_MIME,
    defaultBitRate: DEFAULT_BITRATE,
  }
}
