import React, { useRef, useState, useEffect, useCallback } from 'react'
import { NavLink, useNavigate, useLocation } from 'react-router-dom'
import { useCharacter } from '../store/CharacterContext.jsx'
import { exportCharacter, importCharactersFromFile } from '../store/characters.js'
import {
  FILE_SYNC_SUPPORTED, getLinkedHandle, getLinkedFileName,
  hasWritePermission, requestWritePermission,
  pickAndLinkFile, writeToHandle, readFromHandle, clearLinkedHandle,
} from '../store/fileSync.js'
import {
  SwordsIcon, ChevronDownIcon, XIcon, MenuIcon, SaveIcon,
  UserIcon, BarChartIcon, ZapIcon, PackageIcon, BookOpenIcon, TrendingUpIcon, BookIcon,
} from './Icons.jsx'
import { getBaseHits, getPowerPoints } from '../utils/calc.js'

const NAV = [
  { to: '/sheet',     label: 'Sheet',    Icon: UserIcon       },
  { to: '/skills',    label: 'Skills',   Icon: BarChartIcon   },
  { to: '/spells',    label: 'Spells',   Icon: ZapIcon        },
  { to: '/gear',      label: 'Gear',     Icon: PackageIcon    },
  { to: '/notebook',  label: 'Notes',    Icon: BookOpenIcon   },
  { to: '/levelup',   label: 'Level Up', Icon: TrendingUpIcon },
  { to: '/reference', label: 'Ref',      Icon: BookIcon       },
]

