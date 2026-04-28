import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useEditor, useEditorState, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TaskList } from '@tiptap/extension-task-list'
import { TaskItem } from '@tiptap/extension-task-item'
import Placeholder from '@tiptap/extension-placeholder'
import {
  ChevronDownIcon, ChevronRightIcon, PlusIcon, TrashIcon,
  PencilIcon, PinIcon, FolderIcon, FolderOpenIcon, DotsHIcon, FileIcon, CalendarIcon,
  XIcon, MenuIcon, ChevronLeftIcon, CheckIcon,
} from '../components/Icons.jsx'
import {
  loadNotebook, saveNotebook, loadOpenFolders, saveOpenFolders,
  loadActiveNoteId, saveActiveNoteId, nbUid,
} from '../store/notebook.js'
import { usePersistentOpen } from '../hooks/persist.js'
import { importNotebookFromFile } from '../store/characters.js'

// ── Constants ─────────────────────────────────────────────────────────────────

const NOTE_COLORS = {
  red:    '#ef4444',
  orange: '#f97316',
  yellow: '#eab308',
  green:  '#22c55e',
  blue:   'var(--accent)',
  purple: 'var(--purple)',
}
const COLOR_KEYS = Object.keys(NOTE_COLORS)

// Hex-based tints for use in backgrounds (CSS vars can't be alpha-modified inline)
const NOTE_COLOR_ACTIVE = {
  red:    '#ef444428', orange: '#f9731628', yellow: '#eab30828',
  green:  '#22c55e28', blue:   '#6366f128', purple: '#a855f728',
}
const NOTE_COLOR_PASSIVE = {
  red:    '#ef444412', orange: '#f9731612', yellow: '#eab30812',
  green:  '#22c55e12', blue:   '#6366f112', purple: '#a855f712',
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

function escHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
function inlineMd(text) {
  return escHtml(text)
    .replace(/\[\[([^\]]+)\]\]/g, '<a href="#" data-note-link="$1" style="color:var(--accent);text-decoration:underline;cursor:pointer">$1</a>')
    .replace(/#([a-zA-Z][a-zA-Z0-9_-]*)/g, '<span style="background:var(--accent)22;color:var(--accent);border-radius:10px;padding:1px 6px;font-size:.88em">#$1</span>')
    .replace(/`([^`]+)`/g, '<code style="background:var(--surface2);border:1px solid var(--border);border-radius:3px;padding:1px 5px;font-size:.88em;font-family:monospace">$1</code>')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" style="color:var(--accent);text-decoration:underline">$1</a>')
}
function renderMarkdown(src) {
  if (!src?.trim()) return '<p style="color:var(--text3);font-style:italic;margin:0">Nothing here yet — switch to Edit to start writing.</p>'
  const lines = src.split('\n')
  const out = []
  let inCode = false, codeLang = '', codeBuf = []
  let inUl = false, inOl = false, inTaskUl = false
  function closeList() {
    if (inTaskUl) { out.push('</ul>'); inTaskUl = false }
    if (inUl)     { out.push('</ul>'); inUl     = false }
    if (inOl)     { out.push('</ol>'); inOl     = false }
  }
  for (const raw of lines) {
    if (raw.startsWith('```')) {
      if (!inCode) { closeList(); codeLang = raw.slice(3).trim(); codeBuf = []; inCode = true }
      else {
        const lbl = codeLang ? `<span style="font-size:9px;color:var(--text3);text-transform:uppercase;letter-spacing:.07em;display:block;margin-bottom:4px">${escHtml(codeLang)}</span>` : ''
        out.push(`<pre style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;overflow-x:auto;margin:8px 0;line-height:1.5">${lbl}<code style="font-size:12px;font-family:monospace;white-space:pre">${codeBuf.map(escHtml).join('\n')}</code></pre>`)
        inCode = false; codeLang = ''; codeBuf = []
      }
      continue
    }
    if (inCode) { codeBuf.push(raw); continue }
    if (!raw.trim()) { closeList(); out.push('<div style="height:8px"></div>'); continue }
    const hm = raw.match(/^(#{1,6})\s+(.+)$/)
    if (hm) {
      closeList()
      const l = hm[1].length
      const sz = ['1.7em','1.35em','1.12em','1em','0.95em','0.88em'][l - 1]
      const bb = l <= 2 ? 'border-bottom:1px solid var(--border);padding-bottom:6px;' : ''
      out.push(`<div style="font-size:${sz};font-weight:700;color:var(--text);margin:${l===1?'18px':'12px'} 0 6px;line-height:1.3;${bb}">${inlineMd(hm[2])}</div>`)
      continue
    }
    if (/^[-*_]{3,}$/.test(raw.trim())) { closeList(); out.push('<hr style="border:none;border-top:1px solid var(--border);margin:14px 0">'); continue }
    if (raw.startsWith('> ')) { closeList(); out.push(`<blockquote style="border-left:3px solid var(--accent);margin:6px 0;padding:6px 14px;color:var(--text2);font-style:italic;background:var(--surface2);border-radius:0 6px 6px 0">${inlineMd(raw.slice(2))}</blockquote>`); continue }
    const tm = raw.match(/^(\s*)- \[([ xX])\] (.+)$/)
    if (tm) {
      if (inUl) { out.push('</ul>'); inUl = false } if (inOl) { out.push('</ol>'); inOl = false }
      if (!inTaskUl) { out.push('<ul style="list-style:none;padding:0;margin:4px 0">'); inTaskUl = true }
      const done = tm[2].toLowerCase() === 'x'
      out.push(`<li style="display:flex;align-items:flex-start;gap:8px;margin:4px 0"><span style="flex-shrink:0;width:15px;height:15px;border:2px solid ${done?'var(--accent)':'var(--border2)'};border-radius:3px;background:${done?'var(--accent)':'transparent'};display:inline-flex;align-items:center;justify-content:center;margin-top:2px">${done?'<span style="color:#fff;font-size:9px;font-weight:900">✓</span>':''}</span><span style="${done?'text-decoration:line-through;color:var(--text3)':'color:var(--text);line-height:1.5'}">${inlineMd(tm[3])}</span></li>`)
      continue
    }
    const um = raw.match(/^(\s*)[-*+] (.+)$/)
    if (um) { if (inTaskUl) { out.push('</ul>'); inTaskUl = false } if (inOl) { out.push('</ol>'); inOl = false } if (!inUl) { out.push('<ul style="padding-left:22px;margin:4px 0">'); inUl = true } out.push(`<li style="margin:3px 0;color:var(--text);line-height:1.55">${inlineMd(um[2])}</li>`); continue }
    const om = raw.match(/^(\s*)\d+\. (.+)$/)
    if (om) { if (inTaskUl) { out.push('</ul>'); inTaskUl = false } if (inUl) { out.push('</ul>'); inUl = false } if (!inOl) { out.push('<ol style="padding-left:22px;margin:4px 0">'); inOl = true } out.push(`<li style="margin:3px 0;color:var(--text);line-height:1.55">${inlineMd(om[2])}</li>`); continue }
    closeList()
    out.push(`<p style="margin:4px 0;color:var(--text);line-height:1.65">${inlineMd(raw)}</p>`)
  }
  closeList()
  if (inCode) out.push(`<pre><code>${codeBuf.map(escHtml).join('\n')}</code></pre>`)
  return out.join('')
}

// ── HTML ↔ content helpers ────────────────────────────────────────────────────

/** Get plain text from possibly-HTML content */
function htmlText(content) {
  if (!content) return ''
  if (!content.includes('<')) return content
  const d = document.createElement('div')
  d.innerHTML = content
  return d.textContent || ''
}

/** Convert legacy markdown to HTML for the rich editor (runs once per note) */
function noteToHtml(content) {
  if (!content) return ''
  if (content.trimStart().startsWith('<')) return content
  return renderMarkdown(content)
}

