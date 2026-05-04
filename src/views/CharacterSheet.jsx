import React, { useState, useMemo, useRef } from 'react'
import { usePersistentOpen, useScrollRestore } from '../hooks/persist.js'
import { ChevronDownIcon, ChevronUpIcon, XIcon, CheckIcon, DiamondIcon, EyeOpenIcon, EyeClosedIcon } from '../components/Icons.jsx'
import { generateFoundryScript } from '../utils/foundryExport.js'
import { useCharacter } from '../store/CharacterContext.jsx'
import { STATS } from '../store/characters.js'
import { rankBonus, getTotalStatBonus, getDefensiveBonus, getInitiativeBonus, getWeaponOB, getResistanceBonuses, getBaseHits, getEndurance, getPowerPoints, getWeightAllowance, getTalentBonuses, getSpellCastingBonus, getSpellMasteryBonus, getFatiguePenalty, getEnduranceConditionModifier, getKnackBonus } from '../utils/calc.js'
import { REALM_COLORS, SPELL_SECTION_COLORS, RR_COLORS } from '../store/theme.js'
import races from '../data/races.json'
import professions from '../data/professions.json'
import cultures from '../data/cultures.json'
import cultureSkillsData from '../data/culture_skills.json'
import armorData from '../data/armor.json'
import weaponsDb from '../data/weapons.json'
import spellListsDb from '../data/spell_lists.json'
import skillsData from '../data/skills.json'
import talentsData from '../data/talents.json'
import skillCostsData from '../data/skill_costs.json'

const REALMS   = ['Channeling', 'Essence', 'Mentalism']
const SIZES    = ['Small', 'Medium', 'Large', 'Huge']
const ARMOR_TYPES = [
  '1 – None','2 – Heavy Cloth','3 – Soft Leather','4 – Hide Scale',
  '5 – Laminar','6 – Rigid Leather','7 – Metal Scale','8 – Mail',
  '9 – Brigandine','10 – Plate',
]
const SHIELD_OPTIONS = ['None', 'Target Shield', 'Normal Shield', 'Full Shield', 'Wall Shield']
const SHIELD_DB = { 'Target Shield': 15, 'Normal Shield': 20, 'Full Shield': 25, 'Wall Shield': 30 }
const ARMOR_SECTION_MAP = { torso: 'torso', head: 'helmet', arms: 'vambraces', legs: 'greaves' }
const ARMOR_PART_LABELS = { torso: 'Torso', head: 'Head', arms: 'Arms', legs: 'Legs' }

// Starred skills helpers
const skillsDataMap = Object.fromEntries(skillsData.map(s => [s.name, s]))

// Resolve display name for a skill/custom skill — matches SkillsView displayName logic.
// If template has <placeholder>, the label replaces it; otherwise ": label" is appended.
function displaySkillName(templateName, label) {
  if (!label) return templateName
  if (/<[^>]+>/.test(templateName)) return templateName.replace(/<[^>]+>/, label)
  return `${templateName}: ${label}`
}
const SKILL_CATEGORY_STATS = {
  'Animal':'Ag/Em','Awareness':'In/Re','Battle Expertise':'-','Body Discipline':'Co/SD',
  'Brawn':'Co/SD','Combat Expertise':'-','Combat Training':'Ag/St','Composition':'Em/In','Crafting':'Ag/Me',
  'Delving':'Em/In','Environmental':'In/Me','Gymnastic':'Ag/Qu','Lore':'Me/Me',
  'Lore: Languages':'Me/Me','Magical Expertise':'-','Medical':'In/Me','Mental Discipline':'Pr/SD',
  'Movement':'Ag/St','Performance Art':'Em/Pr','Power Manipulation':'RS/RS','Science':'Me/Re',
  'Social':'Em/In','Subterfuge':'Ag/SD','Technical':'In/Re','Vocation':'Em/Me',
}
const SKILL_STAT_MAP = { Ag:'Agility',Co:'Constitution',Em:'Empathy',In:'Intuition',Me:'Memory',Pr:'Presence',Qu:'Quickness',Re:'Reasoning',SD:'Self Discipline',St:'Strength' }
function getSkillStatBonus(c, statKeys) {
  if (!statKeys || statKeys === '-') return 0
  const realm = (c.realm || '').toLowerCase()
  const rsKey = realm.includes('channel') ? 'Intuition' : realm.includes('essence') ? 'Empathy' : realm.includes('mental') ? 'Presence' : null
  return statKeys.split('/').reduce((sum, k) => {
    const t = k.trim(), full = t === 'RS' ? rsKey : SKILL_STAT_MAP[t]
    return full && c.stats?.[full] ? sum + getTotalStatBonus(c.stats[full]) : sum
  }, 0)
}
function computeSkillTotal(c, template, skillData, talentBonusMap) {
  const ranks = (skillData.ranks ?? 0) + (skillData.culture_ranks ?? 0)
  const rb = rankBonus(ranks)
  const catStatB = getSkillStatBonus(c, SKILL_CATEGORY_STATS[template?.category] || '-')
  const skillStatB = getSkillStatBonus(c, template?.stat_keys)
  const item = skillData.item_bonus ?? 0
  const talent = skillData.talent_bonus ?? 0
  const isProf = skillData.proficient !== undefined ? !!skillData.proficient : (template?.prof_type === 'Professional' || template?.prof_type === 'Knack')
  const profBonus = isProf ? Math.min(ranks, 30) : 0
  const entries = (talentBonusMap[template?.name || ''] || [])
  const excluded = skillData.talent_excluded || []
  const autoBonus = entries.filter(e => !excluded.includes(e.instId)).reduce((s, e) => s + e.bonus, 0)
  const dispName = displaySkillName(template?.name || '', skillData?.label || '')
  const knackBonus = getKnackBonus(c, dispName)
  return rb + catStatB + skillStatB + item + talent + autoBonus + profBonus + knackBonus
}

const BMR_BASE = 10  // meters per round for Medium size
const PACE_TABLE = [
  { label: 'Creep',  mult: 0.25, man_pen: 30,  ap: 1 },
  { label: 'Walk',   mult: 0.5,  man_pen: 0,   ap: 1 },
  { label: 'Jog',    mult: 1,    man_pen: -10, ap: 2 },
  { label: 'Run',    mult: 1.5,  man_pen: -20, ap: 3 },
  { label: 'Sprint', mult: 2,    man_pen: -30, ap: 4 },
  { label: 'Dash',   mult: 3,    man_pen: -50, ap: 'All' },
]
const STAT_ABBR = {
  Agility:'Ag', Constitution:'Co', Empathy:'Em', Intuition:'In',
  Memory:'Me', Presence:'Pr', Quickness:'Qu', Reasoning:'Re',
  'Self Discipline':'SD', Strength:'St',
}
const REALM_STAT = { Channeling:'Intuition', Essence:'Empathy', Mentalism:'Presence' }

// ── Small reusable primitives ─────────────────────────────────────────────────
function Card({ title, action, children, onToggle, isOpen }) {
  const collapsible = onToggle != null
  const showContent = !collapsible || isOpen
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {title && (
        <div
          onClick={collapsible ? onToggle : undefined}
          style={{
            padding: '10px 16px',
            borderBottom: showContent ? '1px solid var(--border)' : 'none',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            cursor: collapsible ? 'pointer' : 'default',
            userSelect: 'none',
          }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)' }}>{title}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            onClick={action ? e => e.stopPropagation() : undefined}>
            {action}
            {collapsible && (isOpen
              ? <ChevronUpIcon size={12} color="var(--text3)" />
              : <ChevronDownIcon size={12} color="var(--text3)" />
            )}
          </div>
        </div>
      )}
      {showContent && <div style={{ padding: 16 }}>{children}</div>}
    </div>
  )
}

function FieldRow({ label, children }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }}>
        {label}
      </label>
      {children}
    </div>
  )
}

function TInput({ value, onChange, placeholder }) {
  return <input type="text" value={value || ''} onChange={e => onChange(e.target.value)} placeholder={placeholder} style={{ width: '100%' }} />
}
function NInput({ value, onChange, min, max, style }) {
  return <input type="number" value={value ?? ''} onChange={e => onChange(e.target.value === '' ? null : Number(e.target.value))} min={min} max={max} style={{ width: '100%', ...style }} />
}
function SInput({ value, onChange, options }) {
  return (
    <select value={value || ''} onChange={e => onChange(e.target.value)} style={{ width: '100%' }}>
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  )
}

