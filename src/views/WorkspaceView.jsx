// Multi-pane (tiled) workspace view.
//
// Layout shape (stored per character in char.workspace_layout):
//   { rows: [{ size, panes: [{ view, size }] }] }
//
//   - `rows` is the vertical split (top→bottom)
//   - each row holds horizontal panes
//   - `view` is a route name: 'sheet' | 'skills' | 'spells' | 'gear' | 'notebook' | 'levelup' | 'reference'
//   - `size` is % share within its container
//
// Layout changes persist back to the character via updateCharacter.
//
// Mobile (<800px wide): collapses to a single vertical stack, capped at 2 visible panes.

import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useCharacter } from '../store/CharacterContext.jsx'
import { XIcon, PlusIcon, ChevronDownIcon } from '../components/Icons.jsx'
import CharacterSheet from './CharacterSheet.jsx'
import SkillsView     from './SkillsView.jsx'
import SpellsView     from './SpellsView.jsx'
import EquipmentView  from './EquipmentView.jsx'
import NotebookView   from './NotebookView.jsx'
import LevelUpView    from './LevelUpView.jsx'
import ReferenceView  from './ReferenceView.jsx'
import WelcomeView    from './WelcomeView.jsx'

// ── View registry ─────────────────────────────────────────────────────────
const VIEWS = {
  sheet:     { label: 'Sheet',     component: CharacterSheet, requiresChar: true  },
  skills:    { label: 'Skills',    component: SkillsView,     requiresChar: true  },
  spells:    { label: 'Spells',    component: SpellsView,     requiresChar: false },
  gear:      { label: 'Gear',      component: EquipmentView,  requiresChar: true  },
  notebook:  { label: 'Notes',     component: NotebookView,   requiresChar: false },
  levelup:   { label: 'Level Up',  component: LevelUpView,    requiresChar: true  },
  reference: { label: 'Reference', component: ReferenceView,  requiresChar: false },
}
const VIEW_KEYS = Object.keys(VIEWS)

// ── Default layouts ───────────────────────────────────────────────────────
function defaultLayout() {
  // 2-column split: Sheet | Skills
  return {
    rows: [
      { size: 100, panes: [
        { view: 'sheet',  size: 50 },
        { view: 'skills', size: 50 },
      ]},
    ],
  }
}

const PRESETS = {
  '1×1 single':   { rows: [{ size: 100, panes: [{ view: 'sheet',  size: 100 }] }] },
  '2 columns':    { rows: [{ size: 100, panes: [{ view: 'sheet',  size: 50  }, { view: 'skills', size: 50  }] }] },
  '3 columns':    { rows: [{ size: 100, panes: [{ view: 'sheet',  size: 34  }, { view: 'skills', size: 33  }, { view: 'spells', size: 33 }] }] },
  '2 rows':       { rows: [
                     { size: 50, panes: [{ view: 'sheet',  size: 100 }] },
                     { size: 50, panes: [{ view: 'skills', size: 100 }] },
                   ] },
  '2 × 2 grid':   { rows: [
                     { size: 50, panes: [{ view: 'sheet',  size: 50 }, { view: 'skills',    size: 50 }] },
                     { size: 50, panes: [{ view: 'spells', size: 50 }, { view: 'reference', size: 50 }] },
                   ] },
  'sidebar 30/70':{ rows: [{ size: 100, panes: [{ view: 'sheet',  size: 30  }, { view: 'skills', size: 70  }] }] },
}

// ── Mobile detection ──────────────────────────────────────────────────────
function useIsNarrow(threshold = 800) {
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.innerWidth < threshold)
  useEffect(() => {
    const on = () => setNarrow(window.innerWidth < threshold)
    window.addEventListener('resize', on)
    return () => window.removeEventListener('resize', on)
  }, [threshold])
  return narrow
}

// Clamp a layout to mobile constraints: single column, max 2 stacked panes.
function clampToMobile(layout) {
  // Flatten all panes into a single column, max 2.
  const allPanes = layout.rows.flatMap(r => r.panes)
  const limited = allPanes.slice(0, 2)
  if (limited.length === 1) {
    return { rows: [{ size: 100, panes: [{ ...limited[0], size: 100 }] }] }
  }
  return {
    rows: limited.map(p => ({ size: 50, panes: [{ ...p, size: 100 }] })),
  }
}

