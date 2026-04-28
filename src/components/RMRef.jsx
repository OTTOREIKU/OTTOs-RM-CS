import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'

import skillsData     from '../data/skills.json'
import weaponsData    from '../data/weapons.json'
import talentsData    from '../data/talents.json'
import racesData      from '../data/races.json'
import armorData      from '../data/armor.json'
import spellListsData from '../data/spell_lists.json'

// ── Type configuration ─────────────────────────────────────────────────────────

const TYPES = ['skill', 'weapon', 'talent', 'race', 'armor', 'spell']

const TYPE_CFG = {
  skill:  { label: 'Skill',   color: '#6366f1' },
  weapon: { label: 'Weapon',  color: '#ef4444' },
  talent: { label: 'Talent',  color: '#a855f7' },
  race:   { label: 'Race',    color: '#22c55e' },
  armor:  { label: 'Armor',   color: '#f97316' },
  spell:  { label: 'Spell',   color: '#06b6d4' },
}

// ── Data helpers ───────────────────────────────────────────────────────────────

function getAllArmorItems() {
  const SECTION_LABELS = {
    full_suit: 'Full Suit', torso: 'Torso', helmet: 'Helmet',
    vambraces: 'Vambraces', greaves: 'Greaves', shields: 'Shield',
  }
  const items = []
  for (const [section, rows] of Object.entries(armorData)) {
    for (const row of rows) {
      if (row.name && row.name !== 'None') {
        items.push({ ...row, _section: SECTION_LABELS[section] || section })
      }
    }
  }
  return items
}

function getAllSpellItems() {
  const items = []
  for (const [listName, listData] of Object.entries(spellListsData)) {
    for (const spell of (listData.spells || [])) {
      items.push({
        name:     spell.name,
        list:     listName,
        realm:    listData.realm    || '',
        section:  listData.section  || '',
        level:    spell.level,
        aoe:      spell.aoe,
        duration: spell.duration,
        range:    spell.range,
        type:     spell.type,
      })
    }
  }
  return items
}

const DATA_MAPS = {
  skill:  skillsData,
  weapon: weaponsData,
  talent: talentsData,
  race:   racesData,
  armor:  getAllArmorItems(),
  spell:  getAllSpellItems(),
}

function getItemId(type, item) {
  if (type === 'talent') return item.id
  if (type === 'spell')  return `${item.list}::${item.level}`
  return item.name
}

function searchItems(type, query) {
  const items = DATA_MAPS[type] || []
  if (!query.trim()) return items
  const q = query.toLowerCase()
  return items.filter(item => {
    const n   = (item.name || item.id || '').toLowerCase()
    const cat = (item.category || item.list || '').toLowerCase()
    const sec = (item.section  || item.realm || '').toLowerCase()
    return n.includes(q) || cat.includes(q) || sec.includes(q)
  })
}

function findItem(type, id) {
  return (DATA_MAPS[type] || []).find(item => getItemId(type, item) === id) || null
}

// ── Tooltip content by type ────────────────────────────────────────────────────

function Row({ label, value, color }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11 }}>
      <span style={{ color: 'var(--text3)', flexShrink: 0, minWidth: 90 }}>{label}</span>
      <span style={{ color: color || 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function SkillTooltip({ item }) {
  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {item.category}
      </div>
      <Row label="Dev Cost"  value={item.dev_cost} />
      <Row label="Prof Type" value={item.prof_type} />
      <Row label="Stat"      value={item.stat_keys} />
    </>
  )
}

function WeaponTooltip({ item }) {
  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {item.skill_name} · {item.ob_type}
      </div>
      <Row label="Fumble"  value={item.fumble} />
      <Row label="Str Req" value={item.str_req} />
      <Row label="Size"    value={item.size} />
      <Row label="Length"  value={item.length} />
      <Row label="Weight"  value={item.weight != null ? `${item.weight} lbs` : null} />
      {item.notes && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', fontStyle: 'italic',
          borderTop: '1px solid var(--border)', paddingTop: 5 }}>
          {item.notes}
        </div>
      )}
    </>
  )
}

