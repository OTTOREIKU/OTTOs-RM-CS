import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import ReactDOM from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer, NodeViewWrapper } from '@tiptap/react'

import skillsData     from '../data/skills.json'
import weaponsData    from '../data/weapons.json'
import talentsData    from '../data/talents.json'
import racesData      from '../data/races.json'
import armorData      from '../data/armor.json'
import spellListsData        from '../data/spell_lists.json'
import spellDescriptionsData from '../data/spell_descriptions.json'
import { loadNotebook } from '../store/notebook.js'
import { rankBonus, getTotalStatBonus, getSpellCastingBonus, getSpellMasteryBonus } from '../utils/calc.js'
import { useCharacter } from '../store/CharacterContext.jsx'

// ── Type configuration ─────────────────────────────────────────────────────────
// cssVar references --accent/--danger/etc so colorblind overrides apply automatically.

const TYPES = ['skill', 'weapon', 'talent', 'race', 'armor', 'spell', 'note']

const TYPE_CFG = {
  skill:  { label: 'Skill',  cssVar: '--accent'  },
  weapon: { label: 'Weapon', cssVar: '--danger'  },
  talent: { label: 'Talent', cssVar: '--purple'  },
  race:   { label: 'Race',   cssVar: '--success' },
  armor:  { label: 'Armor',  cssVar: '--warning' },
  spell:  { label: 'Spell',  cssVar: '--info'    },
  note:   { label: 'Note',   cssVar: '--accent'  },
}

// ── Note navigation callback (registered by NotebookView while mounted) ─────────
let _noteNavCb = null
export function registerNoteNav(fn) { _noteNavCb = fn }

// ── Skill bonus helpers (mirrors CharacterSheet.jsx computeSkillTotal) ────────
const _SKILL_CAT_STATS = {
  'Animal':'Ag/Em','Awareness':'In/Re','Battle Expertise':'-','Body Discipline':'Co/SD',
  'Brawn':'Co/SD','Combat Expertise':'-','Combat Training':'Ag/St','Composition':'Em/In','Crafting':'Ag/Me',
  'Delving':'Em/In','Environmental':'In/Me','Gymnastic':'Ag/Qu','Lore':'Me/Me',
  'Lore: Languages':'Me/Me','Magical Expertise':'-','Medical':'In/Me','Mental Discipline':'Pr/SD',
  'Movement':'Ag/St','Performance Art':'Em/Pr','Power Manipulation':'RS/RS','Science':'Me/Re',
  'Social':'Em/In','Subterfuge':'Ag/SD','Technical':'In/Re','Vocation':'Em/Me',
}
const _SKILL_STAT_MAP = {
  Ag:'Agility',Co:'Constitution',Em:'Empathy',In:'Intuition',
  Me:'Memory',Pr:'Presence',Qu:'Quickness',Re:'Reasoning',
  SD:'Self Discipline',St:'Strength',
}
function _chipStatBonus(c, statKeys) {
  if (!statKeys || statKeys === '-') return 0
  const realm  = (c.realm || '').toLowerCase()
  const rsKey  = realm.includes('channel') ? 'Intuition'
    : realm.includes('essence') ? 'Empathy'
    : realm.includes('mental')  ? 'Presence' : null
  return statKeys.split('/').reduce((sum, k) => {
    const t = k.trim(), full = t === 'RS' ? rsKey : _SKILL_STAT_MAP[t]
    return full && c.stats?.[full] ? sum + getTotalStatBonus(c.stats[full]) : sum
  }, 0)
}
function _resolveSkillName(templateName, label) {
  if (!label) return templateName
  if (/<[^>]+>/.test(templateName)) return templateName.replace(/<[^>]+>/, label)
  return `${templateName}: ${label}`
}

