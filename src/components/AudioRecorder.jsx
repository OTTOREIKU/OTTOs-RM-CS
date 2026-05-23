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
import { useCharacter } from '../store/CharacterContext.jsx'
import { ChevronDownIcon, ChevronRightIcon, XIcon, TrashIcon, PencilIcon, GearIcon } from './Icons.jsx'

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

export default function AudioRecorder() {
  const { activeChar } = useCharacter()
  const rec = useAudioRecorder()
  const [sessions, setSessions] = useState([])
  const [expanded, setExpanded] = useState(true)
  const [bookmarks, setBookmarks] = useState([])   // in-progress markers (pre-save)
  const [bookmarkLabelDraft, setBookmarkLabelDraft] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settings, setSettings] = useState(() => loadSettings())
  // Active mime/bitrate (settings > recommended default)
  const activeMime = settings.mime || rec.supportedMime
  const activeBitRate = settings.bitsPerSecond || rec.defaultBitRate

  // Reload sessions list on mount + after each save/delete
  const reload = useCallback(async () => {
    try {
      const all = await getAllSessions()
      setSessions(all)
    } catch (e) {
      console.error('audio reload failed:', e)
    }
  }, [])

  useEffect(() => { reload() }, [reload])

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
      await saveSession(session)
      downloadSession(session)             // ← triggers browser save prompt
      setBookmarks([])
      await reload()
    } catch (e) {
      console.error('saveSession failed:', e)
      // Still try to download so the user doesn't lose the recording
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

  const recording = rec.state === 'recording'
  const paused    = rec.state === 'paused'
  const active    = recording || paused
  const stopping  = rec.state === 'stopping'

  return (
    <div style={{
      flexShrink: 0,
      marginTop: 16,                                       // breathing room above
      borderTop: '1px solid var(--border)',
      background: 'var(--surface)',
    }}>
      <HeaderRow
        expanded={expanded}
        onToggle={() => setExpanded(e => !e)}
        active={active}
        sessionCount={sessions.length}
        elapsed={rec.elapsed}
        state={rec.state}
      />
      {expanded && (
        <div style={{ padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <RecordingControls
            rec={rec}
            active={active}
            recording={recording}
            paused={paused}
            stopping={stopping}
            bookmarks={bookmarks}
            bookmarkLabelDraft={bookmarkLabelDraft}
            setBookmarkLabelDraft={setBookmarkLabelDraft}
            onStart={handleStart}
            onStop={handleStop}
            onAddBookmark={handleAddBookmark}
            activeMime={activeMime}
            activeBitRate={activeBitRate}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          {sessions.length > 0 && (
            <SessionsList
              sessions={sessions}
              onChange={reload}
            />
          )}
        </div>
      )}
      {settingsOpen && (
        <SettingsPanel
          settings={settings}
          rec={rec}
          onSave={(next) => { setSettings(next); saveSettings(next); setSettingsOpen(false) }}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  )
}

// ── Header row (collapsible) ────────────────────────────────────────────────
function HeaderRow({ expanded, onToggle, active, sessionCount, elapsed, state }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '100%',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 16px',
        background: 'transparent',
        border: 'none',
        cursor: 'pointer',
        color: 'var(--text2)',
        fontSize: 11,
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
      }}
    >
      {expanded
        ? <ChevronDownIcon size={12} color="var(--text3)" />
        : <ChevronRightIcon size={12} color="var(--text3)" />}
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
          {sessionCount} saved session{sessionCount !== 1 ? 's' : ''}
        </span>
      )}
    </button>
  )
}

