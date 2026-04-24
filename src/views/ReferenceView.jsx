import React, { useState, useMemo } from 'react'
import { ChevronDownIcon, ChevronUpIcon } from '../components/Icons.jsx'
import racesData          from '../data/races.json'
import cultureSkillsData  from '../data/culture_skills.json'
import armorData    from '../data/armor.json'
import skillCosts   from '../data/skill_costs.json'
import professions  from '../data/professions.json'
import statBonuses  from '../data/stat_bonuses.json'
import critTables   from '../data/crit_tables.json'
import attackTables from '../data/attack_tables.json'
import combatGuide  from '../data/combat_guide.json'
import weaponsData  from '../data/weapons.json'
import fumbleTables from '../data/fumble_tables.json'

const TABS = ['Races', 'Cultures', 'Armor', 'Stat Bonuses', 'Skill Costs', 'Weapons', 'Crit Tables', 'Attack Tables', 'Combat Calc', 'Combat Guide']
const STAT_COLS = ['Agility','Constitution','Empathy','Intuition','Memory',
                   'Presence','Quickness','Reasoning','Self Discipline','Strength']
const STAT_ABR  = ['Ag','Co','Em','In','Me','Pr','Qu','Re','SD','St']

const SEV_META = {
  A: { label:'A – Minor',    color:'#22c55e' },
  B: { label:'B – Light',    color:'#86efac' },
  C: { label:'C – Moderate', color:'#fbbf24' },
  D: { label:'D – Serious',  color:'#f97316' },
  E: { label:'E – Severe',   color:'#ef4444' },
  F: { label:'F – Extreme',  color:'#dc2626' },
}
const CRIT_KEYS   = Object.keys(critTables)
const WEAPON_KEYS = Object.keys(attackTables)
const AT_LABELS   = ['AT 1','AT 2','AT 3','AT 4','AT 5','AT 6','AT 7','AT 8','AT 9','AT 10']

const CRIT_CODE_MAP = {
  S:'Slash', K:'Krush', P:'Puncture', U:'Unbalancing',
  G:'Grapple', C:'Cold', H:'Heat', E:'Electricity', I:'Impact',
  T:'Strike', Su:'Subdual', Sw:'Sweeps',
}

function parseAtCell(val) {
  if (!val) return null
  const m = val.match(/^(\d+)([A-F])([A-Z])$/)
  if (m) return { hits: parseInt(m[1]), severity: m[2], critCode: m[3], critType: CRIT_CODE_MAP[m[3]] || m[3] }
  const n = val.match(/^(\d+)$/)
  if (n) return { hits: parseInt(n[1]), severity: null, critCode: null, critType: null }
  return null
}

function findCritRow(type, sev, roll) {
  const mappedSev = (sev === 'F' || !critTables[type]?.[sev]) ? 'E' : sev
  const rows = critTables[type]?.[mappedSev] ?? []
  const r = parseInt(roll, 10)
  if (isNaN(r) || r < 1 || r > 100) return null
  return rows.find(row => r >= row.min && r <= row.max) ?? null
}

// Simulate an open-ended d100 roll
// High OE: 96–100 chains (roll again, add) — no limit
// Low OE: 01–05 on first die only (roll once more, subtract) — does NOT chain
function rollOEd100() {
  const rolls = []
  let r = Math.ceil(Math.random() * 100)
  rolls.push(r)
  if (r <= 5) {
    // Low open-ended: one extra roll, stored as negative
    rolls.push(-(Math.ceil(Math.random() * 100)))
    return rolls
  }
  while (r >= 96) {
    r = Math.ceil(Math.random() * 100)
    rolls.push(r)
  }
  return rolls  // sum for total; rolls[0] is the unmodified die
}

function findFumbleResult(weaponKey, fumbleRoll) {
  const colMap = fumbleTables._col_map[weaponKey]
  if (!colMap) return null
  const [tableKey, colIdx] = colMap
  const table = fumbleTables[tableKey]
  if (!table) return null
  const roll = parseInt(fumbleRoll, 10)
  if (isNaN(roll) || roll < 1 || roll > 100) return null
  const row = table.rows.find(r => roll >= r.min && roll <= r.max)
  if (!row) return null
  return { result: row.results[colIdx], table: table.label, column: table.columns[colIdx], tableKey, colIdx, table }
}

const CHOICE_LABELS = {
  animal_specialization: 'choose animal',
  combat_unarmed:        'unarmed type',
  combat_melee:          'melee weapon',
  combat_ranged:         'ranged weapon',
  composition_perf_art:  'art/music',
  crafting_vocation:     'crafting',
  vehicle:               'vehicle type',
  language:              'spoken/written',
  region_lore:           'region',
  lore:                  'lore type',
  influence:             'influence type',
  survival:              'biome',
}

