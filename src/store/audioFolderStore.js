// Folder-backed audio session storage. When the user has linked an RMUCplus
// root folder + granted write permission, sessions live as:
//
//   RMUCplus/Audio Recordings/<safe-label>.<ext>          ← the audio file
//   RMUCplus/Audio Bookmarks/<safe-label>.bookmarks.json  ← sidecar metadata
//
// Sidecar JSON shape (the source of truth for the session):
//
//   {
//     "id":              "audio_<ts>_<rand>",
//     "label":           "Recording 2026-05-23",
//     "audioFilename":   "Recording_2026-05-23.webm",
//     "characterId":     "char_..." | null,
//     "startedAt":       <ms epoch>,
//     "endedAt":         <ms epoch>,
//     "durationMs":      number,
//     "mimeType":        "audio/webm;codecs=opus",
//     "bitRate":         256000,
//     "deviceLabel":     "Built-in mic",
//     "markers":         [{ "offsetMs", "label", "kind" }]
//   }
//
// If an audio file exists in Audio Recordings/ but has no sidecar (someone
// dropped it in via Syncthing or another app), the next list call auto-creates
// a stub sidecar with no bookmarks so we have a stable ID for it.

import {
  DIR_SYNC_SUPPORTED,
  getLinkedDirHandle, hasDirWritePermission,
  getSubDir, writeFile, readFile, readJsonFile, deleteFile, listEntries,
  safeFilename,
} from './fileSync.js'

const REC_DIR = 'Audio Recordings'
const BMK_DIR = 'Audio Bookmarks'

function extFor(mimeType) {
  const t = (mimeType || '').toLowerCase()
  if (t.includes('webm')) return 'webm'
  if (t.includes('mp4'))  return 'm4a'
  if (t.includes('ogg'))  return 'ogg'
  if (t.includes('mpeg')) return 'mp3'
  if (t.includes('wav'))  return 'wav'
  if (t.includes('flac')) return 'flac'
  return 'audio'
}

function stripExt(name) {
  return name.replace(/\.[^.]+$/, '')
}

function bookmarksFilenameFor(safeBase) {
  return `${safeBase}.bookmarks.json`
}

/** Is the folder both linked AND we have write permission RIGHT NOW? */
export async function isFolderReady() {
  if (!DIR_SYNC_SUPPORTED) return false
  const root = await getLinkedDirHandle()
  if (!root) return false
  if (!(await hasDirWritePermission(root))) return false
  return true
}

/** Returns { root, recDir, bmkDir } or null if not ready. */
async function getFolders() {
  const root = await getLinkedDirHandle()
  if (!root) return null
  const recDir = await getSubDir(root, REC_DIR, { create: true })
  const bmkDir = await getSubDir(root, BMK_DIR, { create: true })
  if (!recDir || !bmkDir) return null
  return { root, recDir, bmkDir }
}

/**
 * List all sessions in the folder. Walks the Audio Recordings/ folder and
 * pairs each audio file with its sidecar in Audio Bookmarks/. For audio files
 * without a sidecar, creates a stub sidecar so they get a stable ID.
 *
 * Returns: [{ ...sessionMetadata, blob: null }]  — blobs are loaded on demand
 *          via loadSessionBlob() to avoid pulling MBs of audio upfront.
 */
