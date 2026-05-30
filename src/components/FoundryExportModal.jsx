import React, { useState, useMemo, useRef } from 'react'
import { XIcon } from './Icons.jsx'
import { generateFoundryScript, generateTalentInjectionScript, analyzeSync } from '../utils/foundryExport.js'

// Three ways to get a character into Foundry:
//  1. Module    — download/copy JSON for the RMU Character+ Sync module (DM installs it once)
//  2. Console   — paste a console script that pushes stats/skills/spell ranks (no install; you own the actor)
//  3. Talents   — paste a console script that injects talents, bypassing the sheet's "level up first" lock
//
// Tabs 2 & 3 need no module — they work for any player on a character they own.

export default function FoundryExportModal({ char, onClose }) {
  const [tab, setTab] = useState('module')   // 'module' | 'console' | 'talents'
  const [copied, setCopied] = useState('')
  const textRef = useRef(null)

  const payload = useMemo(() => ({ _version: 1, _type: 'single', character: char }), [char])
  const jsonStr = useMemo(() => JSON.stringify(payload, null, 2), [payload])
  const pushScript = useMemo(() => generateFoundryScript(char), [char])
  const talentScript = useMemo(() => generateTalentInjectionScript(char), [char])
  const analysis = useMemo(() => analyzeSync(char), [char])

  const safe = s => (s || '').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const filename = `${safe(char.name) || 'Character'}_${safe(char.race) || 'Unknown'}_${safe(char.profession) || 'Unknown'}_${char.level ?? 1}_foundry.json`

  function copy(text, which) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which); setTimeout(() => setCopied(''), 2000)
    }).catch(() => textRef.current?.select())
  }
  function download() {
    const blob = new Blob([jsonStr], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 700, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
        {/* Header */}
        <div style={{ padding: '14px 16px 0', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>Send to Foundry VTT</div>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{char.name} · {char.race} {char.profession} · Lvl {char.level ?? 1}</div>
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}>
              <XIcon size={18} color="currentColor" />
            </button>
          </div>
          {/* Tabs */}
          <div style={{ display: 'flex', gap: 2 }}>
            <TabBtn active={tab === 'module'} onClick={() => setTab('module')} label="Module (JSON)" sub="DM installs once" />
            <TabBtn active={tab === 'console'} onClick={() => setTab('console')} label="Console Push" sub="no install" />
            <TabBtn active={tab === 'talents'} onClick={() => setTab('talents')} label="Inject Talents" sub="bypass lock" />
          </div>
        </div>

        {/* ── Module (JSON) ── */}
        {tab === 'module' && (
          <>
            <Instructions title="Apply via the RMU Character+ Sync module">
              <ol style={olStyle}>
                <li><strong>Download .json</strong> (or Copy JSON).</li>
                <li>In Foundry, open your character sheet → click the <strong>RMU Character+ Sync</strong> header button.</li>
                <li>On the <strong>Push</strong> tab, upload/paste the JSON → <strong>Import to actor</strong>.</li>
              </ol>
              <Note>Requires the DM to install the module once. Skills must already exist on your actor.</Note>
            </Instructions>
            <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
              <button onClick={download} style={primaryBtn}>Download .json</button>
              <button onClick={() => copy(jsonStr, 'json')} style={secondaryBtn}>{copied === 'json' ? '✓ Copied' : 'Copy JSON'}</button>
            </div>
            <ScriptBox value={jsonStr} label={`JSON (${jsonStr.length.toLocaleString()} chars)`} textRef={textRef} />
          </>
        )}

        {/* ── Console Push ── */}
        {tab === 'console' && (
          <>
            <Instructions title="Push ranks via the browser console — no module, works on a character you own">
              <ol style={olStyle}>
                <li>Open your character's sheet (or select its token) in Foundry.</li>
                <li>Press <strong>F12</strong> → <strong>Console</strong> tab. If warned, type <code style={codeStyle}>allow pasting</code> ↵</li>
                <li>Click <strong>Copy script</strong>, paste into the console, press Enter.</li>
              </ol>
              <Note>Shows a current→new diff in the console, applies, then re-reads to verify. Never deletes or replaces anything.</Note>
            </Instructions>
            <PreflightSummary
              willSync={analysis.skillUpdates.length + analysis.spellUpdates.length}
              cannotSync={analysis.cannotSync}
            />
            <div style={{ padding: '8px 16px' }}>
              <button onClick={() => copy(pushScript, 'push')} style={primaryBtn}>{copied === 'push' ? '✓ Copied' : 'Copy script'}</button>
            </div>
            <ScriptBox value={pushScript} label="Console push script" textRef={textRef} />
          </>
        )}

        {/* ── Inject Talents ── */}
        {tab === 'talents' && (
          <>
            <Instructions title="Inject talents — bypasses the RMU sheet's “level up first” edit lock">
              <ol style={olStyle}>
                <li>Open your character's sheet (or select its token).</li>
                <li>Press <strong>F12</strong> → <strong>Console</strong>. If warned, type <code style={codeStyle}>allow pasting</code> ↵</li>
                <li>Copy the script, paste, Enter. Then <strong>reload the world (F5)</strong> so talent effects recompute.</li>
              </ol>
              <Note>Pulls the real talent items from the rmu.core compendium. Talents already on your character are skipped.</Note>
            </Instructions>
            <PreflightSummary
              willSync={analysis.talentInjects.length}
              willSyncLabel="talent(s) ready to inject"
              cannotSync={analysis.unknownTalents}
              cannotLabel="can't inject (non-core / PDF)"
            />
            <div style={{ padding: '8px 16px' }}>
              <button onClick={() => copy(talentScript, 'talent')} style={primaryBtn}
                disabled={analysis.talentInjects.length === 0}>
                {copied === 'talent' ? '✓ Copied' : (analysis.talentInjects.length === 0 ? 'No injectable talents' : 'Copy script')}
              </button>
            </div>
            <ScriptBox value={talentScript} label="Talent injection script" textRef={textRef} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Subcomponents ────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, label, sub }) {
  return (
    <button onClick={onClick} style={{
      flex: 1, padding: '8px 6px 9px', cursor: 'pointer', background: 'transparent',
      border: 'none', borderBottom: '2px solid ' + (active ? 'var(--accent)' : 'transparent'),
      color: active ? 'var(--text)' : 'var(--text3)', fontWeight: active ? 700 : 500,
    }}>
      <div style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 9, color: active ? 'var(--accent)' : 'var(--text3)', marginTop: 1, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{sub}</div>
    </button>
  )
}
function Instructions({ title, children }) {
  return (
    <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>{title}</div>
      {children}
    </div>
  )
}
function Note({ children }) {
  return <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>{children}</div>
}
function PreflightSummary({ willSync, willSyncLabel = 'item(s) will sync', cannotSync = [], cannotLabel = 'app-only (can’t push)' }) {
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: 12, color: 'var(--success)', fontWeight: 600 }}>
        {willSync} {willSyncLabel}
      </div>
      {cannotSync.length > 0 && (
        <div style={{ marginTop: 6 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)', marginBottom: 3 }}>
            {cannotSync.length} {cannotLabel}:
          </div>
          <ul style={{ margin: 0, paddingLeft: 16, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5 }}>
            {cannotSync.map((c, i) => (
              <li key={i}><strong>{c.display}</strong> — {c.reason}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
function ScriptBox({ value, label, textRef }) {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{label} — click inside to select all</div>
      <textarea ref={textRef} readOnly value={value} onClick={e => e.target.select()} style={{
        width: '100%', height: 260, resize: 'vertical', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
        padding: '10px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)',
        color: 'var(--text)', boxSizing: 'border-box',
      }} />
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const olStyle = { margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }
const codeStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: 11 }
const primaryBtn = { padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none' }
const secondaryBtn = { padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }
