// ClipEditorModal — confirm/edit start/end/label before inserting (or after
// editing) an audio clip pill in the notebook.
//
// Props:
//   open: boolean
//   initial: { sessionId, audioFilename, startMs, endMs, label, sessionLabel? }
//   defaultDurationMs: number   (used when no endMs supplied — default 30s)
//   mode: 'insert' | 'edit'
//   onClose(): cancel
//   onConfirm(attrs): apply
//   onDelete(): only used in edit mode

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { playClip, stop as stopClipPlayer } from '../store/audioClipPlayer.js'
import { XIcon } from './Icons.jsx'

function fmtTime(ms) {
  const sec = Math.max(0, Math.floor((ms || 0) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

// Parse "0:42:11" / "42:11" / "152" → ms. Returns null if invalid.
function parseTime(str) {
  const s = String(str || '').trim()
  if (!s) return null
  if (/^\d+$/.test(s)) return parseInt(s, 10) * 1000
  const parts = s.split(':').map(p => parseInt(p, 10))
  if (parts.some(isNaN)) return null
  let total = 0
  for (const p of parts) total = total * 60 + p
  return total * 1000
}

export default function ClipEditorModal({
  open, initial, defaultDurationMs = 30000,
  mode = 'insert', onClose, onConfirm, onDelete,
}) {
  const [label, setLabel]     = useState('')
  const [startStr, setStartStr] = useState('0:00')
  const [endStr, setEndStr]     = useState('0:30')
  const [errorMsg, setErrorMsg] = useState(null)
  const [previewing, setPreviewing] = useState(false)

  // Init when modal opens
  useEffect(() => {
    if (!open || !initial) return
    setLabel(initial.label || '')
    const s = initial.startMs ?? 0
    const e = initial.endMs ?? (s + defaultDurationMs)
    setStartStr(fmtTime(s))
    setEndStr(fmtTime(e))
    setErrorMsg(null)
    setPreviewing(false)
  }, [open, initial, defaultDurationMs])

  // Stop preview when modal closes
  useEffect(() => {
    if (!open) stopClipPlayer()
  }, [open])

  const parsedStart = parseTime(startStr)
  const parsedEnd   = parseTime(endStr)
  const durationMs  = (parsedEnd != null && parsedStart != null) ? (parsedEnd - parsedStart) : null
  const valid       = parsedStart != null && parsedEnd != null && durationMs > 0

  function adjustStart(deltaMs) {
    const cur = parsedStart ?? 0
    const next = Math.max(0, cur + deltaMs)
    setStartStr(fmtTime(next))
    // Keep duration constant when nudging start
    if (parsedEnd != null) {
      const dur = parsedEnd - cur
      setEndStr(fmtTime(next + Math.max(0, dur)))
    }
  }
  function adjustEnd(deltaMs) {
    const cur = parsedEnd ?? 0
    const next = Math.max((parsedStart ?? 0) + 100, cur + deltaMs)
    setEndStr(fmtTime(next))
  }

  const handlePreview = useCallback(async () => {
    if (!valid) return
    setPreviewing(true)
    setErrorMsg(null)
    const result = await playClip({
      sessionId: initial.sessionId,
      audioFilename: initial.audioFilename,
      startMs: parsedStart,
      endMs: parsedEnd,
    })
    if (!result.ok) {
      setErrorMsg(result.error || 'Preview failed')
    }
    setPreviewing(false)
  }, [valid, initial, parsedStart, parsedEnd])

  const handleConfirm = useCallback(() => {
    if (!valid) { setErrorMsg('Invalid time range'); return }
    stopClipPlayer()
    onConfirm({
      sessionId:     initial.sessionId,
      audioFilename: initial.audioFilename,
      startMs:       parsedStart,
      endMs:         parsedEnd,
      label:         label.trim(),
    })
  }, [valid, initial, parsedStart, parsedEnd, label, onConfirm])

  if (!open || !initial) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 480,
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
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontWeight: 700, fontSize: 13 }}>
              {mode === 'edit' ? 'Edit audio clip' : 'Insert audio clip'}
            </span>
            {initial.sessionLabel && (
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>
                from "{initial.sessionLabel}"
              </span>
            )}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}>
            <XIcon size={14} color="currentColor" />
          </button>
        </div>

        <div style={{ padding: '14px 14px', display: 'flex', flexDirection: 'column', gap: 12, fontSize: 12 }}>

          {/* Label */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Label (optional)
            </label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Quick note for this clip…"
              style={{
                width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 4,
                background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* Start + End times */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <TimeField
              label="Start"
              value={startStr}
              onChange={setStartStr}
              onNudge={adjustStart}
            />
            <TimeField
              label="End"
              value={endStr}
              onChange={setEndStr}
              onNudge={adjustEnd}
            />
          </div>

          {/* Computed duration */}
          <div style={{ fontSize: 11, color: valid ? 'var(--text2)' : 'var(--danger)', fontFamily: 'ui-monospace, monospace' }}>
            Duration: {valid ? fmtTime(durationMs) : 'invalid'}
          </div>

          {/* Preview */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', borderTop: '1px solid var(--border)', paddingTop: 10 }}>
            <button
              onClick={handlePreview}
              disabled={!valid || previewing}
              style={{
                background: 'var(--surface2)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '6px 12px', fontSize: 12, fontWeight: 600,
                cursor: valid && !previewing ? 'pointer' : 'not-allowed',
                opacity: valid && !previewing ? 1 : 0.5,
              }}
            >
              {previewing ? 'Playing…' : '▶ Preview'}
            </button>
            <button
              onClick={stopClipPlayer}
              style={{
                background: 'transparent', color: 'var(--text3)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '6px 10px', fontSize: 11, cursor: 'pointer',
              }}
            >
              Stop
            </button>
            {errorMsg && (
              <span style={{ fontSize: 11, color: 'var(--danger)' }}>{errorMsg}</span>
            )}
          </div>
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', gap: 8, justifyContent: 'space-between',
          padding: '10px 14px', borderTop: '1px solid var(--border)',
          background: 'var(--surface2)',
        }}>
          {mode === 'edit' && onDelete ? (
            <button
              onClick={onDelete}
              style={{
                background: 'transparent', color: 'var(--danger)',
                border: '1px solid var(--danger)', borderRadius: 4,
                padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Delete clip
            </button>
          ) : <div />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                background: 'var(--surface)', color: 'var(--text)',
                border: '1px solid var(--border)', borderRadius: 4,
                padding: '6px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!valid}
              style={{
                background: valid ? 'var(--accent)' : 'var(--surface2)',
                color: '#fff',
                border: 'none', borderRadius: 4,
                padding: '6px 14px', fontSize: 12, fontWeight: 700,
                cursor: valid ? 'pointer' : 'not-allowed',
                opacity: valid ? 1 : 0.6,
              }}
            >
              {mode === 'edit' ? 'Save' : 'Insert into note'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function TimeField({ label, value, onChange, onNudge }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <label style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{
          width: '100%', fontSize: 13, padding: '6px 8px', borderRadius: 4,
          background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)',
          fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box',
        }}
      />
      <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
        <NudgeBtn label="-10s" onClick={() => onNudge(-10000)} />
        <NudgeBtn label="-5s"  onClick={() => onNudge(-5000)}  />
        <NudgeBtn label="-1s"  onClick={() => onNudge(-1000)}  />
        <NudgeBtn label="+1s"  onClick={() => onNudge(+1000)}  />
        <NudgeBtn label="+5s"  onClick={() => onNudge(+5000)}  />
        <NudgeBtn label="+10s" onClick={() => onNudge(+10000)} />
      </div>
    </div>
  )
}

function NudgeBtn({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: '3px 0', fontSize: 10, fontWeight: 600,
        background: 'transparent', color: 'var(--text2)',
        border: '1px solid var(--border)', borderRadius: 3, cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