export async function listFolderSessions() {
  const folders = await getFolders()
  if (!folders) return []
  const { recDir, bmkDir } = folders

  const audioFiles = await listEntries(recDir)
  const sessions = []

  for (const f of audioFiles) {
    if (f.kind !== 'file') continue
    const base = stripExt(f.name)
    const bmkFilename = bookmarksFilenameFor(base)
    let sidecar = await readJsonFile(bmkDir, bmkFilename)

    if (!sidecar) {
      // External file with no sidecar — synthesize one and persist it
      sidecar = {
        id: `audio_${f.lastModified || Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        label: base,
        audioFilename: f.name,
        characterId: null,
        startedAt: f.lastModified || Date.now(),
        endedAt: f.lastModified || Date.now(),
        durationMs: 0,
        mimeType: '',
        bitRate: 0,
        deviceLabel: 'imported',
        markers: [],
      }
      try {
        await writeFile(bmkDir, bmkFilename, JSON.stringify(sidecar, null, 2))
      } catch (e) {
        console.warn('[audioFolderStore] could not write stub sidecar:', e)
      }
    } else {
      // Keep audioFilename in sync with what's actually on disk (in case
      // someone renamed the file externally)
      if (sidecar.audioFilename !== f.name) {
        sidecar.audioFilename = f.name
        try {
          await writeFile(bmkDir, bmkFilename, JSON.stringify(sidecar, null, 2))
        } catch {}
      }
    }
    sidecar.size = f.size
    sidecar.blob = null   // lazy
    sessions.push(sidecar)
  }

  sessions.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0))
  return sessions
}

/** Load the audio blob for a single session. Returns null if missing. */
export async function loadSessionBlob(session) {
  const folders = await getFolders()
  if (!folders) return null
  return await readFile(folders.recDir, session.audioFilename)
}

/**
 * Save a freshly-recorded (or imported) session to disk. Writes both the
 * audio file and the sidecar JSON. Returns the persisted session metadata
 * (with audioFilename set to the actual on-disk name after de-duplication).
 */
export async function saveSessionToFolder(session) {
  const folders = await getFolders()
  if (!folders) throw new Error('RMUCplus folder is not linked or permission is missing.')
  const { recDir, bmkDir } = folders

  const ext = extFor(session.mimeType)
  let base = safeFilename(session.label || 'Recording', 'Recording')
  let audioFilename = `${base}.${ext}`
  let bmkFilename   = bookmarksFilenameFor(base)

  // Avoid clobbering existing files: append " (N)" if needed
  let n = 2
  while (await fileExists(recDir, audioFilename) || await fileExists(bmkDir, bmkFilename)) {
    const altBase = `${base} (${n})`
    audioFilename = `${altBase}.${ext}`
    bmkFilename   = bookmarksFilenameFor(altBase)
    n++
    if (n > 999) break
  }

  await writeFile(recDir, audioFilename, session.blob)

  const persisted = {
    id:            session.id,
    label:         session.label,
    audioFilename,
    characterId:   session.characterId ?? null,
    startedAt:     session.startedAt,
    endedAt:       session.endedAt,
    durationMs:    session.durationMs,
    mimeType:      session.mimeType,
    bitRate:       session.bitRate ?? 0,
    deviceLabel:   session.deviceLabel ?? '',
    markers:       session.markers ?? [],
  }
  await writeFile(bmkDir, bmkFilename, JSON.stringify(persisted, null, 2))
  return persisted
}

/** Rename a session: changes label → recomputes both filenames → renames on disk + rewrites sidecar. */
export async function renameSessionInFolder(session, newLabel) {
  const folders = await getFolders()
  if (!folders) throw new Error('RMUCplus folder is not linked.')
  const { recDir, bmkDir } = folders

  const ext = extFor(session.mimeType) || stripExt(session.audioFilename).split('.').pop() || 'webm'
  const newBase = safeFilename(newLabel, 'Recording')
  const newAudioFilename = `${newBase}.${ext}`
  const newBmkFilename   = bookmarksFilenameFor(newBase)
  const oldBase = stripExt(session.audioFilename)
  const oldBmkFilename = bookmarksFilenameFor(oldBase)

  if (newAudioFilename === session.audioFilename && newBmkFilename === oldBmkFilename) {
    // Names didn't change, just patch the label inside the sidecar
    const sidecar = await readJsonFile(bmkDir, oldBmkFilename)
    if (sidecar) {
      sidecar.label = newLabel
      await writeFile(bmkDir, oldBmkFilename, JSON.stringify(sidecar, null, 2))
    }
    return { ...session, label: newLabel }
  }

  // Refuse if the target name already exists (don't clobber)
  if (await fileExists(recDir, newAudioFilename) || await fileExists(bmkDir, newBmkFilename)) {
    throw new Error(`A recording named "${newBase}" already exists. Choose a different name.`)
  }

  // Read old audio + sidecar, write under new names, delete old.
  const audioBlob = await readFile(recDir, session.audioFilename)
  if (!audioBlob) throw new Error(`Audio file not found: ${session.audioFilename}`)
  const sidecar = (await readJsonFile(bmkDir, oldBmkFilename)) || { ...session }

  sidecar.label         = newLabel
  sidecar.audioFilename = newAudioFilename

  await writeFile(recDir, newAudioFilename, audioBlob)
  await writeFile(bmkDir, newBmkFilename, JSON.stringify(sidecar, null, 2))
  await deleteFile(recDir, session.audioFilename)
  await deleteFile(bmkDir, oldBmkFilename)

  return { ...session, label: newLabel, audioFilename: newAudioFilename }
}

/** Update a session's markers in the sidecar. Does NOT touch the audio file. */
export async function updateSessionMarkersInFolder(session, markers) {
  const folders = await getFolders()
  if (!folders) throw new Error('RMUCplus folder is not linked.')
  const { bmkDir } = folders
  const base = stripExt(session.audioFilename)
  const bmkFilename = bookmarksFilenameFor(base)
  const sidecar = (await readJsonFile(bmkDir, bmkFilename)) || { ...session }
  sidecar.markers = markers
  await writeFile(bmkDir, bmkFilename, JSON.stringify(sidecar, null, 2))
  return sidecar
}

/** Delete a session: removes both audio file + sidecar. */
export async function deleteSessionFromFolder(session) {
  const folders = await getFolders()
  if (!folders) return false
  const { recDir, bmkDir } = folders
  const base = stripExt(session.audioFilename)
  const bmkFilename = bookmarksFilenameFor(base)
  await deleteFile(recDir, session.audioFilename)
  await deleteFile(bmkDir, bmkFilename)
  return true
}

/** Copy an external file blob into the Audio Recordings folder (used by Import). */
export async function importFileToFolder(file, opts = {}) {
  const folders = await getFolders()
  if (!folders) throw new Error('RMUCplus folder is not linked.')

  const labelGuess = opts.label || file.name.replace(/\.[^.]+$/, '') || 'Imported'
  const session = {
    id:           opts.id || `audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    label:        labelGuess,
    blob:         file,
    characterId:  opts.characterId ?? null,
    startedAt:    opts.startedAt || file.lastModified || Date.now(),
    endedAt:      opts.endedAt   || file.lastModified || Date.now(),
    durationMs:   opts.durationMs ?? 0,
    mimeType:     file.type || opts.mimeType || '',
    bitRate:      opts.bitRate ?? 0,
    deviceLabel:  opts.deviceLabel || 'imported',
    markers:      opts.markers || [],
  }
  return await saveSessionToFolder(session)
}

// ── Helpers ─────────────────────────────────────────────────────────────────

async function fileExists(dirHandle, filename) {
  try {
    await dirHandle.getFileHandle(filename)
    return true
  } catch (e) {
    if (e.name === 'NotFoundError') return false
    return false
  }
}