function StatCard({ value, label, color, sub, showDetail = true }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', minHeight: 72 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
        {showDetail && sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}

// ── Culture Grants Panel ──────────────────────────────────────────────────────
const CHOICE_LABELS = {
  animal_specialization: 'choose animal',
  combat_unarmed:        'choose unarmed type',
  combat_melee:          'choose melee weapon',
  combat_ranged:         'choose ranged weapon',
  composition_perf_art:  'choose art/music',
  crafting_vocation:     'choose crafting',
  vehicle:               'choose vehicle',
  language:              'spoken/written',
  region_lore:           'choose region',
  lore:                  'choose lore',
  influence:             'choose type',
  survival:              'choose biome',
}

function CultureGrantsPanel({ culture, char, updateCharacter, updateSkill }) {
  const [open, setOpen] = useState(false)
  const entry = cultureSkillsData.find(c => c.name === culture)
  if (!entry) return null

  const grants = entry.grants || []
  const hasNoData = grants.length === 0
  const fixed  = grants.filter(g => !g.choice)
  const choice = grants.filter(g =>  g.choice)
  const applied = char.culture_applied === culture

  function handleApply() {
    if (applied) {
      if (!confirm(`Culture skills for ${culture} are already applied. Re-apply and overwrite?`)) return
    }
    fixed.forEach(g => {
      updateSkill(g.skill, 'culture_ranks', g.ranks)
    })
    updateCharacter({ culture_applied: culture })
  }

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
        color: 'var(--text2)', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <span>Culture Grants — {culture}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {applied && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'none', letterSpacing: 0, display: 'flex', alignItems: 'center', gap: 3 }}><CheckIcon size={10} color="currentColor" /> Applied</span>}
          {open ? <ChevronUpIcon size={12} color="var(--text3)" /> : <ChevronDownIcon size={12} color="var(--text3)" />}
        </div>
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {hasNoData ? (
            <p style={{ fontSize: 12, color: 'var(--text3)', fontStyle: 'italic', margin: 0 }}>
              No standard grants defined for this culture (supplement material).
            </p>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {/* Fixed skills */}
                <div style={{ flex: '1 1 180px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
                    Auto-apply ({fixed.length} skills)
                  </div>
                  {fixed.map(g => (
                    <div key={g.skill} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                      <span style={{
                        minWidth: 26, textAlign: 'center',
                        background: 'var(--accent)', color: '#fff',
                        borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '1px 4px',
                      }}>{g.ranks}</span>
                      <span style={{ fontSize: 12, color: 'var(--text)' }}>{g.skill}</span>
                    </div>
                  ))}
                </div>

                {/* Choice skills */}
                {choice.length > 0 && (
                  <div style={{ flex: '1 1 180px' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 5 }}>
                      Manual choices ({choice.length} grants)
                    </div>
                    {choice.map((g, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <span style={{
                          minWidth: 26, textAlign: 'center',
                          background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border2)',
                          borderRadius: 4, fontSize: 10, fontWeight: 700, padding: '1px 4px',
                        }}>{g.ranks}</span>
                        <span style={{ fontSize: 12, color: 'var(--text2)' }}>{g.skill}</span>
                        <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>
                          {g.max_per_skill ? `max ${g.max_per_skill}/skill · ` : ''}{CHOICE_LABELS[g.choice] || g.choice}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <button onClick={handleApply} style={{
                  background: applied ? 'var(--surface2)' : 'var(--accent)',
                  color: applied ? 'var(--text2)' : '#fff',
                  border: applied ? '1px solid var(--border2)' : 'none',
                  borderRadius: 7, padding: '6px 14px', fontWeight: 600,
                  fontSize: 12, cursor: 'pointer', letterSpacing: '0.01em',
                }}>
                  {applied ? 'Re-apply Fixed Skills' : 'Apply Fixed Skills to Sheet'}
                </button>
                {choice.length > 0 && (
                  <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                    {choice.reduce((s, g) => s + g.ranks, 0)} choice ranks → assign in Skills tab
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ── Knacks Sub-Panel (inside Identity card) ───────────────────────────────────
function KnacksSubPanel({ char, updateCharacter, allSkillNames }) {
  const [open, setOpen] = useState(false)
  const knacks = char.knacks || []
  const summary = knacks.length ? knacks.join(', ') : 'none set'
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
        color: 'var(--text2)', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <span>Knacks</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!open && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{summary}</span>}
          {open ? <ChevronUpIcon size={12} color="var(--text3)" /> : <ChevronDownIcon size={12} color="var(--text3)" />}
        </div>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            2 knacks per character — each grants a permanent <strong style={{ color: 'var(--purple)' }}>+5</strong> to the chosen professional skill.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {[0, 1].map(i => {
              const val = knacks[i] || ''
              return (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Knack {i + 1}
                    {val && <span style={{ marginLeft: 6, color: 'var(--purple)', fontWeight: 700 }}>★ +5</span>}
                  </div>
                  <select
                    value={val}
                    onChange={e => {
                      const next = [knacks[0] || '', knacks[1] || '']
                      next[i] = e.target.value
                      updateCharacter({ knacks: next.filter(Boolean) })
                    }}
                    style={{ width: '100%', fontSize: 13, padding: '5px 8px', borderRadius: 6,
                      background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    <option value="">— none —</option>
                    {allSkillNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Combat Training Groups Sub-Panel (inside Identity card) ───────────────────
const CT_GROUPS = ['Melee Weapons', 'Unarmed', 'Shield', 'Ranged Weapons']
function CTGroupsSubPanel({ char, updateCharacter }) {
  const [open, setOpen] = useState(false)
  const groups = char.combat_training_groups || {}
  const profession = char.profession || ''
  const summary = CT_GROUPS.map(g => {
    const t = groups[g] ?? 1
    const cost = skillCostsData[`Combat Training ${t}`]?.[profession] || `Tier ${t}`
    return `${g.replace(' Weapons', '')}: ${cost}`
  }).join(' · ')
  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
        color: 'var(--text2)', fontSize: 11, fontWeight: 600,
        textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <span>Combat Training Groups</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!open && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{summary}</span>}
          {open ? <ChevronUpIcon size={12} color="var(--text3)" /> : <ChevronDownIcon size={12} color="var(--text3)" />}
        </div>
      </button>
      {open && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            Assign your profession's DP cost tier (Tier 1 = cheapest) to each weapon training group.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {CT_GROUPS.map(group => {
              const tier = groups[group] ?? 1
              return (
                <div key={group} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    {group}
                  </div>
                  <select
                    value={tier}
                    onChange={e => updateCharacter({
                      combat_training_groups: { ...groups, [group]: Number(e.target.value) }
                    })}
                    style={{ width: '100%', fontSize: 13, padding: '5px 8px', borderRadius: 6,
                      background: 'var(--surface2)', border: '1px solid var(--border)', color: 'var(--text)' }}
                  >
                    {[1, 2, 3, 4].map(t => {
                      const cost = skillCostsData[`Combat Training ${t}`]?.[profession]
                      return <option key={t} value={t}>{cost ? `Tier ${t} — ${cost} DP` : `Tier ${t}`}</option>
                    })}
                  </select>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

// ── Weapon Browser State ──────────────────────────────────────────────────────
const WDB_SKILLS = ['All','Blade','Greater Blade','Hafted','Greater Hafted','Pole Arm','Spear','Chain','Greater Chain','Net','Bow','Crossbow','Thrown','Sling','Blowpipe','Shield','Strikes','Grappling/Wrestling']
const WDB_TYPES  = ['All','melee','ranged','unarmed']

function WeaponBrowser({ onSelect, onCancel }) {
  const [q, setQ]       = useState('')
  const [cat, setCat]   = useState('All')
  const [obT, setObT]   = useState('All')

  const filtered = useMemo(() => {
    const lq = q.toLowerCase()
    return weaponsDb.filter(w => {
      if (cat !== 'All' && w.skill_name !== cat) return false
      if (obT !== 'All' && w.ob_type !== obT) return false
      if (lq && !w.name.toLowerCase().includes(lq) && !w.skill_name.toLowerCase().includes(lq)) return false
      return true
    })
  }, [q, cat, obT])

  return (
    <div style={{ border:'1px solid var(--border2)', borderRadius:8, marginBottom:8, overflow:'hidden' }}>
      <div style={{ padding:'8px 10px', background:'var(--surface2)', borderBottom:'1px solid var(--border)', display:'flex', gap:6, flexWrap:'wrap', alignItems:'center' }}>
        <input type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="Search weapons…" autoFocus
          style={{ flex:1, minWidth:120, background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:5, padding:'4px 7px', color:'var(--text)', fontSize:12 }} />
        <select value={obT} onChange={e=>setObT(e.target.value)}
          style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:5, padding:'4px 6px', color:'var(--text)', fontSize:12 }}>
          {WDB_TYPES.map(t=><option key={t} value={t}>{t==='All'?'All types':t}</option>)}
        </select>
        <select value={cat} onChange={e=>setCat(e.target.value)}
          style={{ background:'var(--surface)', border:'1px solid var(--border2)', borderRadius:5, padding:'4px 6px', color:'var(--text)', fontSize:12, minWidth:100 }}>
          {WDB_SKILLS.map(s=><option key={s} value={s}>{s==='All'?'All skills':s}</option>)}
        </select>
        <button onClick={onCancel}
          style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', padding:'2px', display:'flex', alignItems:'center' }}><XIcon size={14} color="currentColor" /></button>
      </div>
      <div style={{ maxHeight:260, overflowY:'auto' }}>
        {filtered.length === 0 && (
          <div style={{ padding:12, textAlign:'center', color:'var(--text3)', fontSize:12 }}>No matches</div>
        )}
        {filtered.map(w => (
          <div key={w.name} onClick={()=>onSelect(w)}
            style={{ padding:'7px 12px', borderBottom:'1px solid var(--border)', cursor:'pointer', display:'flex', gap:10, alignItems:'center' }}
            onMouseEnter={e=>e.currentTarget.style.background='var(--surface2)'}
            onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
            <div style={{ flex:1, minWidth:0 }}>
              <span style={{ fontWeight:600, fontSize:13, color:'var(--text)', marginRight:8 }}>{w.name}</span>
              <span style={{ fontSize:11, color:'var(--text3)' }}>{w.skill_name} · {w.ob_type}</span>
            </div>
            <div style={{ flexShrink:0, display:'flex', gap:10, fontSize:11, color:'var(--text2)' }}>
              <span>Fumble <strong style={{color:w.fumble>=8?'var(--danger)':w.fumble>=6?'#f97316':'var(--text)'}}>{w.fumble}</strong></span>
              {w.str_req > 0 && <span>Str {w.str_req}</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Fatigue Card (CoreLaw §5.5) ───────────────────────────────────────────────
const FATIGUE_COND_ROWS = [
  { key: 'days_no_sleep',   label: 'Days no sleep',      rate: -20, unit: '/day'    },
  { key: 'days_half_sleep', label: 'Days half sleep',    rate: -10, unit: '/day'    },
  { key: 'hours_no_water',  label: 'Hours no water',     rate: -5,  unit: '/hr'     },
  { key: 'days_no_food',    label: 'Days no food',       rate: -10, unit: '/day'    },
  { key: 'days_half_food',  label: 'Days half rations',  rate: -10, unit: '/3 days', div: 3 },
  { key: 'altitude_ft',     label: 'Altitude (ft)',      rate: -10, unit: '/2500 ft', div: 2500 },
  { key: 'temp_offset_f',   label: 'Temp offset (°F)',   rate: -5,  unit: '/5°F',   div: 5 },
]
const FATIGUE_INTERVALS = [
  ['Walk',                   '2 hours' ],
  ['Jog',                    '5 min'   ],
  ['Run',                    '1 min'   ],
  ['Sprint',                 '2 rounds'],
  ['Dash',                   '1 round' ],
  ['Melee / Climbing / Swim','6 rounds'],
]

function FatigueCard({ c, updateCharacter, autoEndurance, armorManPenalty }) {
  const [rollInput, setRollInput] = useState('')
  const [restMin,   setRestMin  ] = useState('')
  const [condOpen,  setCondOpen ] = useState(false)

  const fat    = c.fatigue            || { penalty: 0, injury: 0 }
  const conds  = c.fatigue_conditions || {}
  const pen    = fat.penalty ?? 0   // 0 to -50
  const inj    = fat.injury  ?? 0   // overflow injury ≤ 0
  const total  = pen + inj

  const condMod = getEnduranceConditionModifier(c)
  const rollMod = autoEndurance + armorManPenalty + pen + condMod

  const penColor = pen === 0 ? 'var(--text3)' : pen >= -20 ? 'var(--warning)' : 'var(--danger)'
  const fmt = n  => n > 0 ? `+${n}` : String(n)
  const fmtOpt = n => n === 0 ? '—' : fmt(n)

  function patchFatigue(patch) {
    updateCharacter({ fatigue: { ...fat, ...patch } })
  }

  function addFatigue(amount) {
    const raw = pen - amount
    if (raw >= -50) { patchFatigue({ penalty: raw }) }
    else            { patchFatigue({ penalty: -50, injury: inj + (raw + 50) }) }
  }
  function reduceFatigue(amount) {
    patchFatigue({ penalty: Math.min(0, pen + amount) })
  }

  // Roll simulator
  const rollVal   = rollInput !== '' ? parseInt(rollInput, 10) : null
  const rollTotal = rollVal != null && !isNaN(rollVal) ? rollVal + rollMod : null
  function getResultBand(t) {
    if (t === null) return null
    if (t >= 176) return { label: 'Absolute Success', color: 'var(--success)', delta: -10 }
    if (t >= 101) return { label: 'Success',          color: 'var(--accent)',  delta:   0 }
    if (t >= 76)  return { label: 'Partial Success',  color: 'var(--warning)', delta:  5 }
    if (t >= 1)   return { label: 'Failure',          color: 'var(--danger)',  delta:  10 }
    return               { label: 'Absolute Failure', color: 'var(--danger)',  delta:  20, hits: true }
  }
  const band = getResultBand(rollTotal)
  function applyRoll() {
    if (!band) return
    if (band.delta < 0) reduceFatigue(-band.delta)
    else if (band.delta > 0) addFatigue(band.delta)
    setRollInput('')
  }

  // Recovery
  const restMinsNum = parseInt(restMin, 10) || 0
  const foodWaterDep = (conds.hours_no_water || 0) * 5
                     + (conds.days_no_food   || 0) * 10
                     + Math.floor((conds.days_half_food || 0) / 3) * 10
  const recoveryCap = foodWaterDep > 0 ? -(foodWaterDep / 2) : null
  function applyRest() {
    if (restMinsNum <= 0) return
    const proposed   = Math.min(0, pen + restMinsNum)
    const newPenalty = recoveryCap !== null ? Math.min(proposed, recoveryCap) : proposed
    patchFatigue({ penalty: newPenalty })
    setRestMin('')
  }
  const restPreview = restMinsNum > 0 ? (() => {
    const proposed = Math.min(0, pen + restMinsNum)
    return recoveryCap !== null ? Math.min(proposed, recoveryCap) : proposed
  })() : null

  const sb = (color) => ({
    padding: '3px 9px', borderRadius: 5, fontSize: 11, fontWeight: 700,
    cursor: 'pointer', border: `1px solid ${color}`,
    background: 'transparent', color,
  })

  return (
    <>
      {/* Status tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 14 }}>
        {[
          { label: 'Fatigue Penalty', value: pen,   color: penColor },
          { label: 'Fatigue Injury',  value: inj,   color: inj < 0 ? 'var(--danger)' : 'var(--text3)' },
          { label: 'Total Penalty',   value: total, color: total < 0 ? 'var(--danger)' : 'var(--text3)', sub: total < 0 ? 'all actions' : null },
        ].map(({ label, value, color, sub }) => (
          <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
            <div style={{ fontSize: 22, fontWeight: 800, color, lineHeight: 1 }}>{value || '0'}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>}
            <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Adjust buttons */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Adjust</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>Worsen:</span>
          {[5, 10, 20].map(n => <button key={`w${n}`} onClick={() => addFatigue(n)} style={sb('var(--danger)')}>+{n}</button>)}
          <span style={{ marginLeft: 8, fontSize: 10, color: 'var(--text3)' }}>Reduce:</span>
          {[5, 10, 20].map(n => <button key={`r${n}`} onClick={() => reduceFatigue(n)} style={sb('var(--success)')}>−{n}</button>)}
          {total < 0 && (
            <button onClick={() => updateCharacter({ fatigue: { penalty: 0, injury: 0 } })} style={{ ...sb('var(--text3)'), marginLeft: 8 }}>Clear</button>
          )}
        </div>
      </div>

      {/* Rest recovery */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 14 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>Rest</span>
        <input type="number" value={restMin} min={1} onChange={e => setRestMin(e.target.value)}
          placeholder="min" style={{ width: 58, textAlign: 'center', padding: '4px 6px' }} />
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>min →</span>
        {restPreview !== null && (
          <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--accent)' }}>penalty {restPreview}</span>
        )}
        <button onClick={applyRest} disabled={restMinsNum <= 0} style={sb('var(--accent)')}>Apply Rest</button>
        {recoveryCap !== null && (
          <span style={{ fontSize: 10, color: 'var(--warning)', flex: '1 0 100%', marginTop: 2 }}>
            Recovery capped at {recoveryCap} until fed/watered
          </span>
        )}
      </div>

      <div style={{ borderTop: '1px solid var(--border)', marginBottom: 14 }} />

      {/* Endurance roll modifier breakdown */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Endurance Roll Modifier</div>
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', marginBottom: 10 }}>
          {[
            { label: 'Base Endurance (BD + race)', value: autoEndurance, always: true },
            { label: 'Armor Man. Penalty',         value: armorManPenalty },
            { label: 'Accumulated Fatigue',        value: pen },
            { label: 'Conditions',                 value: condMod, showEdit: true },
          ].map(({ label, value, always, showEdit }) => {
            if (!always && value === 0 && !showEdit) return null
            return (
              <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 12px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 12, color: 'var(--text2)' }}>{label}</span>
                  {showEdit && (
                    <button onClick={() => setCondOpen(p => !p)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 10, padding: '0 3px' }}>
                      {condOpen ? 'hide' : 'edit'}
                    </button>
                  )}
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: value < 0 ? 'var(--danger)' : value > 0 ? 'var(--success)' : 'var(--text3)' }}>
                  {fmtOpt(value)}
                </span>
              </div>
            )
          })}
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}>Total Modifier</span>
            <span style={{ fontSize: 16, fontWeight: 800, color: rollMod < 0 ? 'var(--danger)' : rollMod > 0 ? 'var(--success)' : 'var(--text3)' }}>{fmt(rollMod)}</span>
          </div>
        </div>

        {/* Conditions panel */}
        {condOpen && (
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Conditions (Table 5-5)</div>
            <div style={{ display: 'grid', gap: 5 }}>
              {FATIGUE_COND_ROWS.map(({ key, label, rate, unit, div }) => {
                const val = conds[key] || 0
                const mult = div ? Math.floor(val / div) : val
                const pen_ = mult * rate
                return (
                  <div key={key} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--text2)', minWidth: 0 }}>{label}</span>
                    <input type="number" value={val || ''} min={0}
                      onChange={e => updateCharacter({ fatigue_conditions: { ...conds, [key]: Number(e.target.value) || 0 } })}
                      style={{ width: 50, textAlign: 'center', padding: '3px 4px', flexShrink: 0 }} />
                    <span style={{ fontSize: 10, color: 'var(--text3)', width: 58, flexShrink: 0 }}>{unit}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, width: 34, textAlign: 'right', flexShrink: 0, color: pen_ < 0 ? 'var(--danger)' : 'var(--text3)' }}>
                      {pen_ !== 0 ? fmt(pen_) : '—'}
                    </span>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Roll simulator */}
        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Endurance Roll</div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 8 }}>
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>d100OE</span>
          <input type="number" value={rollInput} onChange={e => setRollInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && band && applyRoll()}
            placeholder="—" style={{ width: 72, textAlign: 'center', padding: '5px 6px', fontSize: 16 }} />
          <span style={{ fontSize: 11, color: 'var(--text3)' }}>{rollMod >= 0 ? '+' : ''}{rollMod} =</span>
          <span style={{ fontSize: 18, fontWeight: 800, color: rollTotal != null ? (band?.color || 'var(--text3)') : 'var(--text3)' }}>
            {rollTotal ?? '—'}
          </span>
        </div>
        {band && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 700, color: band.color, padding: '2px 8px', borderRadius: 4, border: `1px solid ${band.color}` }}>{band.label}</span>
            <span style={{ fontSize: 11, color: 'var(--text2)' }}>
              {band.delta < 0 ? `Reduce fatigue ${band.delta}` : band.delta > 0 ? `Fatigue +${band.delta}` : 'No change'}
              {band.hits ? ', suffer 10 hits' : ''}
            </span>
            <button onClick={applyRoll} style={sb(band.color)}>Apply</button>
          </div>
        )}
      </div>

      {/* Check intervals reference */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Check Intervals</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 20px' }}>
          {FATIGUE_INTERVALS.map(([pace, interval]) => (
            <div key={pace} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, padding: '2px 0', borderBottom: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text2)' }}>{pace}</span>
              <span style={{ color: 'var(--text3)' }}>{interval}</span>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

// ── Foundry Export Modal ──────────────────────────────────────────────────────
function FoundryExportModal({ char, onClose }) {
  const script = useMemo(() => generateFoundryScript(char), [char])
  const textRef = useRef(null)
  const [copied, setCopied] = useState(false)

  function handleCopy() {
    navigator.clipboard.writeText(script).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }).catch(() => {
      // Fallback: select text so user can Ctrl+C
      textRef.current?.select()
    })
  }

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(2px)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        padding: '24px 12px', overflowY: 'auto',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%', maxWidth: 680,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 14, overflow: 'hidden', boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        }}
      >
        {/* Header */}
        <div style={{
          padding: '14px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)' }}>
              Export to Foundry VTT
            </div>
            <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
              Paste this script into the Foundry console (F12 → Console tab) and press Enter.
            </div>
          </div>
          <button
            onClick={handleCopy}
            style={{
              padding: '7px 16px', borderRadius: 8, fontWeight: 700, fontSize: 13, cursor: 'pointer',
              background: copied ? 'var(--success)' : 'var(--accent)', color: '#fff', border: 'none',
              transition: 'background 0.2s', minWidth: 80,
            }}
          >
            {copied ? '✓ Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'var(--text3)' }}
          >
            <XIcon size={18} color="currentColor" />
          </button>
        </div>

        {/* Instructions */}
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface2)' }}>
          <ol style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: 'var(--text2)', lineHeight: 1.7 }}>
            <li>Open Foundry in your browser and press <strong>F12</strong> to open Developer Tools.</li>
            <li>Click the <strong>Console</strong> tab.</li>
            <li>Click <strong>Copy</strong> above, then paste (<strong>Ctrl+V</strong>) into the console and press <strong>Enter</strong>.</li>
            <li>A notification will confirm how many fields were synced. Any missing skills appear in the console as warnings.</li>
          </ol>
          <div style={{ marginTop: 8, fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
            Skills and spell lists must already exist as items on the Foundry actor (added during character setup). The script only updates ranks/values — it will not create new items.
          </div>
        </div>

        {/* Script textarea */}
        <div style={{ padding: 16 }}>
          <textarea
            ref={textRef}
            readOnly
            value={script}
            onClick={e => e.target.select()}
            style={{
              width: '100%', height: 340, resize: 'vertical',
              fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5,
              padding: '10px 12px', borderRadius: 8,
              background: 'var(--surface2)', border: '1px solid var(--border)',
              color: 'var(--text)', boxSizing: 'border-box',
            }}
          />
          <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 6 }}>
            Click inside the box to select all · or use the Copy button above
          </div>
        </div>
      </div>
    </div>
  )
}

// ── Main view ─────────────────────────────────────────────────────────────────
export default function CharacterSheet() {
  const { activeChar, updateCharacter, updateStat, updateSkill, addWeapon, updateWeapon, removeWeapon } = useCharacter()
  const [wBrowse,         setWBrowse]        = useState(false)
  const [foundryOpen,     setFoundryOpen]    = useState(false)
  const [identityOpen,    setIdentityOpen]    = usePersistentOpen('rm_panel_identity',    true)
  const [paceOpen,        setPaceOpen]        = usePersistentOpen('rm_panel_pace',         false)
  const [weaponsOpen,     setWeaponsOpen]     = usePersistentOpen('rm_panel_weapons',      true)
  const [armorOpen,       setArmorOpen]       = usePersistentOpen('rm_panel_armor',        true)
  const [fatigueOpen,     setFatigueOpen]     = usePersistentOpen('rm_panel_fatigue',      true)
  const [showDetail,      toggleDetail]       = usePersistentOpen('rm_derived_detail',     false)
  const [showArmorDetail, toggleArmorDetail]  = usePersistentOpen('rm_armor_detail',       false)
  useScrollRestore('rm_scroll_sheet')
  const c = activeChar
  if (!c) return null

  const db           = getDefensiveBonus(c)
  const baseIni      = getInitiativeBonus(c)
  const fatiguePen   = getFatiguePenalty(c)            // 0 or negative
  const iniPenalty   = Math.trunc(fatiguePen / 10)     // -1 per -10 total penalty
  const ini          = baseIni + iniPenalty
  const realmStat = REALM_STAT[c.realm]
  const rrBonuses = getResistanceBonuses(c)
  const talentB   = getTalentBonuses(c)

  // All resolved skill display names for knack pickers
  const allSkillNames = useMemo(() => {
    const names = []
    for (const [name, data] of Object.entries(c.skills || {})) {
      names.push(displaySkillName(name, data.label || ''))
    }
    for (const cs of (c.custom_skills || [])) {
      names.push(displaySkillName(cs.template_name, cs.label || ''))
    }
    return names.sort()
  }, [c.skills, c.custom_skills])

  // Combat talent chips — display-only reminders in the weapons area
  const ct = useMemo(() => {
    const find = id => c.talents?.find(t => t.talent_id === id)
    return {
      deadeye:              find('deadeye'),
      sharpshooter:         find('sharpshooter'),
      foiler:               find('foiler'),
      pressing:             find('pressing_the_advantage'),
      opp_strike:           find('opportunistic_strike'),
      riposte:              find('riposte'),
      sense_weakness:       find('sense_weakness'),
      quickdraw:            find('quickdraw'),
      slow_draw:            find('slow_on_the_draw'),
      frenzy:               find('frenzy'),
      strike_reflex:        find('strike_reflex'),
      non_violent:          find('non_violent'),
    }
  }, [c.talents])
  const hasCombatTalents = Object.values(ct).some(Boolean)

  // Auto-calculated derived stats (shown as placeholder when field is null / not overridden)
  const autoHitsMax    = getBaseHits(c)
  const autoPPMax      = getPowerPoints(c)     // null if no realm selected
  const autoEndurance  = getEndurance(c)
  const wa             = getWeightAllowance(c)
  const effHitsMax     = c.hits_max          ?? autoHitsMax
  const effPPMax       = c.power_points_max  ?? autoPPMax

  const weapons     = c.weapons || []
  const armorParts  = c.armor_parts || {}
  const shield      = armorParts.shield || {}
  const shieldDB    = SHIELD_DB[shield.type] ?? 0
  const totalDB     = db + shieldDB + (shield.db ?? 0)

  function getArmorPenalty(part) {
    const section = ARMOR_SECTION_MAP[part]
    const at = armorParts[part]?.at ?? 1
    const rows = armorData[section] || []
    return rows.find(r => r.at === at) || null
  }
  const armorTotals = ['torso','head','arms','legs'].reduce((acc, part) => {
    const row = getArmorPenalty(part)
    if (!row) return acc
    return {
      man:  acc.man  + (row.maneuver_penalty   || 0),
      rang: acc.rang + (row.ranged_penalty      || 0),
      perc: acc.perc + (row.perception_penalty  || 0),
      wt:   acc.wt   + (row.weight_pct          || 0),
    }
  }, { man: 0, rang: 0, perc: 0, wt: 0 })

  const bmr = BMR_BASE + talentB.stride
  function fmt(n) { return n >= 0 ? `+${n}` : String(n) }

  return (
    <>
    {foundryOpen && <FoundryExportModal char={c} onClose={() => setFoundryOpen(false)} />}
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Foundry export button */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <button
          onClick={() => setFoundryOpen(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '6px 14px', borderRadius: 8, border: '1px solid var(--border)',
            background: 'var(--surface2)', color: 'var(--text2)',
            fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}
          title="Generate a console script to sync this character to Foundry VTT"
        >
          <span style={{ fontSize: 14 }}>⚙</span> Export to Foundry
        </button>
      </div>

      {/* Identity card */}
      <Card title="Identity" onToggle={setIdentityOpen} isOpen={identityOpen}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          <FieldRow label="Name"><TInput value={c.name} onChange={v => updateCharacter({ name: v })} /></FieldRow>
          <FieldRow label="Player"><TInput value={c.player} onChange={v => updateCharacter({ player: v })} /></FieldRow>
          <FieldRow label="Level"><NInput value={c.level} onChange={v => updateCharacter({ level: v })} min={1} max={100} /></FieldRow>
          <FieldRow label="Race"><SInput value={c.race} onChange={v => updateCharacter({ race: v })} options={races.map(r => r.name)} /></FieldRow>
          <FieldRow label="Profession"><SInput value={c.profession} onChange={v => updateCharacter({ profession: v })} options={professions} /></FieldRow>
          <FieldRow label="Realm"><SInput value={c.realm} onChange={v => updateCharacter({ realm: v })} options={REALMS} /></FieldRow>
          <FieldRow label="Culture"><SInput value={c.culture} onChange={v => updateCharacter({ culture: v })} options={cultures} /></FieldRow>
          <FieldRow label="Size">
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <div style={{ flex:1 }}><SInput value={c.size} onChange={v => updateCharacter({ size: v })} options={SIZES} /></div>
              {(talentB.size !== 0 || talentB.sizeHits !== 0) && (
                <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                  {talentB.size !== 0 && (
                    <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4,
                      background: talentB.size > 0 ? 'var(--success)' : 'var(--danger)', color:'#fff', whiteSpace:'nowrap' }}
                      title="Increased/Decreased Size talent">
                      {talentB.size > 0 ? '+' : ''}{talentB.size} size
                    </span>
                  )}
                  {talentB.sizeHits !== 0 && (
                    <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4,
                      background:'var(--danger)', color:'#fff', whiteSpace:'nowrap' }}
                      title="Light-boned: hits treated as smaller size">
                      {talentB.sizeHits} hits sz
                    </span>
                  )}
                </div>
              )}
            </div>
          </FieldRow>
          <FieldRow label="Gender"><TInput value={c.gender} onChange={v => updateCharacter({ gender: v })} /></FieldRow>
          <FieldRow label="Age"><NInput value={c.age} onChange={v => updateCharacter({ age: v })} min={1} /></FieldRow>
          <FieldRow label="Fate Points"><NInput value={c.fate_points} onChange={v => updateCharacter({ fate_points: v })} min={0} /></FieldRow>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
          <FieldRow label="Hometown"><TInput value={c.hometown} onChange={v => updateCharacter({ hometown: v })} /></FieldRow>
          <FieldRow label="Nationality"><TInput value={c.nationality} onChange={v => updateCharacter({ nationality: v })} /></FieldRow>
          <FieldRow label="Hair"><TInput value={c.hair_color} onChange={v => updateCharacter({ hair_color: v })} /></FieldRow>
          <FieldRow label="Eyes"><TInput value={c.eye_color} onChange={v => updateCharacter({ eye_color: v })} /></FieldRow>
          <FieldRow label="Skin"><TInput value={c.skin_color} onChange={v => updateCharacter({ skin_color: v })} /></FieldRow>
          <FieldRow label="Weight (lb)"><NInput value={c.weight} onChange={v => updateCharacter({ weight: v })} /></FieldRow>
          <FieldRow label="Height (ft)"><NInput value={c.height_ft} onChange={v => updateCharacter({ height_ft: v })} /></FieldRow>
          <FieldRow label="Height (in)"><NInput value={c.height_in} onChange={v => updateCharacter({ height_in: v })} /></FieldRow>
        </div>
        {c.culture && (
          <CultureGrantsPanel
            culture={c.culture}
            char={c}
            updateCharacter={updateCharacter}
            updateSkill={updateSkill}
          />
        )}
        <KnacksSubPanel char={c} updateCharacter={updateCharacter} allSkillNames={allSkillNames} />
        <CTGroupsSubPanel char={c} updateCharacter={updateCharacter} />
      </Card>

      {/* Derived stats row */}
      <Card title="Derived Stats" action={
        <button onClick={toggleDetail}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text3)', display: 'flex', alignItems: 'center', padding: 4 }}>
          {showDetail ? <EyeOpenIcon size={14} color="currentColor" /> : <EyeClosedIcon size={14} color="currentColor" />}
        </button>
      }>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: 8 }}>
          <StatCard label="Def Bonus" value={fmt(db)} color={db > 0 ? 'var(--success)' : 'var(--text)'}
            sub={talentB.db ? `Qu×3 + ${talentB.db} talent` : 'Qu×3'} showDetail={showDetail} />
          <StatCard label="Initiative" value={fmt(ini)} color={ini > 0 ? 'var(--accent)' : ini < 0 ? 'var(--danger)' : 'var(--text)'}
            sub={iniPenalty < 0
              ? `Qu${talentB.initiative ? ` + ${talentB.initiative}T` : ''} ${iniPenalty} fatigue`
              : talentB.initiative ? `Qu + ${talentB.initiative} talent` : 'Qu bonus'}
            showDetail={showDetail} />
          <EditStat label="Endurance" field="endurance" char={c} onUpdate={updateCharacter} autoValue={autoEndurance}
            sub={talentB.endurance ? `BD + ${talentB.endurance > 0 ? '+' : ''}${talentB.endurance} talent + race` : 'BD + race'} showDetail={showDetail} />
          <StatCard
            label="Carry Weight"
            value={wa.lbs != null ? `${wa.lbs} lbs` : '—'}
            color={wa.pct > 15 ? 'var(--success)' : wa.pct < 15 ? 'var(--danger)' : 'var(--text)'}
            sub={wa.lbs != null ? `${wa.pct}%${wa.carryBonus ? ` (+${wa.carryBonus}% talent)` : ''}` : 'set weight'}
            showDetail={showDetail}
          />
          <EditStat label="Experience" field="experience" char={c} onUpdate={updateCharacter} showDetail={showDetail} />
        </div>
      </Card>

      {/* HP / PP combat panel */}
      <Card title="Hit Points & Power Points">
        <div style={{ display: 'grid', gridTemplateColumns: effPPMax != null ? '1fr 1fr' : '1fr', gap: 12 }}>
          {/* HP */}
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Hit Points</div>
              {talentB.bleed !== 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
                  background: talentB.bleed < 0 ? 'var(--success)' : 'var(--danger)', color: '#fff' }}
                  title={talentB.bleed < 0 ? 'Slow Bleeder: bleeding reduced' : 'Rapid Bleeder: bleeding increased'}>
                  {talentB.bleed > 0 ? '+' : ''}{talentB.bleed}/rnd bleed
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Current</div>
                <input type="number"
                  value={c.hits_current ?? ''}
                  placeholder={String(effHitsMax ?? '—')}
                  onChange={e => updateCharacter({ hits_current: e.target.value === '' ? null : Number(e.target.value) })}
                  style={{ width: '100%', fontSize: 28, fontWeight: 800, textAlign: 'center', padding: '4px 2px',
                    color: (c.hits_current != null && effHitsMax && c.hits_current / effHitsMax < 0.3) ? 'var(--danger)' : 'var(--text)',
                    background: 'transparent', border: 'none', boxShadow: 'none' }} />
              </div>
              <div style={{ fontSize: 22, color: 'var(--text3)', fontWeight: 300, alignSelf: 'center', paddingTop: 16 }}>/</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Max</div>
                <input type="number"
                  value={c.hits_max ?? ''}
                  placeholder={String(autoHitsMax ?? '—')}
                  onChange={e => updateCharacter({ hits_max: e.target.value === '' ? null : Number(e.target.value) })}
                  style={{ width: '100%', fontSize: 22, fontWeight: 700, textAlign: 'center', padding: '4px 2px',
                    color: c.hits_max != null ? 'var(--text)' : 'var(--text3)',
                    background: 'transparent', border: 'none', boxShadow: 'none' }} />
                {c.hits_max == null && <div style={{ fontSize: 8, color: 'var(--accent)', textAlign: 'center', letterSpacing: '0.06em' }}>AUTO</div>}
                {c.hits_max != null && <div style={{ fontSize: 8, color: 'var(--text3)', textAlign: 'center', marginTop: 1 }}>BD ranks × Co</div>}
              </div>
            </div>
          </div>

          {/* PP — only shown if character has a realm */}
          {effPPMax != null && (
            <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--purple)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Power Points</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Current</div>
                  <input type="number"
                    value={c.power_points_current ?? ''}
                    placeholder={String(effPPMax ?? '—')}
                    onChange={e => updateCharacter({ power_points_current: e.target.value === '' ? null : Number(e.target.value) })}
                    style={{ width: '100%', fontSize: 28, fontWeight: 800, textAlign: 'center', padding: '4px 2px',
                      color: 'var(--text)', background: 'transparent', border: 'none', boxShadow: 'none' }} />
                </div>
                <div style={{ fontSize: 22, color: 'var(--text3)', fontWeight: 300, alignSelf: 'center', paddingTop: 16 }}>/</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 10, color: 'var(--text3)', marginBottom: 3 }}>Max</div>
                  <input type="number"
                    value={c.power_points_max ?? ''}
                    placeholder={String(autoPPMax ?? '—')}
                    onChange={e => updateCharacter({ power_points_max: e.target.value === '' ? null : Number(e.target.value) })}
                    style={{ width: '100%', fontSize: 22, fontWeight: 700, textAlign: 'center', padding: '4px 2px',
                      color: c.power_points_max != null ? 'var(--text)' : 'var(--text3)',
                      background: 'transparent', border: 'none', boxShadow: 'none' }} />
                  {c.power_points_max == null && <div style={{ fontSize: 8, color: 'var(--accent)', textAlign: 'center', letterSpacing: '0.06em' }}>AUTO</div>}
                  {c.power_points_max != null && <div style={{ fontSize: 8, color: 'var(--text3)', textAlign: 'center', marginTop: 1 }}>PD ranks × RS</div>}
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Statistics table */}
      <Card title="Statistics">
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Stat','','Temp','Potential','Racial','Special','Bonus'].map((h, i) => (
                  <th key={i} style={{ padding: '6px 6px', textAlign: i < 2 ? 'left' : 'center', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STATS.map((stat, i) => {
                const s = c.stats[stat] || { temp: 50, potential: 50, racial: 0, special: 0 }
                const bonus = getTotalStatBonus(s)
                const isRealm = stat === realmStat
                const bonusColor = bonus > 0 ? 'var(--success)' : bonus < 0 ? 'var(--danger)' : 'var(--text3)'
                return (
                  <tr key={stat} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 6px', fontWeight: isRealm ? 700 : 400, color: isRealm ? 'var(--accent)' : 'var(--text)', whiteSpace: 'nowrap' }}>{stat}</td>
                    <td style={{ padding: '5px 2px', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{STAT_ABBR[stat]}{isRealm ? <> <DiamondIcon size={7} color="var(--accent)" /></> : ''}</td>
                    <td style={{ padding: '3px 4px' }}>
                      <input type="number" value={s.temp ?? ''} min={1} max={100}
                        onChange={e => updateStat(stat, 'temp', Number(e.target.value))}
                        style={{ width: 52, textAlign: 'center', padding: '3px 2px' }} />
                    </td>
                    <td style={{ padding: '3px 4px' }}>
                      <input type="number" value={s.potential ?? ''} min={1} max={100}
                        onChange={e => updateStat(stat, 'potential', Number(e.target.value))}
                        style={{ width: 52, textAlign: 'center', padding: '3px 2px' }} />
                    </td>
                    <td style={{ padding: '3px 4px' }}>
                      <input type="number" value={s.racial ?? 0}
                        onChange={e => updateStat(stat, 'racial', Number(e.target.value))}
                        style={{ width: 44, textAlign: 'center', padding: '3px 2px' }} />
                    </td>
                    <td style={{ padding: '3px 4px' }}>
                      <input type="number" value={s.special ?? 0}
                        onChange={e => updateStat(stat, 'special', Number(e.target.value))}
                        style={{ width: 44, textAlign: 'center', padding: '3px 2px' }} />
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, color: bonusColor, fontSize: 14 }}>
                      {fmt(bonus)}
                      {talentB.stat[stat] ? (
                        <span style={{ display: 'inline-block', fontSize: 9, fontWeight: 700, marginLeft: 3, padding: '1px 4px', borderRadius: 3,
                          background: talentB.stat[stat] > 0 ? 'var(--success)' : 'var(--danger)', color: '#fff', verticalAlign: 'middle' }}>
                          {talentB.stat[stat] > 0 ? `+${talentB.stat[stat]}` : talentB.stat[stat]}T
                        </span>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, display: 'flex', alignItems: 'center', gap: 4 }}><DiamondIcon size={7} color="var(--accent)" /> Realm stat · Bonus = stat bonus + racial + special</p>
      </Card>

      {/* Fatigue & Endurance */}
      <Card title="Fatigue & Endurance" onToggle={setFatigueOpen} isOpen={fatigueOpen}>
        <FatigueCard
          c={c}
          updateCharacter={updateCharacter}
          autoEndurance={autoEndurance}
          armorManPenalty={armorTotals.man}
        />
      </Card>

      {/* Weapons */}
      <Card title="Weapons & Attacks" onToggle={setWeaponsOpen} isOpen={weaponsOpen} action={weaponsOpen ? (
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>setWBrowse(b=>!b)}
            style={{ background:'var(--surface2)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}>
            {wBrowse ? <><XIcon size={10} color="currentColor" /> Close DB</> : '+ From DB'}
          </button>
          <button onClick={()=>{addWeapon();setWBrowse(false);}}
            style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, cursor:'pointer' }}>+ Custom</button>
        </div>
      ) : null}>
        {wBrowse && (
          <WeaponBrowser
            onSelect={w => {
              addWeapon({ name: w.name, fumble: w.fumble, str_req: w.str_req, skill_name: w.skill_name, ob_type: w.ob_type })
              setWBrowse(false)
            }}
            onCancel={() => setWBrowse(false)}
          />
        )}
        {weapons.length === 0 && !wBrowse && <div style={{ fontSize:12, color:'var(--text3)' }}>No weapons. Use + From DB or + Custom to begin.</div>}
        {talentB.sizeAttack !== 0 && (
          <div style={{ marginBottom:8, display:'flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10,
              background: talentB.sizeAttack > 0 ? 'var(--success)' : 'var(--danger)', color:'#fff' }}>
              Natural attack size {talentB.sizeAttack > 0 ? '+' : ''}{talentB.sizeAttack}
            </span>
            <span style={{ fontSize:10, color:'var(--text3)' }}>from {talentB.sizeAttack > 0 ? 'Enhanced Attack' : 'Lesser Attack'} talent</span>
          </div>
        )}
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {weapons.map(w => {
            const ob = getWeaponOB(c, w)
            const skillRanks = (c.skills?.[w.skill_name]?.ranks) ?? 0
            const baseFumble = w.fumble ?? 3
            const effFumble = Math.max(1, baseFumble - Math.floor(skillRanks / 5))
            const fumbleReduced = effFumble < baseFumble
            return (
              <div key={w.id} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'10px 12px' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 60px 70px', gap:8, marginBottom:8 }}>
                  <FieldRow label="Weapon Name">
                    <TInput value={w.name} onChange={v => updateWeapon(w.id, { name: v })} placeholder="e.g. Broadsword" />
                  </FieldRow>
                  <FieldRow label={fumbleReduced ? `Fumble (${effFumble} eff)` : 'Fumble'}>
                    <NInput value={w.fumble} onChange={v => updateWeapon(w.id, { fumble: v })} min={1} max={20} />
                  </FieldRow>
                  <FieldRow label="Str Req">
                    <NInput value={w.str_req} onChange={v => updateWeapon(w.id, { str_req: v })} min={0} />
                  </FieldRow>
                  <FieldRow label="Item Bonus">
                    <NInput value={w.item_bonus} onChange={v => updateWeapon(w.id, { item_bonus: v })} />
                  </FieldRow>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 100px', gap:8, alignItems:'end' }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 120px', gap:8 }}>
                    <FieldRow label="Combat Skill">
                      <TInput value={w.skill_name} onChange={v => updateWeapon(w.id, { skill_name: v })} placeholder="e.g. Blade" />
                    </FieldRow>
                    <FieldRow label="OB Type">
                      <select value={w.ob_type || 'melee'} onChange={e => updateWeapon(w.id, { ob_type: e.target.value })} style={{ width:'100%' }}>
                        <option value="melee">Melee (Ag+St)</option>
                        <option value="ranged">Ranged (Ag+Qu)</option>
                        <option value="unarmed">Unarmed (Ag+St)</option>
                      </select>
                    </FieldRow>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div style={{ textAlign:'center' }}>
                      <div style={{ fontSize:9, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Total OB</div>
                      <div style={{ fontSize:22, fontWeight:800, color: ob > 0 ? 'var(--success)' : ob < 0 ? 'var(--danger)' : 'var(--text)' }}>{fmt(ob)}</div>
                    </div>
                    <button onClick={() => removeWeapon(w.id)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', padding:'4px', display:'flex', alignItems:'center' }}
                      onMouseEnter={e => e.currentTarget.style.color='var(--danger)'}
                      onMouseLeave={e => e.currentTarget.style.color='var(--text3)'}
                    ><XIcon size={13} color="currentColor" /></button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* Combat talent reminder chips */}
        {hasCombatTalents && (
          <div style={{ marginTop:10, paddingTop:10, borderTop:'1px solid var(--border)' }}>
            <div style={{ fontSize:10, fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Combat Talents</div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:5 }}>
              {/* Ranged */}
              {ct.deadeye && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--success)18', color:'var(--success)', border:'1px solid var(--success)44' }}
                  title="Deadeye: range penalties reduced by 10/Tier">
                  🎯 Deadeye {ct.deadeye.tier > 1 ? `T${ct.deadeye.tier}` : ''} −{ct.deadeye.tier * 10} range pen
                </span>
              )}
              {ct.sharpshooter && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--success)18', color:'var(--success)', border:'1px solid var(--success)44' }}
                  title="Sharpshooter: +5/Tier OB per round aiming, max +5/Tier">
                  🎯 Sharpshooter {ct.sharpshooter.tier > 1 ? `T${ct.sharpshooter.tier}` : ''} +{ct.sharpshooter.tier * 5}/rnd aim (max +{ct.sharpshooter.tier * 5})
                </span>
              )}
              {/* Melee */}
              {ct.foiler && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--success)18', color:'var(--success)', border:'1px solid var(--success)44' }}
                  title="Foiler: foe fumble range increased by 1/Tier">
                  ⚔ Foiler {ct.foiler.tier > 1 ? `T${ct.foiler.tier}` : ''} foe fumble +{ct.foiler.tier}
                </span>
              )}
              {ct.pressing && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--success)18', color:'var(--success)', border:'1px solid var(--success)44' }}
                  title="Pressing the Advantage: +10/Tier OB on next attack after landing a critical">
                  ⚔ Press Adv {ct.pressing.tier > 1 ? `T${ct.pressing.tier}` : ''} +{ct.pressing.tier * 10} OB after crit
                </span>
              )}
              {ct.opp_strike && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--success)18', color:'var(--success)', border:'1px solid var(--success)44' }}
                  title="Opportunistic Strike: free attack (0 AP) when foe fumbles">
                  ⚔ Opp. Strike free atk on fumble
                </span>
              )}
              {ct.riposte && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--success)18', color:'var(--success)', border:'1px solid var(--success)44' }}
                  title="Riposte: counter-attack when using full OB to parry">
                  ⚔ Riposte counter when parrying
                </span>
              )}
              {ct.sense_weakness && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--success)18', color:'var(--success)', border:'1px solid var(--success)44' }}
                  title="Sense Weakness: after 1 round observing foe, may reroll one critical">
                  👁 Sense Weakness reroll crit after observe
                </span>
              )}
              {/* General */}
              {ct.quickdraw && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--accent)18', color:'var(--accent)', border:'1px solid var(--accent)44' }}
                  title="Quickdraw: drawing weapon costs 0 AP instead of 1 AP">
                  ⚡ Quickdraw draw 0 AP
                </span>
              )}
              {ct.frenzy && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--accent)18', color:'var(--accent)', border:'1px solid var(--accent)44' }}
                  title="Frenzy: while frenzied +5 St, attacks +1 size, no hit-loss penalties">
                  🔥 Frenzy +5 St / +1 atk size
                </span>
              )}
              {ct.strike_reflex && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--accent)18', color:'var(--accent)', border:'1px solid var(--accent)44' }}
                  title="Strike Reflex: +20 initiative when sudden movement triggers reflex">
                  ⚡ Strike Reflex +20 init on movement
                </span>
              )}
              {ct.slow_draw && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--danger)18', color:'var(--danger)', border:'1px solid var(--danger)44' }}
                  title="Slow on the Draw: drawing weapon costs 2 AP">
                  🐢 Slow Draw 2 AP
                </span>
              )}
              {ct.non_violent && (
                <span style={{ fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:10, background:'var(--danger)18', color:'var(--danger)', border:'1px solid var(--danger)44' }}
                  title={`Non-violent: after inflicting a critical, all actions next round −${ct.non_violent.tier * 20}`}>
                  😬 Non-violent −{ct.non_violent.tier * 20} after crit
                </span>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Armor by Body Part */}
      <Card title="Armor & Defense" onToggle={setArmorOpen} isOpen={armorOpen} action={armorOpen ? (
        <button onClick={toggleArmorDetail} title={showArmorDetail ? 'Hide calculation detail' : 'Show calculation detail'}
          style={{ background:'none', border:'none', cursor:'pointer', color: showArmorDetail ? 'var(--accent)' : 'var(--text3)', display:'flex', alignItems:'center' }}>
          {showArmorDetail ? <EyeOpenIcon size={14} color="currentColor" /> : <EyeClosedIcon size={14} color="currentColor" />}
        </button>
      ) : null}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
            <thead>
              <tr style={{ background:'var(--surface2)' }}>
                {['Part','AT','Man','Rang','Perc','Wt%','Str'].map(h => (
                  <th key={h} style={{ padding:'5px 8px', fontSize:10, fontWeight:600, color:'var(--text3)', textAlign: h==='Part' ? 'left' : 'center', textTransform:'uppercase', letterSpacing:'0.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {['torso','head','arms','legs'].map((part, i) => {
                const ap = armorParts[part] || { at: 1 }
                const row = getArmorPenalty(part)
                return (
                  <tr key={part} style={{ borderBottom:'1px solid var(--border)', background: i%2===0 ? 'transparent' : 'var(--surface2)' }}>
                    <td style={{ padding:'4px 8px', fontWeight:600, fontSize:12 }}>{ARMOR_PART_LABELS[part]}</td>
                    <td style={{ padding:'4px 8px', textAlign:'center' }}>
                      {armorParts[part]?.name ? (
                        <>
                          <div style={{ fontSize:11, color:'var(--text)' }}>{armorParts[part].name}</div>
                          <div style={{ fontSize:9, color:'var(--text3)' }}>AT {ap.at ?? 1}</div>
                        </>
                      ) : (
                        <div style={{ fontSize:11, color:'var(--text3)' }}>AT {ap.at ?? 1}</div>
                      )}
                    </td>
                    {['maneuver_penalty','ranged_penalty','perception_penalty','weight_pct','str_req'].map(f => (
                      <td key={f} style={{ padding:'4px 8px', textAlign:'center', fontSize:11, color: row?.[f] < 0 ? 'var(--danger)' : 'var(--text3)', fontWeight: row?.[f] < 0 ? 600 : 400 }}>
                        {row?.[f] ? row[f] : '—'}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {/* Shield row — read-only, set in Gear tab */}
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                <td style={{ padding:'4px 8px', fontWeight:600, fontSize:12 }}>Shield</td>
                <td style={{ padding:'4px 8px' }} colSpan={5}>
                  {shield.type ? (
                    <div style={{ fontSize:11, color:'var(--text)' }}>{shield.type}</div>
                  ) : (
                    <div style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>None — set in Gear tab</div>
                  )}
                </td>
                <td style={{ padding:'4px 8px', textAlign:'center', fontSize:11, color:'var(--success)', fontWeight:700 }}>
                  {shield.type ? `+${SHIELD_DB[shield.type]} DB` : '—'}
                </td>
              </tr>
              {/* Totals */}
              <tr style={{ background:'var(--accent)12', fontWeight:700 }}>
                <td style={{ padding:'5px 8px', fontSize:12, fontWeight:700, color:'var(--accent)' }}>Totals</td>
                <td />
                {[armorTotals.man, armorTotals.rang, armorTotals.perc, armorTotals.wt].map((v, i) => (
                  <td key={i} style={{ padding:'4px 8px', textAlign:'center', fontSize:12, color: v < 0 ? 'var(--danger)' : 'var(--text2)', fontWeight:700 }}>
                    {v !== 0 ? v : '—'}
                  </td>
                ))}
                <td />
              </tr>
            </tbody>
          </table>
        </div>

        {/* DB breakdown */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(100px,1fr))', gap:8, marginTop:12 }}>
          <StatCard label="Qu DB"     value={fmt(db)}      color={db > 0 ? 'var(--success)' : 'var(--text)'} sub="Qu bonus ×3" showDetail={showArmorDetail} />
          <StatCard label="Shield DB" value={shieldDB > 0 ? `+${shieldDB}` : '—'} color="var(--accent)" />
          <StatCard label="Total DB"  value={fmt(totalDB)} color={totalDB > 0 ? 'var(--success)' : 'var(--text)'} />
          <StatCard label="Initiative" value={fmt(ini)} color="var(--accent)" />
          {talentB.at > 0 && (
            <StatCard label="Natural Armor" value={`+${talentB.at} AT`} color="var(--success)" sub="no encumbrance" />
          )}
        </div>

        {/* Resistance Rolls */}
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)', marginBottom:6 }}>
            Resistance Rolls{showArmorDetail && ' (Stat + Lvl×2 + Special)'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:6 }}>
            {[
              { key:'channeling', label:'Channeling', stat:'Intuition'    },
              { key:'essence',    label:'Essence',    stat:'Empathy'      },
              { key:'mentalism',  label:'Mentalism',  stat:'Presence'     },
              { key:'physical',   label:'Physical',   stat:'Constitution' },
              { key:'fear',       label:'Fear',       stat:'Self Disc.'   },
            ].map(({ key, label, stat }) => {
              const color = RR_COLORS[key] || 'var(--accent)'
              const total = rrBonuses[key] ?? 0
              return (
                <div key={key} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                    <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color }}>{label}</div>
                    {showArmorDetail && <div style={{ fontSize:8, color:'var(--text3)' }}>{stat}</div>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
                    <div style={{ fontSize:20, fontWeight:800, color: total > 0 ? 'var(--success)' : 'var(--text)' }}>{fmt(total)}</div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:2 }}>
                      <div style={{ fontSize:9, color:'var(--text3)' }}>Special</div>
                      <input type="number" value={c.rr_bonuses?.[key] ?? 0}
                        onChange={e => updateCharacter({ rr_bonuses: { ...(c.rr_bonuses||{}), [key]: Number(e.target.value) } })}
                        style={{ width:42, padding:'1px 3px', textAlign:'center', fontSize:11 }} />
                    </div>
                  </div>
                </div>
              )
            })}
            {/* Elemental resistance/susceptibility rows from talent */}
            {Object.entries(talentB.elemental).map(([elem, bonus]) => (
              <div key={elem} style={{ background:'var(--surface2)', border:`1px solid ${bonus > 0 ? 'var(--success)' : 'var(--danger)'}`, borderRadius:8, padding:'8px 10px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                  <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color: bonus > 0 ? 'var(--success)' : 'var(--danger)' }}>{elem}</div>
                  <div style={{ fontSize:8, color:'var(--text3)' }}>elemental</div>
                </div>
                <div style={{ fontSize:20, fontWeight:800, color: bonus > 0 ? 'var(--success)' : 'var(--danger)' }}>
                  {fmt(bonus)}
                </div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      {/* Starred Skills */}
      <StarredSkillsPanel c={c} />

      {/* Spell Lists */}
      <SpellListsPanel c={c} />

      {/* Pace & Encumbrance */}
      <Card title="Pace & Encumbrance" onToggle={setPaceOpen} isOpen={paceOpen}>
        {(
          <>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:8, marginBottom:12 }}>
              <StatCard label="BMR (m/rnd)" value={bmr} color="var(--accent)" sub={talentB.stride ? `${talentB.stride > 0 ? '+' : ''}${talentB.stride} stride talent` : undefined} />
              <StatCard label="Armor Man." value={armorTotals.man || '—'} color={armorTotals.man < 0 ? 'var(--danger)' : 'var(--text3)'} />
              <StatCard label="Armor Rang." value={armorTotals.rang || '—'} color={armorTotals.rang < 0 ? 'var(--danger)' : 'var(--text3)'} />
              <StatCard label="Armor Perc." value={armorTotals.perc || '—'} color={armorTotals.perc < 0 ? 'var(--danger)' : 'var(--text3)'} />
            </div>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
                <thead>
                  <tr style={{ background:'var(--surface2)' }}>
                    {['Pace','Metres/Rnd','Man. Pen','AP Cost'].map(h => (
                      <th key={h} style={{ padding:'5px 8px', fontSize:10, fontWeight:600, color:'var(--text3)', textAlign:'center', textTransform:'uppercase', letterSpacing:'0.07em', borderBottom:'1px solid var(--border)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {PACE_TABLE.map((p, i) => (
                    <tr key={p.label} style={{ borderBottom:'1px solid var(--border)', background: i%2===0 ? 'transparent' : 'var(--surface2)' }}>
                      <td style={{ padding:'4px 8px', fontWeight:600, fontSize:12 }}>{p.label}</td>
                      <td style={{ padding:'4px 8px', textAlign:'center', fontSize:12, color:'var(--accent)', fontWeight:700 }}>{Math.round(bmr * p.mult)}</td>
                      <td style={{ padding:'4px 8px', textAlign:'center', fontSize:12, color: p.man_pen < 0 ? 'var(--danger)' : p.man_pen > 0 ? 'var(--success)' : 'var(--text3)', fontWeight: p.man_pen !== 0 ? 600 : 400 }}>
                        {p.man_pen > 0 ? `+${p.man_pen}` : p.man_pen === 0 ? '—' : p.man_pen}
                      </td>
                      <td style={{ padding:'4px 8px', textAlign:'center', fontSize:12, color:'var(--text2)' }}>{p.ap}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

    </div>
    </>
  )
}

/* ─── STARRED SKILLS PANEL ──────────────────────────────── */
function StarredSkillsPanel({ c }) {
  const [open, setOpen] = usePersistentOpen('rm_panel_starred', true)
  const talentBonusMap = useMemo(() => {
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

  const starred = useMemo(() => {
    const result = []
    for (const [skillName, skillData] of Object.entries(c.skills || {})) {
      if (!skillData.starred) continue
      const template = skillsDataMap[skillName]
      if (!template) continue
      const total = computeSkillTotal(c, template, skillData, talentBonusMap)
      const ranks = (skillData.ranks ?? 0) + (skillData.culture_ranks ?? 0)
      result.push({ name: displaySkillName(skillName, skillData.label), total, ranks, notes: skillData.notes })
    }
    for (const cs of (c.custom_skills || [])) {
      if (!cs.starred) continue
      const template = skillsDataMap[cs.template_name]
      const name = displaySkillName(cs.template_name, cs.label)
      const total = computeSkillTotal(c, template, cs, talentBonusMap)
      const ranks = (cs.ranks ?? 0) + (cs.culture_ranks ?? 0)
      result.push({ name, total, ranks, notes: cs.notes })
    }
    return result.sort((a, b) => a.name.localeCompare(b.name))
  }, [c.skills, c.custom_skills, c.talents, c.stats, c.realm, talentBonusMap])

  if (!starred.length) return null

  return (
    <Card title="Starred Skills" onToggle={setOpen} isOpen={open}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 8 }}>
        {starred.map(({ name, total, ranks, notes }) => (
          <div key={name} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 10px' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', marginBottom: 4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 20, fontWeight: 800,
                color: total > 0 ? 'var(--success)' : total < -10 ? 'var(--danger)' : 'var(--text2)' }}>
                {total >= 0 ? `+${total}` : total}
              </span>
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{ranks} rank</span>
            </div>
            {notes && (
              <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, fontStyle: 'italic',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={notes}>{notes}</div>
            )}
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ─── SPELL LISTS PANEL ─────────────────────────────────── */
// Per CoreLaw: Mentalism realm stat is Presence, not Self Discipline
const REALM_STAT_MAP = { Channeling: 'Intuition', Essence: 'Empathy', Mentalism: 'Presence' }
const SPELL_SUBS = ['Magic Ritual', 'Base', 'Open', 'Closed', 'Arcane', 'Restricted']
const SUB_COLOR  = SPELL_SECTION_COLORS

function SpellListsPanel({ c }) {
  const [open, setOpen] = usePersistentOpen('rm_panel_spells', true)
  const lists = Object.entries(c.spell_lists || {})
  if (!lists.length) return null

  const grouped = {}
  for (const sub of SPELL_SUBS) grouped[sub] = []
  for (const [name, data] of lists) {
    const cat = (typeof data === 'object' ? data.category : null) || 'Base'
    const target = grouped[cat] ?? grouped['Base']
    target.push([name, data])
  }

  const fmt = v => v == null ? '—' : (v >= 0 ? `+${v}` : `${v}`)

  return (
    <Card title="Spell Lists" onToggle={setOpen} isOpen={open}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SPELL_SUBS.map(sub => {
          const subLists = grouped[sub] || []
          if (!subLists.length) return null
          const color = SUB_COLOR[sub] || 'var(--accent)'
          return (
            <div key={sub}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                color, marginBottom: 4 }}>{sub}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 36px 54px 60px', gap: 3,
                padding: '3px 6px', background: 'var(--surface2)', borderRadius: 4,
                fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 2 }}>
                <span>List</span>
                <span style={{textAlign:'center'}}>Rnk</span>
                <span style={{textAlign:'center'}} title="Spellcasting Roll: raw ranks + realm stat×1 + talents">SCR</span>
                <span style={{textAlign:'center'}} title="Spell Mastery: rank bonus + stat×2 + Memory + item + prof + talents">Mastery</span>
              </div>
              {subLists.map(([name, data]) => {
                const ranks = typeof data === 'number' ? data : (data?.ranks ?? 0)
                const scr     = getSpellCastingBonus(c, name)
                const mastery = getSpellMasteryBonus(c, name)
                return (
                  <div key={name} style={{ display: 'grid', gridTemplateColumns: '1fr 36px 54px 60px',
                    gap: 3, padding: '4px 6px', fontSize: 12, alignItems: 'center',
                    borderBottom: '1px solid var(--border)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--text)', fontWeight: 500 }} title={name}>{name}</span>
                    <span style={{ textAlign: 'center', color: 'var(--text2)' }}>{ranks}</span>
                    <span style={{ textAlign: 'center', fontWeight: 700, fontSize: 12,
                      color: scr > 0 ? 'var(--success)' : scr < 0 ? 'var(--danger)' : 'var(--text2)' }}
                      title="Spellcasting Roll modifier">
                      {fmt(scr)}
                    </span>
                    <span style={{ textAlign: 'center', fontWeight: 700, fontSize: 12,
                      color: mastery > 0 ? 'var(--success)' : mastery < 0 ? 'var(--danger)' : 'var(--text2)' }}
                      title="Spell Mastery modifier">
                      {fmt(mastery)}
                    </span>
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
    </Card>
  )
}

/* ─── ACTIVE TRAITS PANEL ───────────────────────────────── */
function EditStat({ label, field, char, onUpdate, danger, autoValue, sub, showDetail = true }) {
  const stored = char[field]
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px', textAlign: 'center', display: 'flex', flexDirection: 'column', minHeight: 72 }}>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
        <input type="number" value={stored ?? ''}
          placeholder={autoValue != null ? String(autoValue) : ''}
          onChange={e => onUpdate({ [field]: e.target.value === '' ? null : Number(e.target.value) })}
          style={{ width: 64, textAlign: 'center', fontSize: 22, fontWeight: 700, padding: '2px', lineHeight: 1,
            background: 'transparent', border: 'none', boxShadow: 'none',
            color: danger ? 'var(--danger)' : 'var(--text)' }}
        />
        {showDetail && sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 10, color: 'var(--text3)', marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
    </div>
  )
}
