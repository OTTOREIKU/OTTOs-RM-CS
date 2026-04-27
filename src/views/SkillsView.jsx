import React, { useState, useMemo, useEffect } from 'react'
import { useCharacter } from '../store/CharacterContext.jsx'
import { rankBonus, getTotalStatBonus, getTalentBonuses, getSpellCastingBonus, getSpellMasteryBonus, getNamedTalentBonus } from '../utils/calc.js'
import skillsData from '../data/skills.json'
import skillCosts from '../data/skill_costs.json'
import talentsData from '../data/talents.json'
import spellListsDb from '../data/spell_lists.json'
import cultureSkillsData from '../data/culture_skills.json'
import { LockIcon, UnlockIcon, PencilIcon, PlusIcon, XIcon, NoteIcon, StarIcon, ChevronDownIcon, ChevronRightIcon } from '../components/Icons.jsx'

// Full stat names for the override selector
const ALL_STATS = ['Agility','Constitution','Empathy','Intuition','Memory','Presence','Quickness','Reasoning','Self Discipline','Strength']
const STAT_KEY_TO_FULL = { Ag:'Agility',Co:'Constitution',Em:'Empathy',In:'Intuition',Me:'Memory',Pr:'Presence',Qu:'Quickness',Re:'Reasoning',SD:'Self Discipline',St:'Strength' }
const REALM_DEFAULT_STAT = { Channeling:'Intuition', Essence:'Empathy', Mentalism:'Presence' }

const STAT_MAP = {
  Ag:'Agility', Co:'Constitution', Em:'Empathy', In:'Intuition',
  Me:'Memory', Pr:'Presence', Qu:'Quickness', Re:'Reasoning',
  SD:'Self Discipline', St:'Strength', '-':null,
}

// Two category-level stats averaged, then add the individual skill stat
const CATEGORY_STATS = {
  'Animal':             'Ag/Em',
  'Awareness':          'In/Re',
  'Battle Expertise':   '-',
  'Body Discipline':    'Co/SD',
  'Brawn':              'Co/SD',
  'Combat Expertise':   '-',
  'Combat Training':    'Ag/St',
  'Composition':        'Em/In',
  'Crafting':           'Ag/Me',
  'Delving':            'Em/In',
  'Environmental':      'In/Me',
  'Gymnastic':          'Ag/Qu',
  'Lore':               'Me/Me',
  'Lore: Languages':    'Me/Me',
  'Magical Expertise':  '-',
  'Medical':            'In/Me',
  'Mental Discipline':  'Pr/SD',
  'Movement':           'Ag/St',
  'Performance Art':    'Em/Pr',
  'Power Manipulation': 'RS/RS',
  'Science':            'Me/Re',
  'Social':             'Em/In',
  'Subterfuge':         'Ag/SD',
  'Technical':          'In/Re',
  'Vocation':           'Em/Me',
}

function hasPlaceholder(name) { return /<[^>]+>/.test(name) }

// Weapon slot type derived from template skill name
const WEAPON_SLOT_TYPE = {
  melee:   /^Melee: <weapon/,
  unarmed: /^Unarmed: <weapon/,
  ranged:  /^Ranged: <weapon/,
}
const WEAPON_OPTIONS = {
  melee:   ['Blade', 'Greater Blade', 'Hafted', 'Greater Hafted', 'Pole Arm', 'Spear', 'Chain', 'Greater Chain', 'Net'],
  unarmed: ['Strikes', 'Grappling/Wrestling'],
  ranged:  ['Bow', 'Crossbow', 'Thrown', 'Sling', 'Blowpipe'],
}
function getWeaponSlotType(skillName) {
  for (const [type, re] of Object.entries(WEAPON_SLOT_TYPE)) {
    if (re.test(skillName)) return type
  }
  return null
}

// Dropdown + optional custom text input for Combat Training weapon slots
function WeaponTypeSelector({ slotType, label, setLabel }) {
  const options = WEAPON_OPTIONS[slotType] || []
  const isCustomMode = label !== '' && !options.includes(label)
  const [customMode, setCustomMode] = useState(isCustomMode)

  if (customMode) {
    return (
      <div style={{ display: 'flex', gap: 4, flex: 1, minWidth: 0 }}>
        <select
          value="__custom__"
          onChange={e => {
            if (e.target.value !== '__custom__') { setLabel(e.target.value); setCustomMode(false) }
          }}
          style={{ background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 5, padding: '2px 4px', color: 'var(--text)', fontSize: 12 }}
        >
          {options.map(o => <option key={o} value={o}>{o}</option>)}
          <option value="__custom__">Custom…</option>
        </select>
        <input
          autoFocus
          value={label}
          onChange={e => setLabel(e.target.value)}
          placeholder="weapon type"
          style={{ flex: 1, minWidth: 0, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 5, padding: '2px 6px', color: 'var(--text)', fontSize: 12, outline: 'none' }}
        />
      </div>
    )
  }

  return (
    <select
      autoFocus
      value={label || ''}
      onChange={e => {
        if (e.target.value === '__custom__') { setCustomMode(true); setLabel('') }
        else setLabel(e.target.value)
      }}
      style={{ flex: 1, minWidth: 0, background: 'var(--surface2)', border: '1px solid var(--accent)', borderRadius: 5, padding: '2px 4px', color: 'var(--text)', fontSize: 12 }}
    >
      <option value="">— choose weapon type —</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
      <option value="__custom__">Custom…</option>
    </select>
  )
}

function displayName(templateName, label) {
  if (!label) return templateName
  if (hasPlaceholder(templateName)) return templateName.replace(/<[^>]+>/, label)
  return `${templateName}: ${label}`
}

// Realm stats per CoreLaw Table 3-0a footnote:
// Essence→Empathy, Channeling→Intuition, Mentalism→Presence
function realmStatKey(char) {
  const realm = (char.realm || char.magic_realm || '').toLowerCase()
  if (realm.includes('channel')) return 'In'
  if (realm.includes('essence')) return 'Em'
  if (realm.includes('mental'))  return 'Pr'
  return null
}

// All stat bonuses are straight-added (never averaged) per CoreLaw p.84.
// e.g. Animal Handling = Ag bonus + Em bonus + Pr bonus
function getStatBonus(char, stat_keys) {
  if (!stat_keys || stat_keys === '-') return 0
  const keys = stat_keys.split('/').map(k => {
    const t = k.trim()
    return t === 'RS' ? realmStatKey(char) : t
  })
  return keys.reduce((sum, k) => {
    if (!k) return sum
    const full = STAT_MAP[k]
    if (!full || !char.stats?.[full]) return sum
    return sum + getTotalStatBonus(char.stats[full])
  }, 0)
}

