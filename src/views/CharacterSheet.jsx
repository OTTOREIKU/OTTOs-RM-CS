import React, { useState, useMemo } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '../components/Icons.jsx'
import { useCharacter } from '../store/CharacterContext.jsx'
import { STATS } from '../store/characters.js'
import { rankBonus, getTotalStatBonus, getDefensiveBonus, getInitiativeBonus, getWeaponOB, getResistanceBonuses, getBaseHits, getEndurance, getPowerPoints, getTalentBonuses } from '../utils/calc.js'
import races from '../data/races.json'
import professions from '../data/professions.json'
import cultures from '../data/cultures.json'
import cultureSkillsData from '../data/culture_skills.json'
import armorData from '../data/armor.json'
import weaponsDb from '../data/weapons.json'
import spellListsDb from '../data/spell_lists.json'
import skillsData from '../data/skills.json'
import talentsData from '../data/talents.json'

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
  return rb + catStatB + skillStatB + item + talent + autoBonus + profBonus
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
function Card({ title, action, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      {title && (
        <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text2)' }}>{title}</span>
          {action}
        </div>
      )}
      <div style={{ padding: 16 }}>{children}</div>
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

function StatCard({ value, label, color, sub }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 22, fontWeight: 700, color: color || 'var(--text)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text2)', marginTop: 2 }}>{sub}</div>}
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
          {applied && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>✓ Applied</span>}
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
          style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', fontSize:16, lineHeight:1, padding:'0 2px' }}>✕</button>
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