// ── Main view ─────────────────────────────────────────────────────────────
export default function WorkspaceView() {
  const { activeChar, updateCharacter } = useCharacter()
  const isNarrow = useIsNarrow()

  // Resolve current layout: per-character → fall back to default
  const storedLayout = activeChar?.workspace_layout
  const baseLayout   = storedLayout || defaultLayout()
  const layout       = isNarrow ? clampToMobile(baseLayout) : baseLayout

  // Debounced save back to character on layout edits
  const saveTimerRef = useRef(null)
  const saveLayout = useCallback((next) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    saveTimerRef.current = setTimeout(() => {
      updateCharacter({ workspace_layout: next })
    }, 250)
  }, [updateCharacter])

  function applyPreset(preset) {
    saveLayout(deepClone(PRESETS[preset]))
  }

  function changePaneView(rowIdx, paneIdx, view) {
    const next = deepClone(layout)
    next.rows[rowIdx].panes[paneIdx].view = view
    saveLayout(next)
  }

  function addPaneRight(rowIdx, paneIdx) {
    const next = deepClone(layout)
    const row = next.rows[rowIdx]
    // Take half of the current pane's size for the new pane
    const half = Math.floor(row.panes[paneIdx].size / 2)
    row.panes[paneIdx].size = half
    row.panes.splice(paneIdx + 1, 0, { view: nextUnusedView(layout), size: row.panes[paneIdx].size })
    saveLayout(next)
  }

  function addRowBelow(rowIdx) {
    const next = deepClone(layout)
    const half = Math.floor(next.rows[rowIdx].size / 2)
    next.rows[rowIdx].size = half
    next.rows.splice(rowIdx + 1, 0, { size: half, panes: [{ view: nextUnusedView(layout), size: 100 }] })
    saveLayout(next)
  }

  function removePane(rowIdx, paneIdx) {
    const next = deepClone(layout)
    const row = next.rows[rowIdx]
    row.panes.splice(paneIdx, 1)
    if (row.panes.length === 0) next.rows.splice(rowIdx, 1)
    // If the layout is now empty, fall back to default
    if (next.rows.length === 0) {
      saveLayout(defaultLayout())
    } else {
      // Normalize sizes so the remaining panes/rows fill the space
      normalizeLayout(next)
      saveLayout(next)
    }
  }

  function nextUnusedView() {
    const used = new Set(layout.rows.flatMap(r => r.panes.map(p => p.view)))
    return VIEW_KEYS.find(k => !used.has(k)) || 'reference'
  }

  // Handle PanelGroup resize → persist sizes
  function onRowResize(rowIdx, sizes) {
    const next = deepClone(layout)
    next.rows[rowIdx].panes.forEach((p, i) => { p.size = sizes[i] ?? p.size })
    saveLayout(next)
  }
  function onOuterResize(sizes) {
    const next = deepClone(layout)
    next.rows.forEach((r, i) => { r.size = sizes[i] ?? r.size })
    saveLayout(next)
  }

  if (!activeChar) return <WelcomeView />

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <WorkspaceToolbar
        isNarrow={isNarrow}
        onPreset={applyPreset}
      />

      <div style={{ flex: 1, minHeight: 0 }}>
        <PanelGroup
          direction="vertical"
          autoSaveId={`workspace-rows-${activeChar.id}`}
          onLayout={onOuterResize}
        >
          {layout.rows.map((row, rIdx) => (
            <React.Fragment key={rIdx}>
              {rIdx > 0 && <PanelResizeHandle style={resizeHandleStyle('horizontal')} />}
              <Panel defaultSize={row.size} minSize={10}>
                <PanelGroup
                  direction="horizontal"
                  autoSaveId={`workspace-row-${rIdx}-${activeChar.id}`}
                  onLayout={(s) => onRowResize(rIdx, s)}
                >
                  {row.panes.map((pane, pIdx) => (
                    <React.Fragment key={`${rIdx}-${pIdx}-${pane.view}`}>
                      {pIdx > 0 && <PanelResizeHandle style={resizeHandleStyle('vertical')} />}
                      <Panel defaultSize={pane.size} minSize={15}>
                        <PaneFrame
                          view={pane.view}
                          isNarrow={isNarrow}
                          onChangeView={(v) => changePaneView(rIdx, pIdx, v)}
                          onAddPaneRight={!isNarrow ? () => addPaneRight(rIdx, pIdx) : null}
                          onAddRowBelow={!isNarrow ? () => addRowBelow(rIdx) : null}
                          onRemove={() => removePane(rIdx, pIdx)}
                        />
                      </Panel>
                    </React.Fragment>
                  ))}
                </PanelGroup>
              </Panel>
            </React.Fragment>
          ))}
        </PanelGroup>
      </div>
    </div>
  )
}

// ── Single pane frame: header + body ──────────────────────────────────────
function PaneFrame({ view, isNarrow, onChangeView, onAddPaneRight, onAddRowBelow, onRemove }) {
  const def = VIEWS[view] || VIEWS.sheet
  const Component = def.component
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface)',
      border: '1px solid var(--border)',
      borderRadius: 6,
      overflow: 'hidden',
      margin: 1,
    }}>
      <PaneHeader
        view={view}
        onChangeView={onChangeView}
        onAddPaneRight={onAddPaneRight}
        onAddRowBelow={onAddRowBelow}
        onRemove={onRemove}
      />
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        <Component />
      </div>
    </div>
  )
}