/** Walk DOM tree to produce markdown for .md export */
function htmlToMarkdown(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  function walk(node) {
    if (node.nodeType === 3) return node.textContent
    if (node.nodeType !== 1) return ''
    const tag = node.tagName.toLowerCase()
    const kids = [...node.childNodes].map(walk).join('')
    switch (tag) {
      case 'h1': return `\n# ${kids.trim()}\n`
      case 'h2': return `\n## ${kids.trim()}\n`
      case 'h3': return `\n### ${kids.trim()}\n`
      case 'strong': case 'b': return `**${kids}**`
      case 'em': case 'i': return `*${kids}*`
      case 'del': case 's': return `~~${kids}~~`
      case 'code': return node.parentElement?.tagName === 'PRE' ? kids : `\`${kids}\``
      case 'pre': return `\n\`\`\`\n${kids.trim()}\n\`\`\`\n`
      case 'blockquote': return kids.trim().split('\n').map(l => `> ${l}`).join('\n') + '\n'
      case 'br': return '\n'
      case 'p': return `${kids}\n`
      case 'div': return kids ? `${kids}\n` : ''
      case 'li': return node.parentElement?.tagName === 'OL' ? `1. ${kids}\n` : `- ${kids}\n`
      case 'ul': case 'ol': return kids + '\n'
      case 'hr': return `\n---\n`
      case 'a': return `[${kids}](${node.getAttribute('href') || ''})`
      default: return kids
    }
  }
  return walk(div).replace(/\n{3,}/g, '\n\n').trim()
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function fmtRelative(iso) {
  if (!iso) return ''
  const d = Date.now() - new Date(iso).getTime()
  if (d < 60000) return 'just now'
  if (d < 3600000) return `${Math.floor(d / 60000)}m ago`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h ago`
  if (d < 604800000) return `${Math.floor(d / 86400000)}d ago`
  return new Date(iso).toLocaleDateString()
}
function wordCount(t) {
  const text = htmlText(t)
  return text.trim().split(/\s+/).filter(Boolean).length
}

function extractTags(content) {
  const text = htmlText(content)
  const m = text.match(/#([a-zA-Z][a-zA-Z0-9_-]*)/g) || []
  return [...new Set(m.map(t => t.slice(1).toLowerCase()))]
}

function exportNoteAsMd(note) {
  const content = note.content || ''
  const md = content.trimStart().startsWith('<') ? htmlToMarkdown(content) : content
  const blob = new Blob([md], { type: 'text/markdown' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  const safe = s => (s || '').replace(/[^a-z0-9 ]/gi, '').trim().replace(/\s+/g, '_') || 'note'
  a.download = safe(note.title) + '.md'
  a.click()
  URL.revokeObjectURL(url)
}

function getSubfolders(folders, parentId) {
  return Object.values(folders)
    .filter(f => (f.parent_id ?? null) === parentId)
    .sort((a, b) => a.name.localeCompare(b.name))
}

function collectDescendants(folders, rootId) {
  const ids = new Set([rootId])
  let changed = true
  while (changed) {
    changed = false
    for (const f of Object.values(folders)) {
      if (!ids.has(f.id) && ids.has(f.parent_id)) { ids.add(f.id); changed = true }
    }
  }
  return ids
}

// Sort notes array by sortBy key
function sortNotes(arr, sortBy) {
  return [...arr].sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
    if (sortBy === 'title')   return (a.title || '').localeCompare(b.title || '')
    if (sortBy === 'created') return new Date(b.created_at) - new Date(a.created_at)
    return new Date(b.updated_at) - new Date(a.updated_at) // modified (default)
  })
}

// ── Main view ─────────────────────────────────────────────────────────────────

export default function NotebookView() {
  const [data,           setData]           = useState(() => loadNotebook())
  const [activeId,       setActiveId]       = useState(() => {
    const id = loadActiveNoteId(), nb = loadNotebook()
    return id && nb.notes[id] ? id : null
  })
  const [openFolders,    setOpenFolders]    = useState(() => loadOpenFolders())
  const [search,         setSearch]         = useState('')
  const [sortBy,,        setSortBy]         = usePersistentOpen('rm_nb_sort',  'title')
  const [activeTag,,     setActiveTag]      = usePersistentOpen('rm_nb_tag',   null)
  const [showSidebar,    setShowSidebar]    = useState(() => window.innerWidth >= 700)
  const [sidebarHidden,  setSidebarHidden]  = useState(false)
  const [isMobile,       setIsMobile]       = useState(() => window.innerWidth < 700)
  const [ctxMenu,        setCtxMenu]        = useState(null)
  const [renaming,       setRenaming]       = useState(null)
  const [renameVal,      setRenameVal]      = useState('')
  const [dragItem,       setDragItem]       = useState(null)  // { type: 'note'|'folder', id, ids? }
  const [dragOverTarget, setDragOverTarget] = useState(null)
  const [plusOpen,       setPlusOpen]       = useState(false)
  const [confirmDlg,     setConfirmDlg]     = useState(null)  // { message, onConfirm }
  const [selectedIds,    setSelectedIds]    = useState({})    // { [noteId]: bool }

  const renameRef    = useRef(null)
  const titleRef     = useRef(null)
  const dragItemRef  = useRef(null)   // sync ref — avoids stale closure in drag events
  const nbImportRef  = useRef(null)
  const [nbImportStatus, setNbImportStatus] = useState(null)

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 700)
    window.addEventListener('resize', h); return () => window.removeEventListener('resize', h)
  }, [])
  useEffect(() => { saveOpenFolders(openFolders) }, [openFolders])
  useEffect(() => { saveActiveNoteId(activeId)   }, [activeId])

  useEffect(() => {
    if (!renaming) return
    let attempts = 0
    const tryFocus = () => {
      if (renameRef.current) { renameRef.current.focus(); renameRef.current.select() }
      else if (++attempts < 10) requestAnimationFrame(tryFocus)
    }
    requestAnimationFrame(tryFocus)
  }, [renaming?.id]) // eslint-disable-line

  useEffect(() => {
    const onDown = () => { setCtxMenu(null); setPlusOpen(false) }
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [])

  useEffect(() => {
    const onKey = e => {
      if (e.key === 'Escape') { setCtxMenu(null); setPlusOpen(false); if (renaming) commitRename() }
    }
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey)
  })

  const activeNote = activeId ? data.notes[activeId] : null
  const selCount   = useMemo(() => Object.values(selectedIds).filter(Boolean).length, [selectedIds])

  // ── Mutations ──────────────────────────────────────────────────────────────
  function mutate(fn) {
    setData(prev => { const next = fn(JSON.parse(JSON.stringify(prev))); saveNotebook(next); return next })
  }

  const createNote = useCallback((folderId = null) => {
    const id = nbUid('note'), now = new Date().toISOString()
    mutate(d => { d.notes[id] = { id, title: 'Untitled', content: '', folder_id: folderId, pinned: false, color: null, created_at: now, updated_at: now }; return d })
    setActiveId(id);     if (isMobile) setShowSidebar(false)
    requestAnimationFrame(() => requestAnimationFrame(() => titleRef.current?.select()))
  }, [isMobile])

  function createDailyNote() {
    const today = new Date().toISOString().slice(0, 10)
    const existing = Object.values(data.notes).find(n => n.title === today)
    if (existing) { setActiveId(existing.id); if (isMobile) setShowSidebar(false); setPlusOpen(false); return }
    const id = nbUid('note'), now = new Date().toISOString()
    mutate(d => { d.notes[id] = { id, title: today, content: `# ${today}\n\n`, folder_id: null, pinned: false, color: null, created_at: now, updated_at: now }; return d })
    setActiveId(id); setMode('edit'); setPlusOpen(false)
    if (isMobile) setShowSidebar(false)
  }

  function updateNote(id, patch) {
    mutate(d => { if (d.notes[id]) d.notes[id] = { ...d.notes[id], ...patch, updated_at: new Date().toISOString() }; return d })
  }
  function deleteNote(id) {
    setCtxMenu(null)
    setConfirmDlg({
      message: 'Delete this note? This cannot be undone.',
      onConfirm: () => {
        mutate(d => { delete d.notes[id]; return d })
        if (activeId === id) setActiveId(null)
      }
    })
  }

  function createFolder(parentId = null) {
    const id = nbUid('folder'), now = new Date().toISOString()
    mutate(d => { d.folders[id] = { id, name: 'New Folder', parent_id: parentId, created_at: now, updated_at: now }; return d })
    setOpenFolders(o => {
      const next = { ...o, [id]: true }
      if (parentId) next[parentId] = true
      return next
    })
    setRenaming({ type: 'folder', id }); setRenameVal('New Folder')
  }

  function updateFolder(id, patch) {
    mutate(d => { if (d.folders[id]) d.folders[id] = { ...d.folders[id], ...patch, updated_at: new Date().toISOString() }; return d })
  }
  function deleteFolder(id) {
    setCtxMenu(null)
    setConfirmDlg({
      message: 'Delete this folder and all subfolders? Notes inside will become Unfiled.',
      onConfirm: () => {
        mutate(d => {
          const toDelete = collectDescendants(d.folders, id)
          Object.values(d.notes).forEach(n => { if (toDelete.has(n.folder_id)) n.folder_id = null })
          toDelete.forEach(fId => delete d.folders[fId])
          return d
        })
      }
    })
  }
  function moveNote(noteId, folderId) {
    updateNote(noteId, { folder_id: folderId ?? null }); setCtxMenu(null)
  }
  function moveFolder(folderId, newParentId) {
    if (folderId === newParentId) return
    if (newParentId !== null) {
      const desc = collectDescendants(data.folders, folderId)
      if (desc.has(newParentId)) return // would create cycle
    }
    updateFolder(folderId, { parent_id: newParentId ?? null })
  }

  // ── Copy note ──────────────────────────────────────────────────────────────
  function copyNote(id) {
    const note = data.notes[id]; if (!note) return
    const newId = nbUid('note'), now = new Date().toISOString()
    mutate(d => {
      d.notes[newId] = { ...note, id: newId, title: `Copy of ${note.title}`, created_at: now, updated_at: now }
      return d
    })
    setActiveId(newId);     if (isMobile) setShowSidebar(false)
    setCtxMenu(null)
  }

  // ── Multi-select ───────────────────────────────────────────────────────────
  function toggleSelect(id) {
    setSelectedIds(prev => ({ ...prev, [id]: !prev[id] }))
  }
  function clearSelection() { setSelectedIds({}) }
  function deleteSelected() {
    const ids = Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k)
    if (!ids.length) return
    setConfirmDlg({
      message: `Delete ${ids.length} note${ids.length !== 1 ? 's' : ''}? This cannot be undone.`,
      onConfirm: () => {
        mutate(d => { ids.forEach(id => delete d.notes[id]); return d })
        if (ids.includes(activeId)) setActiveId(null)
        clearSelection()
      }
    })
  }

  // ── Notebook import ────────────────────────────────────────────────────────
  async function handleImportNotebook(e) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const { imported, skipped } = await importNotebookFromFile(file, 'merge')
      setData(loadNotebook())
      setNbImportStatus(`Imported ${imported} note${imported !== 1 ? 's' : ''}${skipped ? `, skipped ${skipped} (already exist)` : ''}.`)
      setTimeout(() => setNbImportStatus(null), 4000)
    } catch (err) {
      setNbImportStatus('Error: ' + err.message)
      setTimeout(() => setNbImportStatus(null), 5000)
    }
  }

  // ── Rename ─────────────────────────────────────────────────────────────────
  function startRename(type, id, val) { setRenaming({ type, id }); setRenameVal(val); setCtxMenu(null) }
  function commitRename() {
    if (!renaming) return
    const val = renameVal.trim() || 'Untitled'
    if (renaming.type === 'folder') updateFolder(renaming.id, { name: val })
    else updateNote(renaming.id, { title: val })
    setRenaming(null)
  }

  // ── Context menu ───────────────────────────────────────────────────────────
  function openCtx(type, id, e) {
    e.preventDefault(); e.stopPropagation()
    const x = Math.min(e.clientX, window.innerWidth  - 190)
    const y = Math.min(e.clientY, window.innerHeight - 300)
    setCtxMenu({ type, id, x, y })
  }

  // ── Drag & drop ────────────────────────────────────────────────────────────
  function onNoteDragStart(e, noteId) {
    // If dragging a selected note, carry all selected notes; otherwise just this one
    const dragIds = (selCount > 0 && selectedIds[noteId])
      ? Object.entries(selectedIds).filter(([, v]) => v).map(([k]) => k)
      : [noteId]
    const item = { type: 'note', id: noteId, ids: dragIds }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `note:${noteId}`)
    dragItemRef.current = item
    setDragItem(item)
  }
  function onFolderDragStart(e, folderId) {
    e.stopPropagation()
    const item = { type: 'folder', id: folderId }
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', `folder:${folderId}`)
    dragItemRef.current = item
    setDragItem(item)
  }
  function onDragEnd() { dragItemRef.current = null; setDragItem(null); setDragOverTarget(null) }

  function onFolderDragOver(e, folderId) {
    // Use ref (not state) — state may still be null on first render after dragstart
    const item = dragItemRef.current
    if (!item) return
    if (item.type === 'folder' && item.id === folderId) return // self
    e.preventDefault(); e.dataTransfer.dropEffect = 'move'
    setDragOverTarget(folderId)
  }
  function onFolderDragLeave(e) {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOverTarget(null)
  }
  function onFolderDrop(e, folderId) {
    e.preventDefault()
    e.stopPropagation()  // prevent bubbling to root onDrop which would move to root
    const raw = e.dataTransfer.getData('text/plain') || (dragItem ? `${dragItem.type}:${dragItem.id}` : '')
    const [type, id] = raw.split(':')
    if (type === 'note') {
      const target = folderId === '__unfiled__' ? null : folderId
      const idsToMove = dragItemRef.current?.ids ?? [id]
      idsToMove.forEach(nid => moveNote(nid, target))
      if (idsToMove.length > 1) clearSelection()
    }
    if (type === 'folder') moveFolder(id, folderId === '__unfiled__' ? null : folderId)
    setDragItem(null); setDragOverTarget(null)
  }
  // Root-level drop zone (between folders in sidebar)
  function onRootDrop(e) {
    e.preventDefault()
    const raw = e.dataTransfer.getData('text/plain') || (dragItem ? `${dragItem.type}:${dragItem.id}` : '')
    const [type, id] = raw.split(':')
    if (type === 'folder') moveFolder(id, null) // move to root
    setDragItem(null); setDragOverTarget(null)
  }

  // ── Editor (Tiptap) ──────────────────────────────────────────────────────────

  function handleContentChange(val) {
    if (!activeId) return
    mutate(d => { if (d.notes[activeId]) { d.notes[activeId].content = val; d.notes[activeId].updated_at = new Date().toISOString() }; return d })
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: 'Start writing…' }),
    ],
    content: activeNote ? noteToHtml(activeNote.content) : '',
    onUpdate: ({ editor: e }) => {
      if (activeId) handleContentChange(e.getHTML())
    },
    editorProps: {
      attributes: { class: 'rich-editor' },
    },
  })

  // When active note changes, load its content into the editor
  useEffect(() => {
    if (!editor) return
    if (!activeNote) { editor.commands.setContent('', false); return }
    const html = noteToHtml(activeNote.content)
    editor.commands.setContent(html, false) // false = don't trigger onUpdate
    // One-time migration: save converted HTML so legacy markdown isn't re-converted
    if (activeNote.content?.trim() && !activeNote.content.trimStart().startsWith('<')) {
      mutate(d => { if (d.notes[activeNote.id]) d.notes[activeNote.id].content = html; return d })
    }
  }, [activeNote?.id, editor]) // eslint-disable-line

  // Reactive toolbar state — useEditorState subscribes to every transaction so
  // isActive values update immediately on selection/content change (Tiptap v3 requirement)
  const fmt = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold:      e?.isActive('bold')                    ?? false,
      italic:    e?.isActive('italic')                  ?? false,
      strike:    e?.isActive('strike')                  ?? false,
      h1:        e?.isActive('heading', { level: 1 })   ?? false,
      h2:        e?.isActive('heading', { level: 2 })   ?? false,
      h3:        e?.isActive('heading', { level: 3 })   ?? false,
      code:      e?.isActive('code')                    ?? false,
      codeBlock: e?.isActive('codeBlock')               ?? false,
      quote:     e?.isActive('blockquote')              ?? false,
      ul:        e?.isActive('bulletList')              ?? false,
      ol:        e?.isActive('orderedList')             ?? false,
      task:      e?.isActive('taskList')                ?? false,
    }),
  })

  // ── Derived data ───────────────────────────────────────────────────────────
  const q = search.toLowerCase()

  const notesByFolder = useMemo(() => {
    const map = {}
    for (const note of Object.values(data.notes)) {
      const key = note.folder_id || '__unfiled__'
      if (!map[key]) map[key] = []
      map[key].push(note)
    }
    for (const key of Object.keys(map)) map[key] = sortNotes(map[key], sortBy)
    return map
  }, [data.notes, sortBy])

  const searchResults = useMemo(() => {
    if (!q) return []
    return sortNotes(
      Object.values(data.notes).filter(n => n.title.toLowerCase().includes(q) || htmlText(n.content).toLowerCase().includes(q)),
      sortBy
    )
  }, [data.notes, q, sortBy])

  const tagResults = useMemo(() => {
    if (!activeTag || q) return []
    return sortNotes(
      Object.values(data.notes).filter(n => extractTags(n.content).includes(activeTag)),
      sortBy
    )
  }, [data.notes, activeTag, q, sortBy])

  const allTags = useMemo(() => {
    const s = new Set()
    Object.values(data.notes).forEach(n => extractTags(n.content).forEach(t => s.add(t)))
    return [...s].sort()
  }, [data.notes])

  const rootFolders = useMemo(() => getSubfolders(data.folders, null), [data.folders])

  const allFoldersSorted = useMemo(() =>
    Object.values(data.folders).sort((a, b) => a.name.localeCompare(b.name)),
  [data.folders])

  // ── Context menu content ───────────────────────────────────────────────────
  function renderCtxItems() {
    if (!ctxMenu) return null
    if (ctxMenu.type === 'note') {
      const note = data.notes[ctxMenu.id]; if (!note) return null
      return <>
        <CtxItem icon={<PencilIcon size={12} />} onClick={() => startRename('note', ctxMenu.id, note.title)}>Rename</CtxItem>
        <CtxItem icon={<FileIcon size={12} color="currentColor" />} onClick={() => copyNote(ctxMenu.id)}>Duplicate note</CtxItem>
        <CtxItem icon={<PinIcon size={12} filled={note.pinned} color="currentColor" />}
          onClick={() => { updateNote(ctxMenu.id, { pinned: !note.pinned }); setCtxMenu(null) }}>
          {note.pinned ? 'Unpin' : 'Pin to top'}
        </CtxItem>
        <CtxDivider label="Label" />
        <div onMouseDown={e => e.stopPropagation()}
          style={{ display: 'flex', gap: 6, padding: '4px 12px 8px', flexWrap: 'wrap' }}>
          {[null, ...COLOR_KEYS].map(c => (
            <button key={c ?? 'none'} title={c ?? 'None'}
              onClick={() => { updateNote(ctxMenu.id, { color: c ?? null }); setCtxMenu(null) }}
              style={{
                width: 18, height: 18, borderRadius: '50%', cursor: 'pointer', padding: 0,
                background: c ? NOTE_COLORS[c] : 'transparent',
                border: `2px solid ${c ? NOTE_COLORS[c] : 'var(--border2)'}`,
                outline: (note.color ?? null) === (c ?? null) ? '2px solid var(--text)' : 'none',
                outlineOffset: 2,
              }} />
          ))}
        </div>
        {(allFoldersSorted.length > 0 || note.folder_id) && <>
          <CtxDivider label="Move to" />
          {note.folder_id && <CtxItem icon={<FolderIcon size={12} color="currentColor" />} onClick={() => moveNote(ctxMenu.id, null)}>Unfiled</CtxItem>}
          {allFoldersSorted.filter(f => f.id !== note.folder_id).map(f => (
            <CtxItem key={f.id} icon={<FolderIcon size={12} color="currentColor" />} onClick={() => moveNote(ctxMenu.id, f.id)}>{f.name}</CtxItem>
          ))}
        </>}
        <CtxDivider />
        <CtxItem icon={<TrashIcon size={12} />} onClick={() => deleteNote(ctxMenu.id)} danger>Delete note</CtxItem>
      </>
    }
    if (ctxMenu.type === 'sidebar') {
      return <>
        <CtxItem icon={<FileIcon size={12} color="currentColor" />}
          onClick={() => { createNote(); setCtxMenu(null) }}>New note</CtxItem>
        <CtxItem icon={<FolderIcon size={12} color="currentColor" />}
          onClick={() => { createFolder(); setCtxMenu(null) }}>New folder</CtxItem>
        <CtxDivider />
        <CtxItem icon={<CalendarIcon size={12} color="currentColor" />}
          onClick={() => { createDailyNote(); setCtxMenu(null) }}>Today's note</CtxItem>
      </>
    }
    if (ctxMenu.type === 'folder') {
      const folder = data.folders[ctxMenu.id]; if (!folder) return null
      const parentFolders = allFoldersSorted.filter(f => f.id !== ctxMenu.id && !collectDescendants(data.folders, ctxMenu.id).has(f.id))
      return <>
        <CtxItem icon={<PencilIcon size={12} />} onClick={() => startRename('folder', ctxMenu.id, folder.name)}>Rename</CtxItem>
        <CtxItem icon={<FileIcon size={12} color="currentColor" />} onClick={() => { createNote(ctxMenu.id); setOpenFolders(o => ({ ...o, [ctxMenu.id]: true })); setCtxMenu(null) }}>New note here</CtxItem>
        <CtxItem icon={<FolderIcon size={12} color="currentColor" />} onClick={() => { createFolder(ctxMenu.id); setCtxMenu(null) }}>New subfolder</CtxItem>
        {(parentFolders.length > 0 || folder.parent_id) && <>
          <CtxDivider label="Move to" />
          {folder.parent_id && <CtxItem icon={<FolderIcon size={12} color="currentColor" />} onClick={() => { moveFolder(ctxMenu.id, null); setCtxMenu(null) }}>Root (top level)</CtxItem>}
          {parentFolders.filter(f => f.id !== folder.parent_id).map(f => (
            <CtxItem key={f.id} icon={<FolderIcon size={12} color="currentColor" />} onClick={() => { moveFolder(ctxMenu.id, f.id); setCtxMenu(null) }}>{f.name}</CtxItem>
          ))}
        </>}
        <CtxDivider />
        <CtxItem icon={<TrashIcon size={12} />} onClick={() => deleteFolder(ctxMenu.id)} danger>Delete folder</CtxItem>
      </>
    }
    return null
  }

  // ── Recursive folder tree renderer ─────────────────────────────────────────
  function renderFolderNode(folderId, depth = 0) {
    const isUnfiled = folderId === '__unfiled__'
    const folder    = isUnfiled ? { id: '__unfiled__', name: 'Unfiled' } : data.folders[folderId]
    if (!folder) return null

    const notes      = notesByFolder[folderId] || []
    const children   = isUnfiled ? [] : getSubfolders(data.folders, folderId)
    const isOpen     = openFolders[folderId] !== false
    const isDrop     = dragOverTarget === folderId
    const isDragging = !isUnfiled && dragItem?.type === 'folder' && dragItem.id === folderId
    const isRenaming = !isUnfiled && renaming?.type === 'folder' && renaming.id === folderId
    const pad        = 10 + depth * 14
    const FIcon      = isOpen ? FolderOpenIcon : FolderIcon

    return (
      <div key={folderId} style={{ opacity: isDragging ? 0.4 : 1 }}>
        {/* Folder header row */}
        <div
          draggable={!isUnfiled}
          onDragStart={isUnfiled ? undefined : e => onFolderDragStart(e, folderId)}
          onDragEnd={onDragEnd}
          onDragOver={e => onFolderDragOver(e, folderId)}
          onDragLeave={onFolderDragLeave}
          onDrop={e => onFolderDrop(e, folderId)}
          onContextMenu={isUnfiled ? undefined : e => openCtx('folder', folderId, e)}
          style={{ display: 'flex', alignItems: 'center', gap: 4,
            padding: `5px 8px 5px ${pad}px`, margin: '0 4px 1px', borderRadius: 6,
            background: isDrop ? 'var(--accent)22' : 'transparent',
            border: isDrop ? '1px dashed var(--accent)' : '1px solid transparent',
            cursor: isUnfiled ? 'default' : 'grab',
            transition: 'background .1s, border-color .1s' }}>

          <span onClick={() => setOpenFolders(o => ({ ...o, [folderId]: !isOpen }))}
            style={{ display: 'flex', alignItems: 'center', gap: 5, flex: 1, minWidth: 0, cursor: 'pointer' }}>
            <span style={{ color: 'var(--text3)', flexShrink: 0, display: 'flex' }}>
              {isOpen ? <ChevronDownIcon  size={10} color="currentColor" />
                      : <ChevronRightIcon size={10} color="currentColor" />}
            </span>
            <span style={{ color: isUnfiled ? 'var(--text3)' : 'var(--accent)', flexShrink: 0, display: 'flex' }}>
              <FIcon size={12} color="currentColor" />
            </span>
            {isRenaming ? (
              <input ref={renameRef} value={renameVal}
                onChange={e => setRenameVal(e.target.value)}
                onBlur={commitRename}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') commitRename() }}
                onClick={e => e.stopPropagation()}
                style={{ flex: 1, fontSize: 12, fontWeight: 600, background: 'var(--surface2)',
                  border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 5px',
                  color: 'var(--text)', minWidth: 0 }} />
            ) : (
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600,
                color: isUnfiled ? 'var(--text3)' : 'var(--text2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {folder.name}
              </span>
            )}
          </span>

          <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{notes.length}</span>

          {!isUnfiled && (
            <button onClick={e => openCtx('folder', folderId, e)}
              style={{ background: 'none', border: 'none', cursor: 'pointer',
                color: 'var(--text3)', padding: '1px 3px', borderRadius: 3, flexShrink: 0, display: 'flex' }}
              onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.background = 'var(--surface2)' }}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}>
              <DotsHIcon size={12} color="currentColor" />
            </button>
          )}
        </div>

        {/* Expanded content — with Obsidian-style indent guide */}
        {isOpen && (
          <div style={{ position: 'relative' }}>
            {/* Vertical indent guide line */}
            {!isUnfiled && (
              <div style={{ position: 'absolute', left: pad + 13, top: 2, bottom: 10,
                width: 1, background: 'var(--border2)', borderRadius: 1, pointerEvents: 'none' }} />
            )}
            {children.map(cf => renderFolderNode(cf.id, depth + 1))}
            {notes.map(note => (
              <NoteRow key={note.id} note={note} active={activeId === note.id}
                dragging={dragItem?.type === 'note' && dragItem.ids?.includes(note.id)}
                selected={!!selectedIds[note.id]}
                inSelectionMode={selCount > 0}
                indent={pad + 14}
                renaming={renaming?.type === 'note' && renaming.id === note.id}
                renameVal={renameVal} renameRef={renameRef}
                onRenameChange={setRenameVal} onRenameCommit={commitRename}
                onSelect={() => { setActiveId(note.id); if (isMobile) setShowSidebar(false) }}
                onToggleSelect={() => toggleSelect(note.id)}
                onContextMenu={e => openCtx('note', note.id, e)}
                onDotsClick={e => openCtx('note', note.id, e)}
                onDragStart={e => onNoteDragStart(e, note.id)}
                onDragEnd={onDragEnd}
              />
            ))}
            <button onClick={() => { createNote(isUnfiled ? null : folderId); if (!isUnfiled) setOpenFolders(o => ({ ...o, [folderId]: true })) }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer',
                padding: `3px 8px 4px ${pad + 14}px`, fontSize: 11, color: 'var(--text3)', borderRadius: 4 }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text3)' }}>
              <PlusIcon size={9} color="currentColor" /> New note here
            </button>
          </div>
        )}
      </div>
    )
  }

  // ── Layout ─────────────────────────────────────────────────────────────────
  const OUTER_H   = '100%'
  const SIDEBAR_W = 260

  // Determine sidebar display mode
  const sidebarMode = q ? 'search' : activeTag ? 'tag' : 'tree'

  // Sidebar content — shared between desktop inline and mobile drawer
  const sidebarContent = (
    <>
      {/* Header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          {isMobile && (
            <button onClick={() => setShowSidebar(false)}
              style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer',
                padding: '0 6px 0 0', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
              <ChevronLeftIcon size={18} color="currentColor" />
            </button>
          )}
          <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1 }}>Notebook</span>
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>
            {Object.keys(data.notes).length} note{Object.keys(data.notes).length !== 1 ? 's' : ''}
          </span>
          {/* Sort picker */}
          <select value={sortBy} onChange={e => setSortBy(e.target.value)}
            title="Sort notes by"
            style={{ fontSize: 10, background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 5, padding: '2px 4px', color: 'var(--text2)', cursor: 'pointer' }}>
            <option value="modified">Modified</option>
            <option value="created">Created</option>
            <option value="title">Title</option>
          </select>
          {/* + dropdown */}
          <div style={{ position: 'relative' }}>
            <button
              onMouseDown={e => e.stopPropagation()}
              onClick={e => { e.stopPropagation(); setPlusOpen(p => !p); setCtxMenu(null) }}
              style={{ display: 'flex', alignItems: 'center', gap: 3,
                background: plusOpen ? 'var(--accent)' : 'var(--surface2)',
                color: plusOpen ? '#fff' : 'var(--text2)',
                border: '1px solid ' + (plusOpen ? 'transparent' : 'var(--border)'),
                borderRadius: 6, padding: '3px 7px', cursor: 'pointer' }}
              title="New…">
              <PlusIcon size={11} color="currentColor" />
              <ChevronDownIcon size={9} color="currentColor" />
            </button>
            {plusOpen && (
              <div onMouseDown={e => e.stopPropagation()}
                style={{ position: 'absolute', right: 0, top: '110%', zIndex: 300,
                  background: 'var(--surface)', border: '1px solid var(--border2)',
                  borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
                  minWidth: 160, overflow: 'hidden' }}>
                <CtxItem icon={<FileIcon size={12} color="currentColor" />}
                  onClick={() => { createNote(); setPlusOpen(false) }}>New note</CtxItem>
                <CtxItem icon={<FolderIcon size={12} color="currentColor" />}
                  onClick={() => { createFolder(); setPlusOpen(false) }}>New folder</CtxItem>
                <CtxDivider />
                <CtxItem icon={<CalendarIcon size={12} color="currentColor" />}
                  onClick={createDailyNote}>Today's note</CtxItem>
              </div>
            )}
          </div>
        </div>

        <input type="text" value={search} onChange={e => { setSearch(e.target.value); if (e.target.value) setActiveTag(null) }}
          placeholder="Search notes…"
          style={{ width: '100%', padding: '6px 10px', fontSize: 13, borderRadius: 6,
            background: 'var(--surface2)', border: '1px solid var(--border2)',
            color: 'var(--text)', boxSizing: 'border-box' }} />
      </div>

      {/* Selection bar — shown when notes are ctrl+clicked */}
      {selCount > 0 && (
        <div style={{ padding: '6px 10px', background: 'var(--accent)22',
          borderBottom: '1px solid var(--accent)44', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ flex: 1, fontSize: 11, fontWeight: 700, color: 'var(--accent)' }}>
            {selCount} selected
          </span>
          <button onClick={deleteSelected}
            style={{ background: 'var(--danger)', color: '#fff', border: 'none',
              borderRadius: 5, padding: '3px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>
            Delete
          </button>
          <button onClick={clearSelection}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text2)', borderRadius: 5, padding: '4px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center' }}>
            <XIcon size={11} color="currentColor" />
          </button>
        </div>
      )}

      {/* Tree / search / tag results */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0', WebkitOverflowScrolling: 'touch' }}
        onContextMenu={e => {
          // Only fires on empty space — child items call e.stopPropagation() in their own handlers
          e.preventDefault()
          const x = Math.min(e.clientX, window.innerWidth  - 190)
          const y = Math.min(e.clientY, window.innerHeight - 160)
          setCtxMenu({ type: 'sidebar', x, y })
        }}>
        {sidebarMode === 'search' ? (
          <div>
            <SectionLabel>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}</SectionLabel>
            {searchResults.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>No matches.</div>
            )}
            {searchResults.map(note => (
              <NoteRow key={note.id} note={note} active={activeId === note.id}
                dragging={dragItem?.type === 'note' && dragItem.ids?.includes(note.id)}
                selected={!!selectedIds[note.id]} inSelectionMode={selCount > 0} indent={10}
                renaming={renaming?.type === 'note' && renaming.id === note.id}
                renameVal={renameVal} renameRef={renameRef}
                onRenameChange={setRenameVal} onRenameCommit={commitRename}
                onSelect={() => { setActiveId(note.id); if (isMobile) setShowSidebar(false) }}
                onToggleSelect={() => toggleSelect(note.id)}
                onContextMenu={e => openCtx('note', note.id, e)}
                onDotsClick={e => openCtx('note', note.id, e)}
                onDragStart={e => onNoteDragStart(e, note.id)}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
        ) : sidebarMode === 'tag' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', padding: '2px 8px 4px' }}>
              <SectionLabel>#{activeTag}</SectionLabel>
              <button onClick={() => setActiveTag(null)}
                style={{ background: 'none', border: 'none', color: 'var(--text3)',
                  cursor: 'pointer', padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 3, fontSize: 11 }}>
                <XIcon size={9} color="currentColor" /> clear
              </button>
            </div>
            {tagResults.length === 0 && (
              <div style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>No notes with #{activeTag}.</div>
            )}
            {tagResults.map(note => (
              <NoteRow key={note.id} note={note} active={activeId === note.id}
                dragging={dragItem?.type === 'note' && dragItem.ids?.includes(note.id)}
                selected={!!selectedIds[note.id]} inSelectionMode={selCount > 0} indent={10}
                renaming={renaming?.type === 'note' && renaming.id === note.id}
                renameVal={renameVal} renameRef={renameRef}
                onRenameChange={setRenameVal} onRenameCommit={commitRename}
                onSelect={() => { setActiveId(note.id); if (isMobile) setShowSidebar(false) }}
                onToggleSelect={() => toggleSelect(note.id)}
                onContextMenu={e => openCtx('note', note.id, e)}
                onDotsClick={e => openCtx('note', note.id, e)}
                onDragStart={e => onNoteDragStart(e, note.id)}
                onDragEnd={onDragEnd}
              />
            ))}
          </div>
        ) : (
          /* Folder tree */
          <div
            onDragOver={e => { if (dragItemRef.current?.type === 'folder') { e.preventDefault(); e.dataTransfer.dropEffect = 'move' } }}
            onDrop={onRootDrop}>
            {rootFolders.map(f => renderFolderNode(f.id, 0))}
            {/* Unfiled — visually separated with subtle tint */}
            <div style={{ margin: '6px 4px 0', borderTop: '1px solid var(--border)' }} />
            <div style={{ background: 'var(--surface2)', borderRadius: 8, margin: '4px 4px 0', padding: '2px 0 4px' }}>
              {renderFolderNode('__unfiled__', 0)}
            </div>
          </div>
        )}

        {/* Tags section */}
        {sidebarMode === 'tree' && allTags.length > 0 && (
          <div style={{ borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
            <SectionLabel>Tags</SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '0 8px 8px' }}>
              {allTags.map(tag => (
                <button key={tag} onClick={() => setActiveTag(t => t === tag ? null : tag)}
                  style={{
                    background: activeTag === tag ? 'var(--accent)' : 'var(--surface2)',
                    color: activeTag === tag ? '#fff' : 'var(--text2)',
                    border: '1px solid ' + (activeTag === tag ? 'var(--accent)' : 'var(--border)'),
                    borderRadius: 10, padding: '2px 8px', fontSize: 11, cursor: 'pointer',
                    transition: 'background .1s',
                  }}>
                  #{tag}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Sidebar footer — export buttons */}
      <div style={{ borderTop: '1px solid var(--border)', padding: '8px 10px', flexShrink: 0 }}>
        {/* Notebook import status */}
        {nbImportStatus && (
          <div style={{
            marginBottom: 6, fontSize: 11, padding: '5px 8px', borderRadius: 6,
            background: nbImportStatus.startsWith('Error') ? 'var(--danger)22' : 'var(--success)22',
            color: nbImportStatus.startsWith('Error') ? 'var(--danger)' : 'var(--success)',
            border: '1px solid ' + (nbImportStatus.startsWith('Error') ? 'var(--danger)44' : 'var(--success)44'),
          }}>{nbImportStatus}</div>
        )}
        {/* Hidden file input for notebook import */}
        <input ref={nbImportRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleImportNotebook} />
        {/* Hide sidebar (desktop only) */}
        {!isMobile && (
          <button
            onClick={() => setSidebarHidden(true)}
            style={{ width: '100%', marginBottom: 6, background: 'none', border: '1px solid var(--border)',
              borderRadius: 7, padding: '5px 8px', cursor: 'pointer',
              color: 'var(--text3)', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text2)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text3)' }}>
            <ChevronLeftIcon size={11} color="currentColor" /> Hide sidebar
          </button>
        )}
        <div style={{ display: 'flex', gap: 6 }}>
        {activeNote && (
          <button onClick={() => exportNoteAsMd(activeNote)}
            title="Download current note as a .md file"
            style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 7, padding: '7px 8px', cursor: 'pointer',
              color: 'var(--text2)', fontSize: 11, fontWeight: 500 }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)22'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}>
            Export Note
          </button>
        )}
        <button onClick={() => {
            const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
            const url = URL.createObjectURL(blob)
            const a = document.createElement('a')
            a.href = url; a.download = `rm_notebook_${new Date().toISOString().slice(0,10)}.json`
            a.click(); URL.revokeObjectURL(url)
          }}
          title="Download entire notebook as JSON"
          style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 7, padding: '7px 8px', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 11, fontWeight: 500 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)22'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}>
          Export Notebook
        </button>
        <button
          onClick={() => nbImportRef.current?.click()}
          title="Import a previously exported notebook JSON file"
          style={{ flex: 1, background: 'var(--surface2)', border: '1px solid var(--border)',
            borderRadius: 7, padding: '7px 8px', cursor: 'pointer',
            color: 'var(--text2)', fontSize: 11, fontWeight: 500 }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)22'; e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--text)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}>
          Import Notebook
        </button>
        </div>
      </div>
    </>
  )

  return (
    <div style={{ display: 'flex', height: OUTER_H, overflow: 'hidden', position: 'relative' }}>

      {/* ── DESKTOP SIDEBAR — inline ──────────────────────────── */}
      {!isMobile && !sidebarHidden && (
        <div style={{ width: SIDEBAR_W, flexShrink: 0, display: 'flex',
          flexDirection: 'column', borderRight: '1px solid var(--border)',
          background: 'var(--surface)', overflow: 'hidden' }}>
          {sidebarContent}
        </div>
      )}

      {/* ── MOBILE SIDEBAR — overlay drawer ──────────────────── */}
      {isMobile && showSidebar && (
        <>
          {/* Backdrop — absolute within the notebook panel */}
          <div onClick={() => setShowSidebar(false)}
            style={{ position: 'absolute', inset: 0, zIndex: 198,
              background: 'rgba(0,0,0,0.55)' }} />
          {/* Drawer — absolute within the notebook panel */}
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, zIndex: 199,
            width: '82vw', maxWidth: 320, display: 'flex', flexDirection: 'column',
            background: 'var(--surface)', boxShadow: '4px 0 28px rgba(0,0,0,0.5)',
            overflow: 'hidden' }}>
            {sidebarContent}
          </div>
        </>
      )}

      {/* ── EDITOR — always visible ───────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg)' }}>
        {activeNote ? (
            <>
              {/* Header */}
              <div style={{ padding: '10px 16px 0', borderBottom: '1px solid var(--border)',
                background: 'var(--surface)', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  {(isMobile || sidebarHidden) && (
                    <button
                      onClick={() => isMobile ? setShowSidebar(true) : setSidebarHidden(false)}
                      title="Open notes list"
                      style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                        color: 'var(--text2)', cursor: 'pointer', padding: '5px 8px',
                        flexShrink: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <MenuIcon size={15} color="currentColor" />
                    </button>
                  )}
                  <input ref={titleRef} value={activeNote.title}
                    onChange={e => updateNote(activeId, { title: e.target.value })}
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); editor?.commands.focus() } }}
                    style={{ flex: 1, fontSize: 18, fontWeight: 700, color: 'var(--text)',
                      background: 'transparent', border: 'none', boxShadow: 'none', padding: '2px 0', minWidth: 0 }}
                    placeholder="Note title…" />
                  <button onClick={() => updateNote(activeId, { pinned: !activeNote.pinned })}
                    title={activeNote.pinned ? 'Unpin' : 'Pin note'}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                      color: activeNote.pinned ? 'var(--accent)' : 'var(--text3)', flexShrink: 0, display: 'flex' }}>
                    <PinIcon size={15} filled={activeNote.pinned} color="currentColor" />
                  </button>
                  <select value={activeNote.folder_id || ''}
                    onChange={e => updateNote(activeId, { folder_id: e.target.value || null })}
                    style={{ fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border)',
                      borderRadius: 5, padding: '3px 6px', color: 'var(--text2)', maxWidth: 120, flexShrink: 0 }}>
                    <option value="">Unfiled</option>
                    {allFoldersSorted.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                  <button onClick={() => deleteNote(activeId)} title="Delete note"
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px',
                      color: 'var(--text3)', flexShrink: 0, display: 'flex' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>
                    <TrashIcon size={14} color="currentColor" />
                  </button>
                </div>

                {/* Toolbar */}
                <div className="notebook-toolbar" style={{ display: 'flex', alignItems: 'center', gap: 2, paddingBottom: 8, flexWrap: 'wrap' }}>
                  <TGroup>
                    <TBtn onClick={() => editor?.chain().focus().toggleBold().run()}
                      active={fmt.bold}      title="Bold (Ctrl+B)"><strong>B</strong></TBtn>
                    <TBtn onClick={() => editor?.chain().focus().toggleItalic().run()}
                      active={fmt.italic}    title="Italic (Ctrl+I)"><em>I</em></TBtn>
                    <TBtn onClick={() => editor?.chain().focus().toggleStrike().run()}
                      active={fmt.strike}    title="Strikethrough"><del>S</del></TBtn>
                  </TGroup>
                  <TGroup>
                    <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()}
                      active={fmt.h1}        title="Heading 1">H1</TBtn>
                    <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()}
                      active={fmt.h2}        title="Heading 2">H2</TBtn>
                    <TBtn onClick={() => editor?.chain().focus().toggleHeading({ level: 3 }).run()}
                      active={fmt.h3}        title="Heading 3">H3</TBtn>
                  </TGroup>
                  <TGroup>
                    <TBtn onClick={() => editor?.chain().focus().toggleCode().run()}
                      active={fmt.code}      title="Inline code">{'<>'}</TBtn>
                    <TBtn onClick={() => editor?.chain().focus().toggleCodeBlock().run()}
                      active={fmt.codeBlock} title="Code block">{'```'}</TBtn>
                    <TBtn onClick={() => editor?.chain().focus().toggleBlockquote().run()}
                      active={fmt.quote}     title="Blockquote">"</TBtn>
                  </TGroup>
                  <TGroup>
                    <TBtn onClick={() => editor?.chain().focus().toggleBulletList().run()}
                      active={fmt.ul}        title="Bullet list">• List</TBtn>
                    <TBtn onClick={() => editor?.chain().focus().toggleOrderedList().run()}
                      active={fmt.ol}        title="Numbered list">1. List</TBtn>
                    <TBtn onClick={() => editor?.chain().focus().toggleTaskList().run()}
                      active={fmt.task}      title="Task checkbox">[ ] Task</TBtn>
                    <TBtn onClick={() => editor?.chain().focus().setHorizontalRule().run()}
                      title="Horizontal rule">─</TBtn>
                  </TGroup>
                  <div style={{ flex: 1 }} />
                </div>
              </div>

              {/* Rich text editor — Tiptap */}
              <EditorContent
                editor={editor}
                style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}
              />

              {/* Status bar */}
              <div style={{ padding: '4px 16px', borderTop: '1px solid var(--border)', flexShrink: 0,
                display: 'flex', gap: 12, alignItems: 'center', fontSize: 10, color: 'var(--text3)' }}>
                <span>{wordCount(activeNote.content)} words</span>
                <span>·</span>
                <span>{activeNote.content?.length ?? 0} chars</span>
                <span>·</span>
                <span>Saved {fmtRelative(activeNote.updated_at)}</span>
                {activeNote.pinned && (
                  <><span>·</span><span style={{ color: 'var(--accent)', display: 'flex', alignItems: 'center', gap: 3 }}>
                    <PinIcon size={9} filled color="currentColor" /> Pinned
                  </span></>
                )}
                {activeNote.color && (
                  <><span>·</span><span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: NOTE_COLORS[activeNote.color], display: 'inline-block' }} />
                    {activeNote.color}
                  </span></>
                )}
              </div>
            </>
          ) : (
            /* Empty state */
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', color: 'var(--text3)', gap: 12, padding: 24, position: 'relative' }}>
              {(isMobile || sidebarHidden) && (
                <button
                  onClick={() => isMobile ? setShowSidebar(true) : setSidebarHidden(false)}
                  title="Open notes list"
                  style={{ position: 'absolute', top: 12, left: 12,
                    background: 'var(--surface)', border: '1px solid var(--border2)',
                    borderRadius: 8, color: 'var(--text2)', cursor: 'pointer',
                    padding: '7px 10px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.25)', display: 'flex', alignItems: 'center' }}>
                  <MenuIcon size={16} color="currentColor" />
                </button>
              )}
              <div style={{ opacity: 0.25 }}><FileIcon size={44} color="var(--text)" /></div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>No note open</div>
              <div style={{ fontSize: 12, textAlign: 'center', maxWidth: 240 }}>
                Select a note from the sidebar or create a new one
              </div>
              <button onClick={() => createNote()}
                style={{ display: 'flex', alignItems: 'center', gap: 6,
                  background: 'var(--accent)', color: '#fff', border: 'none',
                  borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 600, cursor: 'pointer', marginTop: 4 }}>
                <PlusIcon size={13} color="#fff" /> New Note
              </button>
            </div>
          )}
        </div>

      {/* ── CONTEXT MENU ─────────────────────────────────────────── */}
      {ctxMenu && (
        <div onMouseDown={e => e.stopPropagation()}
          style={{ position: 'fixed', left: ctxMenu.x, top: ctxMenu.y, zIndex: 9999,
            background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 9,
            boxShadow: '0 6px 24px rgba(0,0,0,0.5)', minWidth: 170, overflow: 'hidden' }}>
          {renderCtxItems()}
        </div>
      )}

      {/* ── CONFIRM DIALOG ───────────────────────────────────────── */}
      {confirmDlg && (
        <>
          <div onClick={() => setConfirmDlg(null)}
            style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)' }} />
          <div style={{ position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
            padding: '24px 28px', maxWidth: 320, width: '90vw' }}>
            <div style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.5, marginBottom: 20 }}>
              {confirmDlg.message}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDlg(null)}
                style={{ padding: '7px 18px', borderRadius: 8, border: '1px solid var(--border2)',
                  background: 'var(--surface2)', color: 'var(--text2)', fontSize: 13,
                  fontWeight: 500, cursor: 'pointer' }}>
                Cancel
              </button>
              <button onClick={() => { confirmDlg.onConfirm(); setConfirmDlg(null) }}
                style={{ padding: '7px 18px', borderRadius: 8, border: 'none',
                  background: 'var(--danger)', color: '#fff', fontSize: 13,
                  fontWeight: 600, cursor: 'pointer' }}>
                Delete
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── NoteRow ───────────────────────────────────────────────────────────────────