// ── Main view ─────────────────────────────────────────────────────────────────
export default function CharacterSheet() {
  const { activeChar, updateCharacter, updateStat, updateSkill, addWeapon, updateWeapon, removeWeapon, updateArmorPart } = useCharacter()
  const [wBrowse, setWBrowse] = useState(false)
  const c = activeChar
  if (!c) return null

  const db  = getDefensiveBonus(c)
  const ini = getInitiativeBonus(c)
  const realmStat = REALM_STAT[c.realm]
  const rrBonuses = getResistanceBonuses(c)
  const talentB   = getTalentBonuses(c)

  // Auto-calculated derived stats (shown as placeholder when field is null / not overridden)
  const autoHitsMax    = getBaseHits(c)
  const autoPPMax      = getPowerPoints(c)     // null if no realm selected
  const autoEndurance  = getEndurance(c)
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

  const bmr = BMR_BASE
  function fmt(n) { return n >= 0 ? `+${n}` : String(n) }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 12px', display: 'flex', flexDirection: 'column', gap: 12 }}>

      {/* Identity card */}
      <Card title="Identity">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
          <FieldRow label="Name"><TInput value={c.name} onChange={v => updateCharacter({ name: v })} /></FieldRow>
          <FieldRow label="Player"><TInput value={c.player} onChange={v => updateCharacter({ player: v })} /></FieldRow>
          <FieldRow label="Level"><NInput value={c.level} onChange={v => updateCharacter({ level: v })} min={1} max={100} /></FieldRow>
          <FieldRow label="Race"><SInput value={c.race} onChange={v => updateCharacter({ race: v })} options={races.map(r => r.name)} /></FieldRow>
          <FieldRow label="Profession"><SInput value={c.profession} onChange={v => updateCharacter({ profession: v })} options={professions} /></FieldRow>
          <FieldRow label="Realm"><SInput value={c.realm} onChange={v => updateCharacter({ realm: v })} options={REALMS} /></FieldRow>
          <FieldRow label="Culture"><SInput value={c.culture} onChange={v => updateCharacter({ culture: v })} options={cultures} /></FieldRow>
          <FieldRow label="Size"><SInput value={c.size} onChange={v => updateCharacter({ size: v })} options={SIZES} /></FieldRow>
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
      </Card>

      {/* Derived stats row */}
      <Card title="Derived Stats">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px,1fr))', gap: 8 }}>
          <StatCard label="Def Bonus" value={fmt(db)} color={db > 0 ? 'var(--success)' : 'var(--text)'} sub={talentB.db ? `Qu×3 + ${talentB.db} talent` : 'Qu×3'} />
          <StatCard label="Initiative" value={fmt(ini)} color={ini > 0 ? 'var(--accent)' : 'var(--text)'} sub={talentB.initiative ? `Qu + ${talentB.initiative} talent` : 'Qu bonus'} />
          <EditStat label="Endurance" field="endurance"   char={c} onUpdate={updateCharacter} autoValue={autoEndurance} sub="Race base" />
          <EditStat label="Experience" field="experience" char={c} onUpdate={updateCharacter} />
        </div>
        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, marginBottom: 0 }}>
          Auto values shown in grey — type to override, clear to revert
        </p>
      </Card>

      {/* HP / PP combat panel */}
      <Card title="Hit Points & Power Points">
        <div style={{ display: 'grid', gridTemplateColumns: effPPMax != null ? '1fr 1fr' : '1fr', gap: 12 }}>
          {/* HP */}
          <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Hit Points</div>
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
        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8, marginBottom: 0 }}>
          Current values editable — clear to reset to max · Max auto-calculated or type to override
        </p>
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
                    <td style={{ padding: '5px 2px', fontSize: 10, color: 'var(--text3)', fontWeight: 600 }}>{STAT_ABBR[stat]}{isRealm ? ' ✦' : ''}</td>
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
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text3)', marginTop: 8 }}>✦ Realm stat · Bonus = stat bonus + racial + special</p>
      </Card>

      {/* Weapons */}
      <Card title="Weapons & Attacks" action={
        <div style={{ display:'flex', gap:6 }}>
          <button onClick={()=>setWBrowse(b=>!b)}
            style={{ background:'var(--surface2)', color:'var(--text2)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, cursor:'pointer' }}>
            {wBrowse ? '✕ Close DB' : '+ From DB'}
          </button>
          <button onClick={()=>{addWeapon();setWBrowse(false);}}
            style={{ background:'var(--accent)', color:'#fff', border:'none', borderRadius:6, padding:'3px 10px', fontSize:11, fontWeight:600, cursor:'pointer' }}>+ Custom</button>
        </div>
      }>
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
                    <button onClick={() => removeWeapon(w.id)} style={{ background:'none', border:'none', color:'var(--text3)', cursor:'pointer', padding:'4px', fontSize:14 }}
                      onMouseEnter={e => e.currentTarget.style.color='var(--danger)'}
                      onMouseLeave={e => e.currentTarget.style.color='var(--text3)'}
                    >✕</button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </Card>

      {/* Armor by Body Part */}
      <Card title="Armor & Defense">
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
              {/* Shield row */}
              <tr style={{ borderBottom:'1px solid var(--border)', background:'var(--surface2)' }}>
                <td style={{ padding:'4px 8px', fontWeight:600, fontSize:12 }}>Shield</td>
                <td style={{ padding:'3px 6px' }} colSpan={5}>
                  <select value={shield.type || 'None'} onChange={e => updateArmorPart('shield', { type: e.target.value === 'None' ? null : e.target.value })} style={{ width:'100%', padding:'2px 3px', fontSize:11 }}>
                    {SHIELD_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
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
          <StatCard label="Qu DB"     value={fmt(db)}      color={db > 0 ? 'var(--success)' : 'var(--text)'} sub="Qu bonus ×3" />
          <StatCard label="Shield DB" value={shieldDB > 0 ? `+${shieldDB}` : '—'} color="var(--accent)" />
          <StatCard label="Total DB"  value={fmt(totalDB)} color={totalDB > 0 ? 'var(--success)' : 'var(--text)'} />
          <StatCard label="Initiative" value={fmt(ini)} color="var(--accent)" />
        </div>

        {/* Resistance Rolls */}
        <div style={{ marginTop:14 }}>
          <div style={{ fontSize:10, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--text3)', marginBottom:6 }}>Resistance Rolls (Stat + Lvl×2 + Special)</div>
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(130px,1fr))', gap:6 }}>
            {[
              { key:'channeling', label:'Channeling', stat:'Intuition',    color:'#f59e0b' },
              { key:'essence',    label:'Essence',    stat:'Empathy',      color:'#4c8bf5' },
              { key:'mentalism',  label:'Mentalism',  stat:'Presence',     color:'#8b5cf6' },
              { key:'physical',   label:'Physical',   stat:'Constitution', color:'#22c55e' },
              { key:'fear',       label:'Fear',       stat:'Self Disc.',   color:'#ef4444' },
            ].map(({ key, label, stat, color }) => {
              const total = rrBonuses[key] ?? 0
              return (
                <div key={key} style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'baseline', marginBottom:4 }}>
                    <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.07em', color }}>{label}</div>
                    <div style={{ fontSize:8, color:'var(--text3)' }}>{stat}</div>
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
          </div>
        </div>
      </Card>

      {/* Starred Skills */}
      <StarredSkillsPanel c={c} />

      {/* Spell Lists */}
      <SpellListsPanel c={c} />

      {/* Pace & Encumbrance */}
      <Card title="Pace & Encumbrance">
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(110px,1fr))', gap:8, marginBottom:12 }}>
          <StatCard label="BMR (m/rnd)" value={bmr} color="var(--accent)" />
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
      </Card>

      {/* Notes */}
      <Card title="Notes">
        <textarea value={c.notes || ''} onChange={e => updateCharacter({ notes: e.target.value })}
          placeholder="Session notes, injuries, reminders…"
          style={{ width: '100%', minHeight: 90, resize: 'vertical', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.5 }} />
      </Card>
    </div>
  )
}

/* ─── STARRED SKILLS PANEL ──────────────────────────────── */
function StarredSkillsPanel({ c }) {
  const talentBonusMap = useMemo(() => {
    const map = {}
    for (const inst of (c.talents || [])) {
      const def = talentsData.find(t => t.id === inst.talent_id)
      if (!def?.effects) continue
      for (const eff of def.effects) {
        if (eff.type !== 'skill_talent_bonus') continue
        const skillName = eff.skill === 'param' ? inst.param : eff.skill
        if (!skillName) continue
        const bonus = eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
        if (!map[skillName]) map[skillName] = []
        map[skillName].push({ instId: inst.id, name: def.name, bonus })
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
      result.push({ name: skillName, total, ranks, notes: skillData.notes })
    }
    for (const cs of (c.custom_skills || [])) {
      if (!cs.starred) continue
      const template = skillsDataMap[cs.template_name]
      const name = displaySkillName(cs.template_name, cs.label)
      const total = computeSkillTotal(c, template, cs, talentBonusMap)
      const ranks = (cs.ranks ?? 0) + (cs.culture_ranks ?? 0)
      result.push({ name, total, ranks, notes: cs.notes })
    }
    return result
  }, [c.skills, c.custom_skills, c.talents, c.stats, c.realm, talentBonusMap])

  if (!starred.length) return null

  return (
    <Card title="Starred Skills">
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
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{ranks} rnk</span>
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
const SUB_COLOR  = { 'Magic Ritual': '#a855f7', Base: '#4c8bf5', Open: '#22c55e', Closed: '#f59e0b', Arcane: '#ec4899', Restricted: '#ef4444' }

function SpellListsPanel({ c }) {
  const lists = Object.entries(c.spell_lists || {})
  if (!lists.length) return null

  // Formula: rankBonus + RS×2 + Me + itemBonus + profBonus + talentSpell  (must match SkillsView SpellListRow)
  const talentSpellB = getTalentBonuses(c).spellcasting
  function castingBonus(listName, data) {
    const d       = typeof data === 'object' ? data : {}
    const ranks   = typeof data === 'number' ? data : (d.ranks ?? 0)
    const item    = d.item_bonus ?? 0
    const isProf  = !!d.proficient
    const profB   = isProf ? Math.min(ranks, 30) : 0
    const rb      = rankBonus(ranks)
    const listDef = spellListsDb[listName]
    const realm   = listDef?.realm || c.realm
    const rsName  = c.spell_cast_stat ?? REALM_STAT_MAP[realm]
    const rsB     = rsName && c.stats?.[rsName] ? getTotalStatBonus(c.stats[rsName]) : 0
    const meB     = c.stats?.Memory ? getTotalStatBonus(c.stats.Memory) : 0
    const statB   = rsB * 2 + meB
    return { ranks, rb, statB, item, profB, talentB: talentSpellB, total: rb + statB + item + profB + talentSpellB }
  }

  const grouped = {}
  for (const sub of SPELL_SUBS) grouped[sub] = []
  for (const [name, data] of lists) {
    const cat = (typeof data === 'object' ? data.category : null) || 'Base'
    const target = grouped[cat] ?? grouped['Base']
    target.push([name, data])
  }

  return (
    <Card title="Spell Lists">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {SPELL_SUBS.map(sub => {
          const subLists = grouped[sub] || []
          if (!subLists.length) return null
          const color = SUB_COLOR[sub] || 'var(--accent)'
          return (
            <div key={sub}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em',
                color, marginBottom: 4 }}>{sub}</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 40px 40px 40px 40px 54px', gap: 3,
                padding: '3px 6px', background: 'var(--surface2)', borderRadius: 4,
                fontSize: 9, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase',
                letterSpacing: '0.06em', marginBottom: 2 }}>
                <span>List</span><span style={{textAlign:'center'}}>Rnk</span>
                <span style={{textAlign:'center'}}>Rank</span>
                <span style={{textAlign:'center'}}>Stat</span>
                <span style={{textAlign:'center'}}>Other</span>
                <span style={{textAlign:'center'}}>Total</span>
              </div>
              {subLists.map(([name, data]) => {
                const { ranks, rb, statB, item, profB, talentB, total } = castingBonus(name, data)
                const other = item + profB + talentB
                const otherTip = [
                  item    ? `Item: +${item}`     : null,
                  profB   ? `Prof: +${profB}`    : null,
                  talentB ? `Talent: ${talentB > 0 ? '+' : ''}${talentB}` : null,
                ].filter(Boolean).join(' + ') || 'no bonus'
                return (
                  <div key={name} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 40px 40px 40px 54px',
                    gap: 3, padding: '4px 6px', fontSize: 12, alignItems: 'center',
                    borderBottom: '1px solid var(--border)' }}>
                    <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      color: 'var(--text)', fontWeight: 500 }} title={name}>{name}</span>
                    <span style={{ textAlign: 'center', color: 'var(--text2)' }}>{ranks}</span>
                    <span style={{ textAlign: 'center', color: ranks > 0 ? 'var(--text2)' : 'var(--text3)',
                      fontSize: 11 }}>{rb >= 0 ? `+${rb}` : rb}</span>
                    <span style={{ textAlign: 'center', color: 'var(--text2)', fontSize: 11 }}>
                      {statB >= 0 ? `+${statB}` : statB}
                    </span>
                    <span style={{ textAlign: 'center', fontSize: 11,
                      color: other !== 0 ? 'var(--accent)' : 'var(--text3)' }}
                      title={otherTip}>
                      {other !== 0 ? (other > 0 ? `+${other}` : other) : '—'}
                    </span>
                    <span style={{ textAlign: 'center', fontWeight: 700, fontSize: 13,
                      color: total > 0 ? 'var(--success)' : total < -10 ? 'var(--danger)' : 'var(--text2)' }}
                      title={`Rank ${rb >= 0 ? '+' : ''}${rb} | Stat ${statB >= 0 ? '+' : ''}${statB}${other ? ` | Other +${other}` : ''}`}>
                      {total >= 0 ? `+${total}` : total}
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

function EditStat({ label, field, char, onUpdate, danger, autoValue, sub }) {
  const stored  = char[field]
  const isAuto  = stored == null && autoValue != null
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', textAlign: 'center' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{label}</div>
      <input type="number" value={stored ?? ''}
        placeholder={autoValue != null ? String(autoValue) : ''}
        onChange={e => onUpdate({ [field]: e.target.value === '' ? null : Number(e.target.value) })}
        style={{ width: 64, textAlign: 'center', fontSize: 18, fontWeight: 700, padding: '2px',
          background: 'transparent', border: 'none', boxShadow: 'none',
          color: danger ? 'var(--danger)' : 'var(--text)' }}
      />
      {isAuto
        ? <div style={{ fontSize: 8, color: 'var(--accent)', letterSpacing: '0.06em', marginTop: 1 }}>AUTO</div>
        : sub && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>
      }
    </div>
  )
}
