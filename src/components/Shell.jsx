import React, { useRef, useState } from 'react'
import { NavLink, useNavigate } from 'react-router-dom'
import { useCharacter } from '../store/CharacterContext.jsx'
import { exportCharacter, importCharactersFromFile } from '../store/characters.js'
import { SwordsIcon, ChevronDownIcon } from './Icons.jsx'
import { getBaseHits, getPowerPoints } from '../utils/calc.js'

const NAV = [
  { to: '/sheet',     label: 'Sheet',    icon: '◆' },
  { to: '/skills',    label: 'Skills',   icon: '◈' },
  { to: '/spells',    label: 'Spells',   icon: '✦' },
  { to: '/gear',      label: 'Gear',     icon: '⊞' },
  { to: '/levelup',   label: 'Level',    icon: '★' },
  { to: '/reference', label: 'Ref',      icon: '◉' },
]

export default function Shell({ children }) {
  const { characters, activeId, activeChar, switchCharacter, createCharacter, deleteCharacter, reloadCharacters } = useCharacter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const importRef = useRef(null)
  const navigate = useNavigate()
  const charList = Object.values(characters)

  function handleCreate() {
    createCharacter()
    setMenuOpen(false)
    navigate('/sheet')
  }

  function handleDelete(id, e) {
    e.stopPropagation()
    if (!confirm(`Delete "${characters[id]?.name}"?`)) return
    deleteCharacter(id)
    navigate('/')
  }

  function handleExport(e) {
    e.stopPropagation()
    if (activeId) exportCharacter(activeId)
  }

  async function handleImport(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const { imported, skipped } = await importCharactersFromFile(file, 'merge')
      reloadCharacters()
      setImportStatus(`Imported ${imported} character${imported !== 1 ? 's' : ''}${skipped ? `, skipped ${skipped} (already exist)` : ''}.`)
      setTimeout(() => setImportStatus(null), 4000)
    } catch (err) {
      setImportStatus('Error: ' + err.message)
      setTimeout(() => setImportStatus(null), 5000)
    }
  }

  const hp    = activeChar?.hits_current
  const hpMax = activeChar ? (activeChar.hits_max ?? getBaseHits(activeChar)) : null
  const pp    = activeChar?.power_points_current
  const ppMax = activeChar ? (activeChar.power_points_max ?? getPowerPoints(activeChar)) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>
      {/* Header */}
      <header style={{
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        padding: '0 16px',
        height: 52,
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}>
        {/* Logo */}
        <SwordsIcon size={17} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: 13, letterSpacing: '0.12em', color: 'var(--text)', opacity: 0.9 }}>
          ROLEMASTER
        </span>

        {/* Divider */}
        <div style={{ width: 1, height: 20, background: 'var(--border2)', margin: '0 4px' }} />

        {/* Character picker */}
        <div style={{ position: 'relative', flex: 1 }}>
          <button onClick={() => setMenuOpen(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: menuOpen ? 'var(--surface2)' : 'transparent',
            border: '1px solid ' + (menuOpen ? 'var(--border2)' : 'transparent'),
            borderRadius: 8, padding: '5px 10px',
            color: 'var(--text)', cursor: 'pointer', fontSize: 13,
            maxWidth: 220,
          }}>
            <span style={{ flex: 1, textAlign: 'left', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {activeChar?.name ?? 'Select character'}
            </span>
            {activeChar && (
              <span style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0 }}>
                Lv {activeChar.level}
              </span>
            )}
            <ChevronDownIcon size={12} color="var(--text3)" />
          </button>

          {menuOpen && (
            <>
              <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setMenuOpen(false)} />
              <div style={{
                position: 'absolute', top: '110%', left: 0,
                background: 'var(--surface)', border: '1px solid var(--border2)',
                borderRadius: 10, minWidth: 240, zIndex: 99,
                boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                overflow: 'hidden',
              }}>
                {charList.map(ch => (
                  <div key={ch.id} onClick={() => { switchCharacter(ch.id); setMenuOpen(false) }}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '10px 14px',
                      cursor: 'pointer', gap: 10,
                      borderLeft: '3px solid ' + (ch.id === activeId ? 'var(--accent)' : 'transparent'),
                      background: ch.id === activeId ? 'var(--surface2)' : 'transparent',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
                    onMouseLeave={e => e.currentTarget.style.background = ch.id === activeId ? 'var(--surface2)' : 'transparent'}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{ch.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 1 }}>
                        Level {ch.level} {ch.profession} · {ch.race}
                      </div>
                    </div>
                    <button onClick={e => handleDelete(ch.id, e)} style={{
                      background: 'none', border: 'none', color: 'var(--text3)',
                      cursor: 'pointer', padding: '2px 4px', borderRadius: 4, fontSize: 12,
                    }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
                    >✕</button>
                  </div>
                ))}
                {charList.length > 0 && <div style={{ height: 1, background: 'var(--border)' }} />}
                <div style={{ padding: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <button onClick={handleCreate} style={{
                    width: '100%', background: 'var(--accent)', color: '#fff',
                    border: 'none', borderRadius: 7, padding: '8px 12px',
                    fontWeight: 600, fontSize: 13, cursor: 'pointer', letterSpacing: '0.01em',
                  }}>+ New Character</button>

                  <div style={{ display: 'flex', gap: 6 }}>
                    {/* Import */}
                    <input ref={importRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImport} />
                    <button onClick={() => importRef.current?.click()} style={{
                      flex: 1, background: 'var(--surface2)', color: 'var(--text2)',
                      border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px',
                      fontSize: 12, cursor: 'pointer', fontWeight: 500,
                    }}>Import</button>
                    {activeId && (
                      <button onClick={handleExport} style={{
                        flex: 1, background: 'var(--surface2)', color: 'var(--text2)',
                        border: '1px solid var(--border)', borderRadius: 7, padding: '7px 10px',
                        fontSize: 12, cursor: 'pointer', fontWeight: 500,
                      }}>Export</button>
                    )}
                  </div>

                  {importStatus && (
                    <div style={{
                      fontSize: 11, padding: '6px 8px', borderRadius: 6,
                      background: importStatus.startsWith('Error') ? 'var(--danger)22' : 'var(--success)22',
                      color: importStatus.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
                      border: '1px solid ' + (importStatus.startsWith('Error') ? 'var(--danger)44' : 'var(--success)44'),
                    }}>{importStatus}</div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* HP / PP */}
        {activeChar && (
          <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
            <StatBadge label="HP" value={hp} max={hpMax} color="var(--danger)" />
            <StatBadge label="PP" value={pp} max={ppMax} color="var(--purple)" />
          </div>
        )}
      </header>

      {/* Content */}
      <main style={{ flex: 1, overflowY: 'auto', paddingBottom: 64 }}>
        {children}
      </main>

      {/* Bottom nav */}
      <nav style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
        background: 'var(--surface)', borderTop: '1px solid var(--border)',
        display: 'flex', zIndex: 50,
      }}>
        {NAV.map(({ to, label, icon }) => (
          <NavLink key={to} to={to} style={({ isActive }) => ({
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            textDecoration: 'none', gap: 2, padding: '4px 2px',
            color: isActive ? 'var(--accent)' : 'var(--text3)',
            borderTop: '2px solid ' + (isActive ? 'var(--accent)' : 'transparent'),
          })}>
            <span style={{ fontSize: 14 }}>{icon}</span>
            <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function StatBadge({ label, value, max, color }) {
  const pct = (value != null && max != null && max > 0) ? value / max : null
  return (
    <div style={{
      background: 'var(--surface2)', border: '1px solid var(--border2)',
      borderRadius: 7, padding: '4px 10px', fontSize: 12,
      display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 52,
    }}>
      <span style={{ color, fontWeight: 700, fontSize: 10, letterSpacing: '0.05em' }}>{label}</span>
      <span style={{ fontWeight: 700, fontSize: 13, color: pct != null && pct < 0.3 ? color : 'var(--text)' }}>
        {value ?? '—'}<span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>/{max ?? '—'}</span>
      </span>
    </div>
  )
}
