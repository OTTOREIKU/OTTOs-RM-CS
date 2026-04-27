// Notebook store — folders + notes, persisted to localStorage
import { scheduleBackup } from './fileSync.js'

function buildBackupPayload() {
  const chars = (() => { try { return JSON.parse(localStorage.getItem('rm_characters') || '{}') } catch { return {} } })()
  const nb    = (() => { try { return JSON.parse(localStorage.getItem(NB_KEY) || 'null') } catch { return null } })()
  return { _version: 1, _type: 'backup', characters: chars, notebook: nb, _saved_at: new Date().toISOString() }
}

const NB_KEY        = 'rm_notebook'
const NB_OPEN_KEY   = 'rm_nb_open_folders'
const NB_ACTIVE_KEY = 'rm_nb_active_note'

export function loadNotebook() {
  try {
    const raw = localStorage.getItem(NB_KEY)
    return raw ? JSON.parse(raw) : { folders: {}, notes: {} }
  } catch { return { folders: {}, notes: {} } }
}

export function saveNotebook(data) {
  try { localStorage.setItem(NB_KEY, JSON.stringify(data)) } catch {}
  scheduleBackup(buildBackupPayload)
}

export function loadOpenFolders() {
  try { return JSON.parse(localStorage.getItem(NB_OPEN_KEY) || '{}') } catch { return {} }
}
export function saveOpenFolders(v) {
  try { localStorage.setItem(NB_OPEN_KEY, JSON.stringify(v)) } catch {}
}

export function loadActiveNoteId() {
  return localStorage.getItem(NB_ACTIVE_KEY) || null
}
export function saveActiveNoteId(id) {
  if (id) localStorage.setItem(NB_ACTIVE_KEY, id)
  else localStorage.removeItem(NB_ACTIVE_KEY)
}

export function nbUid(prefix = 'n') {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}
