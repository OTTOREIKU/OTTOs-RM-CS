import React, { useState, useMemo, useRef } from 'react'
import { XIcon } from './Icons.jsx'
import { generateFoundryScript } from '../utils/foundryExport.js'

export default function FoundryExportModal({ char, onClose }) {
  const script  = useMemo(() => generateFoundryScript(char), [char])
  const textRef = useRef(null)
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      textRef.current?.select()
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 12px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 680,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Export to Foundry VTT</div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Paste this script into the Foundry console (F12 → Console tab) and press Enter.
            </div>
          </div>
          <button
            onClick={handleCopy}
            style={{
              padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: copied ? 'var(--success)' : 'var(--accent)', color: '#fff', border: 'none',
              transition: 'background 0.2s', minWidth: 80,
            }}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Instructions */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            <li>Open Foundry in your browser and press <strong>F12</strong> to open Developer Tools.</li>
            <li>Click the <strong>Console</strong> tab.</li>
            <li>Click <strong>Copy</strong> above, paste (<strong>Ctrl+V</strong>) into the console, and press <strong>Enter</strong>.</li>
            <li>A notification will confirm how many fields were synced. Missing skills appear as console warnings.</li>
          </ol>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
            Skills and spell lists must already exist as embedded items on the Foundry actor. The script only updates ranks/values — it will not create new items.
          </div>
        </div>

        {/* Script */}
        <div style={{ padding: 16 }}>
          <textarea
            ref={textRef}
            readOnly
            value={script}
            onClick={e => e.target.select()}
            style={{
              width: '100%', height: 340, resize: 'vertical',
              fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
            Click inside the box to select all · or use the Copy button above
          </div>
        </div>
      </div>
    </div>
  )
}
