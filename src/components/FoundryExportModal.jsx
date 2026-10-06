import React, { useState, useMemo, useRef, useEffect } from 'react'
import { XIcon } from './Icons.jsx'
import { buildDesiredState, generateSyncScript, buildImportFile } from '../utils/foundrySync.js'

// Ways to get a character into Foundry (RMU system 1.3.x):
//  1. Sync script — paste into the F12 console as the GM or the actor's owner. Previews
//     every change, saves a backup of the actor, adds missing skills/lists/talents from
//     the compendiums, then verifies. No module needed. (Main route.)
//  2. Import file — backup route: upload the actor's "Export Data" file, download the
//     merged file, and use "Import Data" on the actor.
//  3. Module JSON — for the RMU Character+ Sync module, if the DM installed it.

export default function FoundryExportModal({ char, onClose }) {
  const [tab, setTab] = useState('script')   // 'script' | 'file' | 'module'
  const [copied, setCopied] = useState('')
  const [includeHealth, setIncludeHealth] = useState(false)
  const textRef = useRef(null)

  const desired = useMemo(() => buildDesiredState(char, { includeHealth }), [char, includeHealth])
  const script = useMemo(() => generateSyncScript(desired), [desired])
  const jsonStr = useMemo(() => JSON.stringify({ _version: 1, _type: 'single', character: char }, null, 2), [char])

  const safe = s => (s || '').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const baseName = `${safe(char.name) || 'Character'}_${safe(char.race) || 'Unknown'}_${safe(char.profession) || 'Unknown'}_${char.level ?? 1}`

  function copy(text, which) {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(which); setTimeout(() => setCopied(''), 2000)
    }).catch(() => textRef.current?.select())
  }

  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '24px 12px', overflowY: 'auto',
    }}>
      <div onClick={e => e.stopPropagation()} style={{
        width: '100%', maxWidth: 720, background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
      }}>
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
          <div style={{ display: 'flex', gap: 2 }}>
            <TabBtn active={tab === 'script'} onClick={() => setTab('script')} label="Sync script" sub="recommended" />
            <TabBtn active={tab === 'file'} onClick={() => setTab('file')} label="Import file" sub="backup route" />
            <TabBtn active={tab === 'module'} onClick={() => setTab('module')} label="Module JSON" sub="if installed" />
          </div>
        </div>

        {tab === 'script' && (
          <>
            <Instructions title="Paste into Foundry's console. No module needed.">
              <ol style={olStyle}>
                <li>In Foundry, select {char.name || 'your character'}'s token (or have them as your assigned character).</li>
                <li>Press <strong>F12</strong> → <strong>Console</strong>. If Chrome warns you, type <code style={codeStyle}>allow pasting</code> and press Enter.</li>
                <li><strong>Copy script</strong>, paste it into the console, press Enter.</li>
                <li>Check the preview and click <strong>Apply</strong>. A backup of the actor downloads first.</li>
              </ol>
              <Note>Works as the GM or the character's owner. It adds missing skills, spell lists and talents from the compendiums, sets ranks, culture ranks, professional skills, knacks, stats, realm and level, then re-checks. Nothing is deleted. Things in Foundry that the app doesn't have are listed, and you can choose to zero them.</Note>
            </Instructions>
            <DesiredSummary desired={desired} />
            <div style={{ padding: '8px 16px', display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
              <button onClick={() => copy(script, 'script')} style={primaryBtn}>{copied === 'script' ? '✓ Copied' : 'Copy script'}</button>
              <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 6, alignItems: 'center' }}>
                <input type="checkbox" checked={includeHealth} onChange={e => setIncludeHealth(e.target.checked)} />
                Also send current hits &amp; PP
              </label>
            </div>
            <ScriptBox value={script} label={`Sync script (${script.length.toLocaleString()} chars)`} textRef={textRef} />
          </>
        )}

        {tab === 'file' && <ImportFileTab desired={desired} baseName={baseName} />}

        {tab === 'module' && (
          <>
            <Instructions title="For the RMU Character+ Sync module">
              <ol style={olStyle}>
                <li><strong>Download .json</strong> (or Copy JSON).</li>
                <li>In Foundry, open the character sheet → <strong>RMU Character+ Sync</strong> → <strong>Push</strong>.</li>
              </ol>
              <Note>Only if your DM installed the module. It can't add missing skills, spell lists or talents. Use the sync script instead when you can.</Note>
            </Instructions>
            <div style={{ padding: '10px 16px', display: 'flex', gap: 8 }}>
              <button onClick={() => download(jsonStr, `${baseName}_foundry.json`)} style={primaryBtn}>Download .json</button>
              <button onClick={() => copy(jsonStr, 'json')} style={secondaryBtn}>{copied === 'json' ? '✓ Copied' : 'Copy JSON'}</button>
            </div>
            <ScriptBox value={jsonStr} label={`JSON (${jsonStr.length.toLocaleString()} chars)`} textRef={textRef} />
          </>
        )}
      </div>
    </div>
  )
}