function TalentTooltip({ item }) {
  const tierCost = item.cost_tier1 != null
    ? `${item.cost_tier1} (T1), +${item.cost_per_tier} / tier`
    : `${item.cost_per_tier} / tier`
  return (
    <>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {item.category}
        </span>
        {item.is_flaw && (
          <span style={{ fontSize: 9, background: 'var(--danger)22', color: 'var(--danger)',
            border: '1px solid var(--danger)44', borderRadius: 3, padding: '0 4px', fontWeight: 700 }}>
            FLAW
          </span>
        )}
      </div>
      <Row label="Cost"      value={tierCost} />
      <Row label="Max Tiers" value={item.max_tiers} />
      {item.description && (
        <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
          borderTop: '1px solid var(--border)', paddingTop: 5 }}>
          {item.description}
        </div>
      )}
    </>
  )
}

function RaceTooltip({ item }) {
  const bonuses  = item.stat_bonuses || {}
  const nonZero  = Object.entries(bonuses).filter(([, v]) => v !== 0)
  return (
    <>
      {nonZero.length > 0 && (
        <div style={{ marginBottom: 6 }}>
          <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase',
            letterSpacing: '0.06em', marginBottom: 4 }}>Stat Bonuses</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px' }}>
            {nonZero.map(([stat, val]) => (
              <span key={stat} style={{ fontSize: 11, color: val > 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                {stat.slice(0, 3)} {val > 0 ? `+${val}` : val}
              </span>
            ))}
          </div>
        </div>
      )}
      <Row label="Base Hits"     value={item.base_hits} />
      <Row label="Recovery"      value={item.recovery_mult != null ? `×${item.recovery_mult}` : null} />
      <Row label="Endurance"     value={item.endurance} />
      <Row label="Channeling RR" value={item.channeling_rr} />
      <Row label="Essence RR"    value={item.essence_rr} />
      <Row label="Mentalism RR"  value={item.mentalism_rr} />
      <Row label="Physical RR"   value={item.physical_rr} />
      {item.dp_bonus_pool > 0 && (
        <Row label="Bonus DP Pool" value={item.dp_bonus_pool} color="var(--accent)" />
      )}
    </>
  )
}

function ArmorTooltip({ item }) {
  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {item._section} · AT {item.at}
      </div>
      <Row label="Weight"     value={item.weight_pct != null ? `${item.weight_pct}% body wt` : null} />
      <Row label="Str Req"    value={item.str_req} />
      <Row label="Maneuver"   value={item.maneuver_penalty  ? `${item.maneuver_penalty}`  : null} />
      <Row label="Ranged"     value={item.ranged_penalty    ? `${item.ranged_penalty}`    : null} />
      <Row label="Perception" value={item.perception_penalty ? `${item.perception_penalty}` : null} />
      {item.difficulty  && <Row label="Difficulty" value={item.difficulty} />}
      {item.craft_time  && <Row label="Craft Time" value={item.craft_time} />}
    </>
  )
}

function SpellTooltip({ item }) {
  return (
    <>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {item.list} · Lv {item.level}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6 }}>
        {item.realm} — {item.section}
      </div>
      <Row label="AoE"      value={item.aoe} />
      <Row label="Duration" value={item.duration} />
      <Row label="Range"    value={item.range} />
      <Row label="Type"     value={item.type} />
    </>
  )
}

function TooltipContent({ type, item }) {
  if (!item) return <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Item not found.</div>
  switch (type) {
    case 'skill':  return <SkillTooltip  item={item} />
    case 'weapon': return <WeaponTooltip item={item} />
    case 'talent': return <TalentTooltip item={item} />
    case 'race':   return <RaceTooltip   item={item} />
    case 'armor':  return <ArmorTooltip  item={item} />
    case 'spell':  return <SpellTooltip  item={item} />
    default:       return null
  }
}

