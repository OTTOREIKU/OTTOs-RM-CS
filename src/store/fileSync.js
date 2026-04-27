// File System Access API — optional live backup to a user-chosen file.
// Supported in Chrome 86+, Edge 86+, Opera 72+. Gracefully no-ops elsewhere.

export const FILE_SYNC_SUPPORTED = typeof window !== 'undefined' && 'showSaveFilePicker' in window

// ── Tiny IndexedDB helper (file handles can't go in localStorage) ────────────

let _db = null

function openDB() {
  if (_db) return Promise.resolve(_db)
  return new Promise((res, rej) => {
    const req = indexedDB.open('rm_filesync', 1)
    req.onupgradeneeded = e => e.target.result.createObjectStore('kv')
    req.onsuccess  = e => { _db = e.target.result; res(_db) }
    req.onerror    = () => rej(req.error)
  })
}
async function idbGet(key) {
  const db  = await openDB()
  return new Promise((res, rej) => {
    const req = db.transaction('kv', 'readonly').objectStore('kv').get(key)
    req.onsuccess = () => res(req.result ?? null)
    req.onerror   = () => rej(req.error)
  })
}
async function idbSet(key, val) {
  const db = await openDB()
  return new Promise((res, rej) => {
    const req = db.transaction('kv', 'readwrite').objectStore('kv').put(val, key)
    req.onsuccess = () => res()
    req.onerror   = () => rej(req.error)
  })
}
async function idbDel(key) {
  const db = await openDB()
  return new Promise((res, rej) => {
    const req = db.transaction('kv', 'readwrite').objectStore('kv').delete(key)
    req.onsuccess = () => res()
    req.onerror   = () => rej(req.error)
  })
}

// ── Handle persistence ────────────────────────────────────────────────────────

export async function getLinkedHandle() {
  if (!FILE_SYNC_SUPPORTED) return null
  try { return await idbGet('fileHandle') } catch { return null }
}

export async function clearLinkedHandle() {
  try { await idbDel('fileHandle') } catch {}
}

/** Returns the file name stored with the handle, or null */
export async function getLinkedFileName() {
  const h = await getLinkedHandle()
  return h?.name ?? null
}

/** Check if we already have write permission (no prompt) */
export async function hasWritePermission(handle) {
  if (!handle) return false
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
  } catch { return false }
}

/** Ask for write permission — must be called from a user gesture */
export async function requestWritePermission(handle) {
  if (!handle) return false
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch { return false }
}

/** Open the file picker and link a new backup file */
export async function pickAndLinkFile() {
  if (!FILE_SYNC_SUPPORTED) return null
  try {
    const handle = await window.showSaveFilePicker({
      suggestedName: 'rmu_backup.json',
      types: [{ description: 'RMU Character+ Backup', accept: { 'application/json': ['.json'] } }],
    })
    await idbSet('fileHandle', handle)
    return handle
  } catch (e) {
    if (e.name === 'AbortError') return null   // user cancelled
    throw e
  }
}

/** Write data to the linked file handle */
export async function writeToHandle(handle, data) {
  if (!handle) return false
  try {
    const w = await handle.createWritable()
    await w.write(JSON.stringify(data, null, 2))
    await w.close()
    return true
  } catch { return false }
}

/** Read and parse the linked backup file */
export async function readFromHandle(handle) {
  if (!handle) return null
  try {
    const file = await handle.getFile()
    return JSON.parse(await file.text())
  } catch { return null }
}

// ── Debounced auto-save ───────────────────────────────────────────────────────

let _timer = null

/**
 * Schedule a background write of all app data to the linked file.
 * Debounced to 2 s so rapid keystrokes don't hammer the file system.
 * Safe to call on every keystroke — silently no-ops if no file is linked
 * or permission is missing.
 */
export function scheduleBackup(buildPayload) {
  if (!FILE_SYNC_SUPPORTED) return
  clearTimeout(_timer)
  _timer = setTimeout(async () => {
    try {
      const handle = await getLinkedHandle()
      if (!handle) return
      if (!(await hasWritePermission(handle))) return  // don't prompt mid-session
      await writeToHandle(handle, buildPayload())
    } catch { /* silent */ }
  }, 2000)
}