function computeChipSkillBonus(c, template, skillData) {
  if (!c || !template || !skillData) return null
  const ranks     = (skillData.ranks ?? 0) + (skillData.culture_ranks ?? 0)
  const rb        = rankBonus(ranks)
  const statB     = _chipStatBonus(c, _SKILL_CAT_STATS[template.category] || '-')
                  + _chipStatBonus(c, template.stat_keys)
  const item      = skillData.item_bonus   ?? 0
  const misc      = skillData.talent_bonus ?? 0

  // Mirror SkillsView exactly:
  //   1. resolved name uses the raw template name (template_name), not item.name
  //      (item.name on custom skills is already the display label like "Perception: Hearing")
  //   2. fall back to the raw template name (not item.name) so "Perception" is tried
  //   3. apply talent_excluded filtering just like SkillsView does
  const templateName   = template._isCustom ? template.template_name : template.name
  const resolvedName   = _resolveSkillName(templateName, skillData.label || '')
  const excludedIds    = skillData.talent_excluded || []

  // Build talent entry map (mirrors SkillsView talentBonuses useMemo)
  const talentMap = {}
  for (const inst of (c.talents || [])) {
    const def = talentsData.find(t => t.id === inst.talent_id)
    if (!def?.effects) continue
    for (const eff of def.effects) {
      if (eff.type !== 'skill_talent_bonus') continue
      const skillNames = eff.skill === 'param'
        ? [inst.param, ...(inst.extra_params || [])].filter(Boolean)
        : (eff.skill ? [eff.skill] : [])
      const bonus = eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
      for (const sn of skillNames) {
        if (!talentMap[sn]) talentMap[sn] = []
        talentMap[sn].push({ instId: inst.id, bonus })
      }
    }
  }
  const talentEntries = talentMap[resolvedName] || talentMap[templateName] || []
  const autoBonus     = talentEntries
    .filter(e => !excludedIds.includes(e.instId))
    .reduce((sum, e) => sum + e.bonus, 0)

  const isProf    = skillData.proficient !== undefined ? !!skillData.proficient
    : (template.prof_type === 'Professional' || template.prof_type === 'Knack')
  const profBonus = isProf ? Math.min(ranks, 30) : 0
  return { total: rb + statB + item + misc + autoBonus + profBonus, ranks, rb, statB, item, misc, autoBonus, profBonus }
}
// displayName for a custom skill (mirrors displaySkillName in CharacterSheet)
function _customDisplayName(templateName, label) {
  if (!label) return templateName
  if (/<[^>]+>/.test(templateName)) return templateName.replace(/<[^>]+>/, label)
  return `${templateName}: ${label}`
}

// Helpers — keeps inline style strings clean
const cv   = v => `var(${v})`
const cmix = (v, pct) => `color-mix(in srgb, var(${v}) ${pct}%, transparent)`

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
        name:        spell.name,
        list:        listName,
        realm:       listData.realm    || '',
        section:     listData.section  || '',
        level:       spell.level,
        aoe:         spell.aoe,
        duration:    spell.duration,
        range:       spell.range,
        type:        spell.type,
        description: spellDescriptionsData[listName]?.[String(spell.level)] || '',
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
  if (type === 'note')   return item.id
  if (type === 'skill' && item._isCustom) return `custom::${item.template_name}::${item.label}`
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

function findNoteItem(id) {
  try {
    const nb     = loadNotebook()
    const note   = nb.notes[id]
    if (!note) return null
    const folder = note.folder_id ? nb.folders[note.folder_id] : null
    return { ...note, folderName: folder?.name || null }
  } catch { return null }
}

function findItem(type, id) {
  if (type === 'note') return findNoteItem(id)
  if (type === 'skill' && id.startsWith('custom::')) {
    const rest  = id.slice('custom::'.length)
    const sep   = rest.indexOf('::')
    const tName = sep === -1 ? rest : rest.slice(0, sep)
    const label = sep === -1 ? ''   : rest.slice(sep + 2)
    const tmpl  = skillsData.find(s => s.name === tName)
    if (!tmpl) return null
    return { ...tmpl, label, template_name: tName, _isCustom: true, name: _customDisplayName(tName, label) }
  }
  return (DATA_MAPS[type] || []).find(item => getItemId(type, item) === id) || null
}

function stripHtml(html) {
  if (!html) return ''
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
}

// ── Tooltip content by type ────────────────────────────────────────────────────

function Row({ label, value, color }) {
  if (value == null || value === '') return null
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', fontSize: 11 }}>
      <span style={{ color: 'var(--text2)', flexShrink: 0, minWidth: 90 }}>{label}</span>
      <span style={{ color: color || 'var(--text)', fontWeight: 500 }}>{value}</span>
    </div>
  )
}

