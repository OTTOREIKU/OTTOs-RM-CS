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
  SwordsIcon, ChevronDownIcon, XIcon, SaveIcon,
  UserIcon, BarChartIcon, ZapIcon, PackageIcon, BookOpenIcon, TrendingUpIcon, BookIcon,
} from './Icons.jsx'

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
  const [backupFile, setBackupFile] = useState(null)
  const [backupMenuOpen, setBackupMenuOpen] = useState(false)
  const importRef = useRef(null)
  const navigate = useNavigate()
  const location = useLocation()

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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh' }}>

      {/* ── Header ───────────────────────────────────────────────── */}
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

        <div style={{ width: 1, height: 20, background: 'var(--border2)', margin: '0 4px' }} />

        {/* Character picker */}
        <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
          <button onClick={() => setMenuOpen(p => !p)} style={{
            display: 'flex', alignItems: 'center', gap: 8,
            background: menuOpen ? 'var(--surface2)' : 'transparent',
            border: '1px solid ' + (menuOpen ? 'var(--border2)' : 'transparent'),
            borderRadius: 8, padding: '5px 10px',
            color: 'var(--text)', cursor: 'pointer', fontSize: 13,
            maxWidth: '100%',
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
      </header>

      {/* ── Tab bar ──────────────────────────────────────────────── */}
      <nav style={{
        position: 'sticky',
        top: 52,
        zIndex: 49,
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        padding: '8px 12px',
        overflowX: 'auto',
        WebkitOverflowScrolling: 'touch',
        scrollbarWidth: 'none',
      }}>
        {NAV.map(({ to, label, Icon: NavIcon }) => (
          <NavLink
            key={to}
            to={to}
            title={label}
            style={({ isActive }) => ({
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flex: 1,
              minWidth: 36,
              height: 42,
              borderRadius: 8,
              textDecoration: 'none',
              background: isActive ? 'var(--accent)' : 'var(--surface2)',
              color: isActive ? '#fff' : 'var(--text2)',
              border: '1px solid ' + (isActive ? 'transparent' : 'var(--border)'),
            })}
          >
            <NavIcon size={17} color="currentColor" />
          </NavLink>
        ))}
      </nav>

      {/* ── Content ──────────────────────────────────────────────── */}
      <main style={{ flex: 1, paddingBottom: 24, overflowX: 'hidden', minWidth: 0 }}>
        {children}
      </main>

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