// ── Import file (backup route) ──────────────────────────────────────────────
function ImportFileTab({ desired, baseName }) {
  const [templates, setTemplates] = useState(null)
  const [exportJson, setExportJson] = useState(null)
  const [error, setError] = useState('')
  const [zeroMissing, setZeroMissing] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    import('../data/foundry_templates.json').then(m => setTemplates(m.default || m)).catch(e => setError('Could not load Foundry data: ' + e.message))
  }, [])

  const result = useMemo(() => {
    if (!templates || !exportJson) return null
    try { return buildImportFile(desired, exportJson, templates, { zeroMissing }) } catch (e) { return { error: e.message } }
  }, [templates, exportJson, desired, zeroMissing])

  async function onFile(e) {
    setError('')
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try {
      const json = JSON.parse(await f.text())
      if (json.type !== 'Character' || !Array.isArray(json.items)) throw new Error("That isn't a Foundry Character export (right-click the actor → Export Data).")
      setExportJson(json)
    } catch (err) { setError(err.message) }
  }

  const changes = result?.plan ? Object.keys(result.plan.actorSet).length + result.plan.updates.length + result.plan.creates.length : 0
  return (
    <>
      <Instructions title="Use this if the script doesn't work for you">
        <ol style={olStyle}>
          <li>In Foundry's Actors sidebar, right-click the character → <strong>Export Data</strong>.</li>
          <li><strong>Choose that file</strong> below. The app merges your character into it.</li>
          <li><strong>Download</strong> the result, then right-click the actor → <strong>Import Data</strong> → pick the downloaded file.</li>
        </ol>
        <Note>Import Data replaces the whole actor with the file, so export it fresh just before you do this. Your exported file is your backup. Gear isn't added this way.</Note>
      </Instructions>
      <div style={{ padding: '10px 16px', display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={onFile} />
        <button onClick={() => fileRef.current?.click()} style={secondaryBtn} disabled={!templates}>
          {templates ? (exportJson ? `Loaded: ${exportJson.name}` : 'Choose Foundry export…') : 'Loading…'}
        </button>
        {result?.plan && (
          <>
            <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="checkbox" checked={zeroMissing} onChange={e => setZeroMissing(e.target.checked)} />
              Zero what the app doesn't have ({result.plan.extras.length})
            </label>
            <button onClick={() => download(JSON.stringify(result.actor, null, 2), `${baseName}_for_foundry_import.json`)} style={primaryBtn}>
              Download ({changes} change{changes === 1 ? '' : 's'})
            </button>
          </>
        )}
      </div>
      {(error || result?.error) && <div style={{ padding: '0 16px 10px', color: 'var(--danger)', fontSize: 12 }}>{error || result.error}</div>}
      {result?.plan && <PlanTable plan={result.plan} />}
    </>
  )
}

function PlanTable({ plan }) {
  return (
    <div style={{ padding: '0 16px 16px', fontSize: 12 }}>
      {plan.report.length === 0
        ? <div style={{ color: 'var(--success)', fontWeight: 600 }}>Already in sync. Nothing to change.</div>
        : (
          <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <tbody>
                {plan.report.map((r, i) => (
                  <tr key={i} style={{ background: i % 2 ? 'var(--surface2)' : 'transparent' }}>
                    <td style={td}>{r.action}</td>
                    <td style={{ ...td, fontWeight: 600 }}>{r.label}</td>
                    <td style={{ ...td, color: 'var(--text3)' }}>{String(r.from)}</td>
                    <td style={td}>→ {String(r.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      {plan.extras.length > 0 && (
        <div style={{ marginTop: 8, color: 'var(--text2)' }}>
          <strong>In Foundry but not in the app:</strong> {plan.extras.map(x => `${x.label} (${x.value})`).join(' · ')}
        </div>
      )}
      {plan.warnings.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 16, color: 'var(--text3)', lineHeight: 1.5 }}>
          {plan.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}
    </div>
  )
}

function DesiredSummary({ desired }) {
  const n = (count, label) => <span><strong style={{ color: 'var(--text)' }}>{count}</strong> {label}</span>
  return (
    <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', fontSize: 12, color: 'var(--text2)' }}>
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {n(desired.skills.length, 'skills')}
        {n(desired.lists.length, 'spell lists')}
        {n(desired.talents.length, 'talents')}
        {n(desired.professional.length, 'professional')}
        {n(desired.knacks.length, 'knacks')}
        {desired.gear.length > 0 && n(desired.gear.length, 'gear')}
      </div>
      {desired.unsynced.length > 0 && (
        <ul style={{ margin: '8px 0 0', paddingLeft: 16, fontSize: 11, color: 'var(--text3)', lineHeight: 1.5 }}>
          {desired.unsynced.map((u, i) => <li key={i}><strong>{u.display}</strong>: {u.reason}</li>)}
        </ul>
      )}
    </div>
  )
}

function download(text, filename) {
  const blob = new Blob([text], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click()
  URL.revokeObjectURL(url)
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
function ScriptBox({ value, label, textRef }) {
  return (
    <div style={{ padding: '4px 16px 16px' }}>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{label}. Click inside to select all.</div>
      <textarea ref={textRef} readOnly value={value} onClick={e => e.target.select()} style={{
        width: '100%', height: 200, resize: 'vertical', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
        padding: '10px 12px', borderRadius: 8, background: 'var(--surface2)', border: '1px solid var(--border)',
        color: 'var(--text)', boxSizing: 'border-box',
      }} />
    </div>
  )
}

// ── Styles ───────────────────────────────────────────────────────────────────
const td = { padding: '4px 8px', borderBottom: '1px solid var(--border)', verticalAlign: 'top' }
const olStyle = { margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }
const codeStyle = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 3, padding: '1px 5px', fontFamily: 'monospace', fontSize: 11 }
const primaryBtn = { padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: 'var(--accent)', color: '#fff', border: 'none' }
const secondaryBtn = { padding: '7px 14px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer', background: 'var(--surface2)', color: 'var(--text)', border: '1px solid var(--border)' }
