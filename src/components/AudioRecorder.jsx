// AudioRecorder.jsx — notebook audio recording + playback.
//
// Self-contained. Drops into NotebookView (or any view) and gives the user:
//   - Mic device picker
//   - Record / Pause / Stop controls
//   - Live timer (h:mm:ss)
//   - Bookmark button (drops a manual timestamp marker)
//   - On Stop: prompts save dialog + persists session to IndexedDB
//   - Sessions list with playback, scrub bar, markers, label edit, download, delete
//
// All text-only labels — no colorful icons. Flat single-color SVG only where unavoidable.

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import fixWebmDuration from 'fix-webm-duration'
import { useAudioRecorder } from '../hooks/useAudioRecorder.js'
import {
  saveSession, getAllSessions, deleteSession, updateSessionLabel,
  addSessionMarker, removeSessionMarker, downloadSession,
} from '../store/audioStorage.js'
import {
  isFolderReady, listFolderSessions, loadSessionBlob,
  saveSessionToFolder, renameSessionInFolder, updateSessionMarkersInFolder,
  deleteSessionFromFolder, importFileToFolder,
} from '../store/audioFolderStore.js'
import {
  DIR_SYNC_SUPPORTED,
  getLinkedDirHandle, getLinkedDirName, clearLinkedDirHandle,
  hasDirWritePermission, requestDirWritePermission, pickRMUCplusFolder,
} from '../store/fileSync.js'
import { useCharacter } from '../store/CharacterContext.jsx'
import { ChevronDownIcon, ChevronRightIcon, XIcon, TrashIcon, PencilIcon, GearIcon, FolderIcon } from './Icons.jsx'

// Persisted across app reloads — encoding settings are environment-specific,
// not per-character, so they live in localStorage.
const SETTINGS_KEY = 'rm_audio_settings'
function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY)
    if (!raw) return {}
    return JSON.parse(raw)
  } catch { return {} }
}
function saveSettings(s) {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(s)) } catch {}
}

// Codec choices the user can pick from — filtered at runtime to those the browser supports.
const CODEC_CHOICES = [
  { mime: 'audio/webm;codecs=opus', label: 'Opus (webm)' },
  { mime: 'audio/ogg;codecs=opus',  label: 'Opus (ogg)'  },
  { mime: 'audio/webm',             label: 'webm default' },
  { mime: 'audio/mp4',              label: 'AAC (mp4)'   },
]
const BITRATE_CHOICES = [
  { value:  64000, label:  '64 kbps' },
  { value:  96000, label:  '96 kbps' },
  { value: 128000, label: '128 kbps' },
  { value: 192000, label: '192 kbps' },
  { value: 256000, label: '256 kbps (default)' },
  { value: 320000, label: '320 kbps' },
]

function shortCodecLabel(mime) {
  if (!mime) return 'browser default'
  if (mime.includes('opus')) return 'Opus'
  if (mime.includes('mp4'))  return 'AAC'
  if (mime.includes('webm')) return 'webm'
  return mime
}

// Read duration of an arbitrary audio Blob/File via a hidden <audio> element.
// Returns ms. Handles the WebM infinite-duration case by force-seeking to 1e10
// which makes the browser read through the file to discover the real value.
function detectAudioDuration(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.src = url
    let done = false
    const finish = (ms) => {
      if (done) return
      done = true
      try { URL.revokeObjectURL(url) } catch {}
      resolve(Math.max(0, Math.round(ms || 0)))
    }
    audio.addEventListener('loadedmetadata', () => {
      if (audio.duration === Infinity || isNaN(audio.duration)) {
        // WebM bug — force-read to discover true duration
        const onDurChange = () => {
          if (audio.duration !== Infinity && !isNaN(audio.duration)) {
            audio.removeEventListener('durationchange', onDurChange)
            finish(audio.duration * 1000)
          }
        }
        audio.addEventListener('durationchange', onDurChange)
        audio.currentTime = 1e10
      } else {
        finish(audio.duration * 1000)
      }
    })
    audio.addEventListener('error', () => finish(0))
    // Fail-safe: don't hang forever
    setTimeout(() => finish(audio.duration ? audio.duration * 1000 : 0), 8000)
  })
}

