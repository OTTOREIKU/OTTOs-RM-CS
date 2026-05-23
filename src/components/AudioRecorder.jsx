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
import { useAudioRecorder } from '../hooks/useAudioRecorder.js'
import {
  saveSession, getAllSessions, deleteSession, updateSessionLabel,
  addSessionMarker, removeSessionMarker, downloadSession,
} from '../store/audioStorage.js'
import { useCharacter } from '../store/CharacterContext.jsx'
import { ChevronDownIcon, ChevronRightIcon, XIcon, TrashIcon, PencilIcon } from './Icons.jsx'

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
    await rec.start()
  }

  const handleStop = async () => {
    const result = await rec.stop()
    if (!result || !result.blob || result.blob.size === 0) {
      setBookmarks([])
      return
    }
    const id = `audio_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    const dateLabel = new Date(result.startedAt).toLocaleString()
    const session = {
      id,
      characterId: activeChar?.id || null,
      label:       `Recording — ${dateLabel}`,
      ...result,
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
          />
          {sessions.length > 0 && (
            <SessionsList
              sessions={sessions}
              onChange={reload}
            />
          )}
        </div>
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

      {/* Quality/info line */}
      <div style={{ fontSize: 10, color: 'var(--text3)' }}>
        {rec.error ? (
          <span style={{ color: 'var(--danger)' }}>Error: {rec.error}</span>
        ) : (
          <>
            Encoding: {rec.supportedMime || 'browser default'} · ~{Math.round(rec.defaultBitRate / 1000)} kbps stereo
            {' · '}On Stop the file is saved to disk AND kept in browser storage for in-app playback.
          </>
        )}
      </div>
    </div>
  )
}

function DevicePicker({ rec, disabled }) {
  return (
    <select
      value={rec.selectedDeviceId || ''}
      onChange={(e) => rec.setSelectedDeviceId(e.target.value || null)}
      disabled={disabled}
      style={{
        background: 'var(--surface2)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '5px 8px',
        fontSize: 11,
        maxWidth: 280,
      }}
      title="Input device"
    >
      <option value="">Default mic</option>
      {rec.devices.map(d => (
        <option key={d.deviceId} value={d.deviceId}>
          {d.label || `Device ${d.deviceId.slice(0, 6)}`}
        </option>
      ))}
    </select>
  )
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

  const handleSeek = (ms) => {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = ms / 1000
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
            onLoadedMetadata={() => setAudioReady(true)}
            onTimeUpdate={(e) => setCurrentTime(e.target.currentTime)}
            onPlay={() => setPlaying(true)}
            onPause={() => setPlaying(false)}
            style={{ width: '100%' }}
          />
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