// ── Tooltip popup (portalled to body) ─────────────────────────────────────────

function TooltipPopup({ type, id, label, anchorRef, onClose }) {
  const popupRef = useRef(null)
  const item     = useMemo(() => findItem(type, id), [type, id])
  const cfg      = TYPE_CFG[type] || { label: '?', color: '#888' }
  const [style, setStyle] = useState({ position: 'fixed', top: 0, left: 0, opacity: 0 })

  useEffect(() => {
    if (!anchorRef.current || !popupRef.current) return
    const r  = anchorRef.current.getBoundingClientRect()
    const pw = popupRef.current.offsetWidth  || 240
    const ph = popupRef.current.offsetHeight || 120
    const vw = window.innerWidth
    const vh = window.innerHeight
    let left = r.left
    let top  = r.bottom + 6
    if (left + pw > vw - 8) left = vw - pw - 8
    if (left < 8) left = 8
    if (top + ph > vh - 8) top = r.top - ph - 6
    if (top < 8) top = 8
    setStyle({ position: 'fixed', top, left, opacity: 1 })
  }, [])

  useEffect(() => {
    const h = e => {
      if (!popupRef.current?.contains(e.target) && !anchorRef.current?.contains(e.target)) onClose()
    }
    setTimeout(() => document.addEventListener('mousedown', h), 0)
    return () => document.removeEventListener('mousedown', h)
  }, [onClose])

  return ReactDOM.createPortal(
    <div ref={popupRef} style={{
      ...style,
      zIndex: 99999,
      background: 'var(--surface)',
      border: `1px solid ${cfg.color}66`,
      borderTop: `2px solid ${cfg.color}`,
      borderRadius: 8,
      boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      padding: '10px 14px',
      minWidth: 200,
      maxWidth: 280,
      transition: 'opacity .1s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8,
        paddingBottom: 6, borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
        <span style={{ fontSize: 9, color: cfg.color, background: cfg.color + '22',
          border: `1px solid ${cfg.color}44`, borderRadius: 3, padding: '1px 5px',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          {cfg.label}
        </span>
      </div>
      <TooltipContent type={type} item={item} />
    </div>,
    document.body
  )
}

// ── Chip node view ─────────────────────────────────────────────────────────────

function RMRefNodeView({ node }) {
  const { refType, refId, refLabel } = node.attrs
  const cfg     = TYPE_CFG[refType] || { label: '?', color: '#888' }
  const chipRef = useRef(null)
  const [open, setOpen] = useState(false)

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <span
        ref={chipRef}
        contentEditable={false}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline',
          background: 'transparent',
          color: cfg.color,
          border: 'none',
          padding: 0,
          fontWeight: 800,
          cursor: 'pointer',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          transition: 'opacity .1s',
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.7' }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1' }}>
        {refLabel}
      </span>
      {open && (
        <TooltipPopup
          type={refType} id={refId} label={refLabel}
          anchorRef={chipRef}
          onClose={() => setOpen(false)}
        />
      )}
    </NodeViewWrapper>
  )
}

// ── Tiptap extension ───────────────────────────────────────────────────────────

export const RMRefExtension = Node.create({
  name: 'rmref',
  group: 'inline',
  inline: true,
  atom: true,

  addAttributes() {
    return {
      refType: {
        default: null,
        parseHTML: el => el.getAttribute('data-ref-type'),
        renderHTML: a  => ({ 'data-ref-type': a.refType }),
      },
      refId: {
        default: null,
        parseHTML: el => el.getAttribute('data-ref-id'),
        renderHTML: a  => ({ 'data-ref-id': a.refId }),
      },
      refLabel: {
        default: null,
        parseHTML: el => el.getAttribute('data-ref-label'),
        renderHTML: a  => ({ 'data-ref-label': a.refLabel }),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-rmref]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ 'data-rmref': '1' }, HTMLAttributes)]
  },

  addNodeView() {
    return ReactNodeViewRenderer(RMRefNodeView)
  },
})