function BonusRow({ label, value }) {
  if (value == null || value === 0) return null
  const fmt = v => v >= 0 ? `+${v}` : `${v}`
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
      fontSize: 10, color: 'var(--text3)', padding: '1px 0' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 700, color: value >= 0 ? 'var(--success)' : 'var(--danger)' }}>{fmt(value)}</span>
    </div>
  )
}

function SkillTooltip({ item }) {
  const [tab, setTab] = useState('info')
  const { activeChar: c } = useCharacter()

  const skillData = useMemo(() => {
    if (!c) return null
    if (item._isCustom) {
      return (c.custom_skills || []).find(cs =>
        cs.template_name === item.template_name && cs.label === item.label
      ) || null
    }
    return c.skills?.[item.name] || null
  }, [c, item])

  const bonusData = useMemo(() =>
    computeChipSkillBonus(c, item, skillData),
  [c, item, skillData])

  return (
    <>
      {/* Segmented toggle */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, padding: 3,
        background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        {[['info', 'Info'], ['bonus', 'My Bonus']].map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 10, fontWeight: 700,
            cursor: 'pointer', border: 'none', transition: 'all .12s',
            background: tab === key ? cv('--accent') : 'transparent',
            color:      tab === key ? 'var(--surface)' : 'var(--text3)',
          }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {item.category}
          </div>
          <Row label="Dev Cost"  value={item.dev_cost} />
          <Row label="Prof Type" value={item.prof_type} />
          <Row label="Stat"      value={item.stat_keys} />
        </>
      ) : !c ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No character loaded.</div>
      ) : !skillData ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
          Not trained — add ranks in the Skills tab.
        </div>
      ) : bonusData ? (
        <>
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1,
              color: bonusData.total >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {bonusData.total >= 0 ? `+${bonusData.total}` : bonusData.total}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
              {bonusData.ranks} rank{bonusData.ranks !== 1 ? 's' : ''}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            <BonusRow label="Rank bonus"  value={bonusData.rb} />
            <BonusRow label="Stat bonus"  value={bonusData.statB} />
            <BonusRow label="Item"        value={bonusData.item} />
            <BonusRow label="Misc bonus"  value={bonusData.misc} />
            <BonusRow label="Talents"     value={bonusData.autoBonus} />
            <BonusRow label="Proficiency" value={bonusData.profBonus} />
          </div>
        </>
      ) : null}
    </>
  )
}

const _OB_STATS = {
  melee:   ['Agility', 'Strength'],
  ranged:  ['Agility', 'Quickness'],
  unarmed: ['Agility', 'Strength'],
}