function fmtTime(ms) {
  const sec = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
function fmtBytes(n) {
  if (!n) return '0 B'
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * AudioRecorder — notebook recording UI.
 *
 * Props:
 *   onStateChange(state)  — optional. Called whenever the recorder state changes
 *                           ('idle' | 'recording' | 'paused' | 'stopping').
 *                           Lets the parent show a "recording in background"
 *                           indicator when the panel is collapsed/hidden.
 *   inSidebar             — boolean. When true, drops the embedded outer
 *                           border/marginTop because the sidebar already
 *                           provides its own framing.
 */
export default function AudioRecorder({ onStateChange, inSidebar = false }) {
  const { activeChar } = useCharacter()
  const rec = useAudioRecorder()
  const [sessions, setSessions] = useState([])
  const [expanded, setExpanded] = useState(true)
  const [bookmarks, setBookmarks] = useState([])   // in-progress markers (pre-save)
  const [bookmarkLabelDraft, setBookmarkLabelDraft] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(() => loadSettings())
  // Folder state
  const [folderReady,       setFolderReady]       = useState(false)
  const [folderName,        setFolderName]        = useState(null)
  const [needsPermission,   setNeedsPermission]   = useState(false)
  const [setupPromptOpen,   setSetupPromptOpen]   = useState(false)
  // Active mime/bitrate (settings > recommended default)
  const activeMime = settings.mime || rec.supportedMime
  const activeBitRate = settings.bitsPerSecond || rec.defaultBitRate

  // Notify parent of state changes so it can colour the mic toggle button
  useEffect(() => {
    if (onStateChange) onStateChange(rec.state)
  }, [rec.state, onStateChange])

  // Check folder linkage on mount. Three outcomes:
  //   - Folder linked + permission granted → use folder backend
  //   - Folder linked but permission revoked (e.g. page reload) → show "Reconnect" prompt
  //   - No folder linked → show first-time setup prompt
  const checkFolder = useCallback(async () => {
    if (!DIR_SYNC_SUPPORTED) {
      setFolderReady(false); setNeedsPermission(false); setFolderName(null); return
    }
    const root = await getLinkedDirHandle()
    if (!root) {
      setFolderReady(false); setNeedsPermission(false); setFolderName(null)
      setSetupPromptOpen(true)   // first-time prompt
      return
    }
    setFolderName(root.name)
    const ok = await hasDirWritePermission(root)
    setFolderReady(ok)
    setNeedsPermission(!ok)
  }, [])

  // Reload sessions list — chooses folder backend when ready, IDB otherwise
  const reload = useCallback(async () => {
    try {
      if (await isFolderReady()) {
        const all = await listFolderSessions()
        setSessions(all)
      } else {
        const all = await getAllSessions()
        setSessions(all)
      }
    } catch (e) {
      console.error('audio reload failed:', e)
    }
  }, [])

  useEffect(() => { checkFolder() }, [checkFolder])
  useEffect(() => { reload() }, [reload, folderReady])

  // ── Start / Stop wiring ─────────────────────────────────────────────────
  const handleStart = async () => {
    setBookmarks([])
    await rec.start({ mimeType: activeMime, bitsPerSecond: activeBitRate })
  }

  const handleStop = async () => {
    const result = await rec.stop()
    if (!result || !result.blob || result.blob.size === 0) {
      setBookmarks([])
      return
    }

    // Patch the WebM container so its Duration metadata is filled in.
    // Without this, MediaRecorder leaves the duration as Infinity and the file
    // can't be seeked in any player. Only applies to webm — pass through
    // unchanged for other containers.
    let finalBlob = result.blob
    if (result.mimeType?.includes('webm')) {
      try {
        finalBlob = await fixWebmDuration(result.blob, result.durationMs, { logger: false })
      } catch (e) {
        console.warn('[AudioRecorder] fixWebmDuration failed, falling back to raw blob:', e)
      }
    }

    const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const dateLabel = new Date(result.startedAt).toLocaleString()
    const session = {
      id,
      characterId: activeChar?.id || null,
      label:       `Recording — ${dateLabel}`,
      ...result,
      blob: finalBlob,
      markers: [...bookmarks],
    }
    try {
      if (await isFolderReady()) {
        // Folder mode: write straight to disk via the linked folder, no
        // download prompt. The sidecar JSON gets written automatically.
        await saveSessionToFolder(session)
      } else {
        // Fallback mode: IndexedDB + auto-download (legacy behavior)
        await saveSession(session)
        downloadSession(session)
      }
      setBookmarks([])
      await reload()
    } catch (e) {
      console.error('saveSession failed:', e)
      // Last-ditch fallback: at least trigger a download so the user doesn't
      // lose the recording, even if folder writes are failing.
      downloadSession(session)
      setBookmarks([])
    }
  }

  const handleAddBookmark = () => {
    const marker = rec.addMarkerNow(bookmarkLabelDraft.trim())
    if (marker) {
      setBookmarks(b => [...b, marker])
      setBookmarkLabelDraft('')
    }
  }

  // Import an external audio file (someone sent you a recording, etc).
  // Detects duration via a hidden <audio> element. Saves to the linked folder
  // when available; otherwise falls back to IndexedDB.
  const handleImport = async (file) => {
    if (!file) return
    try {
      const durationMs = await detectAudioDuration(file)
      const label = file.name.replace(/\.[^.]+$/, '') || 'Imported audio'

      if (await isFolderReady()) {
        await importFileToFolder(file, {
          label,
          characterId: activeChar?.id || null,
          durationMs,
          startedAt: file.lastModified || Date.now(),
          endedAt:   file.lastModified || Date.now(),
          deviceLabel: 'imported',
        })
      } else {
        const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
        const session = {
          id,
          characterId: activeChar?.id || null,
          label,
          startedAt:   Date.now(),
          endedAt:     Date.now(),
          durationMs,
          mimeType:    file.type || 'audio/unknown',
          bitRate:     0,
          deviceLabel: 'imported',
          blob:        file,
          markers:     [],
          imported:    true,
        }
        await saveSession(session)
      }
      await reload()
    } catch (e) {
      console.error('Import failed:', e)
      alert('Could not import that file: ' + (e.message || 'unknown error'))
    }
  }

  // ── Folder linkage actions ─────────────────────────────────────────────
  const handleLinkFolder = async () => {
    try {
      const root = await pickRMUCplusFolder()
      if (!root) return    // user cancelled
      setSetupPromptOpen(false)
      await checkFolder()
      await reload()
    } catch (e) {
      console.error('Folder link failed:', e)
      alert('Could not link folder: ' + (e.message || 'unknown error'))
    }
  }
  const handleReconnectFolder = async () => {
    const root = await getLinkedDirHandle()
    if (!root) { setSetupPromptOpen(true); return }
    const ok = await requestDirWritePermission(root)
    setFolderReady(ok)
    setNeedsPermission(!ok)
    if (ok) await reload()
  }
  const handleUnlinkFolder = async () => {
    if (!confirm('Unlink the RMUCplus folder? The files on disk stay where they are; the app just stops auto-saving there.')) return
    await clearLinkedDirHandle()
    setFolderReady(false)
    setFolderName(null)
    setNeedsPermission(false)
    setSetupPromptOpen(false)
    await reload()
  }

  const recording = rec.state === 'recording'
  const paused    = rec.state === 'paused'
  const active    = recording || paused
  const stopping  = rec.state === 'stopping'

  return (
    <div style={{
      flexShrink: 0,
      // Embedded mode keeps its outer border + spacer; sidebar mode lets the
      // sidebar container provide the framing. In sidebar mode we use
      // flex:1+minHeight:0 instead of height:100% so the footer is pushed
      // to the bottom regardless of the parent's height resolution.
      ...(inSidebar
        ? { background: 'var(--surface)', display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, overflow: 'hidden' }
        : { marginTop: 16, borderTop: '1px solid var(--border)', background: 'var(--surface)' }
      ),
    }}>
      <HeaderRow
        expanded={inSidebar ? true : expanded}
        onToggle={inSidebar ? null : () => setExpanded(e => !e)}
        active={active}
        sessionCount={sessions.length}
        elapsed={rec.elapsed}
        state={rec.state}
      />
      {(inSidebar || expanded) && (
        <div style={{
          padding: '10px 14px 0',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          ...(inSidebar ? { flex: 1, overflowY: 'auto', minHeight: 0 } : {}),
        }}>
          {/* First-time folder setup prompt */}
          {setupPromptOpen && DIR_SYNC_SUPPORTED && (
            <SetupPrompt
              onLink={handleLinkFolder}
              onSkip={() => setSetupPromptOpen(false)}
            />
          )}

          {/* Permission-revoked prompt (page reloaded, need re-grant) */}
          {needsPermission && !setupPromptOpen && (
            <PermissionPrompt
              folderName={folderName}
              onReconnect={handleReconnectFolder}
              onUnlink={handleUnlinkFolder}
            />
          )}

          <RecordingControls
            rec={rec}
            active={active}
            recording={recording}
            paused={paused}
            stopping={stopping}
            bookmarks={bookmarks}
            bookmarkLabelDraft={bookmarkLabelDraft}
            setBookmarkLabelDraft={setBookmarkLabelDraft}
            setBookmarks={setBookmarks}
            onStart={handleStart}
            onStop={handleStop}
            onAddBookmark={handleAddBookmark}
            onImport={handleImport}
          />
          {sessions.length > 0 && (
            <SessionsList
              sessions={sessions}
              onChange={reload}
              folderReady={folderReady}
            />
          )}
          <div style={{ height: 10 }} />
        </div>
      )}
      {/* Footer: encoding info + settings gear (always visible when panel open) */}
      {(inSidebar || expanded) && (
        <EncodingFooter
          rec={rec}
          activeMime={activeMime}
          activeBitRate={activeBitRate}
          onOpenSettings={() => setSettingsOpen(true)}
          disabled={active}
        />
      )}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          rec={rec}
          folderReady={folderReady}
          folderName={folderName}
          needsPermission={needsPermission}
          onLinkFolder={handleLinkFolder}
          onReconnectFolder={handleReconnectFolder}
          onUnlinkFolder={handleUnlinkFolder}
          onSave={(next) => { setSettings(next); saveSettings(next); setSettingsOpen(false) }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

// ── Header row (collapsible when onToggle provided, static in sidebar mode) ─
function HeaderRow({ expanded, onToggle, active, sessionCount, elapsed, state }) {
  const interactive = !!onToggle
  const Tag = interactive ? 'button' : 'div'
  return (
    <Tag
      onClick={onToggle || undefined}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '10px 14px',
        background: 'transparent',
        border: 'none',
        borderBottom: '1px solid var(--border)',
        cursor: interactive ? 'pointer' : 'default',
        color: 'var(--text2)',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {interactive && (expanded
        ? <ChevronDownIcon size={12} color="var(--text3)" />
        : <ChevronRightIcon size={12} color="var(--text3)" />)}
      <span>Audio Recorder</span>
      {active && (
        <span style={{
          color: state === 'paused' ? 'var(--warning)' : 'var(--danger)',
          fontWeight: 700, letterSpacing: 0, textTransform: 'none', marginLeft: 6,
        }}>
          {state === 'paused' ? 'paused' : 'recording'} · {fmtTime(elapsed)}
        </span>
      )}
      <div style={{ flex: 1 }} />
      {sessionCount > 0 && (
        <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>
          {sessionCount} saved
        </span>
      )}
    </Tag>
  )
}

// ── Recording controls (device picker + record button + bookmarks) ──────────
function RecordingControls({
  rec, active, recording, paused, stopping,
  bookmarks, bookmarkLabelDraft, setBookmarkLabelDraft, setBookmarks,
  onStart, onStop, onAddBookmark, onImport,
}) {
  const importInputRef = useRef(null)

  function handleImportClick() {
    importInputRef.current?.click()
  }
  function handleImportChange(e) {
    const file = e.target.files?.[0]
    if (file) onImport(file)
    e.target.value = ''   // allow re-import of same filename
  }
  function removeDraftBookmark(idx) {
    setBookmarks(b => b.filter((_, i) => i !== idx))
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Top row: device picker + import */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <DevicePicker rec={rec} disabled={active} />
        <div style={{ flex: 1 }} />
        <button
          onClick={handleImportClick}
          disabled={active}
          title="Import an audio file from disk"
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '5px 10px',
            fontSize: 11,
            fontWeight: 600,
            color: active ? 'var(--text3)' : 'var(--text2)',
            cursor: active ? 'not-allowed' : 'pointer',
            opacity: active ? 0.4 : 1,
          }}
        >
          Import…
        </button>
        <input
          ref={importInputRef}
          type="file"
          accept="audio/*,.webm,.mp3,.wav,.m4a,.ogg,.opus,.flac"
          onChange={handleImportChange}
          style={{ display: 'none' }}
        />
      </div>

      {/* Full-width primary action */}
      {!active && (
        <button
          onClick={onStart}
          disabled={stopping}
          style={{
            width: '100%',
            padding: '10px 16px',
            background: 'var(--danger)',
            color: '#fff',
            border: 'none',
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          ● Record
        </button>
      )}
      {active && (
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            onClick={rec.pause}
            style={{
              flex: 1, padding: '10px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: paused ? 'var(--success)' : 'var(--surface2)',
              color:      paused ? '#fff'           : 'var(--text)',
              border: '1px solid var(--border)',
            }}
          >
            {paused ? 'Resume' : 'Pause'}
          </button>
          <button
            onClick={onStop}
            disabled={stopping}
            style={{
              flex: 2, padding: '10px 8px', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer',
              background: 'var(--danger)', color: '#fff', border: 'none',
            }}
          >
            {stopping ? 'Stopping…' : '■ Stop & Save'}
          </button>
        </div>
      )}

      {/* Bookmark row (only visible during recording) */}
      {active && (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 6,
          padding: '8px 10px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 6,
        }}>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
            <input
              type="text"
              placeholder="Bookmark label (optional)…"
              value={bookmarkLabelDraft}
              onChange={(e) => setBookmarkLabelDraft(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onAddBookmark()}
              style={{
                flex: 1, fontSize: 12, padding: '5px 8px', borderRadius: 4,
                background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
              }}
            />
            <button onClick={onAddBookmark} style={btnStyle('var(--accent)', '#fff')}>
              + Bookmark
            </button>
          </div>
          {bookmarks.length === 0 ? (
            <div style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>
              No bookmarks yet. Drop one to mark an important moment.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, maxHeight: 140, overflowY: 'auto' }}>
              {bookmarks.map((b, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '2px 4px', fontSize: 11,
                }}>
                  <span style={{
                    fontFamily: 'ui-monospace, monospace', fontSize: 10, fontWeight: 600,
                    color: 'var(--accent)', minWidth: 44,
                  }}>
                    {fmtTime(b.offsetMs)}
                  </span>
                  <span style={{ flex: 1, color: 'var(--text)' }}>
                    {b.label || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>(no label)</span>}
                  </span>
                  <button
                    onClick={() => removeDraftBookmark(i)}
                    title="Remove this bookmark"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text3)' }}
                  >
                    <XIcon size={10} color="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Encoding footer (sticky bottom — codec + bitrate + settings gear) ────────
function EncodingFooter({ rec, activeMime, activeBitRate, onOpenSettings, disabled }) {
  return (
    <div style={{
      flexShrink: 0,
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
      padding: '6px 14px',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 10,
      color: 'var(--text3)',
    }}>
      {rec.error ? (
        <span style={{ color: 'var(--danger)', flex: 1 }}>Error: {rec.error}</span>
      ) : (
        <span style={{ flex: 1 }}>
          Encoding: {shortCodecLabel(activeMime)} · {Math.round(activeBitRate / 1000)} kbps Stereo
        </span>
      )}
      <button
        onClick={onOpenSettings}
        disabled={disabled}
        title={disabled ? 'Stop recording to change settings' : 'Audio settings'}
        style={{
          background: 'transparent', border: 'none',
          cursor: disabled ? 'not-allowed' : 'pointer',
          padding: 4, color: 'var(--text3)',
          opacity: disabled ? 0.4 : 1,
          display: 'flex', alignItems: 'center',
        }}
      >
        <GearIcon size={13} color="currentColor" />
      </button>
    </div>
  )
}

// Device picker. Browsers hide device LABELS until the page has been granted
// mic permission. We expose a "Refresh" button + auto-attempt permission on
// first interaction so the dropdown shows real device names instead of empty
// "Device abc123" placeholders.
function DevicePicker({ rec, disabled }) {
  const [unlocked, setUnlocked] = useState(false)
  const [busy, setBusy] = useState(false)

  // Devices are "unlocked" (labels populated) once at least one device has a label.
  useEffect(() => {
    if (rec.devices.some(d => d.label)) setUnlocked(true)
  }, [rec.devices])

  async function requestPermissionAndRefresh() {
    setBusy(true)
    try {
      // Briefly grab the mic to unlock device labels, then immediately stop the stream.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach(t => t.stop())
      await rec.enumerate()
      setUnlocked(true)
    } catch (e) {
      // User denied or no mic — leave device picker showing default option only
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
      <select
        value={rec.selectedDeviceId || ''}
        onChange={(e) => rec.setSelectedDeviceId(e.target.value || null)}
        onMouseDown={() => { if (!unlocked && !busy) requestPermissionAndRefresh() }}
        disabled={disabled}
        style={{
          background: 'var(--surface2)',
          color: 'var(--text)',
          border: '1px solid var(--border)',
          borderRadius: 4,
          padding: '5px 8px',
          fontSize: 11,
          maxWidth: 280,
          minWidth: 160,
        }}
        title={unlocked ? 'Input device' : 'Click to grant mic permission and see device names'}
      >
        <option value="">Default mic</option>
        {rec.devices.map(d => (
          <option key={d.deviceId} value={d.deviceId}>
            {d.label || (unlocked ? `(unnamed) ${d.deviceId.slice(0, 6)}` : `Device ${d.deviceId.slice(0, 6)}`)}
          </option>
        ))}
      </select>
      <button
        onClick={requestPermissionAndRefresh}
        disabled={disabled || busy}
        title="Refresh device list (will prompt for mic permission if not yet granted)"
        style={{
          background: 'transparent', border: '1px solid var(--border)', borderRadius: 4,
          padding: '4px 8px', fontSize: 10, fontWeight: 600,
          color: 'var(--text3)', cursor: 'pointer',
        }}
      >
        {busy ? '…' : 'Refresh'}
      </button>
    </div>
  )
}

// ── Settings panel (codec / bitrate / channels / processing toggles) ──────
function SettingsPanel({
  settings, rec, folderReady, folderName, needsPermission,
  onLinkFolder, onReconnectFolder, onUnlinkFolder,
  onSave, onClose,
}) {
  const [draft, setDraft] = useState({
    mime:          settings.mime          ?? rec.supportedMime,
    bitsPerSecond: settings.bitsPerSecond ?? rec.defaultBitRate,
  })

  // Filter codecs to those actually supported by the current browser.
  const supportedCodecs = useMemo(() => {
    if (typeof MediaRecorder === 'undefined') return []
    return CODEC_CHOICES.filter(c => MediaRecorder.isTypeSupported(c.mime))
  }, [])

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 460,
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          overflow: 'hidden',
        }}
      >
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderBottom: '1px solid var(--border)',
        }}>
          <span style={{ fontWeight: 700, fontSize: 13 }}>Audio Settings</span>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)',
          }}>
            <XIcon size={14} color="currentColor" />
          </button>
        </div>

        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 14, fontSize: 12 }}>

          {/* Folder linkage section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
              <FolderIcon size={13} color="currentColor" /> RMUCplus Folder
            </div>
            {!DIR_SYNC_SUPPORTED ? (
              <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                Your browser doesn't support the File System Access API. Use Chrome, Edge, or Opera
                on desktop to link a folder. (Firefox and Safari fall back to download prompts.)
              </div>
            ) : folderReady ? (
              <>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  Linked: <strong style={{ color: 'var(--accent)' }}>{folderName}</strong>
                  <span style={{ color: 'var(--success)', marginLeft: 6 }}>· active</span>
                </div>
                <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                  Recordings + bookmarks save directly to <code>{folderName}/Audio Recordings/</code> and{' '}
                  <code>{folderName}/Audio Bookmarks/</code>.
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={onLinkFolder} style={btnStyle('var(--surface2)', 'var(--text)')}>
                    Change folder
                  </button>
                  <button onClick={onUnlinkFolder} style={btnStyle('transparent', 'var(--text3)')}>
                    Unlink
                  </button>
                </div>
              </>
            ) : needsPermission ? (
              <>
                <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                  Linked: <strong>{folderName}</strong>
                  <span style={{ color: 'var(--warning, #c2410c)', marginLeft: 6 }}>· permission needed</span>
                </div>
                <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                  <button onClick={onReconnectFolder} style={btnStyle('var(--accent)', '#fff', true)}>
                    Reconnect
                  </button>
                  <button onClick={onUnlinkFolder} style={btnStyle('transparent', 'var(--text3)')}>
                    Unlink
                  </button>
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
                  No folder linked. Recordings save to browser storage + download on Stop.
                </div>
                <button onClick={onLinkFolder} style={{ ...btnStyle('var(--accent)', '#fff', true), alignSelf: 'flex-start', marginTop: 4 }}>
                  Choose folder
                </button>
              </>
            )}
          </div>

          {/* Encoding section */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <div style={{ fontWeight: 700, color: 'var(--text)', fontSize: 12 }}>Encoding</div>
            <SettingRow label="Codec / Container">
              <select
                value={draft.mime || ''}
                onChange={(e) => setDraft(d => ({ ...d, mime: e.target.value }))}
                style={selectStyle}
              >
                {supportedCodecs.map(c => (
                  <option key={c.mime} value={c.mime}>{c.label}</option>
                ))}
              </select>
            </SettingRow>

            <SettingRow label="Bitrate">
              <select
                value={draft.bitsPerSecond}
                onChange={(e) => setDraft(d => ({ ...d, bitsPerSecond: parseInt(e.target.value, 10) }))}
                style={selectStyle}
              >
                {BITRATE_CHOICES.map(b => (
                  <option key={b.value} value={b.value}>{b.label}</option>
                ))}
              </select>
            </SettingRow>

            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4 }}>
              Channels, sample rate, and processing flags are fixed at 2-channel / 48 kHz / no
              echo-cancellation, noise-suppression, or AGC — best for preserving game-session ambiance.
              Encoding changes apply to the NEXT session you start.
            </div>
          </div>
        </div>

        <div style={{
          display: 'flex', gap: 8, justifyContent: 'flex-end',
          padding: '10px 14px', borderTop: '1px solid var(--border)',
          background: 'var(--surface2)',
        }}>
          <button onClick={onClose} style={btnStyle('var(--surface)', 'var(--text)')}>
            Cancel
          </button>
          <button onClick={() => onSave(draft)} style={btnStyle('var(--accent)', '#fff', true)}>
            Save
          </button>
        </div>
      </div>
    </div>
  )
}