function CulturesTab() {
  const cultures = cultureSkillsData.filter(c => c.grants?.length > 0)
  const [selected, setSelected] = useState(cultures[0]?.name ?? '')
  const entry = cultures.find(c => c.name === selected)

  return (
    <div>
      {/* Culture picker */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {cultureSkillsData.map(c => (
          <button key={c.name} onClick={() => setSelected(c.name)} style={{
            background: selected === c.name ? 'var(--accent)' : 'var(--surface2)',
            color: selected === c.name ? '#fff' : c.grants?.length ? 'var(--text2)' : 'var(--text3)',
            border: '1px solid ' + (selected === c.name ? 'transparent' : 'var(--border)'),
            borderRadius: 7, padding: '5px 12px', cursor: 'pointer',
            fontWeight: selected === c.name ? 700 : 400, fontSize: 12,
            opacity: c.grants?.length ? 1 : 0.5,
          }}>{c.name}</button>
        ))}
      </div>

      {entry && (
        <div>
          {entry.grants?.length === 0 ? (
            <p style={{ color: 'var(--text3)', fontStyle: 'italic', fontSize: 13 }}>
              {entry._note || 'No standard grants defined for this culture.'}
            </p>
          ) : (
            <>
              {/* Summary row */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
                {[
                  { label: 'Total ranks', val: entry.grants.reduce((s, g) => s + g.ranks, 0) },
                  { label: 'Fixed skills', val: entry.grants.filter(g => !g.choice).length },
                  { label: 'Choice grants', val: entry.grants.filter(g => g.choice).reduce((s, g) => s + g.ranks, 0) + ' ranks' },
                ].map(({ label, val }) => (
                  <div key={label} style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 90 }}>
                    <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>{val}</div>
                    <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{label}</div>
                  </div>
                ))}
              </div>

              {/* Grants table */}
              <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 50px 120px', padding: '7px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                  {['Skill', 'Ranks', 'Notes'].map((h, i) => (
                    <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: i === 1 ? 'center' : 'left' }}>{h}</span>
                  ))}
                </div>

                {/* Fixed grants */}
                {entry.grants.filter(g => !g.choice).length > 0 && (
                  <div style={{ borderBottom: '1px solid var(--border)' }}>
                    <div style={{ padding: '5px 14px', background: 'rgba(99,102,241,0.08)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accent)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Auto-apply</span>
                    </div>
                    {entry.grants.filter(g => !g.choice).map((g, i) => (
                      <div key={i} style={{
                        display: 'grid', gridTemplateColumns: '1fr 50px 120px',
                        padding: '6px 14px', borderBottom: '1px solid var(--border)',
                        fontSize: 13, alignItems: 'center',
                        background: i % 2 === 0 ? 'transparent' : 'var(--surface2)',
                      }}>
                        <span style={{ color: 'var(--text)' }}>{g.skill}</span>
                        <span style={{ textAlign: 'center', fontWeight: 700, color: 'var(--accent)' }}>{g.ranks}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Choice grants */}
                {entry.grants.filter(g => g.choice).length > 0 && (
                  <div>
                    <div style={{ padding: '5px 14px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                      <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Manual choices *</span>
                    </div>
                    {entry.grants.filter(g => g.choice).map((g, i) => (
                      <div key={i} style={{
                        display: 'grid', gridTemplateColumns: '1fr 50px 120px',
                        padding: '6px 14px', borderBottom: '1px solid var(--border)',
                        fontSize: 13, alignItems: 'center',
                        background: i % 2 === 0 ? 'transparent' : 'var(--surface2)',
                      }}>
                        <span style={{ color: 'var(--text2)' }}>{g.skill} *</span>
                        <span style={{ textAlign: 'center', fontWeight: 600, color: 'var(--text2)' }}>{g.ranks}</span>
                        <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
                          {g.max_per_skill ? `max ${g.max_per_skill}/skill · ` : ''}{CHOICE_LABELS[g.choice] || g.choice}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text3)', marginTop: 8 }}>
                * Choice skills must be assigned manually in the Skills tab. Ranks may be split across multiple specializations up to the max shown.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function ReferenceView() {
  const [tab, setTab]             = useState('Races')
  const [raceSearch, setRaceSearch]   = useState('')
  const [skillSearch, setSkillSearch] = useState('')
  const [selectedProf, setSelectedProf] = useState('Magician')
  const [statVal, setStatVal]     = useState(50)

  // Crit Tables state
  const [critType, setCritType]   = useState('Slash')
  const [critSev, setCritSev]     = useState('A')
  const [critRoll, setCritRoll]   = useState('')

  // Attack Tables state
  const [atWeapon, setAtWeapon]   = useState(WEAPON_KEYS[0])
  const [atRoll, setAtRoll]       = useState('')
  const [atAT, setAtAT]           = useState(null)

  // Combat Calc state
  const [calcWeapon, setCalcWeapon]       = useState(WEAPON_KEYS[0])
  const [calcRoll, setCalcRoll]           = useState('')
  const [calcAT, setCalcAT]               = useState(null)
  const [calcCritRoll, setCalcCritRoll]   = useState('')
  const [calcCritType, setCalcCritType]   = useState(null)
  const [calcCritSev, setCalcCritSev]     = useState(null)
  const [calcFumbleRoll, setCalcFumbleRoll] = useState('')
  const [critOnly, setCritOnly]           = useState(false)

  return (
    <div style={{ maxWidth: 900, margin: '0 auto', padding: '16px 12px' }}>
      {/* Tab strip */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 16, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            background: tab === t ? 'var(--accent)' : 'var(--surface2)',
            color: tab === t ? '#fff' : 'var(--text2)',
            border: '1px solid ' + (tab === t ? 'transparent' : 'var(--border)'),
            borderRadius: 7, padding: '6px 14px', cursor: 'pointer',
            fontWeight: tab === t ? 700 : 400, fontSize: 12,
          }}>{t}</button>
        ))}
      </div>

      {/* ── RACES ── */}
      {tab === 'Races' && (
        <>
          <input type="text" placeholder="Search races…" value={raceSearch}
            onChange={e => setRaceSearch(e.target.value)} style={{ marginBottom: 12, width: '100%' }} />
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <Th left>Race</Th>
                  {STAT_ABR.map(s => <Th key={s}>{s}</Th>)}
                  <Th>Hits</Th><Th>Rec</Th>
                  <Th>Ch</Th><Th>Es</Th><Th>Me</Th><Th>Ph</Th>
                </tr>
              </thead>
              <tbody>
                {racesData.filter(r => r.name.toLowerCase().includes(raceSearch.toLowerCase())).map((race, i) => (
                  <tr key={race.name} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                    <td style={{ padding: '5px 8px', fontWeight: 600, whiteSpace: 'nowrap', fontSize: 12 }}>{race.name}</td>
                    {STAT_COLS.map(s => {
                      const v = race.stat_bonuses[s]
                      return <td key={s} style={{ padding: '5px 6px', textAlign: 'center', color: v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text3)', fontWeight: v !== 0 ? 600 : 400, fontSize: 12 }}>{v !== 0 ? (v > 0 ? `+${v}` : v) : '—'}</td>
                    })}
                    <td style={{ padding:'5px 6px', textAlign:'center', fontSize:12 }}>{race.base_hits}</td>
                    <td style={{ padding:'5px 6px', textAlign:'center', fontSize:12 }}>{race.recovery_mult}</td>
                    {[race.channeling_rr, race.essence_rr, race.mentalism_rr, race.physical_rr].map((v, j) => (
                      <td key={j} style={{ padding:'5px 6px', textAlign:'center', fontSize:12, color: v > 0 ? 'var(--success)' : v < 0 ? 'var(--danger)' : 'var(--text3)', fontWeight: v !== 0 ? 600 : 400 }}>{v !== 0 ? v : '—'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── CULTURES ── */}
      {tab === 'Cultures' && <CulturesTab />}

      {/* ── ARMOR ── */}
      {tab === 'Armor' && (
        <div>
          {Object.entries(armorData).filter(([, types]) => types.length > 0).map(([section, types]) => {
            const SECTION_LABELS = { full_suit:'Full Suits', torso:'Torso Armor', helmet:'Helmets', vambraces:'Vambraces', greaves:'Greaves', shields:'Shields' }
            const isShield = section === 'shields'
            const headers = isShield
              ? ['Name','Cost (Med)','Wt%','Str','Difficulty','Craft Time']
              : ['AT','Name','Cost (Med)','Wt%','Str','Man','Rang','Perc','Difficulty','Time']
            return (
              <div key={section} style={{ marginBottom: 20 }}>
                <h3 style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text2)', marginBottom: 8 }}>
                  {SECTION_LABELS[section] ?? section.replace('_',' ')}
                </h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface2)' }}>
                        {headers.map(h => <Th key={h}>{h}</Th>)}
                      </tr>
                    </thead>
                    <tbody>
                      {types.filter(a => a.at !== 1 && a.name !== 'None').map((a, i) => (
                        <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                          {!isShield && <td style={{ padding:'4px 8px', textAlign:'center', fontWeight:700, color:'var(--accent)', fontSize:11 }}>{a.at ?? '—'}</td>}
                          <td style={{ padding:'4px 8px', fontWeight:600, fontSize:11, whiteSpace:'nowrap' }}>{a.name}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontSize:11, color:'var(--text2)' }}>{a.cost_medium != null ? a.cost_medium : '—'}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontSize:11, color:'var(--text2)' }}>{a.weight_pct != null ? `${a.weight_pct}%` : '—'}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontSize:11, color:'var(--text2)' }}>{a.str_req || '—'}</td>
                          {!isShield && [a.maneuver_penalty, a.ranged_penalty, a.perception_penalty].map((v, j) => (
                            <td key={j} style={{ padding:'4px 8px', textAlign:'center', fontSize:11, color: v < 0 ? 'var(--danger)' : 'var(--text3)', fontWeight: v < 0 ? 600 : 400 }}>{v ? v : '—'}</td>
                          ))}
                          <td style={{ padding:'4px 8px', textAlign:'center', fontSize:11, color: a.difficulty?.startsWith('E') ? 'var(--success)' : a.difficulty?.startsWith('SF') ? 'var(--danger)' : a.difficulty?.startsWith('VH') || a.difficulty?.startsWith('XH') ? '#f97316' : 'var(--text2)' }}>{a.difficulty ?? '—'}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontSize:11, color:'var(--text3)' }}>{a.craft_time ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── STAT BONUSES ── */}
      {tab === 'Stat Bonuses' && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 6 }}>Stat Value</div>
              <input type="range" min={1} max={100} value={statVal} onChange={e => setStatVal(Number(e.target.value))} style={{ width: '100%', accentColor: 'var(--accent)', background: 'transparent', border: 'none', boxShadow: 'none' }} />
            </div>
            <div style={{ textAlign: 'center', minWidth: 44 }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--accent)' }}>{statVal}</div>
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>value</div>
            </div>
            <div style={{ textAlign: 'center', minWidth: 52 }}>
              {(() => { const b = Number(statBonuses[String(statVal)]); return (
                <div style={{ fontSize: 28, fontWeight: 700, color: b > 0 ? 'var(--success)' : b < 0 ? 'var(--danger)' : 'var(--text2)' }}>
                  {b >= 0 ? `+${b}` : b}
                </div>
              )})()}
              <div style={{ fontSize: 10, color: 'var(--text3)' }}>bonus</div>
            </div>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  {[0,1,2,3,4].map(c => <React.Fragment key={c}><Th>Stat</Th><Th>Bonus</Th></React.Fragment>)}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 20 }, (_, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                    {[0,1,2,3,4].map(col => {
                      const v = i + col * 20 + 1
                      if (v > 100) return <td key={col} colSpan={2} />
                      const b = statBonuses[String(v)]
                      const hl = v === statVal
                      return (
                        <React.Fragment key={col}>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontWeight: hl ? 700 : 400, background: hl ? 'var(--accent)22' : undefined, color: hl ? 'var(--accent)' : 'var(--text2)', fontSize:12 }}>{v}</td>
                          <td style={{ padding:'4px 8px', textAlign:'center', fontWeight: hl ? 700 : 600, background: hl ? 'var(--accent)22' : undefined, color: Number(b) > 0 ? 'var(--success)' : Number(b) < 0 ? 'var(--danger)' : 'var(--text3)', fontSize:12 }}>
                            {Number(b) >= 0 ? `+${b}` : b}
                          </td>
                        </React.Fragment>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── SKILL COSTS ── */}
      {tab === 'Skill Costs' && (
        <div>
          <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
            <input type="text" placeholder="Search categories…" value={skillSearch}
              onChange={e => setSkillSearch(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
            <select value={selectedProf} onChange={e => setSelectedProf(e.target.value)} style={{ padding: '6px 8px' }}>
              {professions.map(p => <option key={p}>{p}</option>)}
            </select>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: 'var(--surface2)' }}>
                  <Th left>Category</Th>
                  <Th><span style={{ color: 'var(--accent)' }}>{selectedProf}</span></Th>
                  {professions.filter(p => p !== selectedProf).slice(0, 5).map(p => <Th key={p}>{p}</Th>)}
                </tr>
              </thead>
              <tbody>
                {Object.entries(skillCosts)
                  .filter(([cat]) => cat.toLowerCase().includes(skillSearch.toLowerCase()))
                  .map(([cat, costs], i) => (
                  <tr key={cat} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                    <td style={{ padding:'5px 8px', fontWeight:600, fontSize:12 }}>{cat}</td>
                    <td style={{ padding:'5px 8px', textAlign:'center', color:'var(--accent)', fontWeight:700, fontSize:12 }}>{costs[selectedProf] || '?'}</td>
                    {professions.filter(p => p !== selectedProf).slice(0, 5).map(p => (
                      <td key={p} style={{ padding:'5px 8px', textAlign:'center', color:'var(--text3)', fontSize:12 }}>{costs[p] || '?'}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── WEAPONS ── */}
      {tab === 'Weapons' && <WeaponsPanel />}

      {/* ── CRIT TABLES ── */}
      {tab === 'Crit Tables' && <CritTablesPanel
        critType={critType} setCritType={setCritType}
        critSev={critSev} setCritSev={setCritSev}
        critRoll={critRoll} setCritRoll={setCritRoll}
      />}

      {/* ── ATTACK TABLES ── */}
      {tab === 'Attack Tables' && <AttackTablesPanel
        atWeapon={atWeapon} setAtWeapon={setAtWeapon}
        atRoll={atRoll} setAtRoll={setAtRoll}
        atAT={atAT} setAtAT={setAtAT}
      />}

      {/* ── COMBAT CALC ── */}
      {tab === 'Combat Calc' && <CombatCalcPanel
        calcWeapon={calcWeapon} setCalcWeapon={setCalcWeapon}
        calcRoll={calcRoll} setCalcRoll={setCalcRoll}
        calcAT={calcAT} setCalcAT={setCalcAT}
        calcCritRoll={calcCritRoll} setCalcCritRoll={setCalcCritRoll}
        calcCritType={calcCritType} setCalcCritType={setCalcCritType}
        calcCritSev={calcCritSev} setCalcCritSev={setCalcCritSev}
        calcFumbleRoll={calcFumbleRoll} setCalcFumbleRoll={setCalcFumbleRoll}
        critOnly={critOnly} setCritOnly={setCritOnly}
      />}

      {/* ── COMBAT GUIDE ── */}
      {tab === 'Combat Guide' && <CombatGuidePanel />}
    </div>
  )
}

/* ─────────────────────────────────────────────── */
/*  WEAPONS PANEL                                  */
/* ─────────────────────────────────────────────── */
const SKILL_CATS = ['All','Blade','Greater Blade','Hafted','Greater Hafted','Pole Arm','Spear','Chain','Greater Chain','Net','Bow','Crossbow','Thrown','Sling','Blowpipe','Shield','Strikes','Grappling/Wrestling']
const OB_TYPES   = ['All','melee','ranged','unarmed']
const SKILL_CAT_COLOR = {
  'Blade':'#3b82f6','Greater Blade':'#60a5fa','Hafted':'#f97316','Greater Hafted':'#fb923c',
  'Pole Arm':'#22c55e','Spear':'#86efac','Chain':'#a855f7','Greater Chain':'#c084fc',
  'Net':'#14b8a6','Bow':'#f59e0b','Crossbow':'#fbbf24','Thrown':'#ef4444',
  'Sling':'#f87171','Blowpipe':'#84cc16','Shield':'#6b7280',
  'Strikes':'#ec4899','Grappling/Wrestling':'#8b5cf6',
}

function WeaponsPanel() {
  const [search, setSearch]     = useState('')
  const [catFilter, setCatFilter] = useState('All')
  const [obFilter, setObFilter]   = useState('All')
  const [sortKey, setSortKey]     = useState('name')
  const [sortAsc, setSortAsc]     = useState(true)

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    return weaponsData.filter(w => {
      if (catFilter !== 'All' && w.skill_name !== catFilter) return false
      if (obFilter !== 'All' && w.ob_type !== obFilter) return false
      if (q && !w.name.toLowerCase().includes(q) && !w.skill_name.toLowerCase().includes(q)) return false
      return true
    }).sort((a, b) => {
      const av = a[sortKey] ?? '', bv = b[sortKey] ?? ''
      return sortAsc
        ? (av < bv ? -1 : av > bv ? 1 : 0)
        : (av > bv ? -1 : av < bv ? 1 : 0)
    })
  }, [search, catFilter, obFilter, sortKey, sortAsc])

  function toggleSort(key) {
    if (sortKey === key) setSortAsc(a => !a)
    else { setSortKey(key); setSortAsc(true) }
  }
  const SortTh = ({ col, label, left }) => {
    const active = sortKey === col
    return (
      <th onClick={() => toggleSort(col)} style={{
        ...thStyle, cursor:'pointer', textAlign: left ? 'left' : 'center',
        color: active ? 'var(--accent)' : 'var(--text3)',
        userSelect: 'none', whiteSpace:'nowrap',
      }}>
        {label} {active && (sortAsc
          ? <ChevronUpIcon size={9} color="var(--accent)" />
          : <ChevronDownIcon size={9} color="var(--accent)" />
        )}
      </th>
    )
  }

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <input type="text" value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="Search weapons…"
          style={{ flex:1, minWidth:140, padding:'6px 8px', fontSize:12 }} />
        <select value={obFilter} onChange={e=>setObFilter(e.target.value)} style={{ padding:'6px 8px', fontSize:12 }}>
          {OB_TYPES.map(t=><option key={t} value={t}>{t==='All'?'All types':t}</option>)}
        </select>
        <select value={catFilter} onChange={e=>setCatFilter(e.target.value)} style={{ padding:'6px 8px', fontSize:12, minWidth:120 }}>
          {SKILL_CATS.map(c=><option key={c} value={c}>{c==='All'?'All skills':c}</option>)}
        </select>
      </div>

      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
          <thead>
            <tr style={{ background:'var(--surface2)' }}>
              <SortTh col="name"       label="Weapon"    left />
              <SortTh col="skill_name" label="Skill"     />
              <SortTh col="ob_type"    label="Type"      />
              <SortTh col="fumble"     label="Fumble"    />
              <SortTh col="str_req"    label="Str Req"   />
              <SortTh col="size"       label="Size"      />
              <SortTh col="length"     label="Length"    />
              <SortTh col="weight"     label="Wt (lbs)"  />
            </tr>
          </thead>
          <tbody>
            {filtered.map((w, i) => {
              const color = SKILL_CAT_COLOR[w.skill_name] ?? 'var(--text3)'
              return (
                <tr key={w.name} style={{ borderBottom:'1px solid var(--border)', background: i%2===0?'transparent':'var(--surface2)' }}>
                  <td style={{ padding:'5px 8px', fontWeight:600, fontSize:12, whiteSpace:'nowrap' }}>{w.name}</td>
                  <td style={{ padding:'5px 6px', textAlign:'center' }}>
                    <span style={{ display:'inline-block', padding:'2px 7px', borderRadius:4, fontSize:10, fontWeight:700, background:color+'22', color }}>{w.skill_name}</span>
                  </td>
                  <td style={{ padding:'5px 6px', textAlign:'center', fontSize:11, color:'var(--text3)', textTransform:'capitalize' }}>{w.ob_type}</td>
                  <td style={{ padding:'5px 6px', textAlign:'center', fontWeight:700, color:w.fumble>=8?'var(--danger)':w.fumble>=6?'#f97316':'var(--text)' }}>{w.fumble}</td>
                  <td style={{ padding:'5px 6px', textAlign:'center', color:'var(--text2)' }}>{w.str_req||'—'}</td>
                  <td style={{ padding:'5px 6px', textAlign:'center', color:w.size?.startsWith('+')?'var(--success)':w.size?.startsWith('-')?'var(--danger)':'var(--text3)', fontWeight:600 }}>{w.size}</td>
                  <td style={{ padding:'5px 6px', textAlign:'center', color:'var(--text2)' }}>{w.length}</td>
                  <td style={{ padding:'5px 6px', textAlign:'center', color:'var(--text2)' }}>{w.weight}</td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={8} style={{ textAlign:'center', padding:'16px', color:'var(--text3)', fontSize:13 }}>No weapons match.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div style={{ fontSize:11, color:'var(--text3)' }}>
        Fumble = base fumble number (reduced by 1 per 5 ranks in the skill, minimum 1). Size = weapon size modifier vs. Medium target. Str Req = stat needed for effective use.
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────── */
/*  CRIT TABLES PANEL                              */
/* ─────────────────────────────────────────────── */
function CritTablesPanel({ critType, setCritType, critSev, setCritSev, critRoll, setCritRoll }) {
  const table = critTables[critType]
  const rows  = table?.[critSev] ?? []
  const roll  = parseInt(critRoll, 10)
  const hit   = !isNaN(roll) && roll >= 1 && roll <= 100
    ? rows.find(r => roll >= r.min && roll <= r.max)
    : null
  const sevColor = SEV_META[critSev]?.color ?? 'var(--accent)'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Type selector */}
      <div>
        <SectionLabel>Crit Type</SectionLabel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {CRIT_KEYS.map(k => {
            const ct = critTables[k]
            const active = critType === k
            return (
              <button key={k} onClick={() => setCritType(k)} style={{
                background: active ? ct.color : 'var(--surface2)',
                color: active ? '#fff' : 'var(--text2)',
                border: '1px solid ' + (active ? ct.color : 'var(--border)'),
                borderRadius: 8, padding: '7px 14px', cursor: 'pointer',
                fontWeight: active ? 700 : 400, fontSize: 13,
              }}>
                <span style={{ opacity: 0.7, fontSize: 11, marginRight: 5 }}>{ct.code}</span>{ct.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Severity + Roll row */}
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <SectionLabel>Severity</SectionLabel>
          <div style={{ display: 'flex', gap: 6 }}>
            {['A','B','C','D','E'].map(k => {
              const s = SEV_META[k]
              return (
                <button key={k} onClick={() => setCritSev(k)} style={{
                  flex: 1, background: critSev === k ? s.color : 'var(--surface2)',
                  color: critSev === k ? (k === 'B' ? '#111' : '#fff') : 'var(--text2)',
                  border: '1px solid ' + (critSev === k ? s.color : 'var(--border)'),
                  borderRadius: 8, padding: '8px 4px', cursor: 'pointer',
                  fontWeight: critSev === k ? 800 : 500, fontSize: 14,
                }}>{k}</button>
              )
            })}
          </div>
        </div>
        <div style={{ minWidth: 200 }}>
          <SectionLabel>Roll d100</SectionLabel>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" min={1} max={100} value={critRoll}
              onChange={e => setCritRoll(e.target.value)}
              placeholder="01–100"
              style={{ flex: 1, fontSize: 18, fontWeight: 700, textAlign: 'center', padding: '6px 8px' }} />
            <button onClick={() => setCritRoll(String(Math.ceil(Math.random() * 100)))} style={{
              background: 'var(--accent)', color: '#fff', border: 'none',
              borderRadius: 8, padding: '6px 14px', cursor: 'pointer', fontWeight: 700, fontSize: 14,
            }}>d100</button>
          </div>
        </div>
      </div>

      {/* Result card */}
      <CritResultCard hit={hit} critType={critType} critSev={critSev} critRoll={critRoll} sevColor={sevColor} />

      {/* Full table */}
      <div>
        <SectionLabel>{critTables[critType]?.label} – Severity {critSev} – Full Table</SectionLabel>
        <CritTableGrid rows={rows} hit={hit} sevColor={sevColor} />
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────── */
/*  ATTACK TABLES PANEL                            */
/* ─────────────────────────────────────────────── */
function AttackTablesPanel({ atWeapon, setAtWeapon, atRoll, setAtRoll, atAT, setAtAT }) {
  const weapon = attackTables[atWeapon]
  const roll   = parseInt(atRoll, 10)
  const validRoll = !isNaN(roll)

  const hitRow = validRoll
    ? weapon?.rows?.find(r => roll >= r.min && roll <= r.max)
    : null

  const hitCell = hitRow && atAT !== null ? parseAtCell(hitRow.at[atAT]) : null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div style={{ flex: '0 0 auto' }}>
          <SectionLabel>Weapon</SectionLabel>
          <select value={atWeapon} onChange={e => setAtWeapon(e.target.value)} style={{ padding: '7px 10px', fontSize: 13, minWidth: 160 }}>
            {WEAPON_KEYS.map(w => <option key={w}>{w}</option>)}
          </select>
        </div>
        <div>
          <SectionLabel>Modified Roll</SectionLabel>
          <input type="number" value={atRoll} onChange={e => setAtRoll(e.target.value)}
            placeholder="e.g. 127" style={{ width: 110, padding: '7px 8px', fontSize: 14, fontWeight: 700 }} />
        </div>
        <div>
          <SectionLabel>Target Armor Type</SectionLabel>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {AT_LABELS.map((label, i) => (
              <button key={i} onClick={() => setAtAT(atAT === i ? null : i)} style={{
                background: atAT === i ? 'var(--accent)' : 'var(--surface2)',
                color: atAT === i ? '#fff' : 'var(--text2)',
                border: '1px solid ' + (atAT === i ? 'transparent' : 'var(--border)'),
                borderRadius: 6, padding: '5px 8px', cursor: 'pointer', fontSize: 12, fontWeight: atAT === i ? 700 : 400,
              }}>{i + 1}</button>
            ))}
          </div>
        </div>
      </div>

      {/* Criticals info */}
      {weapon?.criticals && (
        <div style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px' }}>
          <span style={{ color: 'var(--text3)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 8 }}>Crits:</span>
          {weapon.criticals}
        </div>
      )}

      {/* Hit result */}
      {hitCell && (
        <div style={{
          border: '2px solid var(--accent)', borderRadius: 12,
          background: 'var(--accent)12', padding: '14px 16px',
          display: 'flex', gap: 14, alignItems: 'center', flexWrap: 'wrap',
        }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', width: '100%', marginBottom: 4 }}>
            {atWeapon} vs AT {(atAT ?? 0) + 1} — Roll {atRoll}
          </div>
          <StatPill label="Hits" value={`+${hitCell.hits}`} color="#ef4444" />
          {hitCell.severity && (
            <StatPill label="Severity" value={hitCell.severity} color={SEV_META[hitCell.severity]?.color ?? 'var(--accent)'} />
          )}
          {hitCell.critType && (
            <StatPill label="Crit Type" value={hitCell.critType} color="var(--accent)" />
          )}
          {!hitCell.severity && (
            <div style={{ fontSize: 13, color: 'var(--text2)' }}>No critical hit.</div>
          )}
        </div>
      )}

      {/* Full table */}
      <div>
        <SectionLabel>{atWeapon} Attack Table</SectionLabel>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={thStyle}>Roll</th>
                {AT_LABELS.map((l, i) => (
                  <th key={i} style={{ ...thStyle, color: atAT === i ? 'var(--accent)' : 'var(--text3)', fontWeight: atAT === i ? 800 : 600 }}>{l}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weapon?.rows?.map((row, ri) => {
                const isHit = hitRow === row
                return (
                  <tr key={ri} style={{
                    background: isHit ? 'var(--accent)18' : ri % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                    borderLeft: isHit ? '3px solid var(--accent)' : '3px solid transparent',
                  }}>
                    <td style={{ padding:'4px 8px', textAlign:'center', fontWeight: isHit ? 700 : 400, color: isHit ? 'var(--accent)' : 'var(--text2)', whiteSpace:'nowrap', fontSize:11 }}>
                      {row.min === row.max ? row.min : `${row.min}–${row.max}`}
                    </td>
                    {row.at.map((cell, ci) => {
                      const parsed = parseAtCell(cell)
                      const isActiveAT = atAT === ci
                      const isHighlight = isHit && isActiveAT
                      const sevColor = parsed?.severity ? SEV_META[parsed.severity]?.color : null
                      return (
                        <td key={ci} onClick={() => setAtAT(isActiveAT ? null : ci)} style={{
                          padding:'4px 6px', textAlign:'center', cursor:'pointer',
                          background: isHighlight ? (sevColor ?? 'var(--accent)') + '30' : isActiveAT ? 'var(--accent)0a' : undefined,
                          fontWeight: isHighlight ? 800 : 400,
                          fontSize: 11,
                        }}>
                          {parsed ? (
                            parsed.severity
                              ? <span style={{ color: sevColor ?? 'var(--text)' }}>{parsed.hits}<span style={{ fontSize:9 }}>{parsed.severity}{parsed.critCode}</span></span>
                              : <span style={{ color: 'var(--text2)' }}>{parsed.hits}</span>
                          ) : <span style={{ color:'var(--text3)' }}>—</span>}
                        </td>
                      )
                    })}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

/* ─────────────────────────────────────────────── */
/*  COMBAT CALCULATOR PANEL                        */
/* ─────────────────────────────────────────────── */
function CombatCalcPanel({
  calcWeapon, setCalcWeapon, calcRoll, setCalcRoll, calcAT, setCalcAT,
  calcCritRoll, setCalcCritRoll, calcCritType, setCalcCritType,
  calcCritSev, setCalcCritSev, calcFumbleRoll, setCalcFumbleRoll,
  critOnly, setCritOnly,
}) {
  const [oeRolls, setOeRolls]   = useState(null)
  const [obVal, setObVal]       = useState('')
  const [dbVal, setDbVal]       = useState('')
  const [diceOpen, setDiceOpen] = useState(false)

  const weapon    = attackTables[calcWeapon]
  const fumbleMax = weapon?.fumble ?? 3
  const tableRows = weapon?.rows ?? []
  const tableMin  = tableRows.length ? Math.min(...tableRows.map(r => r.min)) : 0
  const tableMax  = tableRows.length ? Math.max(...tableRows.map(r => r.max)) : 999

  const atkRoll     = calcRoll !== '' ? parseInt(calcRoll, 10) : NaN
  const clampedRoll = isNaN(atkRoll) ? NaN : Math.min(Math.max(atkRoll, tableMin - 1), tableMax)
  const atkRow      = !isNaN(atkRoll) && calcAT !== null
    ? tableRows.find(r => Math.min(atkRoll, tableMax) >= r.min && Math.min(atkRoll, tableMax) <= r.max)
    : null
  const atkCell     = atkRow ? parseAtCell(atkRow.at[calcAT]) : null

  // Fumble: unmodified first die (always positive first element) ≤ fumble range
  const unmodified = oeRolls?.[0] ?? null
  const isFumble   = unmodified !== null && unmodified <= fumbleMax

  // Low open-ended: first die was 1–5 (second element will be negative)
  const isLowOE = oeRolls && oeRolls.length === 2 && oeRolls[1] < 0

  // Classify roll outcome
  const rollEntered = calcRoll !== '' && !isNaN(atkRoll)
  const isMiss = rollEntered && calcAT !== null && !atkRow && atkRoll < tableMin && !isFumble
  const isVeryLow = rollEntered && atkRoll < 0

  const activeCritType = calcCritType ?? (atkCell?.critType ?? null)
  const activeCritSev  = calcCritSev  ?? (atkCell?.severity ?? null)
  const critResult     = activeCritType && activeCritSev && calcCritRoll
    ? findCritRow(activeCritType, activeCritSev, calcCritRoll)
    : null
  const sevColor = activeCritSev ? SEV_META[activeCritSev]?.color ?? 'var(--accent)' : 'var(--accent)'

  const fumbleResult = isFumble ? findFumbleResult(calcWeapon, calcFumbleRoll) : null

  const oeTotal = oeRolls ? oeRolls.reduce((a, b) => a + b, 0) : null

  function doOERoll() {
    const rolls = rollOEd100()
    setOeRolls(rolls)
    const ob  = parseInt(obVal,  10)
    const db  = parseInt(dbVal,  10)
    const raw = rolls.reduce((a, b) => a + b, 0)
    const final = raw + (isNaN(ob) ? 0 : ob) - (isNaN(db) ? 0 : db)
    setCalcRoll(String(final))
    setCalcCritType(null); setCalcCritSev(null)
    setCalcFumbleRoll('')
  }

  function resetCalc() {
    setCalcRoll(''); setCalcAT(null); setCalcCritRoll('')
    setCalcCritType(null); setCalcCritSev(null)
    setOeRolls(null); setObVal(''); setDbVal('')
    setCalcFumbleRoll(''); setDiceOpen(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Mode toggle + reset */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button onClick={() => setCritOnly(false)} style={modeBtn(!critOnly)}>Attack + Crit</button>
        <button onClick={() => setCritOnly(true)}  style={modeBtn(critOnly)}>Crit Only</button>
        <button onClick={resetCalc} style={{
          marginLeft: 'auto', background: 'var(--surface2)', border: '1px solid var(--border)',
          color: 'var(--text3)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontSize: 12,
        }}>Reset</button>
      </div>

      {/* ── STEP 1: ATTACK ROLL ── */}
      {!critOnly && (
        <CalcSection label="1  Attack Roll" color="var(--accent)">

          {/* Row: weapon + OB + DB */}
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div>
              <SectionLabel>Weapon / Attack</SectionLabel>
              <select value={calcWeapon}
                onChange={e => { setCalcWeapon(e.target.value); setCalcCritType(null); setCalcCritSev(null); setOeRolls(null); setCalcFumbleRoll('') }}
                style={{ padding: '7px 10px', fontSize: 13, minWidth: 150 }}>
                {WEAPON_KEYS.map(w => <option key={w}>{w}</option>)}
              </select>
            </div>
            <div>
              <SectionLabel>Your OB</SectionLabel>
              <input type="number" value={obVal} onChange={e => setObVal(e.target.value)}
                placeholder="e.g. 85" style={{ width: 80, padding: '7px 8px', fontSize: 14 }} />
            </div>
            <div>
              <SectionLabel>Their DB</SectionLabel>
              <input type="number" value={dbVal} onChange={e => setDbVal(e.target.value)}
                placeholder="e.g. 30" style={{ width: 80, padding: '7px 8px', fontSize: 14 }} />
            </div>
          </div>

          {/* Primary: final modified roll input */}
          <div style={{ marginTop: 12 }}>
            <SectionLabel>
              Final Modified Roll
              <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
                = d100 + OB − DB &nbsp;·&nbsp; can be negative &nbsp;·&nbsp; fumble range: 01–{fumbleMax}
              </span>
            </SectionLabel>
            <input
              type="number"
              value={calcRoll}
              onChange={e => { setCalcRoll(e.target.value); setOeRolls(null); setCalcFumbleRoll('') }}
              placeholder="Enter your modified roll (can be negative)"
              style={{ width: '100%', maxWidth: 280, padding: '9px 10px', fontSize: 17, fontWeight: 700,
                border: '2px solid var(--border2)', borderRadius: 8, background: 'var(--surface)',
                color: isVeryLow ? '#ef4444' : 'var(--text)', boxSizing: 'border-box' }}
            />
            {oeRolls && (
              <div style={{ marginTop: 6, fontSize: 12, color: 'var(--text3)' }}>
                Dice: {oeRolls.map((r, i) => (
                  <span key={i} style={{ fontWeight: 700, color: r < 0 ? '#ef4444' : r >= 96 ? '#22c55e' : r <= fumbleMax && i === 0 ? '#ef4444' : 'var(--text)', marginRight: 4 }}>
                    {i > 0 ? (r < 0 ? '−' : '+') : ''}{Math.abs(r)}
                    {r >= 96 ? <span style={{ color: '#22c55e', fontSize: 9 }}> OE!</span> : null}
                    {r < 0 ? <span style={{ color: '#ef4444', fontSize: 9 }}> LOW-OE</span> : null}
                  </span>
                ))}
                = {oeTotal}
                {(parseInt(obVal) || parseInt(dbVal))
                  ? <span> + OB/DB → <strong style={{ color: 'var(--accent)' }}>{calcRoll}</strong></span>
                  : null}
              </div>
            )}
          </div>

          {/* Collapsible dice roller */}
          <div style={{ marginTop: 10 }}>
            <button onClick={() => setDiceOpen(o => !o)} style={{
              background: 'none', border: '1px solid var(--border)', borderRadius: 7,
              padding: '5px 12px', color: 'var(--text3)', fontSize: 11, cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: 6,
            }}>
              <span>Dice Roller</span>
              {diceOpen ? <ChevronUpIcon size={11} color="var(--text3)" /> : <ChevronDownIcon size={11} color="var(--text3)" />}
            </button>
            {diceOpen && (
              <div style={{ marginTop: 8, padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                  Rolls OE d100: 96–100 chains high (add), 01–05 on first die subtracts once (low OE).
                </div>
                <button onClick={doOERoll} style={{
                  background: 'var(--surface2)', color: 'var(--text2)',
                  border: '1px solid var(--border2)',
                  borderRadius: 7, padding: '6px 14px', cursor: 'pointer', fontWeight: 600, fontSize: 13,
                }}>Roll OE d100</button>
                {isLowOE && !isFumble && (
                  <div style={{ marginTop: 8, padding: '6px 10px', background: '#ef444415', border: '1px solid #ef444440', borderRadius: 6, fontSize: 12, color: '#ef4444' }}>
                    Low open-ended: {oeRolls[0]} − {Math.abs(oeRolls[1])} = {oeTotal}. Added OB/DB → {calcRoll}.
                  </div>
                )}
                {oeRolls && oeRolls.length > 2 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: '#22c55e' }}>
                    High open-ended chain: {oeRolls.length} dice, raw total {oeTotal}.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* AT selector */}
          <div style={{ marginTop: 12 }}>
            <SectionLabel>Target Armor Type (AT)</SectionLabel>
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {AT_LABELS.map((_, i) => (
                <button key={i} onClick={() => setCalcAT(calcAT === i ? null : i)} style={{
                  background: calcAT === i ? 'var(--accent)' : 'var(--surface2)',
                  color:      calcAT === i ? '#fff' : 'var(--text2)',
                  border: '1px solid ' + (calcAT === i ? 'var(--accent)' : 'var(--border)'),
                  borderRadius: 6, padding: '6px 10px', cursor: 'pointer', fontSize: 13, fontWeight: calcAT === i ? 700 : 400,
                }}>{i + 1}</button>
              ))}
            </div>
          </div>

          {/* Attack result box */}
          {atkCell && !isFumble && (
            <div style={{ marginTop: 10, padding: '12px 16px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10 }}>
              <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                {calcWeapon} vs AT {(calcAT ?? 0) + 1} — Modified roll {calcRoll}{atkRoll > tableMax ? ` (capped at ${tableMax})` : ''}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <StatPill label="Hits" value={`+${atkCell.hits}`} color="#ef4444" />
                {atkCell.severity
                  ? <>
                      <StatPill label="Severity" value={atkCell.severity} color={SEV_META[atkCell.severity]?.color ?? 'var(--accent)'} />
                      <StatPill label="Crit Type" value={atkCell.critType ?? atkCell.critCode} color="var(--accent)" />
                      <div style={{ fontSize: 12, color: 'var(--text2)' }}>
                        → Roll on {atkCell.critType ?? atkCell.critCode} table, severity {atkCell.severity}
                      </div>
                    </>
                  : <div style={{ fontSize: 13, color: 'var(--text2)' }}>No critical — hits only.</div>
                }
              </div>
            </div>
          )}

          {/* Miss */}
          {(isMiss || isVeryLow) && !isFumble && (
            <div style={{ marginTop: 8, padding: '10px 14px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text2)' }}>Miss</span>
              <span style={{ fontSize: 12, color: 'var(--text3)', marginLeft: 8 }}>
                {isVeryLow
                  ? `Modified roll ${calcRoll} is negative — a spectacularly bad miss.`
                  : `Modified roll ${calcRoll} is below the table minimum of ${tableMin}. Attack fails to connect.`}
              </span>
            </div>
          )}
        </CalcSection>
      )}

      {/* ── FUMBLE SECTION ── (only when fumble triggered via dice roller) */}
      {isFumble && (
        <CalcSection label="FUMBLE" color="#ef4444">
          <div style={{ padding: '10px 12px', background: '#ef444418', border: '1px solid #ef444460', borderRadius: 8, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: '#ef4444' }}>
              Unmodified roll {unmodified} ≤ fumble range (01–{fumbleMax})
            </span>
            <span style={{ fontSize: 12, color: 'var(--text2)', display: 'block', marginTop: 4 }}>
              Roll d100 on the fumble table below.
              {fumbleTables._col_map[calcWeapon]
                ? ` Using: ${fumbleTables[fumbleTables._col_map[calcWeapon][0]].columns[fumbleTables._col_map[calcWeapon][1]]} column.`
                : ' (Select column manually if needed.)'}
            </span>
          </div>

          <SectionLabel>Fumble Roll (d100)</SectionLabel>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginBottom: 10 }}>
            <input
              type="number" min={1} max={100} value={calcFumbleRoll}
              onChange={e => setCalcFumbleRoll(e.target.value)}
              placeholder="01–100"
              style={{ width: 120, fontSize: 17, fontWeight: 700, textAlign: 'center', padding: '7px 8px' }}
            />
            <button onClick={() => setCalcFumbleRoll(String(Math.ceil(Math.random() * 100)))} style={{
              background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border2)',
              borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12,
            }}>Roll</button>
          </div>

          {fumbleResult && (
            <div style={{ padding: '12px 14px', background: '#ef444412', border: '2px solid #ef4444', borderRadius: 10 }}>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#ef4444', marginBottom: 6 }}>
                {fumbleResult.table} — {fumbleResult.column} — Roll {calcFumbleRoll}
              </div>
              <p style={{ margin: 0, fontSize: 14, color: 'var(--text)', lineHeight: 1.6 }}>{fumbleResult.result}</p>
            </div>
          )}

          {calcFumbleRoll && !fumbleResult && (
            <div style={{ fontSize: 12, color: 'var(--text3)', padding: '8px 10px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              {fumbleTables._col_map[calcWeapon]
                ? `No result for roll ${calcFumbleRoll} — check value is 1–100.`
                : `No fumble column mapped for ${calcWeapon}. Check the Fumble Tables in the rulebook.`}
            </div>
          )}
        </CalcSection>
      )}

      {/* ── STEP 2: CRIT ROLL ── */}
      {!isFumble && (
        <CalcSection label={critOnly ? 'Crit Roll' : '2  Crit Roll'} color={sevColor}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <SectionLabel>
              Crit Type
              {!critOnly && atkCell?.critType
                ? <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>(auto from attack)</span>
                : null}
            </SectionLabel>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {CRIT_KEYS.map(k => {
                const ct     = critTables[k]
                const active = activeCritType === k
                const isAuto = !calcCritType && atkCell?.critType === k
                return (
                  <button key={k} onClick={() => setCalcCritType(calcCritType === k ? null : k)} style={{
                    background: active ? ct.color : 'var(--surface2)',
                    color:      active ? '#fff' : 'var(--text2)',
                    border: '1px solid ' + (active ? ct.color : isAuto ? ct.color + '88' : 'var(--border)'),
                    borderRadius: 7, padding: '5px 10px', cursor: 'pointer', fontSize: 12, fontWeight: active ? 700 : 400,
                  }}>
                    <span style={{ opacity: 0.7, fontSize: 10, marginRight: 4 }}>{ct.code}</span>{ct.label}
                  </button>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <SectionLabel>
              Severity
              {!critOnly && atkCell?.severity
                ? <span style={{ color: 'var(--text3)', fontWeight: 400, marginLeft: 6 }}>(auto from attack)</span>
                : null}
            </SectionLabel>
            <div style={{ display: 'flex', gap: 6 }}>
              {['A','B','C','D','E'].map(k => {
                const s      = SEV_META[k]
                const active = activeCritSev === k
                const isAuto = !calcCritSev && atkCell?.severity === k
                return (
                  <button key={k} onClick={() => setCalcCritSev(calcCritSev === k ? null : k)} style={{
                    flex: 1, maxWidth: 52,
                    background: active ? s.color : 'var(--surface2)',
                    color:      active ? (k === 'B' ? '#111' : '#fff') : 'var(--text2)',
                    border: '1px solid ' + (active ? s.color : isAuto ? s.color + '88' : 'var(--border)'),
                    borderRadius: 8, padding: '8px 4px', cursor: 'pointer', fontWeight: active ? 800 : 500, fontSize: 14,
                  }}>{k}</button>
                )
              })}
            </div>
          </div>

          <div style={{ marginTop: 10 }}>
            <SectionLabel>Crit Roll (d100, not open-ended)</SectionLabel>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min={1} max={100} value={calcCritRoll}
                onChange={e => setCalcCritRoll(e.target.value)} placeholder="01–100"
                style={{ width: 120, fontSize: 18, fontWeight: 700, textAlign: 'center', padding: '7px 8px' }} />
              <button onClick={() => setCalcCritRoll(String(Math.ceil(Math.random() * 100)))} style={{
                background: 'var(--surface2)', color: 'var(--text2)', border: '1px solid var(--border2)',
                borderRadius: 7, padding: '6px 12px', cursor: 'pointer', fontWeight: 600, fontSize: 12,
              }}>Roll</button>
            </div>
          </div>

          {critResult && activeCritType && activeCritSev && (
            <div style={{ marginTop: 12 }}>
              <CritResultCard hit={critResult} critType={activeCritType}
                critSev={activeCritSev === 'F' ? 'E' : activeCritSev}
                critRoll={calcCritRoll} sevColor={sevColor} />
            </div>
          )}
          {activeCritType && activeCritSev && calcCritRoll && !critResult && (
            <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text3)', padding: '10px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8 }}>
              No result for roll {calcCritRoll} — check value is 1–100.
            </div>
          )}
        </CalcSection>
      )}

      {/* ── TOTAL RESULT ── */}
      {atkCell && critResult && !critOnly && !isFumble && (
        <div style={{ border: '2px solid var(--success)', borderRadius: 12, background: 'var(--success)0f', padding: '14px 16px' }}>
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--success)', marginBottom: 10 }}>
            Total Result
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <StatPill label="Total Hits" value={`+${atkCell.hits + critResult.hits}`} color="#ef4444" />
            {critResult.hpr > 0 && <StatPill label="Bleed/Rd" value={`${critResult.hpr}/rd`} color="#f97316" />}
            {critResult.stun_rounds > 0 && (
              <StatPill label={`Stun [−${critResult.stun_penalty || '?'}]`} value={`${critResult.stun_rounds} rd`} color="#eab308" />
            )}
            {critResult.injury_penalty > 0 && <StatPill label="Injury" value={`−${critResult.injury_penalty}`} color="#f97316" />}
            {critResult.fatigue_penalty > 0 && <StatPill label="Fatigue" value={`−${critResult.fatigue_penalty}`} color="#a78bfa" />}
            {critResult.knockback > 0 && <StatPill label="Knockback" value={`${critResult.knockback}'`} color="#60a5fa" />}
            {critResult.location && critResult.location !== 'Body' && (
              <StatPill label="Location" value={critResult.location} color="var(--text2)" />
            )}
            {critResult.stagger  && <CondBadge label="Stagger" color="#f97316" />}
            {critResult.prone    && <CondBadge label="Prone"   color="#ef4444" />}
            {critResult.breakage && (
              <CondBadge label={`Breakage${critResult.breakage_mod ? ` (${critResult.breakage_mod > 0 ? '+' : ''}${critResult.breakage_mod})` : ''}`} color="#eab308" />
            )}
          </div>
          {critResult.instant_death && (
            <div style={{ marginTop: 10, fontSize: 16, fontWeight: 800, color: '#ef4444' }}>INSTANT DEATH</div>
          )}
          {!critResult.instant_death && (
            <p style={{ marginTop: 10, fontSize: 13, color: 'var(--text)', lineHeight: 1.6 }}>{critResult.result}</p>
          )}
        </div>
      )}
    </div>
  )
}

/* ─────────────────────────────────────────────── */
/*  COMBAT GUIDE PANEL                             */
/* ─────────────────────────────────────────────── */
const ACTION_COLORS = {
  'Melee Attack':    '#ef4444',
  'Ranged Attack':   '#f97316',
  'Movement':        '#22c55e',
  'Movement (Free)': '#86efac',
  'Other movements': '#6ee7b7',
  'Actions':         '#60a5fa',
  'Spells':          '#a855f7',
}

function ApBadge({ ap }) {
  const color = ap === 0 ? 'var(--text3)' : ap <= 2 ? '#22c55e' : ap <= 4 ? '#fbbf24' : '#f97316'
  return (
    <span style={{
      display: 'inline-block', minWidth: 28, textAlign: 'center',
      fontWeight: 800, fontSize: 13, color,
      background: color + '22', borderRadius: 6, padding: '2px 6px',
    }}>{ap}AP</span>
  )
}

function GuideSection({ title, color, open, onToggle, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <button onClick={onToggle} style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px', background: 'var(--surface2)', border: 'none',
        cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{ width: 3, height: 16, borderRadius: 2, background: color, flexShrink: 0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)', flex: 1 }}>{title}</span>
        {open ? <ChevronUpIcon size={13} color="var(--text3)" /> : <ChevronDownIcon size={13} color="var(--text3)" />}
      </button>
      {open && <div style={{ padding: '12px 14px' }}>{children}</div>}
    </div>
  )
}

function CombatGuidePanel() {
  const [open, setOpen] = useState({
    actions: true, round: true, oeRolls: false, fumbles: false, size: false, vision: false, multiAtk: false, situational: false, mounts: false, recovery: false,
  })
  const toggle = key => setOpen(o => ({ ...o, [key]: !o[key] }))

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── ACTION COSTS ── */}
      <GuideSection title="Action Point Costs" color="var(--accent)" open={open.actions} onToggle={() => toggle('actions')}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {combatGuide.actions.map(cat => {
            const color = ACTION_COLORS[cat.category] ?? 'var(--accent)'
            return (
              <div key={cat.category} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
                <div style={{ padding: '6px 10px', background: color + '22', borderBottom: '1px solid var(--border)' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color }}>{cat.category}</span>
                </div>
                <div>
                  {cat.entries.map((e, i) => (
                    <div key={i} style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '5px 10px', borderBottom: i < cat.entries.length - 1 ? '1px solid var(--border)' : 'none',
                      background: i % 2 === 0 ? 'transparent' : 'var(--surface2)',
                    }}>
                      <ApBadge ap={e.ap} />
                      <span style={{ fontSize: 12, color: 'var(--text)', flex: 1 }}>{e.action.replace(/\n/g, ' / ')}</span>
                      {e.modifier && (
                        <span style={{ fontSize: 10, fontWeight: 700, color: '#ef4444', background: '#ef444422', borderRadius: 4, padding: '1px 5px' }}>{e.modifier}</span>
                      )}
                      {e.note && (
                        <span style={{ fontSize: 10, color: 'var(--text3)', fontStyle: 'italic' }}>{e.note}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </GuideSection>

      {/* ── ROUND RULES ── */}
      <GuideSection title="Round Structure" color="#fbbf24" open={open.round} onToggle={() => toggle('round')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ fontSize: 12, color: 'var(--text2)' }}>
            One round = <strong style={{ color: 'var(--accent)' }}>5 seconds</strong>. AP available depends on your status this round:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {combatGuide.round.ap_by_status.map((row, i) => (
              <div key={i} style={{
                background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8,
                padding: '8px 12px', minWidth: 110, textAlign: 'center',
              }}>
                <div style={{ fontSize: 18, fontWeight: 800, color: row.ap <= 2 ? '#ef4444' : row.ap === 3 ? '#f97316' : row.ap === 4 ? '#fbbf24' : '#22c55e' }}>{row.ap}AP</div>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text2)', marginTop: 2 }}>{row.status}</div>
                {row.note && <div style={{ fontSize: 9, color: 'var(--text3)', marginTop: 2, lineHeight: 1.3 }}>{row.note}</div>}
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {combatGuide.round.notes.filter(n => n && n.includes('Concentration') || n && n.includes('Actions can flow')).map((note, i) => (
              <div key={i} style={{ fontSize: 12, color: 'var(--text2)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', lineHeight: 1.6, whiteSpace: 'pre-line' }}>
                {note.trim()}
              </div>
            ))}
          </div>
        </div>
      </GuideSection>

      {/* ── OPEN-ENDED ROLLS ── */}
      <GuideSection title="Open-Ended Rolls (d100OE)" color="#22c55e" open={open.oeRolls} onToggle={() => toggle('oeRolls')}>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={{ background:'var(--surface)', border:'1px solid #22c55e44', borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#22c55e', marginBottom:6 }}>High Open-Ended (Upward)</div>
              <ul style={{ margin:0, padding:'0 0 0 16px', fontSize:12, color:'var(--text2)', lineHeight:1.8 }}>
                <li>If the d100 result is <strong style={{color:'var(--text)'}}>96–100</strong>, it is a <em>High Open-Ended</em> result.</li>
                <li>Roll the d100 again and <strong style={{color:'#22c55e'}}>add</strong> that result to the total.</li>
                <li>Keep rolling and adding as long as each new roll is also 96–100.</li>
                <li>There is no upper limit — rolls can chain indefinitely.</li>
                <li>The roll is <strong style={{color:'var(--text)'}}>not</strong> a Fumble even if the first die was in the fumble range (the high OE overrides).</li>
                <li><strong>Combat attacks are High-OE only</strong> — no low open-ended on attack rolls.</li>
              </ul>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid var(--danger)44', borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'var(--danger)', marginBottom:6 }}>Low Open-Ended (Downward)</div>
              <ul style={{ margin:0, padding:'0 0 0 16px', fontSize:12, color:'var(--text2)', lineHeight:1.8 }}>
                <li>Only triggered if the <strong style={{color:'var(--text)'}}>first die roll</strong> is <strong style={{color:'var(--danger)'}}>01–05</strong> (on maneuvers/RRs, not attacks).</li>
                <li>Roll the d100 again and <strong style={{color:'var(--danger)'}}>subtract</strong> that result from the running total.</li>
                <li>Keep rolling and subtracting as long as each new roll is <em>not</em> 96–100.</li>
                <li>Stop when a non-OE result is rolled; that value is subtracted and the chain ends.</li>
                <li>Results can go arbitrarily negative.</li>
              </ul>
            </div>
          </div>
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--text2)' }}>
            <strong style={{color:'var(--text)'}}>Example (High OE):</strong> Roll 98 → chain! Roll again: 43 → total = 98 + 43 = <strong style={{color:'#22c55e'}}>141</strong>. Applied to an attack: d100 98 + roll 43 + OB 55 − DB 20 = modified roll 176.
          </div>
          <div style={{ background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'var(--text2)' }}>
            <strong style={{color:'var(--text)'}}>Example (Low OE):</strong> First die 03 → low OE! Roll again: 67 → total = 03 − 67 = <strong style={{color:'var(--danger)'}}>−64</strong>. Non-OE, stop. Applied to maneuver: −64 + skill 50 = −14 (fail).
          </div>
        </div>
      </GuideSection>

      {/* ── FUMBLE RULES ── */}
      <GuideSection title="Fumble Rules" color="#ef4444" open={open.fumbles} onToggle={() => toggle('fumbles')}>
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
            <div style={{ background:'var(--surface)', border:'1px solid #ef444444', borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#ef4444', marginBottom:6 }}>Weapon Fumbles</div>
              <ul style={{ margin:0, padding:'0 0 0 16px', fontSize:12, color:'var(--text2)', lineHeight:1.8 }}>
                <li>Each weapon has a <strong style={{color:'var(--text)'}}>base fumble number</strong> (e.g. 3 for a Dagger, 10 for a Flail).</li>
                <li>If the <strong style={{color:'var(--text)'}}>unmodified</strong> d100 is ≤ the fumble number, it is a Fumble.</li>
                <li>Fumble range is <strong style={{color:'#22c55e'}}>reduced by 1</strong> for every <strong style={{color:'var(--text)'}}>5 ranks</strong> in the weapon skill.</li>
                <li>The minimum fumble range is always <strong style={{color:'var(--text)'}}>1</strong> (never zero).</li>
                <li>Apply OB modifiers to a fumble roll to determine the result from the Fumble table.</li>
                <li>e.g. Flail (fumble 10), 15 ranks → fumble range = 10 − 3 = <strong style={{color:'var(--text)'}}>7</strong>.</li>
              </ul>
            </div>
            <div style={{ background:'var(--surface)', border:'1px solid #a855f744', borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.08em', color:'#a855f7', marginBottom:6 }}>Spell Fumbles</div>
              <ul style={{ margin:0, padding:'0 0 0 16px', fontSize:12, color:'var(--text2)', lineHeight:1.8 }}>
                <li>Spells always fumble on an unmodified roll of <strong style={{color:'var(--danger)'}}>01–02</strong>.</li>
                <li>This range <strong style={{color:'var(--text)'}}>cannot be reduced</strong> by ranks or any other means.</li>
                <li>Directed spells (targeting a single creature) and area-effect spells use separate fumble tables.</li>
                <li>Directed/area spell fumble range is always <strong style={{color:'var(--danger)'}}>01–02</strong> regardless of skill.</li>
              </ul>
            </div>
          </div>
          <div style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>
            Fumble table results vary by weapon type (1H melee, 2H melee, ranged, unarmed, etc.). Results range from minor recovery loss to self-injury or weapon breakage. Always roll on the correct fumble sub-table for the weapon type.
          </div>
        </div>
      </GuideSection>

      {/* ── SIZE & CRIT ADJUSTMENTS ── */}
      <GuideSection title="Size & Crit Adjustments" color="#f97316" open={open.size} onToggle={() => toggle('size')}>
        <div style={{ overflowX: 'auto' }}>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
            When attacker and defender differ in size, apply crit level adjustments. Attacker size determines base hit multiplier and attack size.
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Size','Attack Size','Hits Mult','Atk Crit Adj','Def Crit Adj'].map(h => (
                  <th key={h} style={thStyle}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {combatGuide.crit_size_adjustments?.size_table?.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11 }}>{row.size}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11 }}>{row.attack_size ?? '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11 }}>{row.hits_multiplier ?? '—'}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, color: row.attacker_crit_adj > 0 ? 'var(--success)' : row.attacker_crit_adj < 0 ? 'var(--danger)' : 'var(--text3)' }}>
                    {row.attacker_crit_adj != null ? (row.attacker_crit_adj > 0 ? `+${row.attacker_crit_adj}` : row.attacker_crit_adj) : '—'}
                  </td>
                  <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, color: row.defender_crit_adj > 0 ? 'var(--success)' : row.defender_crit_adj < 0 ? 'var(--danger)' : 'var(--text3)' }}>
                    {row.defender_crit_adj != null ? (row.defender_crit_adj > 0 ? `+${row.defender_crit_adj}` : row.defender_crit_adj) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideSection>

      {/* ── VISION PENALTIES ── */}
      <GuideSection title="Vision & Lighting Penalties" color="#60a5fa" open={open.vision} onToggle={() => toggle('vision')}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
          First value = sight <b>required</b> (combat, tracking). Second = sight merely <b>helpful</b>. Darkvision ignores all lighting penalties.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={thStyle}>Condition</th>
                <th style={thStyle} colSpan={2}>Normal Vision</th>
                <th style={thStyle} colSpan={2}>Nightvision</th>
                <th style={thStyle}>Darkvision</th>
              </tr>
              <tr style={{ background: 'var(--surface2)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ ...thStyle, fontSize: 9, color: 'var(--text3)' }}></th>
                <th style={{ ...thStyle, fontSize: 9, color: 'var(--text3)' }}>Req.</th>
                <th style={{ ...thStyle, fontSize: 9, color: 'var(--text3)' }}>Help.</th>
                <th style={{ ...thStyle, fontSize: 9, color: 'var(--text3)' }}>Req.</th>
                <th style={{ ...thStyle, fontSize: 9, color: 'var(--text3)' }}>Help.</th>
                <th style={{ ...thStyle, fontSize: 9, color: 'var(--text3)' }}>Any</th>
              </tr>
            </thead>
            <tbody>
              {combatGuide.vision_penalties?.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11 }}>{row.condition}</td>
                  {[
                    row.normal_vision_required,
                    row.normal_vision_helpful,
                    row.nightvision_required,
                    row.nightvision_helpful,
                    row.darkvision_required,
                  ].map((v, ci) => (
                    <td key={ci} style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11,
                      color: v < 0 ? 'var(--danger)' : 'var(--text3)',
                      fontWeight: v < 0 ? 700 : 400 }}>
                      {v === 0 ? '—' : v}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideSection>

      {/* ── MULTI-ATTACK PENALTIES ── */}
      <GuideSection title="Multi-Attack Penalties" color="#a855f7" open={open.multiAtk} onToggle={() => toggle('multiAtk')}>
        <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 8 }}>
          When making multiple attacks in a round, apply these penalties to additional attacks by weapon category.
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Category','Skill Name','Penalty'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {combatGuide.weapon_multi_attack_penalties?.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11 }}>{row.group}</td>
                  <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text2)' }}>{row.skill}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, color: 'var(--danger)', fontWeight: 700 }}>{row.multi_attack_penalty}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideSection>

      {/* ── SITUATIONAL MODIFIERS ── */}
      <GuideSection title="Situational Combat Modifiers" color="#f59e0b" open={open.situational} onToggle={() => toggle('situational')}>
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
          Bonuses to OB (Offensive Bonus) or DB (Defensive Bonus) based on combat situation. Apply all relevant modifiers.
        </div>
        {/* OB modifiers */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', marginBottom: 4 }}>OB Modifiers</div>
        <div style={{ overflowX: 'auto', marginBottom: 12 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={thStyle}>Situation</th>
                <th style={{ ...thStyle, width: 60 }}>Bonus</th>
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {combatGuide.situational_modifiers?.filter(r => r.applies_to === 'OB').map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{row.situation}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700,
                    color: row.bonus > 0 ? 'var(--success)' : row.bonus < 0 ? 'var(--danger)' : 'var(--text3)' }}>
                    {row.bonus > 0 ? `+${row.bonus}` : row.bonus}
                  </td>
                  <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text3)' }}>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* DB modifiers */}
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', marginBottom: 4 }}>DB Modifiers</div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                <th style={thStyle}>Situation</th>
                <th style={{ ...thStyle, width: 60 }}>Bonus</th>
                <th style={thStyle}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {combatGuide.situational_modifiers?.filter(r => r.applies_to === 'DB').map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{row.situation}</td>
                  <td style={{ padding: '4px 8px', textAlign: 'center', fontSize: 12, fontWeight: 700,
                    color: row.bonus > 0 ? 'var(--success)' : row.bonus < 0 ? 'var(--danger)' : 'var(--text3)' }}>
                    {row.bonus > 0 ? `+${row.bonus}` : row.bonus}
                  </td>
                  <td style={{ padding: '4px 8px', fontSize: 11, color: 'var(--text3)' }}>{row.notes || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideSection>

      {/* ── MOUNT STATS ── */}
      <GuideSection title="Mount Stats" color="#14b8a6" open={open.mounts} onToggle={() => toggle('mounts')}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
            <thead>
              <tr style={{ background: 'var(--surface2)' }}>
                {['Mount','BMR','AT','Hits','Endurance','Load Bonus','OB','DB','Crit'].map(h => <th key={h} style={thStyle}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {combatGuide.mount_stats?.map((row, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                  <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{row.name}</td>
                  {['bmr','at','hits','endurance','load_bonus','ob','db','crit_type'].map(k => (
                    <td key={k} style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, color: 'var(--text2)' }}>{row[k] ?? '—'}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </GuideSection>

      {/* ── ENDURANCE & RECOVERY ── */}
      <GuideSection title="Endurance Results & Recovery" color="#84cc16" open={open.recovery} onToggle={() => toggle('recovery')}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', marginBottom: 6 }}>Endurance Check Results</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {combatGuide.endurance_results?.map((row, i) => (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '6px 10px', background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)', borderRadius: 6, fontSize: 12 }}>
                  <span style={{ fontWeight: 700, color: 'var(--accent)', minWidth: 120, flexShrink: 0 }}>{row.tier}</span>
                  <span style={{ color: 'var(--text2)', lineHeight: 1.4 }}>{row.result}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text3)', marginBottom: 6 }}>Recovery by Injury Type</div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                <thead>
                  <tr style={{ background: 'var(--surface2)' }}>
                    <th style={thStyle}>Injury Type</th>
                    {combatGuide.recovery?.length > 0 && Object.keys(combatGuide.recovery[0]).filter(k => k !== 'injury_type').map(k => (
                      <th key={k} style={thStyle}>{k.replace(/_/g,' ')}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {combatGuide.recovery?.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'transparent' : 'var(--surface2)' }}>
                      <td style={{ padding: '4px 8px', fontWeight: 600, fontSize: 11, whiteSpace: 'nowrap' }}>{row.injury_type}</td>
                      {Object.entries(row).filter(([k]) => k !== 'injury_type').map(([k, v]) => (
                        <td key={k} style={{ padding: '4px 8px', textAlign: 'center', fontSize: 11, color: 'var(--text2)' }}>{v ?? '—'}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </GuideSection>

    </div>
  )
}

/* ─────────────────────────────────────────────── */
/*  SHARED COMPONENTS                              */
/* ─────────────────────────────────────────────── */
function CritResultCard({ hit, critType, critSev, critRoll, sevColor }) {
  if (!hit) {
    if (!critRoll) return (
      <div style={{ padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text3)', fontSize:13 }}>
        Enter a d100 roll above or press Roll.
      </div>
    )
    return (
      <div style={{ padding:'12px 16px', background:'var(--surface)', border:'1px solid var(--border)', borderRadius:10, color:'var(--text3)', fontSize:13 }}>
        Enter a roll between 1 and 100.
      </div>
    )
  }
  return (
    <div style={{
      border: '2px solid ' + (hit.instant_death ? '#ef4444' : sevColor),
      borderRadius: 12, overflow: 'hidden',
      background: hit.instant_death ? '#ef444415' : sevColor + '12',
    }}>
      <div style={{
        padding: '10px 16px', borderBottom: '1px solid ' + (hit.instant_death ? '#ef444430' : sevColor + '30'),
        display: 'flex', alignItems: 'center', gap: 10,
        background: hit.instant_death ? '#ef444422' : sevColor + '22',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: hit.instant_death ? '#ef4444' : sevColor }}>
          {critType} – Severity {critSev} – Roll {critRoll}
        </span>
        {hit.location && (
          <span style={{ marginLeft:'auto', fontSize:10, background:'var(--surface2)', border:'1px solid var(--border)', borderRadius:6, padding:'2px 8px', color:'var(--text2)', fontWeight:600 }}>
            {hit.location}
          </span>
        )}
      </div>
      <div style={{ padding: '14px 16px' }}>
        {hit.instant_death ? (
          <div style={{ fontSize: 18, fontWeight: 800, color: '#ef4444', letterSpacing: '0.04em', marginBottom: 8 }}>
            INSTANT DEATH
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, marginBottom: 10, flexWrap: 'wrap' }}>
              <StatPill label="Hits" value={hit.hits > 0 ? `+${hit.hits}` : '—'} color={hit.hits > 0 ? '#ef4444' : 'var(--text3)'} />
              <StatPill label="Bleed/Rd" value={hit.hpr > 0 ? `${hit.hpr}/rd` : '—'} color={hit.hpr > 0 ? '#f97316' : 'var(--text3)'} />
              <StatPill
                label={hit.stun_rounds > 0 && hit.stun_penalty ? `Stun [-${hit.stun_penalty}]` : 'Stun'}
                value={hit.stun_rounds > 0 ? `${hit.stun_rounds} rd` : '—'}
                color={hit.stun_rounds > 0 ? '#eab308' : 'var(--text3)'}
              />
              {hit.injury_penalty > 0 && <StatPill label="Injury" value={`-${hit.injury_penalty}`} color="#f97316" />}
              {hit.fatigue_penalty > 0 && <StatPill label="Fatigue" value={`-${hit.fatigue_penalty}`} color="#a78bfa" />}
              {hit.knockback > 0 && <StatPill label="Knockback" value={`${hit.knockback}'`} color="#60a5fa" />}
              {hit.grapple_pct > 0 && <StatPill label="Grapple" value={`${hit.grapple_pct}%`} color="#14b8a6" />}
              {hit.additional_crit && <StatPill label="Add. Crit" value={hit.additional_crit} color="#a855f7" />}
            </div>
            {(hit.stagger || hit.prone || hit.breakage) && (
              <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
                {hit.stagger && <CondBadge label="Stagger" color="#f97316" />}
                {hit.prone && <CondBadge label="Prone" color="#ef4444" />}
                {hit.breakage && <CondBadge label={`Breakage${hit.breakage_mod ? ` (${hit.breakage_mod > 0 ? '+' : ''}${hit.breakage_mod})` : ''}`} color="#eab308" />}
              </div>
            )}
          </>
        )}
        <p style={{ fontSize: 14, color: 'var(--text)', lineHeight: 1.6, margin: 0 }}>{hit.result}</p>
      </div>
    </div>
  )
}

function CritTableGrid({ rows, hit, sevColor }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '60px 48px 60px 80px 72px 100px 1fr', background: 'var(--surface2)', padding: '6px 14px', gap: 8 }}>
        {['Roll','Hits','Bleed','Stun','Location','Conditions','Result'].map(h => (
          <span key={h} style={{ fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
        ))}
      </div>
      {rows.map((r, i) => {
        const isHit = hit === r
        const conds = []
        if (r.stagger) conds.push({ label: 'Stagger', color: '#f97316' })
        if (r.prone) conds.push({ label: 'Prone', color: '#ef4444' })
        if (r.breakage) conds.push({ label: r.breakage_mod ? `Brk${r.breakage_mod > 0 ? '+' : ''}${r.breakage_mod}` : 'Brk', color: '#eab308' })
        if (r.knockback > 0) conds.push({ label: `KB${r.knockback}'`, color: '#60a5fa' })
        if (r.grapple_pct > 0) conds.push({ label: `Grp${r.grapple_pct}%`, color: '#14b8a6' })
        if (r.fatigue_penalty > 0) conds.push({ label: `Fat-${r.fatigue_penalty}`, color: '#a78bfa' })
        if (r.injury_penalty > 0) conds.push({ label: `Inj-${r.injury_penalty}`, color: '#fb923c' })
        if (r.additional_crit) conds.push({ label: `+Crit${r.additional_crit}`, color: '#a855f7' })
        return (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '60px 48px 60px 80px 72px 100px 1fr',
            padding: '6px 14px', gap: 8, alignItems: 'start',
            background: isHit ? sevColor + '20' : i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
            borderLeft: isHit ? `3px solid ${sevColor}` : '3px solid transparent',
            borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none',
          }}>
            <span style={{ fontSize: 12, color: isHit ? sevColor : 'var(--text2)', fontWeight: isHit ? 700 : 400 }}>
              {r.min === r.max ? r.min : `${r.min}–${r.max}`}
            </span>
            <span style={{ fontSize: 12, fontWeight: 700, color: r.instant_death ? '#ef4444' : r.hits > 0 ? '#ef4444' : 'var(--text3)' }}>
              {r.instant_death ? 'Dead' : r.hits > 0 ? `+${r.hits}` : '—'}
            </span>
            <span style={{ fontSize: 12, color: r.hpr > 0 ? '#f97316' : 'var(--text3)' }}>
              {r.hpr > 0 ? `${r.hpr}/rd` : '—'}
            </span>
            <span style={{ fontSize: 11, color: r.stun_rounds > 0 ? '#eab308' : 'var(--text3)' }}>
              {r.stun_rounds > 0 ? `${r.stun_rounds}rd [-${r.stun_penalty}]` : '—'}
            </span>
            <span style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>
              {r.location ?? '—'}
            </span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
              {conds.map((c, ci) => (
                <span key={ci} style={{ fontSize: 9, fontWeight: 700, color: c.color, background: c.color + '20', borderRadius: 4, padding: '1px 4px', whiteSpace: 'nowrap' }}>{c.label}</span>
              ))}
              {conds.length === 0 && <span style={{ fontSize: 11, color: 'var(--text3)' }}>—</span>}
            </div>
            <span style={{ fontSize: 12, color: r.instant_death ? '#ef4444' : 'var(--text)', lineHeight: 1.4 }}>
              {r.result}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function CalcSection({ label, color, children }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
      <div style={{ padding: '8px 16px', background: 'var(--surface2)', borderBottom: '1px solid var(--border)', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:3, height:16, borderRadius:2, background: color, flexShrink:0 }} />
        <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--text2)' }}>{label}</span>
      </div>
      <div style={{ padding: '14px 16px' }}>{children}</div>
    </div>
  )
}

function Th({ children, left }) {
  return <th style={{ padding: '6px 8px', textAlign: left ? 'left' : 'center', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{children}</th>
}

function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text2)', marginBottom: 6 }}>{children}</div>
}

function CondBadge({ label, color }) {
  return (
    <span style={{
      fontSize: 11, fontWeight: 700, color, background: color + '22',
      border: '1px solid ' + color + '55', borderRadius: 6, padding: '4px 10px',
    }}>{label}</span>
  )
}

function StatPill({ label, value, color }) {
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', textAlign: 'center', minWidth: 72 }}>
      <div style={{ fontSize: 20, fontWeight: 800, color }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginTop: 2 }}>{label}</div>
    </div>
  )
}

function modeBtn(active) {
  return {
    background: active ? 'var(--accent)' : 'var(--surface2)',
    color: active ? '#fff' : 'var(--text2)',
    border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
    borderRadius: 7, padding: '7px 16px', cursor: 'pointer',
    fontWeight: active ? 700 : 400, fontSize: 13,
  }
}

const thStyle = {
  padding: '5px 6px', textAlign: 'center', fontSize: 10, fontWeight: 600,
  color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.06em',
  borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap',
}