function WeaponTooltip({ item }) {
  const [tab, setTab] = useState('info')
  const { activeChar: c } = useCharacter()

  const bonusData = useMemo(() => {
    if (!c) return null
    const statNames = _OB_STATS[item.ob_type || 'melee'] || _OB_STATS.melee
    const statBonus = Math.round(
      statNames.reduce((sum, s) => sum + (c.stats?.[s] ? getTotalStatBonus(c.stats[s]) : 0), 0)
      / statNames.length
    )
    const skillName = item.skill_name || ''
    // Mirror getWeaponOB: exact match first, then label match for template slots
    let charSkill = c.skills?.[skillName] || null
    if (!charSkill || (!(charSkill.ranks ?? 0) && !(charSkill.culture_ranks ?? 0))) {
      const found = Object.entries(c.skills || {}).find(
        ([key, data]) => data.label === skillName && key !== skillName
      )
      if (found) charSkill = found[1]
    }
    charSkill = charSkill || {}
    const ranks  = (charSkill.ranks ?? 0) + (charSkill.culture_ranks ?? 0)
    const rb     = ranks > 0 ? rankBonus(ranks) : 0
    const total  = statBonus + rb
    return { total, statBonus, rb, ranks, statNames }
  }, [c, item])

  return (
    <>
      {/* Segmented toggle */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, padding: 3,
        background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        {[['info', 'Info'], ['bonus', 'My OB']].map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 10, fontWeight: 700,
            cursor: 'pointer', border: 'none', transition: 'all .12s',
            background: tab === key ? cv('--danger') : 'transparent',
            color:      tab === key ? '#fff' : 'var(--text3)',
          }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
      ) : !c ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No character loaded.</div>
      ) : bonusData ? (
        <>
          <div style={{ textAlign: 'center', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>Offensive Bonus</div>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1,
              color: bonusData.total >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {bonusData.total >= 0 ? `+${bonusData.total}` : bonusData.total}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
              {bonusData.ranks} rank{bonusData.ranks !== 1 ? 's' : ''} in {item.skill_name}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            <BonusRow label={`Stat (${bonusData.statNames.map(s => s.slice(0,2)).join('+')})`} value={bonusData.statBonus} />
            <BonusRow label="Rank bonus" value={bonusData.rb} />
          </div>
        </>
      ) : null}
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
              <span key={stat} style={{ fontSize: 11, color: val > 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
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
      <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
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
  const [tab, setTab] = useState('info')
  const { activeChar: c } = useCharacter()

  const spellListData = useMemo(() => {
    if (!c) return null
    return c.spell_lists?.[item.list] || null
  }, [c, item.list])

  const ranks       = spellListData?.ranks ?? 0
  const castBonus   = useMemo(() => c ? getSpellCastingBonus(c, item.list)   : null, [c, item.list])
  const mastBonus   = useMemo(() => c ? getSpellMasteryBonus(c, item.list)   : null, [c, item.list])
  const accessible  = ranks >= item.level

  return (
    <>
      {/* Segmented toggle */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 8, padding: 3,
        background: 'var(--surface2)', borderRadius: 8, border: '1px solid var(--border)' }}>
        {[['info', 'Info'], ['bonus', 'My Bonus']].map(([key, lbl]) => (
          <button key={key} onClick={() => setTab(key)} style={{
            flex: 1, padding: '3px 0', borderRadius: 5, fontSize: 10, fontWeight: 700,
            cursor: 'pointer', border: 'none', transition: 'all .12s',
            background: tab === key ? cv('--info') : 'transparent',
            color:      tab === key ? 'var(--surface)' : 'var(--text3)',
          }}>
            {lbl}
          </button>
        ))}
      </div>

      {tab === 'info' ? (
        <>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6,
            textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {item.list} · Lv {item.level}
          </div>
          <div style={{ fontSize: 10, color: 'var(--text2)', marginBottom: 6 }}>
            {item.realm} — {item.section}
          </div>
          <Row label="AoE"      value={item.aoe} />
          <Row label="Duration" value={item.duration} />
          <Row label="Range"    value={item.range} />
          <Row label="Type"     value={item.type} />
          {item.description && (
            <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text2)', lineHeight: 1.5,
              borderTop: '1px solid var(--border)', paddingTop: 5 }}>
              {item.description}
            </div>
          )}
        </>
      ) : !c ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>No character loaded.</div>
      ) : !spellListData || ranks === 0 ? (
        <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
          No ranks in {item.list} — add them in the Spells tab.
        </div>
      ) : (
        <>
          {/* Casting modifier — primary number */}
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 2,
              textTransform: 'uppercase', letterSpacing: '0.06em' }}>Casting modifier</div>
            <div style={{ fontSize: 30, fontWeight: 800, lineHeight: 1,
              color: castBonus >= 0 ? 'var(--success)' : 'var(--danger)' }}>
              {castBonus >= 0 ? `+${castBonus}` : castBonus}
            </div>
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 3 }}>
              {ranks} rank{ranks !== 1 ? 's' : ''} in list
            </div>
          </div>

          {/* Spell accessibility badge */}
          <div style={{
            textAlign: 'center', marginBottom: 8, padding: '3px 8px', borderRadius: 5, fontSize: 10, fontWeight: 700,
            background: accessible ? 'var(--success)20' : 'var(--danger)20',
            color: accessible ? 'var(--success)' : 'var(--danger)',
            border: `1px solid ${accessible ? 'var(--success)' : 'var(--danger)'}40`,
          }}>
            {accessible
              ? `Lv ${item.level} accessible`
              : `Need ${item.level - ranks} more rank${item.level - ranks !== 1 ? 's' : ''} for Lv ${item.level}`}
          </div>

          {/* Mastery bonus */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 6 }}>
            <BonusRow label="Mastery bonus" value={mastBonus} />
          </div>
        </>
      )}
    </>
  )
}