function IconBtn({ onClick, title, active, activeColor = 'var(--accent)', danger, children }) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: active ? activeColor : hovered ? (danger ? 'rgba(239,68,68,0.12)' : 'var(--surface2)') : 'transparent',
        border: '1px solid ' + ((hovered || active) ? (danger ? 'var(--danger)' : 'var(--border2)') : 'transparent'),
        borderRadius: 4,
        color: active ? '#fff' : hovered ? (danger ? 'var(--danger)' : 'var(--text2)') : 'var(--text3)',
        width: 22, height: 22, cursor: 'pointer', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s', padding: 0,
      }}
    >{children}</button>
  )
}

const GRID        = '1fr 54px 34px 50px 50px 50px 62px'   // desktop: all 7 columns
const NUMS_GRID   = '54px 34px 50px 50px 50px 62px'       // mobile: numbers-only second row
// Columns: name | ranks | SCR | Mastery
const SPELL_GRID   = '1fr 54px 62px 68px'
const SPELL_GRID_M = '1fr 48px 56px 60px'

// All category names for default-all-open init
const ALL_SKILL_CATEGORIES = [...new Set(skillsData.map(s => s.category || 'Other'))]

function lsGet(key, fallback) {
  try { const v = localStorage.getItem(key); return v != null ? JSON.parse(v) : fallback } catch { return fallback }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}