function PaneHeader({ view, onChangeView, onAddPaneRight, onAddRowBelow, onRemove }) {
  return (
    <div style={{
      height: 30,
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: '0 6px 0 4px',
      background: 'var(--surface2)',
      borderBottom: '1px solid var(--border)',
      fontSize: 11,
    }}>
      <ViewPicker value={view} onChange={onChangeView} />
      <div style={{ flex: 1 }} />
      {onAddPaneRight && (
        <button title="Split pane right" onClick={onAddPaneRight} style={iconBtnStyle}>
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>|+</span>
        </button>
      )}
      {onAddRowBelow && (
        <button title="Add row below" onClick={onAddRowBelow} style={iconBtnStyle}>
          <span style={{ fontSize: 14, fontWeight: 700, lineHeight: 1 }}>_+</span>
        </button>
      )}
      <button title="Close pane" onClick={onRemove} style={iconBtnStyle}>
        <XIcon size={12} color="currentColor" />
      </button>
    </div>
  )
}

function ViewPicker({ value, onChange }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: 'var(--surface)',
        color: 'var(--text)',
        border: '1px solid var(--border)',
        borderRadius: 4,
        padding: '2px 6px',
        fontSize: 11,
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {VIEW_KEYS.map(k => (
        <option key={k} value={k}>{VIEWS[k].label}</option>
      ))}
    </select>
  )
}

// ── Toolbar (preset picker) ───────────────────────────────────────────────
function WorkspaceToolbar({ isNarrow, onPreset }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    function handle(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
  }, [])
  return (
    <div style={{
      flexShrink: 0,
      padding: '6px 10px',
      background: 'var(--surface)',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 8,
      fontSize: 11,
    }}>
      <span style={{ color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        Workspace
      </span>
      <div style={{ position: 'relative' }} ref={ref}>
        <button
          onClick={() => setOpen(o => !o)}
          style={{
            background: 'var(--surface2)',
            color: 'var(--text)',
            border: '1px solid var(--border)',
            borderRadius: 4,
            padding: '4px 8px',
            fontSize: 11,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          Presets <ChevronDownIcon size={12} color="currentColor" />
        </button>
        {open && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: 4,
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 6,
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
            zIndex: 100,
            minWidth: 160,
          }}>
            {Object.keys(PRESETS).map(p => (
              <button
                key={p}
                onClick={() => { onPreset(p); setOpen(false) }}
                style={{
                  display: 'block',
                  width: '100%',
                  textAlign: 'left',
                  background: 'transparent',
                  color: 'var(--text)',
                  border: 'none',
                  padding: '6px 10px',
                  fontSize: 11,
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface2)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                {p}
              </button>
            ))}
          </div>
        )}
      </div>
      {isNarrow && (
        <span style={{ color: 'var(--text3)', fontStyle: 'italic' }}>
          mobile: single column, max 2 stacked
        </span>
      )}
    </div>
  )
}

// ── Styling helpers ───────────────────────────────────────────────────────
const iconBtnStyle = {
  background: 'transparent',
  color: 'var(--text2)',
  border: 'none',
  cursor: 'pointer',
  padding: '2px 4px',
  display: 'flex',
  alignItems: 'center',
}

function resizeHandleStyle(direction) {
  // direction = 'horizontal' = a horizontal line (between top/bottom panes)
  //             'vertical'   = a vertical line (between left/right panes)
  if (direction === 'horizontal') {
    return {
      height: 4,
      background: 'var(--border)',
      cursor: 'row-resize',
      transition: 'background 0.15s',
    }
  }
  return {
    width: 4,
    background: 'var(--border)',
    cursor: 'col-resize',
    transition: 'background 0.15s',
  }
}

// ── Utilities ─────────────────────────────────────────────────────────────
function deepClone(v) { return JSON.parse(JSON.stringify(v)) }

function normalizeLayout(layout) {
  // Re-normalize sizes within each row + at the row level so they sum to ~100.
  for (const row of layout.rows) {
    const total = row.panes.reduce((s, p) => s + (p.size || 1), 0)
    if (total > 0) row.panes.forEach(p => { p.size = Math.round(((p.size || 1) / total) * 100) })
  }
  const totalRow = layout.rows.reduce((s, r) => s + (r.size || 1), 0)
  if (totalRow > 0) layout.rows.forEach(r => { r.size = Math.round(((r.size || 1) / totalRow) * 100) })
}