function NoteTooltip({ item, onNavigate }) {
  if (!item) return <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Note not found.</div>
  const preview = stripHtml(item.content).slice(0, 160).trim()
  return (
    <>
      {item.folderName && (
        <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 6,
          textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          {item.folderName}
        </div>
      )}
      <div style={{ fontSize: 11, color: 'var(--text2)', lineHeight: 1.5, marginBottom: 8, minHeight: 16 }}>
        {preview
          ? <>{preview}{preview.length >= 160 ? '…' : ''}</>
          : <em style={{ color: 'var(--text3)' }}>Empty note</em>}
      </div>
      <button onClick={onNavigate}
        style={{
          width: '100%', padding: '5px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600,
          cursor: 'pointer', border: '1px solid var(--accent)', background: 'var(--accent)18',
          color: 'var(--accent)', textAlign: 'center',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'var(--accent)'; e.currentTarget.style.color = 'var(--surface)' }}
        onMouseLeave={e => { e.currentTarget.style.background = 'var(--accent)18'; e.currentTarget.style.color = 'var(--accent)' }}>
        Open note →
      </button>
    </>
  )
}

function TooltipContent({ type, item, onNavigate }) {
  if (type !== 'note' && !item) return <div style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>Item not found.</div>
  switch (type) {
    case 'skill':  return <SkillTooltip  item={item} />
    case 'weapon': return <WeaponTooltip item={item} />
    case 'talent': return <TalentTooltip item={item} />
    case 'race':   return <RaceTooltip   item={item} />
    case 'armor':  return <ArmorTooltip  item={item} />
    case 'spell':  return <SpellTooltip  item={item} />
    case 'note':   return <NoteTooltip   item={item} onNavigate={onNavigate} />
    default:       return null
  }
}

// ── Tooltip popup (portalled to body) ─────────────────────────────────────────

