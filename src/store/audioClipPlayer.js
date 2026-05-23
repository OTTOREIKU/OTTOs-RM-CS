// Singleton audio playback manager for the notebook's clip pills.
//
// Multiple pills may exist in a note; only ONE plays at a time. Pills
// subscribe to playback state so they can show a play/pause indicator.
//
// Public API:
//   playClip({ sessionId, audioFilename, startMs, endMs, fromSession })
//   stop()
//   subscribe(cb) → unsubscribe   — cb({ playingClipKey, currentMs })
//
// Session resolution: if `fromSession` is provided we use its blob directly;
// otherwise we fall back to looking up the session in folder mode (resolve at
// call time so the user must have folder access).

import { isFolderReady, loadSessionBlob, listFolderSessions } from './audioFolderStore.js'
import { getSession as getIdbSession } from './audioStorage.js'

// One shared audio element. Created lazily; reused for every clip.
let audioEl = null
let currentBlobUrl = null
let currentSessionId = null
let watchdog = null
let listeners = new Set()
let playingClipKey = null

function getAudio() {
  if (!audioEl) {
    audioEl = new Audio()
    audioEl.preload = 'metadata'
    audioEl.addEventListener('ended', stop)
    audioEl.addEventListener('error', stop)
    audioEl.addEventListener('timeupdate', () => emit())
  }
  return audioEl
}

function emit() {
  const currentMs = audioEl ? Math.round((audioEl.currentTime || 0) * 1000) : 0
  for (const cb of listeners) {
    try { cb({ playingClipKey, currentMs }) } catch {}
  }
}

export function subscribe(cb) {
  listeners.add(cb)
  cb({ playingClipKey, currentMs: audioEl ? Math.round((audioEl.currentTime || 0) * 1000) : 0 })
  return () => listeners.delete(cb)
}

// Unique key for a clip pill so pills can know which one is currently playing
export function makeClipKey({ sessionId, startMs, endMs }) {
  return `${sessionId}::${startMs}-${endMs}`
}

export function stop() {
  if (watchdog) { clearTimeout(watchdog); watchdog = null }
  if (audioEl && !audioEl.paused) {
    try { audioEl.pause() } catch {}
  }
  playingClipKey = null
  emit()
}

async function resolveBlobForSession(sessionId, audioFilename, fromSession) {
  // 1) explicit blob handed in (e.g., recorder still has it in memory)
  if (fromSession?.blob) return fromSession.blob
  // 2) folder mode: read from disk
  if (await isFolderReady()) {
    // Need a session-shaped object — minimum is audioFilename
    if (audioFilename) {
      try {
        return await loadSessionBlob({ audioFilename })
      } catch {}
    }
    // Fallback: scan folder sessions for matching id
    try {
      const all = await listFolderSessions()
      const match = all.find(s => s.id === sessionId)
      if (match) return await loadSessionBlob(match)
    } catch {}
  }
  // 3) IndexedDB mode: pull from the session record
  try {
    const idb = await getIdbSession(sessionId)
    if (idb?.blob) return idb.blob
  } catch {}
  return null
}

/**
 * Play a clip. Returns { ok: boolean, error?: string }.
 *
 * If a different clip is currently playing, it's stopped first. If the same
 * clip is currently playing, this acts as a toggle (stops it).
 */
export async function playClip({ sessionId, audioFilename, startMs, endMs, fromSession }) {
  const key = makeClipKey({ sessionId, startMs, endMs })

  // Toggle: same clip → stop
  if (playingClipKey === key && audioEl && !audioEl.paused) {
    stop()
    return { ok: true }
  }

  // Different clip currently playing → stop it first
  stop()

  const blob = await resolveBlobForSession(sessionId, audioFilename, fromSession)
  if (!blob) return { ok: false, error: 'Audio not available' }

  const audio = getAudio()

  // Reuse blob URL if same session, otherwise swap
  if (currentSessionId !== sessionId || !currentBlobUrl) {
    if (currentBlobUrl) {
      try { URL.revokeObjectURL(currentBlobUrl) } catch {}
    }
    currentBlobUrl = URL.createObjectURL(blob)
    currentSessionId = sessionId
    audio.src = currentBlobUrl
    // Wait for the audio to be loadable before seeking
    await new Promise((resolve) => {
      const onReady = () => {
        audio.removeEventListener('loadedmetadata', onReady)
        audio.removeEventListener('canplay', onReady)
        resolve()
      }
      audio.addEventListener('loadedmetadata', onReady)
      audio.addEventListener('canplay', onReady)
      // Fallback timeout in case neither event fires (rare)
      setTimeout(resolve, 1500)
    })
  }

  // Fix the infinite-duration WebM case the same way we do in SessionRow
  if (audio.duration === Infinity || isNaN(audio.duration)) {
    await new Promise((resolve) => {
      const onDur = () => {
        if (audio.duration !== Infinity && !isNaN(audio.duration)) {
          audio.removeEventListener('durationchange', onDur)
          audio.currentTime = 0
          resolve()
        }
      }
      audio.addEventListener('durationchange', onDur)
      audio.currentTime = 1e10
      setTimeout(resolve, 3000)
    })
  }

  // Seek + play
  try {
    const clampedStart = Math.max(0, Math.min(startMs / 1000, (audio.duration || 0) - 0.05))
    audio.currentTime = clampedStart
    await audio.play()
  } catch (e) {
    return { ok: false, error: e.message || 'Playback failed' }
  }

  playingClipKey = key
  emit()

  // Schedule stop at end time (account for clamping)
  const startSec = audio.currentTime
  const desiredDurationSec = Math.max(0.1, (endMs - startMs) / 1000)
  // Use a watchdog timer so we stop even if the audio element fires no events
  watchdog = setTimeout(() => {
    // Only stop if WE'RE still the active clip
    if (playingClipKey === key) stop()
  }, Math.ceil(desiredDurationSec * 1000) + 100)

  // Also stop via timeupdate guard in case timer drifts
  const guard = () => {
    if (!audioEl) return
    if (playingClipKey !== key) {
      audioEl.removeEventListener('timeupdate', guard)
      return
    }
    if (audioEl.currentTime - startSec >= desiredDurationSec) {
      audioEl.removeEventListener('timeupdate', guard)
      stop()
    }
  }
  audio.addEventListener('timeupdate', guard)

  return { ok: true }
}