// ── SkillRow lives at module scope so React sees a stable component type.
// Defining it inside SkillsView would create a new function reference on every
// render, causing unmount/remount and losing focus after each keystroke.
function SkillRow({
  skill, cs, rowKey, isCustom, customId, catIsUnlocked, cultureGrant, isMobile,
  c, talentBonuses, editMode, setEditMode, notesOpen, setNotesOpen,
  addOpen, setAddOpen, addCustomSkill, updateSkill, updateCustomSkill, removeCustomSkill,
}) {
  const ranks        = cs.ranks ?? 0
  const cultureRanks = cs.culture_ranks ?? 0
  const totalRanks   = ranks + cultureRanks
  const item    = cs.item_bonus ?? 0
  const talent  = cs.talent_bonus ?? 0
  const notes   = cs.notes ?? ''
  const label   = cs.label ?? ''
  const catStatB  = getStatBonus(c, CATEGORY_STATS[skill.category] || '-')
  const skillStatB = getStatBonus(c, skill.stat_keys)
  const combinedStatB = catStatB + skillStatB
  const rb      = rankBonus(totalRanks)
  const talentEntries = isCustom
    ? (talentBonuses[cs.template_name] || [])
    : (talentBonuses[skill.name] || [])
  const excludedTalents = cs.talent_excluded || []
  const autoBonus = talentEntries
    .filter(e => !excludedTalents.includes(e.instId))
    .reduce((sum, e) => sum + e.bonus, 0)
  const defaultProf = skill.prof_type === 'Professional' || skill.prof_type === 'Knack'
  const isProf  = cs.proficient !== undefined ? cs.proficient : defaultProf
  const profBonus = isProf ? Math.min(totalRanks, 30) : 0
  const total   = rb + combinedStatB + item + talent + autoBonus + profBonus
  const isSpec  = hasPlaceholder(skill.name)
  const editing     = !!editMode[rowKey]
  const noteOpen    = !!notesOpen[rowKey]
  const addFormOpen = !!addOpen[rowKey]

  function setRanks(v)        { isCustom ? updateCustomSkill(customId, { ranks: v }) : updateSkill(skill.name, 'ranks', v) }
  function setCultureRanks(v) { isCustom ? updateCustomSkill(customId, { culture_ranks: v }) : updateSkill(skill.name, 'culture_ranks', v) }
  function setItem(v)         { isCustom ? updateCustomSkill(customId, { item_bonus: v }) : updateSkill(skill.name, 'item_bonus', v) }
  function setTalent(v)       { isCustom ? updateCustomSkill(customId, { talent_bonus: v }) : updateSkill(skill.name, 'talent_bonus', v) }
  function setLabel(v)        { isCustom ? updateCustomSkill(customId, { label: v }) : updateSkill(skill.name, 'label', v) }
  function setNotes(v)        { isCustom ? updateCustomSkill(customId, { notes: v }) : updateSkill(skill.name, 'notes', v) }
  function setStarred(v)      { isCustom ? updateCustomSkill(customId, { starred: v }) : updateSkill(skill.name, 'starred', v) }
  const isStarred = cs.starred ?? false
  function toggleProf() {
    const next = !isProf
    isCustom ? updateCustomSkill(customId, { proficient: next }) : updateSkill(skill.name, 'proficient', next)
  }
  function toggleTalentExcluded(instId) {
    const current = cs.talent_excluded || []
    const next = current.includes(instId)
      ? current.filter(id => id !== instId)
      : [...current, instId]
    isCustom ? updateCustomSkill(customId, { talent_excluded: next }) : updateSkill(skill.name, 'talent_excluded', next)
  }
  function submitAdd(key, sk) {
    const form = addOpen[key]
    if (!form) return
    addCustomSkill(sk.name, form.label.trim() || '')
    setAddOpen(p => ({ ...p, [key]: null }))
  }

  const dispName = displayName(skill.name, label || undefined)

  const cultCell = catIsUnlocked ? (
    <input
      type="number" min={0} value={cultureRanks || ''}
      onChange={e => setCultureRanks(Number(e.target.value) || 0)}
      placeholder="0"
      title="Culture ranks — edit manually or use Apply button on Sheet tab"
      style={{ padding: '3px 2px', border: '1px solid var(--accent)', background: 'rgba(99,102,241,0.08)' }}
    />
  ) : (
    <div style={{ textAlign: 'center', fontSize: 12 }}
      title={cultureRanks > 0
        ? `${cultureRanks} rank${cultureRanks !== 1 ? 's' : ''} from culture`
        : cultureGrant
          ? `${cultureGrant.ranks} rank${cultureGrant.ranks !== 1 ? 's' : ''} from ${c.culture} culture${cultureGrant.choice ? ' (choice)' : ' (not yet applied)'}`
          : 'No culture grant for this skill'
      }>
      {cultureRanks > 0
        ? <span style={{ color: 'var(--accent)', fontWeight: 700 }}>{cultureRanks}</span>
        : cultureGrant
          ? <span style={{ color: 'var(--text3)', fontSize: 11 }}>{cultureGrant.ranks}{cultureGrant.choice ? '*' : ''}</span>
          : null
      }
    </div>
  )
  const statCell = (
    <div
      style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 12 }}
      title={`Rank bonus: ${rb >= 0 ? '+' : ''}${rb}\nCategory (${CATEGORY_STATS[skill.category] || '-'}): ${catStatB >= 0 ? '+' : ''}${catStatB}\nSkill (${skill.stat_keys || '-'}): ${skillStatB >= 0 ? '+' : ''}${skillStatB}`}
    >
      {(rb + combinedStatB) >= 0 ? `+${rb + combinedStatB}` : rb + combinedStatB}
    </div>
  )
  const totalCell = (
    <div style={{ textAlign: 'center' }}>
      <span style={{ fontWeight: 700, fontSize: 13,
        color: total > 0 ? 'var(--success)' : total < -10 ? 'var(--danger)' : 'var(--text2)' }}>
        {total >= 0 ? `+${total}` : total}
      </span>
      {(() => {
        const active = talentEntries.filter(e => !excludedTalents.includes(e.instId))
        const activeSum = active.reduce((s, e) => s + e.bonus, 0)
        return activeSum !== 0 ? (
          <span style={{ display: 'block', fontSize: 9, color: 'var(--purple)', lineHeight: 1 }}
            title={active.map(e => `${e.name}: +${e.bonus}`).join(', ')}>
            T{activeSum > 0 ? '+' : ''}{activeSum}
          </span>
        ) : null
      })()}
      {isProf && profBonus > 0 && (
        <span style={{ display: 'block', fontSize: 9, color: 'var(--accent)', lineHeight: 1 }}
          title={`Proficiency bonus +${profBonus} (= ranks, max 30)`}>
          P+{profBonus}
        </span>
      )}
    </div>
  )

  const nameCell = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
      {catIsUnlocked && (
        <button
          onClick={toggleProf}
          title={isProf ? 'Proficient — click to remove' : 'Click to mark as proficient'}
          style={{
            width: 7, height: 7, padding: 0, flexShrink: 0, cursor: 'pointer',
            border: '1.5px solid ' + (isProf ? 'var(--accent)' : 'var(--text3)'),
            background: isProf ? 'var(--accent)' : 'transparent',
            borderRadius: 1,
          }}
        />
      )}
      {catIsUnlocked && (
        <IconBtn onClick={() => setEditMode(p => ({ ...p, [rowKey]: !p[rowKey] }))}
          title={editing ? 'Stop editing name' : 'Edit name/specialization'}
          active={editing}>
          <PencilIcon size={11} color={editing ? '#fff' : 'currentColor'} />
        </IconBtn>
      )}
      {catIsUnlocked && editing && isSpec ? (() => {
        const wType = getWeaponSlotType(skill.name)
        if (wType) {
          return <WeaponTypeSelector slotType={wType} label={label} setLabel={setLabel} />
        }
        return (
          <input
            autoFocus
            value={label}
            onChange={e => setLabel(e.target.value)}
            placeholder="specialization"
            style={{
              flex: 1, minWidth: 0,
              background: 'var(--surface2)', border: '1px solid var(--accent)',
              borderRadius: 5, padding: '2px 6px', color: 'var(--text)', fontSize: 12, outline: 'none',
            }}
          />
        )
      })() : (
        <span style={{
          flex: 1, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: isProf ? 'var(--accent)' : 'var(--text)',
        }}>
          {dispName}
        </span>
      )}
      {catIsUnlocked && isProf && (
        <span style={{ fontSize: 9, background: 'var(--accent)', color: '#fff', padding: '1px 4px', borderRadius: 3, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>PROF</span>
      )}
      {catIsUnlocked && talentEntries.map(entry => {
        const excluded = excludedTalents.includes(entry.instId)
        return (
          <button key={entry.instId}
            onClick={() => toggleTalentExcluded(entry.instId)}
            title={excluded
              ? `${entry.name}: +${entry.bonus} excluded — click to re-enable`
              : `${entry.name}: +${entry.bonus} active — click to exclude from this row`}
            style={{
              flexShrink: 0, padding: '1px 4px', borderRadius: 3, cursor: 'pointer',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', lineHeight: 1,
              border: '1px solid ' + (excluded ? 'var(--border)' : 'var(--purple)'),
              background: excluded ? 'transparent' : 'rgba(168,85,247,0.15)',
              color: excluded ? 'var(--text3)' : 'var(--purple)',
              textDecoration: excluded ? 'line-through' : 'none',
            }}
          >T{entry.bonus > 0 ? '+' : ''}{entry.bonus}</button>
        )
      })}
      {catIsUnlocked && isCustom && (
        <IconBtn onClick={() => removeCustomSkill(customId)} title="Remove this skill" danger>
          <XIcon size={11} color="currentColor" />
        </IconBtn>
      )}
      {catIsUnlocked && (
        <IconBtn onClick={() => setAddOpen(p => ({ ...p, [rowKey]: p[rowKey] ? null : { label: '' } }))}
          title="Add specialization based on this skill"
          active={addFormOpen}>
          <PlusIcon size={11} color={addFormOpen ? '#fff' : 'currentColor'} />
        </IconBtn>
      )}
      <IconBtn onClick={() => setStarred(!isStarred)}
        title={isStarred ? 'Starred — shows on Sheet tab (click to remove)' : 'Star this skill to pin it on the Sheet tab'}>
        <StarIcon size={11} color={isStarred ? '#f59e0b' : 'currentColor'} filled={isStarred} />
      </IconBtn>
      <IconBtn onClick={() => setNotesOpen(p => ({ ...p, [rowKey]: !p[rowKey] }))}
        title={noteOpen ? 'Hide notes' : 'Notes'}
        active={noteOpen}>
        <NoteIcon size={11} color={notes ? 'var(--accent)' : noteOpen ? '#fff' : 'currentColor'} />
      </IconBtn>
    </div>
  )

  return (
    <>
      {isMobile ? (
        <div style={{
          padding: '6px 14px 4px',
          fontSize: 13, borderTop: '1px solid var(--border)',
          background: editing ? 'rgba(99,102,241,0.06)' : 'transparent',
          transition: 'background 0.15s',
        }}>
          <div style={{ marginBottom: 4 }}>{nameCell}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ display: 'grid', gridTemplateColumns: NUMS_GRID, gap: 4, alignItems: 'center' }}>
              <input type="number" min={0} value={ranks || ''}
                onChange={e => setRanks(Number(e.target.value) || 0)}
                placeholder="0" style={{ padding: '3px 4px', width: '100%', boxSizing: 'border-box' }} />
              {cultCell}
              {statCell}
              <input type="number" value={item || ''} placeholder="0"
                onChange={e => setItem(Number(e.target.value) || 0)}
                style={{ padding: '3px 2px' }} />
              <input type="number" value={talent || ''} placeholder="0"
                onChange={e => setTalent(Number(e.target.value) || 0)}
                style={{ padding: '3px 2px' }} />
              {totalCell}
            </div>
          </div>
        </div>
      ) : (
        <div style={{
          display: 'grid', gridTemplateColumns: GRID,
          padding: '5px 14px', gap: 4, alignItems: 'center',
          fontSize: 13, borderTop: '1px solid var(--border)',
          background: editing ? 'rgba(99,102,241,0.06)' : 'transparent',
          transition: 'background 0.15s',
        }}>
          {nameCell}
          <input type="number" min={0} value={ranks || ''}
            onChange={e => setRanks(Number(e.target.value) || 0)}
            placeholder="0" style={{ padding: '3px 6px', width: '100%', boxSizing: 'border-box' }} />
          {cultCell}
          {statCell}
          <input type="number" value={item || ''} placeholder="0"
            onChange={e => setItem(Number(e.target.value) || 0)}
            style={{ padding: '3px 2px' }} />
          <input type="number" value={talent || ''} placeholder="0"
            onChange={e => setTalent(Number(e.target.value) || 0)}
            style={{ padding: '3px 2px' }} />
          {totalCell}
        </div>
      )}

      {noteOpen && (
        <div style={{ padding: '8px 14px 10px 42px', background: 'var(--surface2)', borderTop: '1px solid var(--border)' }}>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Notes for this skill (specialization details, conditions, bonuses...)"
            rows={3}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: 6, padding: '6px 8px',
              color: 'var(--text)', fontSize: 12,
              resize: 'vertical', fontFamily: 'inherit', lineHeight: 1.5, outline: 'none',
            }}
          />
        </div>
      )}

      {addFormOpen && (
        <div style={{
          display: 'flex', gap: 6, padding: '8px 14px',
          alignItems: 'center', flexWrap: 'wrap',
          background: 'rgba(99,102,241,0.06)',
          borderTop: '1px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, color: 'var(--text2)', flexShrink: 0 }}>
            {skill.name.replace(/<[^>]+>/, '').replace(/:\s*$/, '').trim()}:
          </span>
          <input
            type="text"
            autoFocus
            value={addOpen[rowKey]?.label ?? ''}
            onChange={e => setAddOpen(p => ({ ...p, [rowKey]: { label: e.target.value } }))}
            onKeyDown={e => { if (e.key === 'Enter') submitAdd(rowKey, skill); if (e.key === 'Escape') setAddOpen(p => ({ ...p, [rowKey]: null })) }}
            placeholder="specialization (e.g. Hearing, Horse, Elvish...)"
            style={{
              flex: 1, minWidth: 140,
              background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: 6, padding: '5px 7px', color: 'var(--text)', fontSize: 12,
            }}
          />
          <button onClick={() => submitAdd(rowKey, skill)} style={{
            background: 'var(--accent)', border: 'none', borderRadius: 6,
            color: '#fff', padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>Add</button>
          <button onClick={() => setAddOpen(p => ({ ...p, [rowKey]: null }))} style={{
            background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', display: 'flex', alignItems: 'center',
          }}><XIcon size={14} color="currentColor" /></button>
        </div>
      )}
    </>
  )
}

export default function SkillsView() {
  const { activeChar, updateCharacter, updateSkill, updateSpellList, removeSpellList,
          addCustomSkill, updateCustomSkill, removeCustomSkill } = useCharacter()
  const [search, setSearch]       = useState('')
  const [expanded, setExpanded]   = useState(() =>
    lsGet('rm_skills_expanded', Object.fromEntries(ALL_SKILL_CATEGORIES.map(c => [c, true])))
  )
  const [showZero, setShowZero]   = useState(true)
  const [editMode, setEditMode]   = useState({})    // { [skillKey]: bool }
  const [notesOpen, setNotesOpen] = useState({})    // { [skillKey]: bool }
  const [addOpen, setAddOpen]     = useState({})    // { [skillKey]: { label } | null }
  const [catUnlocked, setCatUnlocked] = useState(() =>
    lsGet('rm_skills_unlocked', {})
  )
  const [spellOpen, setSpellOpen]         = useState(() => lsGet('rm_spells_open', false))
  const [spellSubExp, setSpellSubExp]     = useState(() => lsGet('rm_spells_sub', { Base: true }))
  const [spellUnlocked, setSpellUnlocked] = useState(false)

  const [isMobile, setIsMobile] = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', handler)
    return () => window.removeEventListener('resize', handler)
  }, [])
  useEffect(() => { lsSet('rm_skills_expanded', expanded) }, [expanded])
  useEffect(() => { lsSet('rm_skills_unlocked', catUnlocked) }, [catUnlocked])
  useEffect(() => { lsSet('rm_spells_open', spellOpen) }, [spellOpen])
  useEffect(() => { lsSet('rm_spells_sub', spellSubExp) }, [spellSubExp])

  const c = activeChar
  if (!c) return <Empty text="No character selected." />

  const grouped = useMemo(() => {
    const map = {}
    for (const sk of skillsData) {
      const cat = sk.category || 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push(sk)
    }
    return map
  }, [])

  // Compute skill talent entries: { [skillName]: [{ instId, name, bonus }] }
  // Each entry is one talent instance so badges can be toggled individually.
  const talentBonuses = useMemo(() => {
    const map = {}
    for (const inst of (c.talents || [])) {
      const def = talentsData.find(t => t.id === inst.talent_id)
      if (!def?.effects) continue
      for (const eff of def.effects) {
        if (eff.type !== 'skill_talent_bonus') continue
        const skillNames = eff.skill === 'param'
          ? [inst.param, ...(inst.extra_params || [])].filter(Boolean)
          : (eff.skill ? [eff.skill] : [])
        const bonus = eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
        for (const skillName of skillNames) {
          if (!map[skillName]) map[skillName] = []
          map[skillName].push({ instId: inst.id, name: def.name, bonus })
        }
      }
    }
    return map
  }, [c.talents])

  // Build a lookup of culture skill grants for the active character's culture
  const cultureLookup = useMemo(() => {
    if (!c.culture) return {}
    const entry = cultureSkillsData.find(e => e.name === c.culture)
    if (!entry) return {}
    const map = {}
    for (const g of entry.grants || []) {
      map[g.skill] = { ranks: g.ranks, choice: !!g.choice }
    }
    return map
  }, [c.culture])

  const customByCategory = useMemo(() => {
    const map = {}
    const idx = Object.fromEntries(skillsData.map(s => [s.name, s]))
    for (const cs of (c.custom_skills || [])) {
      const tmpl = idx[cs.template_name]
      const cat = tmpl?.category || 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push({ ...cs, _template: tmpl })
    }
    return map
  }, [c.custom_skills])

  const categories = Object.keys(grouped)
  const query = search.toLowerCase()

  function toggle(cat) { setExpanded(p => ({ ...p, [cat]: !p[cat] })) }
  function toggleCatLock(cat) {
    setCatUnlocked(p => {
      const next = !p[cat]
      if (!next) {
        // Locking: clear edit/add state for all skills in this category
        const keys = [...(grouped[cat] || []).map(s => s.name), ...(customByCategory[cat] || []).map(s => s.id)]
        setEditMode(e => { const n = { ...e }; keys.forEach(k => delete n[k]); return n })
        setAddOpen(a => { const n = { ...a }; keys.forEach(k => delete n[k]); return n })
      }
      return { ...p, [cat]: next }
    })
  }

  function profCost(skill) {
    return skillCosts[skill.category]?.[c.profession] || skill.dev_cost
  }

  // Context bundle spread onto every SkillRow (avoids re-declaring props at each call site)
  const rowCtx = {
    c, talentBonuses, editMode, setEditMode, notesOpen, setNotesOpen,
    addOpen, setAddOpen, addCustomSkill, updateSkill, updateCustomSkill, removeCustomSkill,
  }

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 12px' }}>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search skills…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 160 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'var(--text2)', cursor: 'pointer', flexShrink: 0 }}>
          <input type="checkbox" checked={showZero} onChange={e => setShowZero(e.target.checked)} style={{ width: 'auto' }} />
          Unranked
        </label>
        <Btn onClick={() => {
          setExpanded(Object.fromEntries(categories.map(c => [c, true])))
          setSpellOpen(true)
          setSpellSubExp(Object.fromEntries(SPELL_SUBSECTIONS.map(s => [s, true])))
        }}>Expand all</Btn>
        <Btn onClick={() => {
          setExpanded({})
          setSpellSubExp({})
        }}>Collapse all</Btn>
        {(() => {
          const allUnlocked = categories.length > 0 && categories.every(cat => catUnlocked[cat]) && spellUnlocked
          return (
            <Btn onClick={() => {
              if (allUnlocked) {
                setCatUnlocked({})
                setSpellUnlocked(false)
              } else {
                setExpanded(Object.fromEntries(categories.map(c => [c, true])))
                setCatUnlocked(Object.fromEntries(categories.map(c => [c, true])))
                setSpellOpen(true)
                setSpellSubExp(Object.fromEntries(SPELL_SUBSECTIONS.map(s => [s, true])))
                setSpellUnlocked(true)
              }
            }}>
              {allUnlocked ? 'Lock All' : 'Unlock All'}
            </Btn>
          )
        })()}
      </div>

      {isMobile ? (
        <div style={{ display: 'flex', gap: 4, padding: '4px 14px', marginBottom: 4, alignItems: 'center' }}>
          <span style={{ flex: 1, fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Skill</span>
          <div style={{ display: 'grid', gridTemplateColumns: NUMS_GRID, gap: 4 }}>
            {['Ranks', 'Cult', 'Stat', 'Item', 'Other', 'Total'].map((h, i) => (
              <span key={h} style={{ fontSize: 10, fontWeight: 600, color: i === 1 ? 'var(--accent)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center', opacity: i === 1 ? 0.7 : 1 }}>{h}</span>
            ))}
          </div>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 4, padding: '4px 14px', marginBottom: 4 }}>
          {['Skill', 'Ranks', 'Cult', 'Stat', 'Item', 'Other', 'Total'].map((h, i) => (
            <span key={h} style={{ fontSize: 10, fontWeight: 600, color: i === 2 ? 'var(--accent)' : 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i > 0 ? 'center' : 'left', opacity: i === 2 ? 0.7 : 1 }}>{h}</span>
          ))}
        </div>
      )}

      {categories.map(cat => {
        const skills  = grouped[cat]
        const isOpen  = !!expanded[cat]
        const isUnlocked = !!catUnlocked[cat]
        const customs = customByCategory[cat] || []

        const filtered = skills.filter(sk => {
          const label = c.skills?.[sk.name]?.label
          const disp  = displayName(sk.name, label).toLowerCase()
          const matchSearch = !query || disp.includes(query) || cat.toLowerCase().includes(query)
          const hasRanks = (c.skills?.[sk.name]?.ranks ?? 0) > 0
          return matchSearch && (showZero || hasRanks)
        })
        const filteredCustoms = customs.filter(cs => {
          if (!showZero && !cs.ranks) return false
          if (query) {
            const disp = displayName(cs.template_name, cs.label).toLowerCase()
            return disp.includes(query) || cat.toLowerCase().includes(query)
          }
          return true
        })
        if (!filtered.length && !filteredCustoms.length && query) return null

        const catStats = CATEGORY_STATS[cat] || '-'
        const catStatB = getStatBonus(c, catStats)
        const catCost  = skills[0] ? profCost(skills[0]) : '?'

        return (
          <div key={cat} style={{ marginBottom: 4 }}>
            {/* Category header */}
            <div style={{
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: isOpen ? '8px 8px 0 0' : 8, padding: '8px 14px',
              display: 'flex', alignItems: 'center', gap: 10, userSelect: 'none',
            }}>
              {/* Expand/collapse on most of the row */}
              <span onClick={() => toggle(cat)} style={{ fontSize: 10, color: 'var(--text3)', width: 10, flexShrink: 0, cursor: 'pointer' }}>
                {isOpen ? <ChevronDownIcon size={10} color="var(--text3)" /> : <ChevronRightIcon size={10} color="var(--text3)" />}
              </span>
              <span onClick={() => toggle(cat)} style={{ fontWeight: 600, flex: 1, fontSize: 13, cursor: 'pointer' }}>{cat}</span>
              <span onClick={() => toggle(cat)} style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0, cursor: 'pointer' }}>
                {catStats === '-' ? '—' : catStats} ({catStatB >= 0 ? '+' : ''}{catStatB})
              </span>
              <span onClick={() => toggle(cat)} style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0, cursor: 'pointer' }}>{catCost}</span>

              {/* Lock / unlock for this category */}
              <button
                onClick={e => { e.stopPropagation(); if (!isOpen) toggle(cat); toggleCatLock(cat) }}
                title={isUnlocked ? 'Lock category (hide edit controls)' : 'Unlock category to edit skills'}
                style={{
                  background: 'transparent', border: 'none',
                  cursor: 'pointer', padding: 2, flexShrink: 0,
                  display: 'flex', alignItems: 'center',
                  color: isUnlocked ? 'var(--text2)' : 'var(--text3)',
                  transition: 'color 0.15s',
                }}
                onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
                onMouseLeave={e => e.currentTarget.style.color = isUnlocked ? 'var(--text2)' : 'var(--text3)'}
              >
                {isUnlocked
                  ? <UnlockIcon size={15} color="currentColor" />
                  : <LockIcon size={15} color="currentColor" />
                }
              </button>
            </div>

            {isOpen && (
              <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
                {filtered.map(skill => {
                  const cs = c.skills?.[skill.name] || {}
                  // Find any custom instances whose template is this skill, in creation order
                  const children = filteredCustoms.filter(fc => fc.template_name === skill.name)
                  return (
                    <React.Fragment key={skill.name}>
                      <SkillRow {...rowCtx} skill={skill} cs={cs} rowKey={skill.name} isCustom={false} customId={null} catIsUnlocked={isUnlocked} cultureGrant={cultureLookup[skill.name]} isMobile={isMobile} />
                      {children.map(fc => {
                        const tmpl = fc._template || {}
                        return <SkillRow key={fc.id} {...rowCtx} skill={tmpl} cs={fc} rowKey={fc.id} isCustom={true} customId={fc.id} catIsUnlocked={isUnlocked} cultureGrant={cultureLookup[tmpl.name]} isMobile={isMobile} />
                      })}
                    </React.Fragment>
                  )
                })}
                {/* Orphaned custom skills whose template wasn't in the filtered list */}
                {filteredCustoms.filter(fc => !filtered.some(sk => sk.name === fc.template_name)).map(cs => {
                  const tmpl = cs._template || {}
                  return <SkillRow key={cs.id} {...rowCtx} skill={tmpl} cs={cs} rowKey={cs.id} isCustom={true} customId={cs.id} catIsUnlocked={isUnlocked} cultureGrant={cultureLookup[tmpl.name]} isMobile={isMobile} />
                })}
              </div>
            )}
          </div>
        )
      })}

      <SpellListsSection c={c} query={query} updateSpellList={updateSpellList} removeSpellList={removeSpellList} updateCharacter={updateCharacter} isMobile={isMobile}
        sectionOpen={spellOpen} setSectionOpen={setSpellOpen}
        expanded={spellSubExp} setExpanded={setSpellSubExp}
        unlocked={spellUnlocked} setUnlocked={setSpellUnlocked}
      />
    </div>
  )
}