// ── Spell grouping helpers ─────────────────────────────────────────────────────

// Returns results grouped as [{ realm, section, list, spells:[] }, ...]
function groupSpellResults(results) {
  const groups = []
  const seen   = {}
  for (const spell of results) {
    const key = `${spell.realm}::${spell.section}::${spell.list}`
    if (!seen[key]) {
      seen[key] = { realm: spell.realm, section: spell.section, list: spell.list, spells: [] }
      groups.push(seen[key])
    }
    seen[key].spells.push(spell)
  }
  return groups
}

// Realm display order
const REALM_ORDER = ['Channeling', 'Essence', 'Mentalism', 'Hybrid']

// ── RMRef Picker Modal ─────────────────────────────────────────────────────────

export function RMRefPicker({ open, onClose, editor }) {
  const [type,  setType]  = useState('skill')
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  const results = useMemo(() => searchItems(type, query), [type, query])

  useEffect(() => {
    if (open) {
      setQuery('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [open, type])

  useEffect(() => {
    if (!open) return
    const h = e => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])

  const handleInsert = useCallback((item) => {
    if (!editor) return
    const id    = getItemId(type, item)
    const label = item.name || item.id
    editor.chain().focus().insertContent([
      { type: 'text', text: ' ' },
      { type: 'rmref', attrs: { refType: type, refId: id, refLabel: label } },
    ]).run()
    onClose()
  }, [editor, type, onClose])

  // Must be before early return — hooks cannot be called conditionally
  const spellGroups = useMemo(() => {
    if (type !== 'spell') return null
    const grouped = groupSpellResults(results)
    grouped.sort((a, b) => {
      const ra = REALM_ORDER.indexOf(a.realm)
      const rb = REALM_ORDER.indexOf(b.realm)
      if (ra !== rb) return (ra === -1 ? 99 : ra) - (rb === -1 ? 99 : rb)
      if (a.section !== b.section) return a.section.localeCompare(b.section)
      return a.list.localeCompare(b.list)
    })
    return grouped
  }, [type, results])

  if (!open) return null

  const cfg = TYPE_CFG[type]

  const totalResults = type === 'spell'
    ? (spellGroups?.reduce((s, g) => s + g.spells.length, 0) ?? 0)
    : results.length

  return ReactDOM.createPortal(
    <>
      <div onMouseDown={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 10000, background: 'rgba(0,0,0,0.55)' }} />
      <div onMouseDown={e => e.stopPropagation()}
        style={{
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%,-50%)',
          zIndex: 10001,
          background: 'var(--surface)',
          border: '1px solid var(--border2)',
          borderRadius: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          width: 'min(400px, 92vw)',
          maxHeight: '82vh',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
        {/* Header */}
        <div style={{ padding: '14px 16px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>
            Insert Reference
          </div>
          {/* Type tabs */}
          <div style={{ display: 'flex', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
            {TYPES.map(t => {
              const c      = TYPE_CFG[t]
              const active = t === type
              return (
                <button key={t}
                  onClick={() => { setType(t); setQuery('') }}
                  style={{
                    padding: '3px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                    background: active ? c.color : 'transparent',
                    color: active ? '#fff' : 'var(--text)',
                    border: `1px solid ${active ? 'transparent' : c.color}`,
                    transition: 'all .1s',
                  }}>
                  {c.label}
                </button>
              )
            })}
          </div>
          {/* Search */}
          <input ref={inputRef} type="text" value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={`Search ${cfg.label.toLowerCase()}s…`}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px', fontSize: 13, borderRadius: 7,
              background: 'var(--surface2)', border: '1px solid var(--border2)',
              color: 'var(--text)',
            }} />
        </div>

        {/* Results */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '4px 0' }}>
          {type === 'spell' ? (
            <SpellResultsList groups={spellGroups || []} query={query} onInsert={handleInsert} cfg={cfg} />
          ) : (
            results.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                No {cfg.label.toLowerCase()}s found.
              </div>
            ) : (
              results.slice(0, 60).map((item, i) => (
                <ResultRow key={i} item={item} type={type} cfg={cfg} onInsert={() => handleInsert(item)} />
              ))
            )
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '8px 16px', borderTop: '1px solid var(--border)', flexShrink: 0,
          fontSize: 11, color: 'var(--text3)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>
            {totalResults > 0
              ? `${totalResults} result${totalResults !== 1 ? 's' : ''}${query ? '' : ' — type to filter'}`
              : 'No results'}
          </span>
          <button onClick={onClose}
            style={{ background: 'var(--surface2)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 12px', fontSize: 11, cursor: 'pointer', color: 'var(--text2)' }}>
            Cancel
          </button>
        </div>
      </div>
    </>,
    document.body
  )
}

// ── Spell results — grouped by realm → section → list ─────────────────────────

function SpellResultsList({ groups, query, onInsert, cfg }) {
  if (groups.length === 0) {
    return (
      <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
        No spells found.
      </div>
    )
  }

  let lastRealm = null

  return (
    <>
      {groups.map((group, gi) => {
        const showRealm = group.realm !== lastRealm
        lastRealm = group.realm
        return (
          <div key={gi}>
            {/* Realm header — shown once per realm */}
            {showRealm && (
              <div style={{
                padding: '8px 16px 4px',
                marginTop: gi > 0 ? 4 : 0,
                fontSize: 11,
                fontWeight: 800,
                color: cfg.color,
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                borderTop: gi > 0 ? '1px solid var(--border)' : 'none',
              }}>
                {group.realm}
              </div>
            )}
            {/* List header */}
            <div style={{
              padding: '3px 16px 2px',
              fontSize: 10,
              fontWeight: 700,
              color: 'var(--text3)',
              textTransform: 'uppercase',
              letterSpacing: '0.07em',
              background: 'var(--surface2)',
              borderBottom: '1px solid var(--border)',
            }}>
              {group.list}
              <span style={{ fontWeight: 400, marginLeft: 6, color: 'var(--text3)', opacity: 0.7 }}>
                {group.section}
              </span>
            </div>
            {/* Spell rows */}
            {group.spells.map((spell, si) => (
              <button key={si} onClick={() => onInsert(spell)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  width: '100%', textAlign: 'left',
                  background: 'none', border: 'none',
                  padding: '5px 16px', cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
                onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
                <span style={{
                  flexShrink: 0, width: 22, textAlign: 'right',
                  fontSize: 10, color: 'var(--text3)', fontWeight: 600,
                }}>
                  {spell.level}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontSize: 12, color: 'var(--text)', fontWeight: 500 }}>
                    {spell.name}
                  </span>
                </div>
                <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>
                  {spell.type}
                </span>
              </button>
            ))}
          </div>
        )
      })}
    </>
  )
}

// ── General result row ─────────────────────────────────────────────────────────

function ResultRow({ item, type, cfg, onInsert }) {
  const label    = item.name || item.id || ''
  const sublabel = getSubLabel(type, item)

  return (
    <button onClick={onInsert}
      style={{
        display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left',
        background: 'none', border: 'none',
        padding: '7px 16px', cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </div>
        {sublabel && (
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 1 }}>{sublabel}</div>
        )}
      </div>
    </button>
  )
}

function getSubLabel(type, item) {
  switch (type) {
    case 'skill':  return `${item.category} · ${item.dev_cost}`
    case 'weapon': return `${item.skill_name} · ${item.ob_type}`
    case 'talent': return `${item.category}${item.is_flaw ? ' · Flaw' : ''} · ${item.cost_per_tier} DP/tier`
    case 'race':   return item.dp_bonus_pool ? `Bonus DP Pool: ${item.dp_bonus_pool}` : null
    case 'armor':  return `${item._section} · AT ${item.at}`
    default:       return null
  }
}
