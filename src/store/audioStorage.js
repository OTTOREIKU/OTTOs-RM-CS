// IndexedDB wrapper for notebook audio recordings.
//
// One object store: `sessions`, keyed by id. Each entry:
//   {
//     id:         string             — 'audio_<ts>_<rand>'
//     characterId: string|null       — which character was active when recording started (info only)
//     startedAt:  number             — Date.now() at record start
//     endedAt:    number             — Date.now() at stop
//     durationMs: number             — endedAt - startedAt (less any paused time)
//     mimeType:   string             — e.g. 'audio/webm;codecs=opus'
//     bitRate:    number             — bits/sec used by the encoder
//     deviceLabel:string             — name of the mic used
//     blob:       Blob               — the audio data
//     markers:    [{ offsetMs, label, kind: 'manual'|'auto' }]
//     label:      string             — user-editable display name (defaults to date)
//   }

const DB_NAME    = 'rm_notebook_audio'
const DB_VERSION = 1
const STORE      = 'sessions'

let dbPromise = null

function getDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: 'id' })
        store.createIndex('startedAt', 'startedAt', { unique: false })
      }
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror   = () => reject(req.error)
  })
  return dbPromise
}

async function withStore(mode, fn) {
  const db = await getDB()
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode)
    const store = tx.objectStore(STORE)
    const result = fn(store)
    tx.oncomplete = () => resolve(result)
    tx.onerror    = () => reject(tx.error)
    tx.onabort    = () => reject(tx.error)
  })
}

export async function saveSession(session) {
  await withStore('readwrite', store => store.put(session))
  return session
}

export async function getAllSessions() {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDB()
      const tx = db.transaction(STORE, 'readonly')
      const store = tx.objectStore(STORE)
      const req = store.getAll()
      req.onsuccess = () => {
        const list = req.result || []
        // Newest first
        list.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
        resolve(list)
      }
      req.onerror = () => reject(req.error)
    } catch (e) {
      reject(e)
    }
  })
}

export async function getSession(id) {
  return new Promise(async (resolve, reject) => {
    try {
      const db = await getDB()
      const tx = db.transaction(STORE, 'readonly')
      const req = tx.objectStore(STORE).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror   = () => reject(req.error)
    } catch (e) { reject(e) }
  })
}

export async function deleteSession(id) {
  await withStore('readwrite', store => store.delete(id))
}

export async function updateSessionLabel(id, label) {
  const s = await getSession(id)
  if (!s) return null
  s.label = label
  await saveSession(s)
  return s
}

export async function addSessionMarker(id, marker) {
  const s = await getSession(id)
  if (!s) return null
  s.markers = [...(s.markers || []), marker]
  await saveSession(s)
  return s
}

export async function removeSessionMarker(id, markerIdx) {
  const s = await getSession(id)
  if (!s) return null
  s.markers = (s.markers || []).filter((_, i) => i !== markerIdx)
  await saveSession(s)
  return s
}

// Estimate of total bytes stored (rough — sums blob sizes).
export async function getStorageUsage() {
  const all = await getAllSessions()
  return all.reduce((sum, s) => sum + (s.blob?.size || 0), 0)
}

// Browser-side download trigger (prompts file save dialog if browser preference is set).
export function downloadSession(session, suggestedExt = 'webm') {
  if (!session?.blob) return
  const url = URL.createObjectURL(session.blob)
  const a = document.createElement('a')
  const dt = new Date(session.startedAt || Date.now())
  const stamp = dt.toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const safeLabel = (session.label || 'recording').replace(/[^a-z0-9_-]/gi, '_').slice(0, 40)
  a.href = url
  a.download = `${stamp}_${safeLabel}.${suggestedExt}`
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}