// ── Recording controls (device picker + buttons + bookmark) ─────────────────
function RecordingControls({
  rec, active, recording, paused, stopping,
  bookmarks, bookmarkLabelDraft, setBookmarkLabelDraft,
  onStart, onStop, onAddBookmark,
  activeMime, activeBitRate, onOpenSettings,
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {/* Top row: device picker + start/pause/stop */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <DevicePicker rec={rec} disabled={active} />
        <div style={{ flex: 1 }} />
        {!active && (
          <button
            onClick={onStart}
            disabled={stopping}
            style={btnStyle('var(--danger)', '#fff', true)}
          >
            ● Record
          </button>
        )}
        {active && (
          <>
            <button
              onClick={rec.pause}
              style={btnStyle(paused ? 'var(--success)' : 'var(--surface2)', paused ? '#fff' : 'var(--text)')}
            >
              {paused ? 'Resume' : 'Pause'}
            </button>
            <button
              onClick={onStop}
              disabled={stopping}
              style={btnStyle('var(--danger)', '#fff', true)}
            >
              {stopping ? 'Stopping…' : 'Stop & Save'}
            </button>
          </>
        )}
      </div>

      {/* Bookmark row (only visible during recording) */}
      {active && (
        <div style={{
          display: 'flex', gap: 8, alignItems: 'center',
          padding: '8px 10px',
          background: 'var(--surface2)',
          border: '1px solid var(--border)', borderRadius: 6,
        }}>
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
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>
            {bookmarks.length} so far
          </span>
        </div>
      )}

      {/* Quality info line + settings gear */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 10, color: 'var(--text3)' }}>
        {rec.error ? (
          <span style={{ color: 'var(--danger)' }}>Error: {rec.error}</span>
        ) : (
          <span>
            Encoding: {shortCodecLabel(activeMime)} · {Math.round(activeBitRate / 1000)} kbps Stereo
          </span>
        )}
        <div style={{ flex: 1 }} />
        <button
          onClick={onOpenSettings}
          disabled={active}
          title={active ? 'Stop recording to change settings' : 'Audio settings'}
          style={{
            background: 'transparent', border: 'none', cursor: active ? 'not-allowed' : 'pointer',
            padding: 2, color: 'var(--text3)',
            opacity: active ? 0.4 : 1,
            display: 'flex', alignItems: 'center',
          }}
        >
          <GearIcon size={13} color="currentColor" />
        </button>
      </div>
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
function SettingsPanel({ settings, rec, onSave, onClose }) {
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

        <div style={{ padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
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
            Recording quality settings only apply to the NEXT session you start.
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

// ── Sessions list ───────────────────────────────────────────────────────────
function SessionsList({ sessions, onChange }) {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', gap: 6,
      borderTop: '1px dashed var(--border)', paddingTop: 8,
    }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Saved sessions
      </div>
      {sessions.map(s => (
        <SessionRow key={s.id} session={s} onChange={onChange} />
      ))}
    </div>
  )
}

function SessionRow({ session, onChange }) {
  const [open, setOpen] = useState(false)
  const [editingLabel, setEditingLabel] = useState(false)
  const [labelDraft, setLabelDraft] = useState(session.label || '')
  const audioRef = useRef(null)
  const objectUrlRef = useRef(null)
  const [audioReady, setAudioReady] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [durationFixing, setDurationFixing] = useState(false)

  // Lazy: only create object URL when expanded
  useEffect(() => {
    if (open && session.blob && !objectUrlRef.current) {
      objectUrlRef.current = URL.createObjectURL(session.blob)
      if (audioRef.current) audioRef.current.src = objectUrlRef.current
    }
    if (!open && objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current)
      objectUrlRef.current = null
      setAudioReady(false)
    }
    return () => {
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current)
        objectUrlRef.current = null
      }
    }
  }, [open, session.blob])

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
    await addSessionMarker(session.id, { offsetMs, label: label.trim(), kind: 'manual' })
    onChange()
  }

  const handleDelete = async () => {
    if (!confirm(`Delete recording "${session.label}"? This cannot be undone.`)) return
    await deleteSession(session.id)
    onChange()
  }

  const handleSaveLabel = async () => {
    await updateSessionLabel(session.id, labelDraft.trim() || session.label)
    setEditingLabel(false)
    onChange()
  }

  return (
    <div style={{
      background: 'var(--surface2)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      overflow: 'hidden',
    }}>
      {/* Row header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '6px 10px', fontSize: 12,
      }}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 0, color: 'var(--text3)' }}
        >
          {open ? <ChevronDownIcon size={12} color="currentColor" /> : <ChevronRightIcon size={12} color="currentColor" />}
        </button>
        {editingLabel ? (
          <input
            type="text"
            value={labelDraft}
            onChange={(e) => setLabelDraft(e.target.value)}
            onKeyDown={(e) => {
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
            onClick={() => { setEditingLabel(true); setLabelDraft(session.label || '') }}
            style={{ flex: 1, cursor: 'text', fontWeight: 600, color: 'var(--text)' }}
            title="Click to rename"
          >
            {session.label}
          </span>
        )}
        <span style={{ color: 'var(--text3)', fontSize: 11 }}>
          {fmtTime(session.durationMs)} · {fmtBytes(session.blob?.size || 0)}
        </span>
        <button
          onClick={() => downloadSession(session)}
          title="Download .webm"
          style={btnStyle('var(--surface)', 'var(--text)')}
        >
          Download
        </button>
        <button
          onClick={handleDelete}
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
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '3px 6px', borderRadius: 4,
                  background: 'var(--surface)', fontSize: 11,
                }}>
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
                      await removeSessionMarker(session.id, i)
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