function SettingRow({ label, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 130, color: 'var(--text2)', fontWeight: 600 }}>{label}</span>
      <div style={{ flex: 1 }}>{children}</div>
    </div>
  )
}
const selectStyle = {
  width: '100%',
  background: 'var(--surface2)',
  color: 'var(--text)',
  border: '1px solid var(--border)',
  borderRadius: 4,
  padding: '5px 8px',
  fontSize: 12,
}

// ── Folder setup / permission prompts ───────────────────────────────────────
function SetupPrompt({ onLink, onSkip }) {
  return (
    <div style={{
      padding: '12px 14px',
      background: 'var(--surface2)',
      border: '1px solid var(--accent)',
      borderRadius: 6,
      display: 'flex', flexDirection: 'column', gap: 8,
      fontSize: 12,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--accent)', fontWeight: 700 }}>
        <FolderIcon size={14} color="currentColor" />
        <span>Set up your audio folder</span>
      </div>
      <div style={{ color: 'var(--text2)', lineHeight: 1.5 }}>
        Pick a parent folder once. The app will create <strong>RMUCplus/</strong> inside it with
        subfolders for recordings, bookmarks, and (in a future update) characters and notebooks.
        Recordings save directly to disk — no download prompt every time.
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={onSkip} style={btnStyle('var(--surface)', 'var(--text2)')}>
          Skip for now
        </button>
        <button onClick={onLink} style={btnStyle('var(--accent)', '#fff', true)}>
          Choose folder
        </button>
      </div>
    </div>
  )
}

function PermissionPrompt({ folderName, onReconnect, onUnlink }) {
  return (
    <div style={{
      padding: '10px 14px',
      background: 'var(--surface2)',
      border: '1px solid var(--warning, #c2410c)',
      borderRadius: 6,
      display: 'flex', flexDirection: 'column', gap: 6,
      fontSize: 12,
    }}>
      <div style={{ color: 'var(--text)', lineHeight: 1.4 }}>
        Folder <strong>{folderName}</strong> is linked but the browser revoked write
        access (this happens on every page reload — normal browser security).
      </div>
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={onUnlink} style={btnStyle('transparent', 'var(--text3)')}>
          Unlink
        </button>
        <button onClick={onReconnect} style={btnStyle('var(--accent)', '#fff', true)}>
          Reconnect
        </button>
      </div>
    </div>
  )
}

// ── Sessions list ───────────────────────────────────────────────────────────
function SessionsList({ sessions, onChange, folderReady }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      borderTop: '1px dashed var(--border)', paddingTop: 8,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {folderReady ? 'Audio Folder Sessions' : 'In-app Sessions'}
      </div>
      {sessions.map(s => (
        <SessionRow key={s.id} session={s} onChange={onChange} folderReady={folderReady} />
      ))}
    </div>
  )
}