export default function Shell({ children }) {
  const { characters, activeId, activeChar, switchCharacter, createCharacter, deleteCharacter, reloadCharacters } = useCharacter()
  const [menuOpen, setMenuOpen] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const [navMenuOpen, setNavMenuOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 700)
  const [backupFile, setBackupFile] = useState(null)      // { name, hasPermission }
  const [backupMenuOpen, setBackupMenuOpen] = useState(false)
  const importRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 700)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])

  // Check backup file state on mount
  useEffect(() => {
    if (!FILE_SYNC_SUPPORTED) return
    getLinkedHandle().then(async h => {
      if (!h) return
      const hasPerm = await hasWritePermission(h)
      setBackupFile({ name: h.name, hasPermission: hasPerm })
    })
  }, [])

  const handleLinkBackup = useCallback(async () => {
    const handle = await pickAndLinkFile()
    if (!handle) return
    // Write current data immediately
    const chars = (() => { try { return JSON.parse(localStorage.getItem('rm_characters') || '{}') } catch { return {} } })()
    const nb    = (() => { try { return JSON.parse(localStorage.getItem('rm_notebook') || 'null') } catch { return null } })()
    await writeToHandle(handle, { _version: 1, _type: 'backup', characters: chars, notebook: nb, _saved_at: new Date().toISOString() })
    setBackupFile({ name: handle.name, hasPermission: true })
    setBackupMenuOpen(false)
  }, [])

  const handleUnlinkBackup = useCallback(async () => {
    await clearLinkedHandle()
    setBackupFile(null)
    setBackupMenuOpen(false)
  }, [])

  const handleRequestPermission = useCallback(async () => {
    const handle = await getLinkedHandle()
    if (!handle) return
    const ok = await requestWritePermission(handle)
    setBackupFile(prev => prev ? { ...prev, hasPermission: ok } : null)
  }, [])

  // Close nav menu on route change
  useEffect(() => { setNavMenuOpen(false) }, [location.pathname])
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
          RMU Character+
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
                      cursor: 'pointer', padding: '2px 4px', borderRadius: 4,
                      display: 'flex', alignItems: 'center',
                    }}
                      onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                      onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
                    ><XIcon size={13} color="currentColor" /></button>
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

        {/* Backup indicator */}
        {FILE_SYNC_SUPPORTED && (
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <button
              onClick={() => setBackupMenuOpen(p => !p)}
              title={backupFile ? `Backup: ${backupFile.name}` : 'No backup file linked'}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                background: backupMenuOpen ? 'var(--surface2)' : 'transparent',
                border: '1px solid ' + (backupMenuOpen ? 'var(--border2)' : 'transparent'),
                borderRadius: 7, padding: '4px 8px', cursor: 'pointer', color: 'var(--text3)',
              }}>
              <SaveIcon size={15} color="var(--text3)" />
              <span style={{
                width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                background: backupFile
                  ? (backupFile.hasPermission ? '#22c55e' : '#f59e0b')
                  : 'var(--border2)',
              }} />
            </button>

            {backupMenuOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 98 }} onClick={() => setBackupMenuOpen(false)} />
                <div style={{
                  position: 'absolute', top: '110%', right: 0, zIndex: 99,
                  background: 'var(--surface)', border: '1px solid var(--border2)',
                  borderRadius: 10, minWidth: 230, boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  overflow: 'hidden',
                }}>
                  <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>Auto-backup</div>
                    {backupFile ? (
                      <>
                        <div style={{ fontSize: 11, color: 'var(--text2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {backupFile.name}
                        </div>
                        <div style={{ fontSize: 10, marginTop: 3, display: 'flex', alignItems: 'center', gap: 4 }}>
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: backupFile.hasPermission ? '#22c55e' : '#f59e0b', display: 'inline-block' }} />
                          <span style={{ color: backupFile.hasPermission ? '#22c55e' : '#f59e0b' }}>
                            {backupFile.hasPermission ? 'Active — syncs every 2 s' : 'Permission needed'}
                          </span>
                        </div>
                      </>
                    ) : (
                      <div style={{ fontSize: 11, color: 'var(--text3)' }}>No file linked. Link a .json file and all changes will be auto-saved to it in the background.</div>
                    )}
                  </div>
                  {backupFile && !backupFile.hasPermission && (
                    <BackupMenuItem onClick={handleRequestPermission}>Grant write access</BackupMenuItem>
                  )}
                  {backupFile ? (
                    <BackupMenuItem onClick={handleLinkBackup}>Change backup file…</BackupMenuItem>
                  ) : (
                    <BackupMenuItem onClick={handleLinkBackup} accent>Link backup file…</BackupMenuItem>
                  )}
                  {backupFile && (
                    <BackupMenuItem onClick={handleUnlinkBackup} danger>Unlink backup file</BackupMenuItem>
                  )}
                </div>
              </>
            )}
          </div>
        )}

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
      {isMobile ? (
        <>
          {/* Mobile nav menu overlay (bottom sheet) */}
          {navMenuOpen && (
            <>
              <div
                onClick={() => setNavMenuOpen(false)}
                style={{ position: 'fixed', inset: 0, zIndex: 51, background: 'rgba(0,0,0,0.5)' }}
              />
              <div style={{
                position: 'fixed', bottom: 56, left: 0, right: 0,
                background: 'var(--surface)', borderTop: '1px solid var(--border2)',
                borderRadius: '16px 16px 0 0',
                zIndex: 52, overflow: 'hidden',
              }}>
                {NAV.map(({ to, label, Icon: NavIcon }) => (
                  <NavLink key={to} to={to} style={({ isActive }) => ({
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 24px',
                    textDecoration: 'none',
                    color: isActive ? 'var(--accent)' : 'var(--text)',
                    background: isActive ? 'var(--surface2)' : 'transparent',
                    borderLeft: '3px solid ' + (isActive ? 'var(--accent)' : 'transparent'),
                    fontSize: 15, fontWeight: isActive ? 700 : 500,
                  })}>
                    <NavIcon size={18} color="currentColor" />
                    <span>{label}</span>
                  </NavLink>
                ))}
              </div>
            </>
          )}

          {/* Mobile compact bar: active tab + Menu button */}
          <nav style={{
            position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
            background: 'var(--surface)', borderTop: '1px solid var(--border)',
            display: 'flex', zIndex: 50,
          }}>
            {/* Active tab indicator */}
            {(() => {
              const active = NAV.find(n => location.pathname.startsWith(n.to)) ?? NAV[0]
              return (
                <div style={{
                  flex: 1, display: 'flex', alignItems: 'center', gap: 10,
                  padding: '0 16px', color: 'var(--accent)',
                  borderTop: '2px solid var(--accent)',
                }}>
                  <active.Icon size={16} color="var(--accent)" />
                  <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.04em' }}>{active.label}</span>
                </div>
              )
            })()}
            {/* Menu button */}
            <button
              onClick={() => setNavMenuOpen(p => !p)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3,
                padding: '0 20px',
                background: navMenuOpen ? 'var(--surface2)' : 'transparent',
                border: 'none',
                borderTop: '2px solid ' + (navMenuOpen ? 'var(--accent)' : 'transparent'),
                color: navMenuOpen ? 'var(--accent)' : 'var(--text3)',
                cursor: 'pointer',
              }}
            >
              <MenuIcon size={16} color="currentColor" />
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Menu</span>
            </button>
          </nav>
        </>
      ) : (
        <nav style={{
          position: 'fixed', bottom: 0, left: 0, right: 0, height: 56,
          background: 'var(--surface)', borderTop: '1px solid var(--border)',
          display: 'flex', zIndex: 50,
        }}>
          {NAV.map(({ to, label, Icon: NavIcon }) => (
            <NavLink key={to} to={to} style={({ isActive }) => ({
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              textDecoration: 'none', gap: 2, padding: '4px 2px',
              color: isActive ? 'var(--accent)' : 'var(--text3)',
              borderTop: '2px solid ' + (isActive ? 'var(--accent)' : 'transparent'),
            })}>
              <NavIcon size={15} color="currentColor" />
              <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</span>
            </NavLink>
          ))}
        </nav>
      )}
    </div>
  )
}

function BackupMenuItem({ onClick, children, danger, accent }) {
  return (
    <button onClick={onClick} style={{
      display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none',
      padding: '9px 14px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
      color: danger ? 'var(--danger)' : accent ? 'var(--accent)' : 'var(--text)',
    }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
      {children}
    </button>
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