/* ─── SPELL LISTS SECTION ──────────────────────────────── */
const SPELL_SUBSECTIONS = ['Magic Ritual', 'Base', 'Open', 'Closed', 'Arcane', 'Restricted']

// Map each skill subcategory to matching sections in spell_lists.json
function getSpellListOptions(sub, realm, alreadyAdded) {
  const all = Object.keys(spellListsDb)
  const filtered = all.filter(name => {
    if (alreadyAdded.has(name)) return false
    const section = spellListsDb[name].section || ''
    const listRealm = spellListsDb[name].realm || ''
    const matchRealm = !realm || listRealm === realm
    if (sub === 'Base')          return section.includes('Base') && matchRealm
    if (sub === 'Open')          return section.startsWith('Open') && matchRealm
    if (sub === 'Closed')        return section.startsWith('Closed') && matchRealm
    if (sub === 'Restricted')    return section.includes('Evil') && matchRealm
    if (sub === 'Magic Ritual')  return matchRealm  // rituals aren't in spell_lists.json; show all
    if (sub === 'Arcane')        return matchRealm  // arcane catch-all; show all
    return matchRealm
  })
  return filtered.sort()
}

function SpellListsSection({ c, query, updateSpellList, removeSpellList, updateCharacter, isMobile,
  sectionOpen, setSectionOpen, expanded, setExpanded, unlocked, setUnlocked }) {
  const [adding, setAdding] = useState(null) // { sub, name }

  // Resolve casting stat for the header label only
  const defaultStatFull  = REALM_DEFAULT_STAT[c.realm] || null
  const castStatFull     = c.spell_cast_stat ?? defaultStatFull
  const talentSpellBonus = getTalentBonuses(c).spellcasting

  const grouped = useMemo(() => {
    const map = Object.fromEntries(SPELL_SUBSECTIONS.map(s => [s, []]))
    for (const [name, data] of Object.entries(c.spell_lists || {})) {
      const cat = data.category || 'Base'
      if (map[cat]) map[cat].push({ name, ...(typeof data === 'number' ? { ranks: data } : data) })
      else map['Base'].push({ name, ...(typeof data === 'number' ? { ranks: data } : data) })
    }
    return map
  }, [c.spell_lists])

  // If searching, show section open with matching lists visible
  const effectiveOpen = sectionOpen || !!query

  const totalLists = Object.values(c.spell_lists || {}).length

  function addList(sub) {
    const name = adding?.name?.trim()
    if (!name) return
    if (c.spell_lists?.[name]) return // already exists
    updateSpellList(name, { ranks: 0, category: sub, proficient: false })
    setAdding(null)
  }

  if (query) {
    // In search mode: show matching spell lists flat
    const hits = Object.entries(c.spell_lists || {}).filter(([name]) =>
      name.toLowerCase().includes(query)
    )
    if (!hits.length) return null
  }

  return (
    <div style={{ marginBottom: 4 }}>
      {/* Main section header */}
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)',
        borderRadius: effectiveOpen ? '8px 8px 0 0' : 8,
        padding: '8px 14px', display: 'flex', alignItems: 'center', gap: 10,
        userSelect: 'none',
      }}>
        <span onClick={() => setSectionOpen(o => !o)} style={{ fontSize: 10, color: 'var(--text3)', width: 10, flexShrink: 0, display: 'flex', alignItems: 'center', cursor: 'pointer' }}>
          {effectiveOpen
            ? <ChevronDownIcon size={10} color="var(--text3)" />
            : <ChevronRightIcon size={10} color="var(--text3)" />
          }
        </span>
        <span onClick={() => setSectionOpen(o => !o)} style={{ fontWeight: 600, flex: 1, fontSize: 13, cursor: 'pointer' }}>Spell Lists</span>

        {/* Stat selector — editable when unlocked */}
        {unlocked ? (
          <select
            value={castStatFull || ''}
            onChange={e => updateCharacter({ spell_cast_stat: e.target.value || null })}
            onClick={e => e.stopPropagation()}
            style={{ fontSize: 11, background: 'var(--surface2)', border: '1px solid var(--border2)',
              borderRadius: 5, padding: '2px 4px', color: 'var(--text2)', cursor: 'pointer' }}
          >
            <option value="">— auto ({defaultStatFull ?? 'none'}) —</option>
            {ALL_STATS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        ) : (
          <span onClick={() => setSectionOpen(o => !o)}
            title={`SCR: raw ranks + ${castStatFull ?? 'realm stat'}×1 · Mastery: rank bonus + ${castStatFull ?? 'realm stat'}×2 + Memory${talentSpellBonus ? ` + ${talentSpellBonus} talent` : ''}`}
            style={{ fontSize: 11, color: 'var(--text2)', flexShrink: 0, cursor: 'pointer' }}>
            SCR/MST · {castStatFull ?? (defaultStatFull ?? 'no realm')}
          </span>
        )}

        {totalLists > 0 && (
          <span onClick={() => setSectionOpen(o => !o)} style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0, cursor: 'pointer' }}>{totalLists} list{totalLists !== 1 ? 's' : ''}</span>
        )}

        {/* Lock / unlock */}
        <button
          onClick={e => { e.stopPropagation(); if (!effectiveOpen) setSectionOpen(true); setUnlocked(u => !u) }}
          title={unlocked ? 'Lock spell lists' : 'Unlock to edit spell lists'}
          style={{ background: 'transparent', border: 'none', cursor: 'pointer', padding: 2, flexShrink: 0,
            display: 'flex', alignItems: 'center', color: unlocked ? 'var(--text2)' : 'var(--text3)', transition: 'color 0.15s' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--text)'}
          onMouseLeave={e => e.currentTarget.style.color = unlocked ? 'var(--text2)' : 'var(--text3)'}
        >
          {unlocked ? <UnlockIcon size={15} color="currentColor" /> : <LockIcon size={15} color="currentColor" />}
        </button>
      </div>

      {effectiveOpen && (
        <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 8px 8px', overflow: 'hidden' }}>
          {SPELL_SUBSECTIONS.map(sub => {
            const lists = (grouped[sub] || []).filter(l =>
              !query || l.name.toLowerCase().includes(query)
            )
            const subOpen = !!expanded[sub]
            const isAdding = adding?.sub === sub

            return (
              <div key={sub}>
                {/* Subsection header */}
                <div
                  onClick={() => setExpanded(p => ({ ...p, [sub]: !p[sub] }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 14px', cursor: 'pointer',
                    background: 'var(--surface2)',
                    borderTop: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: 9, color: 'var(--text3)', flexShrink: 0, display: 'flex', alignItems: 'center' }}>
                    {subOpen
                      ? <ChevronDownIcon size={9} color="var(--text3)" />
                      : <ChevronRightIcon size={9} color="var(--text3)" />
                    }
                  </span>
                  <span style={{ flex: 1, fontSize: 11, fontWeight: 600, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{sub}</span>
                  {lists.length > 0 && (
                    <span style={{ fontSize: 10, color: 'var(--text3)' }}>{lists.length}</span>
                  )}
                  {/* Add button — only when unlocked */}
                  {unlocked && (
                    <button
                      onClick={e => { e.stopPropagation(); setExpanded(p => ({ ...p, [sub]: true })); setAdding(isAdding ? null : { sub, name: '' }) }}
                      style={{
                        background: 'none', border: '1px solid var(--border2)', borderRadius: 4,
                        color: 'var(--text3)', cursor: 'pointer', fontSize: 11, padding: '1px 6px',
                      }}
                    >+</button>
                  )}
                </div>

                {(subOpen || query) && (
                  <>
                    {/* Column headers */}
                    {lists.length > 0 && (
                      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? SPELL_GRID_M : SPELL_GRID,
                        padding: '3px 14px', gap: 6, background: 'var(--surface2)',
                        borderTop: '1px solid var(--border)' }}>
                        <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.07em' }}>List</span>
                        <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.07em' }}>Ranks</span>
                        <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.07em' }}
                          title="Spellcasting Roll: raw ranks + realm stat (×1) + talents">SCR</span>
                        <span style={{ fontSize: 9, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', textAlign: 'center', letterSpacing: '0.07em' }}
                          title="Spell Mastery: full skill bonus (rank bonus + stats×2 + Memory + item + prof + talents)">Mastery</span>
                      </div>
                    )}
                    {lists.map(list => (
                      <SpellListRow key={list.name} list={list} char={c}
                        updateSpellList={updateSpellList} removeSpellList={removeSpellList}
                        sub={sub} unlocked={unlocked} isMobile={isMobile} />
                    ))}
                    {isAdding && (() => {
                      const alreadyAdded = new Set(Object.keys(c.spell_lists || {}))
                      const options = getSpellListOptions(sub, c.realm, alreadyAdded)
                      return (
                        <div style={{ display: 'flex', gap: 6, padding: '6px 14px', alignItems: 'center', borderTop: '1px solid var(--border)', background: 'rgba(99,102,241,0.06)', flexWrap: 'wrap' }}>
                          {options.length > 0 ? (
                            <select
                              autoFocus
                              value={adding.name}
                              onChange={e => setAdding(a => ({ ...a, name: e.target.value }))}
                              style={{ flex: 1, minWidth: 180, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 5, padding: '4px 7px', color: 'var(--text)', fontSize: 12 }}
                            >
                              <option value="">— choose a {sub} list —</option>
                              {options.map(name => (
                                <option key={name} value={name}>{name}</option>
                              ))}
                            </select>
                          ) : (
                            <input
                              autoFocus
                              value={adding.name}
                              onChange={e => setAdding(a => ({ ...a, name: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') addList(sub); if (e.key === 'Escape') setAdding(null) }}
                              placeholder={`Custom ${sub} list name…`}
                              style={{ flex: 1, minWidth: 180, background: 'var(--surface)', border: '1px solid var(--border2)', borderRadius: 5, padding: '4px 7px', color: 'var(--text)', fontSize: 12 }}
                            />
                          )}
                          <button onClick={() => addList(sub)} style={{ background: 'var(--accent)', border: 'none', borderRadius: 5, color: '#fff', padding: '4px 10px', fontSize: 11, fontWeight: 600, cursor: 'pointer' }}>Add</button>
                          <button onClick={() => setAdding(null)} style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '0 2px' }}>×</button>
                        </div>
                      )
                    })()}
                  </>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function SpellListRow({ list, char, updateSpellList, removeSpellList, sub, unlocked, isMobile }) {
  const [showExtra, setShowExtra] = useState(false)

  const ranks  = list.ranks ?? 0
  const isProf = !!list.proficient
  const comp   = list.complementary || null   // { skill, type }

  const scrVal     = char ? getSpellCastingBonus(char, list.name) : null
  const masteryVal = char ? getSpellMasteryBonus(char, list.name) : null

  function upd(patch) { updateSpellList(list.name, { ...patch, category: sub }) }

  // All skills available as complementary choices
  const allSkillNames = char ? Object.keys(char.skills || {}).sort() : []

  const spellGrid = isMobile ? SPELL_GRID_M : SPELL_GRID

  // Complementary skill breakdown label
  const compLabel = (() => {
    if (!comp?.skill) return null
    const s    = char?.skills?.[comp.skill] || {}
    const raw  = (s.ranks ?? 0) + (s.culture_ranks ?? 0)
    const val  = comp.type === 'secondary' ? Math.floor(raw / 2) : raw
    return `${comp.skill} (${comp.type === 'secondary' ? 'secondary' : 'main'}) +${val}`
  })()

  const nameCell = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
      {unlocked && (
        <button onClick={() => upd({ proficient: !isProf })}
          title={isProf ? 'Proficient — click to remove' : 'Mark as proficient'}
          style={{ width: 7, height: 7, padding: 0, flexShrink: 0, cursor: 'pointer',
            border: '1.5px solid ' + (isProf ? 'var(--accent)' : 'var(--text3)'),
            background: isProf ? 'var(--accent)' : 'transparent', borderRadius: 1 }} />
      )}
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
        whiteSpace: 'nowrap', color: isProf ? 'var(--accent)' : 'var(--text)', fontSize: 12 }}>
        {list.name}
      </span>
      {!unlocked && compLabel && (
        <span style={{ fontSize: 9, color: 'var(--purple)', flexShrink: 0 }}
          title={`Complementary: ${compLabel}`}>comp</span>
      )}
      {unlocked && isProf && (
        <span style={{ fontSize: 9, background: 'var(--accent)', color: '#fff', padding: '1px 4px',
          borderRadius: 3, fontWeight: 700, letterSpacing: '0.04em', flexShrink: 0 }}>PROF</span>
      )}
      {unlocked && (
        <button onClick={() => setShowExtra(x => !x)}
          title="Extra options (complementary skill, talent bonus)"
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '1px 3px',
            color: (comp || list.talent_bonus) ? 'var(--purple)' : 'var(--text3)',
            display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <ChevronDownIcon size={9} color="currentColor" />
        </button>
      )}
      {unlocked && (
        <button onClick={() => removeSpellList(list.name)}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--danger)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--text3)'}
          style={{ background: 'none', border: 'none', color: 'var(--text3)', cursor: 'pointer',
            padding: 2, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
          <XIcon size={11} color="currentColor" />
        </button>
      )}
    </div>
  )

  const fmt = v => v == null ? '—' : (v >= 0 ? `+${v}` : `${v}`)

  const numCells = (
    <>
      <input type="number" min={0} value={ranks || ''} onChange={e => upd({ ranks: Number(e.target.value) || 0 })}
        placeholder="0" style={{ padding: '3px 4px' }} />
      {/* SCR column */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 12,
          color: scrVal > 0 ? 'var(--success)' : scrVal < 0 ? 'var(--danger)' : 'var(--text2)' }}
          title={`SCR: ${ranks} raw ranks + realm stat×1 + talents${compLabel ? ' + ' + compLabel : ''}`}>
          {fmt(scrVal)}
        </span>
        {(() => {
          const talB = (char ? getTalentBonuses(char).spellcasting : 0)
            + (list.talent_bonus || 0)
            + (char ? getNamedTalentBonus(char, list.name) : 0)
          if (!talB) return null
          return (
            <span style={{ display: 'block', fontSize: 9, color: 'var(--purple)', lineHeight: 1 }}
              title="Talent / custom bonus included in SCR">
              T{talB >= 0 ? `+${talB}` : talB}
            </span>
          )
        })()}
      </div>
      {/* Mastery column */}
      <div style={{ textAlign: 'center' }}>
        <span style={{ fontWeight: 700, fontSize: 12,
          color: masteryVal > 0 ? 'var(--success)' : masteryVal < 0 ? 'var(--danger)' : 'var(--text2)' }}
          title={`Mastery: rank bonus ${rankBonus(ranks) >= 0 ? '+' : ''}${rankBonus(ranks)} + realm stat×2 + Memory + item + prof + talents${compLabel ? ' + ' + compLabel : ''}`}>
          {fmt(masteryVal)}
        </span>
        {isProf && (
          <span style={{ display: 'block', fontSize: 9, color: 'var(--accent)', lineHeight: 1 }}
            title={`Proficiency +${Math.min(ranks, 30)} (= ranks, max 30)`}>P+{Math.min(ranks, 30)}</span>
        )}
      </div>
    </>
  )

  // Extra options panel (complementary skill + per-list talent bonus + item bonus)
  const extraPanel = unlocked && showExtra && (
    <div style={{ padding: '6px 14px 8px', background: 'var(--surface2)',
      borderTop: '1px dashed var(--border)', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
      {/* Complementary skill */}
      <label style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
        Comp. skill:
        <select value={comp?.skill || ''} onChange={e => upd({ complementary: e.target.value ? { skill: e.target.value, type: comp?.type || 'secondary' } : null })}
          style={{ fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border2)',
            borderRadius: 4, padding: '2px 4px', color: 'var(--text)', maxWidth: 160 }}>
          <option value="">— none —</option>
          {allSkillNames.map(sn => <option key={sn} value={sn}>{sn}</option>)}
        </select>
      </label>
      {comp?.skill && (
        <label style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
          Type:
          <select value={comp.type || 'secondary'} onChange={e => upd({ complementary: { ...comp, type: e.target.value } })}
            style={{ fontSize: 11, background: 'var(--surface)', border: '1px solid var(--border2)',
              borderRadius: 4, padding: '2px 4px', color: 'var(--text)' }}>
            <option value="main">Main (raw ranks)</option>
            <option value="secondary">Secondary (ranks ÷ 2)</option>
          </select>
        </label>
      )}
      {/* Item bonus */}
      <label style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
        Item:
        <input type="number" value={list.item_bonus || ''} placeholder="0"
          onChange={e => upd({ item_bonus: Number(e.target.value) || 0 })}
          style={{ width: 44, padding: '2px 4px', fontSize: 11 }} />
      </label>
      {/* Per-list talent/custom bonus */}
      <label style={{ fontSize: 11, color: 'var(--text3)', display: 'flex', alignItems: 'center', gap: 4 }}>
        Talent/custom:
        <input type="number" value={list.talent_bonus || ''} placeholder="0"
          onChange={e => upd({ talent_bonus: Number(e.target.value) || 0 })}
          style={{ width: 44, padding: '2px 4px', fontSize: 11 }} />
      </label>
      {compLabel && (
        <span style={{ fontSize: 10, color: 'var(--purple)', background: 'var(--purple)22',
          padding: '2px 7px', borderRadius: 10, flexShrink: 0 }}>
          {compLabel}
        </span>
      )}
    </div>
  )

  if (isMobile) {
    return (
      <div style={{ borderTop: '1px solid var(--border)' }}>
        <div style={{ padding: '6px 14px 4px', fontSize: 13 }}>
          <div style={{ marginBottom: 4 }}>{nameCell}</div>
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '48px 56px 60px', gap: 4, alignItems: 'center' }}>
              {numCells}
            </div>
          </div>
        </div>
        {extraPanel}
      </div>
    )
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: spellGrid,
        padding: '5px 14px', gap: 6, alignItems: 'center', fontSize: 13 }}>
        {nameCell}
        {numCells}
      </div>
      {extraPanel}
    </div>
  )
}

function Btn({ onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: 'var(--surface2)', border: '1px solid var(--border)',
      color: 'var(--text2)', borderRadius: 6, padding: '5px 10px',
      cursor: 'pointer', fontSize: 12, flexShrink: 0,
    }}>{children}</button>
  )
}

function Empty({ text }) {
  return <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text3)' }}>{text}</div>
}
