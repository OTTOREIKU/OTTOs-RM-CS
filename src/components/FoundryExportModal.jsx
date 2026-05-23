import React, { useState, useMemo, useRef } from 'react'
import { XIcon } from './Icons.jsx'

// New flow: download a plain-JSON character payload that the user pastes/uploads
// into the "RMU Character+ Sync" Foundry module on the DM's server. No more
// F12 console paste — the module handles the actor write inside Foundry.
//
// JSON shape matches the regular app Export ({ _version, _type:'single', character }),
// which is what the sync module's Push tab consumes.

export default function FoundryExportModal({ char, onClose }) {
  const payload = useMemo(() => ({
    _version: 1,
    _type: 'single',
    character: char,
  }), [char])

  const jsonStr = useMemo(() => JSON.stringify(payload, null, 2), [payload])
  const textRef = useRef(null)
  const [copied, setCopied] = useState(false)

  const safe = s => (s || '').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const filename = `${safe(char.name) || 'Character'}_${safe(char.race) || 'Unknown'}_${safe(char.profession) || 'Unknown'}_${char.level ?? 1}_foundry.json`

  function handleCopy() {
    navigator.clipboard.writeText(jsonStr).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      textRef.current?.select()
    })
  }

  function handleDownload() {
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = filename
    a.click()
    URL.revokeObjectURL(url)
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
              Send this character into your Foundry actor via the RMU Character+ Sync module.
            </div>
          </div>
          <button
            onClick={handleDownload}
            style={{
              padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: 'var(--accent)', color: '#fff', border: 'none', minWidth: 110,
            }}
          >
            Download .json
          </button>
          <button
            onClick={handleCopy}
            style={{
              padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: copied ? 'var(--success)' : 'var(--surface2)',
              color: copied ? '#fff' : 'var(--text)',
              border: '1px solid var(--border)', minWidth: 80,
              transition: 'background 0.2s',
            }}
          >
            {copied ? '✓ Copied' : 'Copy JSON'}
          </button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}>
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Instructions */}
        <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>
            How to apply this on the DM's Foundry server
          </div>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            <li>Click <strong>Download .json</strong> above (or <strong>Copy JSON</strong>).</li>
            <li>In Foundry, open your character actor sheet.</li>
            <li>Click the <strong>🔄 RMU Character+ Sync</strong> button in the sheet header.</li>
            <li>On the <strong>Push (App → Foundry)</strong> tab, paste the JSON or upload the file, then click <strong>Import to actor</strong>.</li>
          </ol>
          <div style={{ marginTop: 10, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
            DM must install the <strong>RMU Character+ Sync</strong> module on their Foundry server (one-time). Skills must already exist on your actor — any unmatched skills are reported as warnings, not errors.
          </div>
          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text3)' }}>
            <strong>No module installed?</strong> The old console-paste workflow still works — but it's deprecated. Ask your DM to install the module.
          </div>
        </div>

        {/* Preview */}
        <div style={{ padding: 16 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
            JSON preview ({jsonStr.length.toLocaleString()} chars) — click inside to select all
          </div>
          <textarea
            ref={textRef}
            readOnly
            value={jsonStr}
            onClick={e => e.target.select()}
            style={{
              width: '100%', height: 280, resize: 'vertical',
              fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
        </div>
      </div>
    </div>
  )
}