function NoteRow({ note, active, dragging, selected, inSelectionMode, indent = 10,
  renaming, renameVal, renameRef,
  onRenameChange, onRenameCommit, onSelect, onToggleSelect, onContextMenu, onDotsClick,
  onDragStart, onDragEnd }) {
  const dotColor = note.color ? NOTE_COLORS[note.color] : null

  function handleClick(e) {
    if (e.ctrlKey || e.metaKey) { e.preventDefault(); onToggleSelect?.(); return }
    if (inSelectionMode) { onToggleSelect?.(); return }
    onSelect()
  }

  const bg = dragging ? 'var(--surface2)'
    : selected    ? 'var(--accent)33'
    : active      ? (note.color ? NOTE_COLOR_ACTIVE[note.color]  : 'var(--accent)20')
    :               (note.color ? NOTE_COLOR_PASSIVE[note.color] : 'transparent')

  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onContextMenu={onContextMenu}
      onClick={handleClick}
      style={{ display: 'flex', alignItems: 'flex-start',
        padding: `5px 8px 5px ${indent}px`,
        gap: 5, cursor: 'pointer', borderRadius: 6, margin: '0 4px 1px',
        background: bg,
        outline: selected ? '1.5px solid var(--accent)' : 'none',
        outlineOffset: -1,
        opacity: dragging ? 0.4 : 1, transition: 'opacity .15s, background .1s' }}
      onMouseEnter={e => { if (!active && !dragging && !selected) e.currentTarget.style.background = note.color ? NOTE_COLOR_ACTIVE[note.color] : 'var(--surface2)' }}
      onMouseLeave={e => { if (!active && !dragging && !selected) e.currentTarget.style.background = bg }}>

      {/* Selection checkbox or note icon */}
      <span style={{
        color: selected ? 'var(--accent)' : dotColor ?? (active ? 'var(--accent)' : note.pinned ? 'var(--accent)' : 'var(--text3)'),
        flexShrink: 0, marginTop: 1, display: 'flex' }}>
        {selected ? (
          <span style={{ width: 11, height: 11, borderRadius: 3, background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <CheckIcon size={8} color="#fff" />
          </span>
        ) : note.pinned ? (
          <PinIcon size={11} filled color="currentColor" />
        ) : (
          <FileIcon size={11} color="currentColor" />
        )}
      </span>

      <div style={{ flex: 1, minWidth: 0 }}>
        {renaming ? (
          <input ref={renameRef} value={renameVal}
            onChange={e => onRenameChange(e.target.value)}
            onBlur={onRenameCommit}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') onRenameCommit() }}
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', fontSize: 12, fontWeight: 600, background: 'var(--surface2)',
              border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 5px',
              color: 'var(--text)', boxSizing: 'border-box' }} />
        ) : (
          <div style={{ fontSize: 12, fontWeight: active ? 700 : 500,
            color: active ? 'var(--text)' : 'var(--text2)',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {note.title || 'Untitled'}
          </div>
        )}
        <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>
          {fmtRelative(note.updated_at)}
        </div>
      </div>

      <button onClick={onDotsClick}
        style={{ background: 'none', border: 'none', cursor: 'pointer',
          color: 'var(--text3)', padding: '1px 2px', flexShrink: 0, marginTop: 1,
          display: 'flex', alignItems: 'center', borderRadius: 3 }}
        onMouseEnter={e => { e.stopPropagation(); e.currentTarget.style.color = 'var(--text)' }}
        onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}>
        <DotsHIcon size={13} color="currentColor" />
      </button>
    </div>
  )
}