function SessionRow({ session, onChange, folderReady }) {
  const [open, setOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState(session.label || '')
  const audioRef = useRef(null)
  const objectUrlRef = useRef(null)
  const blobRef = useRef(null)        // lazy-loaded blob (folder mode)
  const [audioReady, setAudioReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [durationFixing, setDurationFixing] = useState(false)
  const [blobLoading, setBlobLoading] = useState(false)

  // Lazy: create object URL when expanded. In folder mode, also pull the
  // blob bytes off disk on first expand.
  useEffect(() => {
    if (!open) {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
        setAudioReady(false)
      }
      return
    }
    let cancelled = false
    ;(async () => {
      let blob = session.blob || blobRef.current
      if (!blob && folderReady) {
        setBlobLoading(true)
        try { blob = await loadSessionBlob(session) } catch {}
        setBlobLoading(false)
        if (cancelled) return
        blobRef.current = blob
      }
      if (blob && !objectUrlRef.current) {
        objectUrlRef.current = URL.createObjectURL(blob)
        if (audioRef.current) audioRef.current.src = objectUrlRef.current
      }
    })()
    return () => {
      cancelled = true
    }
  }, [open, session, folderReady])

  // Clean up object URL on unmount
  useEffect(() => () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
    }
  }, [])

  // MediaRecorder produces WebM/Opus files with `duration=Infinity` because the
  // container header isn't finalised on stream-end. The standard workaround is
  // to seek to a huge value, which forces the browser to read through the file
  // and discover the real duration. After that, normal seeking works.
  //
  // Refs: https://bugs.chromium.org/p/chromium/issues/detail?id=642012
  //       https://stackoverflow.com/questions/38443084
  function handleLoadedMetadata() {
    const audio = audioRef.current
    if (!audio) return
    if (audio.duration === Infinity || isNaN(audio.duration)) {
      setDurationFixing(true)
      const onUpdate = () => {
        if (audio.duration !== Infinity && !isNaN(audio.duration)) {
          audio.removeEventListener('durationchange', onUpdate)
          audio.currentTime = 0
          setDurationFixing(false)
          setAudioReady(true)
        }
      }
      audio.addEventListener('durationchange', onUpdate)
      // Trigger the read-through. Browser will fire `durationchange` once it
      // figures out the real value.
      audio.currentTime = 1e10
    } else {
      setAudioReady(true)
    }
  }

  const handleSeek = (ms) => {
    const audio = audioRef.current
    if (!audio) return
    // Ensure duration is known before seeking — otherwise the browser silently
    // ignores the seek on stream-only WebM files. If duration is still infinite,
    // run the fix first, then seek once it resolves.
    if (audio.duration === Infinity || isNaN(audio.duration)) {
      const onceDurationKnown = () => {
        if (audio.duration !== Infinity && !isNaN(audio.duration)) {
          audio.removeEventListener('durationchange', onceDurationKnown)
          audio.currentTime = Math.min(ms / 1000, audio.duration - 0.05)
          audio.play().catch(() => {})
        }
      }
      audio.addEventListener('durationchange', onceDurationKnown)
      audio.currentTime = 1e10
      return
    }
    audio.currentTime = Math.min(ms / 1000, audio.duration - 0.05)
    audio.play().catch(() => {})
  }

  const handleAddPlaybackBookmark = async () => {
    const audio = audioRef.current
    if (!audio) return
    const offsetMs = Math.round(audio.currentTime * 1000)
    const label = prompt('Bookmark label (optional):', '')
    if (label === null) return  // cancelled
    const marker = { offsetMs, label: label.trim(), kind: 'manual' }
    if (folderReady) {
      const next = [...(session.markers || []), marker]
      await updateSessionMarkersInFolder(session, next)
    } else {
      await addSessionMarker(session.id, marker)
    }
    onChange()
  }

  const handleDelete = async () => {
    if (!confirm(`Delete recording "${session.label}"?\n\n${folderReady ? 'Both the audio file and its bookmarks sidecar will be deleted from disk.' : 'This cannot be undone.'}`)) return
    if (folderReady) await deleteSessionFromFolder(session)
    else             await deleteSession(session.id)
    onChange()
  }

  const handleSaveLabel = async () => {
    const newLabel = labelDraft.trim() || session.label
    try {
      if (folderReady) {
        await renameSessionInFolder(session, newLabel)
      } else {
        await updateSessionLabel(session.id, newLabel)
      }
    } catch (e) {
      alert('Rename failed: ' + (e.message || 'unknown error'))
      setLabelDraft(session.label || '')
    }
    setEditingLabel(false)
    onChange()
  }

  // For download button in folder mode, we need to ensure the blob is loaded
  const handleDownload = async () => {
    let blob = session.blob || blobRef.current
    if (!blob && folderReady) {
      blob = await loadSessionBlob(session)
      blobRef.current = blob
    }
    if (blob) {
      downloadSession({ ...session, blob })
    }
  }

  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Row header — the entire left half of the row toggles expand. Specific
          controls (label, download, delete) stopPropagation so their own
          click handlers run instead. */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '10px 10px', fontSize: 12, cursor: 'pointer',
        }}
      >
        <div style={{
          // Larger invisible click zone around the chevron — fills row height
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 22, height: 22, color: 'var(--text3)', flexShrink: 0,
        }}>
          {open ? <ChevronDownIcon size={12} color="currentColor" /> : <ChevronRightIcon size={12} color="currentColor" />}
        </div>
        {editingLabel ? (
          <input
            type="text"
            value={labelDraft}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') handleSaveLabel()
              if (e.key === 'Escape') { setEditingLabel(false); setLabelDraft(session.label || '') }
            }}
            onBlur={handleSaveLabel}
            autoFocus
            style={{
              flex: 1, fontSize: 12, padding: '2px 6px', borderRadius: 3,
              background: 'var(--surface)', border: '1px solid var(--border)', color: 'var(--text)',
            }}
          />
        ) : (
          <span
            onClick={(e) => { e.stopPropagation(); setEditingLabel(true); setLabelDraft(session.label || '') }}
            style={{ flex: 1, cursor: 'text', fontWeight: 600, color: 'var(--text)' }}
            title="Click to rename"
          >
            {session.label}
          </span>
        )}
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>
          {fmtTime(session.durationMs)} · {fmtBytes(session.size || session.blob?.size || 0)}
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); handleDownload() }}
          title="Download file"
          style={btnStyle('var(--surface)', 'var(--text)')}
        >
          Download
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); handleDelete() }}
          title="Delete this recording"
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}
        >
          <TrashIcon size={13} color="currentColor" />
        </button>
      </div>

      {/* Expanded playback area */}
      {open && (
        <div style={{ padding: '0 10px 10px', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <audio
            ref={audioRef}
            controls
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onTimeUpdate={(e) => {
              // While we're force-reading the file to fix the duration, the
              // browser fires timeupdate with current=1e10. Ignore those.
              if (!durationFixing) setCurrentTime(e.target.currentTime)
            }}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            style={{ width: '100%' }}
          />
          {blobLoading && (
            <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
              Loading audio file from disk…
            </div>
          )}
          {durationFixing && (
            <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
              Loading audio metadata…
            </div>
          )}
          {audioReady && (
            <div style={{ display: 'flex', gap: 6, fontSize: 11 }}>
              <button onClick={handleAddPlaybackBookmark} style={btnStyle('var(--accent)', '#fff')}>
                + Bookmark at {fmtTime(currentTime * 1000)}
              </button>
              <div style={{ flex: 1 }} />
              <span style={{ color: 'var(--text3)' }}>
                Recorded {new Date(session.startedAt).toLocaleString()} · {session.deviceLabel || 'unknown mic'}
              </span>
            </div>
          )}
          {/* Markers list */}
          {(session.markers || []).length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Bookmarks
              </div>
              {(session.markers || []).map((m, i) => (
                <div
                  key={i}
                  draggable
                  onDragStart={(e) => {
                    // Payload for the notebook's drop handler. Plain text fallback
                    // for compatibility; JSON for our own consumer.
                    const payload = {
                      type: 'rm-audio-bookmark',
                      sessionId:     session.id,
                      audioFilename: session.audioFilename || null,
                      offsetMs:      m.offsetMs,
                      label:         m.label || '',
                      sessionLabel:  session.label,
                    }
                    e.dataTransfer.setData('application/x-rm-audio-bookmark', JSON.stringify(payload))
                    e.dataTransfer.setData('text/plain', `[Audio @ ${fmtTime(m.offsetMs)}] ${m.label || session.label}`)
                    e.dataTransfer.effectAllowed = 'copy'
                  }}
                  title="Drag into a note to insert an audio clip"
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '3px 6px', borderRadius: 4,
                    background: 'var(--surface)', fontSize: 11,
                    cursor: 'grab',
                  }}
                >
                  <button
                    onClick={() => handleSeek(m.offsetMs)}
                    style={{
                      background: 'transparent', border: 'none', cursor: 'pointer',
                      color: 'var(--accent)', fontWeight: 600, padding: 0,
                      fontFamily: 'ui-monospace, monospace', fontSize: 11,
                    }}
                  >
                    {fmtTime(m.offsetMs)}
                  </button>
                  <span style={{ flex: 1, color: 'var(--text)' }}>
                    {m.label || <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>(no label)</span>}
                  </span>
                  <button
                    onClick={async () => {
                      if (folderReady) {
                        const next = (session.markers || []).filter((_, idx) => idx !== i)
                        await updateSessionMarkersInFolder(session, next)
                      } else {
                        await removeSessionMarker(session.id, i)
                      }
                      onChange()
                    }}
                    title="Remove bookmark"
                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--text3)' }}
                  >
                    <XIcon size={10} color="currentColor" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Styling helpers ─────────────────────────────────────────────────────────
function btnStyle(bg, color, prominent = false) {
  return {
    background: bg,
    color,
    border: '1px solid var(--border)',
    borderRadius: 5,
    padding: prominent ? '6px 14px' : '5px 10px',
    fontSize: 12,
    fontWeight: prominent ? 700 : 600,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }
}