function TooltipPopup({ type, id, label, anchorRef, onClose, onNavigate }) {
  const popupRef = useRef(null)
  const item     = useMemo(() => findItem(type, id), [type, id])
  const cfg      = TYPE_CFG[type] || { label: '?', cssVar: '--text2' }
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
      border: `1px solid ${cmix(cfg.cssVar, 50)}`,
      borderTop: `2px solid ${cv(cfg.cssVar)}`,
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
        <span style={{ fontSize: 9, color: cv(cfg.cssVar), background: cmix(cfg.cssVar, 15),
          border: `1px solid ${cmix(cfg.cssVar, 35)}`, borderRadius: 3, padding: '1px 5px',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>
          {cfg.label}
        </span>
      </div>
      <TooltipContent type={type} item={item} onNavigate={onNavigate} />
    </div>,
    document.body
  )
}

// ── Chip node view ─────────────────────────────────────────────────────────────

function RMRefNodeView({ node }) {
  const { refType, refId, refLabel } = node.attrs
  const cfg      = TYPE_CFG[refType] || { label: '?', cssVar: '--text2' }
  const chipRef  = useRef(null)
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const handleNoteNavigate = useCallback(() => {
    setOpen(false)
    if (_noteNavCb) {
      _noteNavCb(refId)
    } else {
      navigate('/notebook', { state: { openNoteId: refId } })
    }
  }, [refId, navigate])

  return (
    <NodeViewWrapper as="span" style={{ display: 'inline' }}>
      <span
        ref={chipRef}
        contentEditable={false}
        onClick={() => setOpen(v => !v)}
        style={{
          display: 'inline',
          background: 'transparent',
          color: cv(cfg.cssVar),
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
          onNavigate={refType === 'note' ? handleNoteNavigate : undefined}
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

export function RMRefPicker({ open, onClose, editor, notes = [], folders = {}, customSkills = [] }) {
  const [type,  setType]  = useState('skill')
  const [query, setQuery] = useState('')
  const inputRef = useRef(null)

  const noteResults = useMemo(() => {
    if (type !== 'note') return []
    const q = query.toLowerCase().trim()
    return (q ? notes.filter(n => n.title.toLowerCase().includes(q)) : notes)
      .slice().sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return new Date(b.updated_at) - new Date(a.updated_at)
      })
  }, [type, query, notes])

  // Custom skill items derived from the active character — shown at top of skill list
  const customSkillItems = useMemo(() => {
    if (type !== 'skill') return []
    const q = query.toLowerCase().trim()
    return customSkills
      .map(cs => {
        const tmpl = skillsData.find(s => s.name === cs.template_name)
        if (!tmpl) return null
        const displayName = _customDisplayName(cs.template_name, cs.label)
        return { ...tmpl, label: cs.label, template_name: cs.template_name, _isCustom: true, name: displayName }
      })
      .filter(Boolean)
      .filter(item => !q || item.name.toLowerCase().includes(q) || item.template_name.toLowerCase().includes(q))
  }, [type, query, customSkills])

  const results = useMemo(() => type === 'note' ? [] : searchItems(type, query), [type, query])

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
    const label = item.title || item.name || item.id
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
    : type === 'note'
      ? noteResults.length
      : type === 'skill'
        ? customSkillItems.length + results.length
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
                    background: active ? cv(c.cssVar) : 'transparent',
                    color: active ? 'var(--surface)' : cv(c.cssVar),
                    border: `1px solid ${active ? 'transparent' : cv(c.cssVar)}`,
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
          ) : type === 'note' ? (
            noteResults.length === 0 ? (
              <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                {notes.length === 0 ? 'No notes yet — create some in the Notebook.' : 'No notes match your search.'}
              </div>
            ) : (
              noteResults.slice(0, 80).map(note => (
                <NoteResultRow key={note.id} note={note} folders={folders} onInsert={() => handleInsert(note)} cfg={cfg} />
              ))
            )
          ) : type === 'skill' ? (
            <>
              {/* Character's custom skill instances */}
              {customSkillItems.length > 0 && (
                <>
                  <div style={{ padding: '6px 16px 3px', fontSize: 10, fontWeight: 800,
                    color: cv(cfg.cssVar), textTransform: 'uppercase', letterSpacing: '0.1em',
                    borderBottom: '1px solid var(--border)' }}>
                    This Character
                  </div>
                  {customSkillItems.map((item, i) => (
                    <ResultRow key={`csk-${i}`} item={item} type={type} cfg={cfg}
                      onInsert={() => handleInsert(item)}
                      sublabel={`${item.category} · Custom`} />
                  ))}
                  {results.length > 0 && (
                    <div style={{ padding: '6px 16px 3px', fontSize: 10, fontWeight: 800,
                      color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.1em',
                      borderBottom: '1px solid var(--border)', marginTop: 2 }}>
                      Reference
                    </div>
                  )}
                </>
              )}
              {results.length === 0 && customSkillItems.length === 0 ? (
                <div style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text3)', fontStyle: 'italic' }}>
                  No skills found.
                </div>
              ) : (
                results.slice(0, 60).map((item, i) => (
                  <ResultRow key={i} item={item} type={type} cfg={cfg} onInsert={() => handleInsert(item)} />
                ))
              )}
            </>
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
                color: cv(cfg.cssVar),
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

function ResultRow({ item, type, cfg, onInsert, sublabel: sublabelOverride }) {
  const label    = item.name || item.id || ''
  const sublabel = sublabelOverride ?? getSubLabel(type, item)

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

function NoteResultRow({ note, folders, onInsert, cfg }) {
  const folderName = note.folder_id ? folders[note.folder_id]?.name : null
  const preview    = stripHtml(note.content).slice(0, 80).trim()
  return (
    <button onClick={onInsert}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        width: '100%', textAlign: 'left',
        background: 'none', border: 'none',
        padding: '8px 16px', cursor: 'pointer',
        borderBottom: '1px solid var(--border)',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface2)' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'none' }}>
      {note.color && (
        <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: 5,
          background: { red:'#ef4444',orange:'#f97316',yellow:'eab308',green:'#22c55e',blue:'var(--accent)',purple:'var(--purple)' }[note.color] || 'var(--text3)' }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 600,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title || 'Untitled'}
        </div>
        {(folderName || preview) && (
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 2,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {folderName ? `${folderName}${preview ? ' · ' : ''}` : ''}{preview}
          </div>
        )}
      </div>
      {note.pinned && (
        <span style={{ fontSize: 9, color: cv(cfg.cssVar), flexShrink: 0, marginTop: 2 }}>📌</span>
      )}
    </button>
  )
}