// ── Shared primitives ─────────────────────────────────────────────────────────

function TGroup({ children }) {
  return (
    <div style={{ display: 'flex', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden', marginRight: 2 }}>
      {children}
    </div>
  )
}
function TBtn({ onClick, title, active, children }) {
  return (
    <button
      onMouseDown={e => e.preventDefault()} // keep editor focus + selection intact
      onClick={onClick}
      title={title}
      style={{
        background: active ? 'var(--accent)' : 'transparent',
        border: 'none', borderRight: '1px solid var(--border)',
        color: active ? '#fff' : 'var(--text2)',
        padding: '3px 8px', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit', lineHeight: 1.4,
        transition: 'background 0.1s, color 0.1s',
      }}
      onMouseEnter={e => {
        if (active) return
        e.currentTarget.style.background = 'var(--surface2)'; e.currentTarget.style.color = 'var(--text)'
      }}
      onMouseLeave={e => {
        if (active) return
        e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text2)'
      }}>
      {children}
    </button>
  )
}
function CtxItem({ onClick, icon, children, danger }) {
  return (
    <button onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        textAlign: 'left', background: 'none', border: 'none', padding: '7px 12px',
        fontSize: 12, cursor: 'pointer', color: danger ? 'var(--danger)' : 'var(--text)', fontFamily: 'inherit' }}
      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface2)'}
      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
      {icon && <span style={{ color: danger ? 'var(--danger)' : 'var(--text3)', flexShrink: 0 }}>{icon}</span>}
      {children}
    </button>
  )
}
function CtxDivider({ label }) {
  return (
    <div style={{ borderTop: '1px solid var(--border)', margin: '2px 0' }}>
      {label && <div style={{ padding: '4px 12px 0', fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>}
    </div>
  )
}
function SectionLabel({ children }) {
  return <div style={{ padding: '2px 14px 4px', fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{children}</div>
}
