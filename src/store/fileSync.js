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

// ════════════════════════════════════════════════════════════════════════════
// Directory-level API (RMUCplus folder root + subfolders).
// Used for audio recordings + bookmarks (Phase 1), characters + notebooks
// (Phase 3). Same File System Access API as the file-level stuff above; this
// just operates on a single user-chosen folder.
// ════════════════════════════════════════════════════════════════════════════

export const DIR_SYNC_SUPPORTED = typeof window !== 'undefined' && 'showDirectoryPicker' in window

// Standard subfolder layout under the chosen root folder
export const RMUC_SUBFOLDERS = ['Audio Recordings', 'Audio Bookmarks', 'Characters', 'Notebooks']
export const RMUC_MANIFEST   = '_RMUCplus.json'

const DIR_HANDLE_KEY = 'rmucDirHandle'

/** Returns the persisted RMUCplus directory handle, or null. */
export async function getLinkedDirHandle() {
  if (!DIR_SYNC_SUPPORTED) return null
  try { return await idbGet(DIR_HANDLE_KEY) } catch { return null }
}

export async function clearLinkedDirHandle() {
  try { await idbDel(DIR_HANDLE_KEY) } catch {}
}

export async function getLinkedDirName() {
  const h = await getLinkedDirHandle()
  return h?.name ?? null
}

export async function hasDirWritePermission(handle) {
  if (!handle) return false
  try {
    return (await handle.queryPermission({ mode: 'readwrite' })) === 'granted'
  } catch { return false }
}

/** Must be called from a user gesture. */
export async function requestDirWritePermission(handle) {
  if (!handle) return false
  try {
    return (await handle.requestPermission({ mode: 'readwrite' })) === 'granted'
  } catch { return false }
}

/**
 * Open the directory picker. Asks the user to choose a folder, then creates
 * the RMUCplus root inside it (if not present) along with all standard
 * subfolders. Stores the RMUCplus root handle in IDB and returns it.
 *
 * Returns null if the user cancels.
 */
export async function pickRMUCplusFolder({ rootName = 'RMUCplus' } = {}) {
  if (!DIR_SYNC_SUPPORTED) return null
  try {
    const parent = await window.showDirectoryPicker({ mode: 'readwrite' })
    // Always nest under a named folder so we never clutter the user's chosen
    // parent — even if they picked an empty folder.
    const root = await parent.getDirectoryHandle(rootName, { create: true })
    await ensureSubfolders(root)
    await ensureRootManifest(root)
    await idbSet(DIR_HANDLE_KEY, root)
    return root
  } catch (e) {
    if (e.name === 'AbortError') return null   // user cancelled
    throw e
  }
}

/** Create the standard subfolders under the root if missing. */
export async function ensureSubfolders(rootHandle) {
  for (const name of RMUC_SUBFOLDERS) {
    await rootHandle.getDirectoryHandle(name, { create: true })
  }
}

/** Write a minimal manifest at the folder root for debugging + future migrations. */
export async function ensureRootManifest(rootHandle) {
  try {
    // If a manifest already exists, leave it alone (don't blow away user data)
    let existing = null
    try {
      const handle = await rootHandle.getFileHandle(RMUC_MANIFEST)
      const file = await handle.getFile()
      existing = JSON.parse(await file.text())
    } catch {}
    if (existing) return existing
    const manifest = {
      app:         'RMU Character+',
      schema:      1,
      createdAt:   new Date().toISOString(),
      subfolders:  RMUC_SUBFOLDERS,
    }
    const handle = await rootHandle.getFileHandle(RMUC_MANIFEST, { create: true })
    const writer = await handle.createWritable()
    await writer.write(JSON.stringify(manifest, null, 2))
    await writer.close()
    return manifest
  } catch (e) {
    console.warn('[fileSync] ensureRootManifest failed:', e)
    return null
  }
}

/** Get a subfolder handle by name. */
export async function getSubDir(rootHandle, name, { create = false } = {}) {
  if (!rootHandle) return null
  try {
    return await rootHandle.getDirectoryHandle(name, { create })
  } catch (e) {
    if (e.name === 'NotFoundError') return null
    throw e
  }
}

/** Write data (Blob | string | ArrayBuffer) to filename inside dirHandle. */
export async function writeFile(dirHandle, filename, data) {
  if (!dirHandle) throw new Error('No directory handle')
  const fh = await dirHandle.getFileHandle(filename, { create: true })
  const w  = await fh.createWritable()
  if (data instanceof Blob) {
    await w.write(data)
  } else if (typeof data === 'string') {
    await w.write(data)
  } else if (data instanceof ArrayBuffer || ArrayBuffer.isView(data)) {
    await w.write(data)
  } else {
    await w.write(JSON.stringify(data, null, 2))
  }
  await w.close()
  return fh
}

/** Read filename from dirHandle as a Blob. Returns null if not found. */
export async function readFile(dirHandle, filename) {
  if (!dirHandle) return null
  try {
    const fh = await dirHandle.getFileHandle(filename)
    return await fh.getFile()    // File (extends Blob)
  } catch (e) {
    if (e.name === 'NotFoundError') return null
    throw e
  }
}

/** Read filename and parse as JSON. Returns null if not found or invalid. */
export async function readJsonFile(dirHandle, filename) {
  const blob = await readFile(dirHandle, filename)
  if (!blob) return null
  try { return JSON.parse(await blob.text()) } catch { return null }
}

/** Delete filename from dirHandle. Silently no-ops if missing. */
export async function deleteFile(dirHandle, filename) {
  if (!dirHandle) return false
  try {
    await dirHandle.removeEntry(filename)
    return true
  } catch (e) {
    if (e.name === 'NotFoundError') return false
    throw e
  }
}

/**
 * Rename a file. File System Access API has no native rename, so we copy +
 * delete. Atomic enough for our use case (no concurrent writers).
 */
export async function renameFile(dirHandle, oldName, newName) {
  if (oldName === newName) return true
  const blob = await readFile(dirHandle, oldName)
  if (!blob) throw new Error(`File not found: ${oldName}`)
  await writeFile(dirHandle, newName, blob)
  await deleteFile(dirHandle, oldName)
  return true
}

/**
 * List entries in dirHandle. Returns [{ name, kind, size, lastModified }].
 * Optional predicate filters by name.
 */
export async function listEntries(dirHandle, { predicate = null, includeDirs = false } = {}) {
  if (!dirHandle) return []
  const out = []
  for await (const [name, handle] of dirHandle.entries()) {
    if (!includeDirs && handle.kind !== 'file') continue
    if (predicate && !predicate(name, handle)) continue
    let size = null, lastModified = null
    if (handle.kind === 'file') {
      try {
        const file = await handle.getFile()
        size = file.size
        lastModified = file.lastModified
      } catch {}
    }
    out.push({ name, kind: handle.kind, size, lastModified })
  }
  return out
}

/** Sanitize a string for use as a filename. Strips path separators + control chars. */
export function safeFilename(s, fallback = 'untitled') {
  return (String(s || '').trim()
    .replace(/[\\/:*?"<>| -]/g, '_')
    .replace(/^\.+/, '_')
    .replace(/\s+/g, ' ')
    .slice(0, 120)
  ) || fallback
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
