// TipTap inline node for embedded audio clips in the notebook.
//
// Storage shape (HTML attributes when serialized):
//   <span data-audio-clip
//         data-session-id="audio_..."
//         data-audio-filename="Recording.webm"
//         data-start-ms="42100"
//         data-end-ms="72100"
//         data-label="Important moment">
//   </span>
//
// Renders as a small inline pill with [▶] button + label + duration.
// Click the play button → singleton clip player plays the audio range.

import React, { useEffect, useState, useCallback } from 'react'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'
import { playClip, stop as stopClipPlayer, subscribe as subscribeClipPlayer, makeClipKey } from '../store/audioClipPlayer.js'

// Helpers
function fmtTime(ms) {
  const sec = Math.max(0, Math.floor((ms || 0) / 1000))
  const h = Math.floor(sec / 3600)
  const m = Math.floor((sec % 3600) / 60)
  const s = sec % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}
function fmtRange(startMs, endMs) {
  return `${fmtTime(startMs)}–${fmtTime(endMs)}`
}

// ── Pill component ──────────────────────────────────────────────────────────
function AudioClipPill({ node, editor, getPos, updateAttributes, deleteNode }) {
  const { sessionId, audioFilename, startMs, endMs, label } = node.attrs
  const clipKey = makeClipKey({ sessionId, startMs, endMs })
  const [playing, setPlaying] = useState(false)
  const [errorMsg, setErrorMsg] = useState(null)

  useEffect(() => {
    return subscribeClipPlayer(({ playingClipKey }) => {
      setPlaying(playingClipKey === clipKey)
    })
  }, [clipKey])

  const handlePlay = useCallback(async (e) => {
    e.preventDefault()
    e.stopPropagation()
    setErrorMsg(null)
    const result = await playClip({ sessionId, audioFilename, startMs, endMs })
    if (!result.ok) setErrorMsg(result.error || 'Playback failed')
  }, [sessionId, audioFilename, startMs, endMs])

  const handleEdit = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    // Open the editor modal via a custom event. NotebookView listens for it.
    const evt = new CustomEvent('rm-edit-audio-clip', {
      detail: {
        attrs: node.attrs,
        getPos,
        updateAttributes,
        deleteNode,
      },
    })
    window.dispatchEvent(evt)
  }, [node.attrs, getPos, updateAttributes, deleteNode])

  return (
    <NodeViewWrapper
      as="span"
      className="rm-audio-clip"
      data-playing={playing ? 'true' : 'false'}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        padding: '2px 6px 2px 4px',
        background: playing ? 'var(--accent)22' : 'var(--surface2)',
        border: '1px solid ' + (playing ? 'var(--accent)' : 'var(--border)'),
        borderRadius: 12,
        fontSize: '0.88em',
        lineHeight: 1.2,
        color: 'var(--text)',
        verticalAlign: 'middle',
        whiteSpace: 'nowrap',
        userSelect: 'none',
        cursor: 'default',
        margin: '0 1px',
      }}
      title={errorMsg
        ? `Audio clip — ${errorMsg}`
        : `Audio clip: ${fmtRange(startMs, endMs)} from "${sessionId}"`}
    >
      <button
        onClick={handlePlay}
        title={playing ? 'Stop' : 'Play clip'}
        contentEditable={false}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          padding: 0,
          background: playing ? 'var(--accent)' : 'transparent',
          color: playing ? '#fff' : 'var(--accent)',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: 10,
          fontWeight: 700,
        }}
      >
        {playing ? '■' : '▶'}
      </button>
      <span
        onClick={handleEdit}
        contentEditable={false}
        style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
        title="Click to edit clip"
      >
        {label && (
          <span style={{ fontWeight: 600 }}>{label}</span>
        )}
        <span style={{
          color: 'var(--text3)',
          fontFamily: 'ui-monospace, monospace',
          fontSize: '0.85em',
        }}>
          {fmtRange(startMs, endMs)}
        </span>
        {errorMsg && (
          <span style={{ color: 'var(--danger)', fontSize: '0.8em' }}>!</span>
        )}
      </span>
    </NodeViewWrapper>
  )
}

// ── TipTap node definition ──────────────────────────────────────────────────
export const AudioClipNode = Node.create({
  name: 'audioClip',
  inline: true,
  group: 'inline',
  atom: true,        // single unit, not editable inline
  selectable: true,
  draggable: false,  // not draggable yet (could be in a later phase)

  addAttributes() {
    return {
      sessionId:     { default: null,    parseHTML: el => el.getAttribute('data-session-id') },
      audioFilename: { default: null,    parseHTML: el => el.getAttribute('data-audio-filename') },
      startMs:       { default: 0,       parseHTML: el => Number(el.getAttribute('data-start-ms')) || 0 },
      endMs:         { default: 30000,   parseHTML: el => Number(el.getAttribute('data-end-ms')) || 30000 },
      label:         { default: '',      parseHTML: el => el.getAttribute('data-label') || '' },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-audio-clip]' }]
  },

  renderHTML({ node, HTMLAttributes }) {
    const attrs = {
      'data-audio-clip':     '',
      'data-session-id':     node.attrs.sessionId || '',
      'data-audio-filename': node.attrs.audioFilename || '',
      'data-start-ms':       String(node.attrs.startMs ?? 0),
      'data-end-ms':         String(node.attrs.endMs ?? 0),
      'data-label':          node.attrs.label || '',
    }
    return ['span', mergeAttributes(HTMLAttributes, attrs), '']
  },

  addNodeView() {
    return ReactNodeViewRenderer(AudioClipPill)
  },

  addCommands() {
    return {
      insertAudioClip: (attrs) => ({ commands }) => {
        return commands.insertContent({
          type: this.name,
          attrs: {
            sessionId: attrs.sessionId || null,
            audioFilename: attrs.audioFilename || null,
            startMs: attrs.startMs ?? 0,
            endMs: attrs.endMs ?? 30000,
            label: attrs.label || '',
          },
        })
      },
    }
  },
})

// Convenience export
export { fmtTime, fmtRange }
