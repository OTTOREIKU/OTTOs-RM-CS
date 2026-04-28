import React, { useState, useMemo, useReducer } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCharacter } from '../store/CharacterContext.jsx'
import { STATS } from '../store/characters.js'
import { getTotalStatBonus, rankBonus } from '../utils/calc.js'
import skillsData from '../data/skills.json'
import skillCosts from '../data/skill_costs.json'
import spellLists from '../data/spell_lists.json'
import professionDP from '../data/profession_dp.json'
import racesData from '../data/races.json'
import { ChevronDownIcon, ChevronRightIcon, ChevronLeftIcon, ArrowRightIcon, MinusIcon, SparkleIcon } from '../components/Icons.jsx'
import { REALM_COLORS } from '../store/theme.js'

const STAT_MAP = {
  Ag:'Agility', Co:'Constitution', Em:'Empathy', In:'Intuition',
  Me:'Memory', Pr:'Presence', Qu:'Quickness', Re:'Reasoning',
  SD:'Self Discipline', St:'Strength',
}
const REALM_STAT = { Channeling:'Intuition', Essence:'Empathy', Mentalism:'Presence' }

const STEPS = ['Stats', 'Skills & Spells', 'Review']

// ── Cost parsing ──────────────────────────────────────────────────────────────
// Per CoreLaw p.85: "x/y" means 1st rank costs x DP, 2nd rank costs y DP per level.
// No more than 2 ranks of any skill may be purchased each level.
function parseSkillCosts(costStr) {
  if (!costStr || costStr === '?/?') return { first: 5, second: 8 }
  const [a, b] = costStr.split('/')
  const first  = parseInt(a) || 5
  const second = parseInt(b) || first * 2
  return { first, second }
}

function getSkillCostsForChar(skill, profession) {
  const costStr = skillCosts[skill.category]?.[profession] || skill.dev_cost
  return parseSkillCosts(costStr)
}

// Net DP change when moving from `from` ranks to `to` ranks purchased this level.
// Negative = refund (e.g. removing a rank).
function rankCostDelta(from, to, costs) {
  const oldCost = (from >= 1 ? costs.first : 0) + (from >= 2 ? costs.second : 0)
  const newCost = (to   >= 1 ? costs.first : 0) + (to   >= 2 ? costs.second : 0)
  return newCost - oldCost
}

function getSpellCostForChar(listName, list, profession) {
  // Base list = 4 DP, Open = 6 DP, Closed = 8 DP, Evil = 12 DP
  const section = list.section?.toLowerCase() || ''
  if (section.includes('base'))   return 4
  if (section.includes('open'))   return 6
  if (section.includes('closed')) return 8
  if (section.includes('evil'))   return 12
  return 6
}

// ── Racial bonus DP helpers ───────────────────────────────────────────────────
// CoreLaw p.75: each race has a bonus DP pool; up to 25 may be spent per level
// until the pool is exhausted. Human common pool = 50 → +25 at levels 1 and 2.
function getRaceBonusDP(char) {
  const raceEntry = racesData.find(r => r.name === char.race)
  const poolTotal = raceEntry?.dp_bonus_pool ?? 0
  // null means not yet initialised; treat as full pool (character hasn't levelled up yet)
  const poolRemaining = char.race_dp_pool_remaining ?? poolTotal
  const bonusAvailable = Math.min(25, Math.max(0, poolRemaining))
  return { poolTotal, poolRemaining, bonusAvailable }
}

// ── Reducer for level-up state ────────────────────────────────────────────────
function initLevelUp(char) {
  const { poolRemaining, bonusAvailable } = getRaceBonusDP(char)
  const dp = 60 + bonusAvailable  // CoreLaw p.75+85: 60 base + racial bonus pool (≤25/level)
  return {
    step: 0,
    statGains:        Object.fromEntries(STATS.map(s => [s, 0])),
    potGains:         Object.fromEntries(STATS.map(s => [s, 0])),
    statPoints:       10,  // RMU: 10 temp stat points per level
    potPoints:        1,   // 1 potential point per level
    dpTotal:          dp,
    dpSpent:          0,
    bonusDP:          bonusAvailable,   // racial bonus DP included this level
    poolRemaining,                      // pool before this level (for applyLevelUp)
    skillBuys:        {},  // { skillName: ranksAdded }
    spellBuys:        {},  // { listName: ranksAdded }
  }
}

function reducer(state, action) {
  switch (action.type) {
    case 'STAT_GAIN': {
      const cur = state.statGains[action.stat] || 0
      const delta = action.value - cur
      const newPoints = state.statPoints - delta
      if (newPoints < 0 || action.value < 0) return state
      return { ...state, statGains: { ...state.statGains, [action.stat]: action.value }, statPoints: newPoints }
    }
    case 'POT_GAIN': {
      const cur = state.potGains[action.stat] || 0
      const delta = action.value - cur
      const newPoints = state.potPoints - delta
      if (newPoints < 0 || action.value < 0) return state
      return { ...state, potGains: { ...state.potGains, [action.stat]: action.value }, potPoints: newPoints }
    }
    case 'SKILL_BUY': {
      const oldRanks = state.skillBuys[action.name] || 0
      const dpDelta  = rankCostDelta(oldRanks, action.ranks, action.costs)
      const dpNew    = state.dpSpent + dpDelta
      if (dpNew < 0 || dpNew > state.dpTotal || action.ranks < 0 || action.ranks > 2) return state
      const skillBuys = { ...state.skillBuys, [action.name]: action.ranks }
      if (action.ranks === 0) delete skillBuys[action.name]
      return { ...state, skillBuys, dpSpent: dpNew }
    }
    case 'SPELL_BUY': {
      const oldRanks = state.spellBuys[action.name] || 0
      const cost     = action.cost
      const delta    = action.ranks - oldRanks
      const dpNew    = state.dpSpent + delta * cost
      if (dpNew < 0 || dpNew > state.dpTotal || action.ranks < 0) return state
      const spellBuys = { ...state.spellBuys, [action.name]: action.ranks }
      if (action.ranks === 0) delete spellBuys[action.name]
      return { ...state, spellBuys, dpSpent: dpNew }
    }
    case 'STEP':  return { ...state, step: action.step }
    case 'RESET': return { ...initLevelUp(action.char), step: state.step }
    default: return state
  }
}

// ── Main component ────────────────────────────────────────────────────────────
export default function LevelUpView() {
  const { activeChar, updateCharacter, updateStat, updateSkill, updateCustomSkill, updateSpellList } = useCharacter()
  const navigate = useNavigate()
  const c = activeChar

  const [lu, dispatch] = useReducer(reducer, null, () => c ? initLevelUp(c) : initLevelUp({ profession: 'Fighter' }))
  const [skillSearch, setSkillSearch] = useState('')
  const [spellSearch, setSpellSearch] = useState('')
  const [spellRealm, setSpellRealm]   = useState('All')
  const [confirmed, setConfirmed]     = useState(false)

  if (!c) return <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text3)' }}>No character selected.</div>
  if (confirmed) return <ConfirmedScreen char={c} lu={lu} onDone={() => navigate('/sheet')} />

  const dpLeft = lu.dpTotal - lu.dpSpent
  const step   = lu.step

  function applyLevelUp() {
    // 1. Increment level + decrement racial bonus DP pool
    // Only deduct bonus DP that were actually spent (spent > 60 base means dipping into bonus)
    const bonusUsed = Math.max(0, lu.dpSpent - 60)
    const newPool   = Math.max(0, (lu.poolRemaining ?? 0) - bonusUsed)
    updateCharacter({ level: (c.level || 1) + 1, race_dp_pool_remaining: newPool })

    // 2. Apply stat gains
    STATS.forEach(stat => {
      const sg = lu.statGains[stat] || 0
      const pg = lu.potGains[stat] || 0
      if (sg || pg) {
        const cur = c.stats[stat] || { temp: 50, potential: 50, racial: 0, special: 0 }
        updateStat(stat, 'temp',      Math.min(100, (cur.temp || 0) + sg))
        updateStat(stat, 'potential', Math.min(100, (cur.potential || 0) + pg))
      }
    })

    // 3. Apply skill rank purchases
    const customSkillIds = new Set((c.custom_skills || []).map(cs => cs.id))
    Object.entries(lu.skillBuys).forEach(([name, newRanks]) => {
      if (customSkillIds.has(name)) {
        const cs = c.custom_skills.find(cs => cs.id === name)
        updateCustomSkill(name, { ranks: (cs?.ranks || 0) + newRanks })
      } else {
        updateSkill(name, 'ranks', (c.skills?.[name]?.ranks || 0) + newRanks)
      }
    })

    // 4. Apply spell list rank purchases
    Object.entries(lu.spellBuys).forEach(([name, newRanks]) => {
      const curRanks = c.spell_lists?.[name]?.ranks || 0
      updateSpellList(name, curRanks + newRanks)
    })

    setConfirmed(true)
  }

  return (
    <div style={{ maxWidth: 680, margin: '0 auto', padding: '16px 12px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontWeight: 700, fontSize: 18 }}>Level Up</h2>
          <div style={{ color: 'var(--text2)', fontSize: 12, marginTop: 2 }}>
            {c.name} · Level {c.level} → {(c.level || 1) + 1}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {(lu.dpSpent > 0 || Object.keys(lu.skillBuys).length > 0 || Object.keys(lu.spellBuys).length > 0 ||
              Object.values(lu.statGains).some(v => v > 0) || Object.values(lu.potGains).some(v => v > 0)) && (
              <button
                onClick={() => dispatch({ type: 'RESET', char: c })}
                title="Clear all allocations and start over"
                style={{
                  background: 'none', border: '1px solid var(--border)', borderRadius: 6,
                  color: 'var(--text3)', fontSize: 11, padding: '3px 9px', cursor: 'pointer',
                }}>
                ↺ Reset
              </button>
            )}
            <DPBadge spent={lu.dpSpent} total={lu.dpTotal} />
          </div>
          {lu.bonusDP > 0 && (
            <div style={{ fontSize: 10, color: 'var(--accent)' }}>
              +{lu.bonusDP} racial bonus · {lu.poolRemaining - Math.max(0, lu.dpSpent - 60)} pool left after
            </div>
          )}
        </div>
      </div>

      {/* Step tabs */}
      <div style={{ display: 'flex', gap: 2, marginBottom: 16, background: 'var(--surface)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
        {STEPS.map((s, i) => (
          <button key={s} onClick={() => dispatch({ type: 'STEP', step: i })} style={{
            flex: 1, padding: '6px 4px', borderRadius: 6, border: 'none',
            background: step === i ? 'var(--accent)' : 'transparent',
            color: step === i ? '#fff' : 'var(--text2)',
            fontWeight: step === i ? 700 : 400, fontSize: 12, cursor: 'pointer',
            letterSpacing: '0.02em',
          }}>{s}</button>
        ))}
      </div>

      {/* ── Step 0: Stats ── */}
      {step === 0 && (
        <div>
          <InfoBox>
            You receive <strong>10 temp stat points</strong> and <strong>1 potential point</strong> to distribute this level.
            Temp stats cap at 100; Potential stats also cap at 100.
          </InfoBox>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Temp points remaining:</span>
            <PointsBadge n={lu.statPoints} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontSize: 12, color: 'var(--text2)' }}>Potential points remaining:</span>
            <PointsBadge n={lu.potPoints} color="var(--purple)" />
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Stat','Current','Temp +','New Temp','Pot +','New Pot','New Bonus'].map((h, i) => (
                  <th key={i} style={{ fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px', textAlign: i > 0 ? 'center' : 'left', borderBottom: '1px solid var(--border)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {STATS.map(stat => {
                const s      = c.stats[stat] || { temp: 50, potential: 50, racial: 0, special: 0 }
                const sg     = lu.statGains[stat] || 0
                const pg     = lu.potGains[stat] || 0
                const newT   = Math.min(100, (s.temp || 0) + sg)
                const newP   = Math.min(100, (s.potential || 0) + pg)
                const curB   = getTotalStatBonus(s)
                const newB   = getTotalStatBonus({ ...s, temp: newT })
                const isR    = stat === REALM_STAT[c.realm]
                return (
                  <tr key={stat} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '5px 6px', fontWeight: isR ? 700 : 400, color: isR ? 'var(--accent)' : 'var(--text)', fontSize: 13 }}>{stat}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', color: 'var(--text2)', fontSize: 13 }}>{s.temp}</td>
                    <td style={{ padding: '3px 4px' }}>
                      <input type="number" min={0} max={lu.statPoints + sg} value={sg || ''}
                        onChange={e => dispatch({ type: 'STAT_GAIN', stat, value: Number(e.target.value) || 0 })}
                        placeholder="0" style={{ width: 48, padding: '3px 2px' }} />
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 600, color: sg > 0 ? 'var(--success)' : 'var(--text)', fontSize: 13 }}>{newT}</td>
                    <td style={{ padding: '3px 4px' }}>
                      <input type="number" min={0} max={lu.potPoints + pg} value={pg || ''}
                        onChange={e => dispatch({ type: 'POT_GAIN', stat, value: Number(e.target.value) || 0 })}
                        placeholder="0" style={{ width: 48, padding: '3px 2px' }} />
                    </td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 600, color: pg > 0 ? 'var(--purple)' : 'var(--text)', fontSize: 13 }}>{newP}</td>
                    <td style={{ padding: '5px 6px', textAlign: 'center', fontWeight: 700, fontSize: 13,
                      color: newB > curB ? 'var(--success)' : newB < curB ? 'var(--danger)' : 'var(--text2)' }}>
                      {newB >= 0 ? `+${newB}` : newB}
                      {newB !== curB && <span style={{ fontSize: 10, color: 'var(--success)' }}> ({newB > curB ? '+' : ''}{newB - curB})</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Step 1: Skills & Spells ── */}
      {step === 1 && (
        <SkillStep c={c} lu={lu} dispatch={dispatch}
          skillSearch={skillSearch} setSkillSearch={setSkillSearch} dpLeft={dpLeft}
          spellSearch={spellSearch} setSpellSearch={setSpellSearch}
          spellRealm={spellRealm} setSpellRealm={setSpellRealm} />
      )}

      {/* ── Step 2: Review ── */}
      {step === 2 && (
        <ReviewStep c={c} lu={lu} onConfirm={applyLevelUp} />
      )}

      {/* Nav buttons */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 20 }}>
        <button disabled={step === 0} onClick={() => dispatch({ type: 'STEP', step: step - 1 })} style={{ ...navBtn(false), display: 'flex', alignItems: 'center', gap: 5 }}><ChevronLeftIcon size={13} color="currentColor" /> Back</button>
        {step < STEPS.length - 1
          ? <button onClick={() => dispatch({ type: 'STEP', step: step + 1 })} style={{ ...navBtn(true), display: 'flex', alignItems: 'center', gap: 5 }}>Next <ArrowRightIcon size={13} color="currentColor" /></button>
          : <button onClick={applyLevelUp} style={{ ...navBtn(true), background: 'var(--success)' }}>Confirm Level Up</button>
        }
      </div>
    </div>
  )
}

// ── Skill step ────────────────────────────────────────────────────────────────
function SkillStep({ c, lu, dispatch, skillSearch, setSkillSearch, dpLeft,
                     spellSearch, setSpellSearch, spellRealm, setSpellRealm }) {
  const query = skillSearch.toLowerCase()
  const grouped = useMemo(() => {
    const map = {}
    for (const sk of skillsData) {
      const cat = sk.category || 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push(sk)
    }
    // Include custom skills (placeholder skills the user has personalised or added)
    for (const cs of (c.custom_skills || [])) {
      const cat = cs.category || 'Other'
      if (!map[cat]) map[cat] = []
      map[cat].push({
        name:        cs.id,                         // key for skillBuys
        displayName: cs.label || cs.template_name,  // human-readable label
        category:    cs.category,
        dev_cost:    cs.dev_cost,
        _isCustom:   true,
        _curRanks:   cs.ranks || 0,
      })
    }
    return map
  }, [c.custom_skills])

  const [expanded, setExpanded] = useState({})

  return (
    <div>
      <InfoBox>
        Each skill shows <strong>x/y DP</strong> — the 1st rank costs x, the 2nd costs y. Max <strong>2 ranks</strong> per skill per level (CoreLaw p.85).
        Costs are lower for professions where the skill is core.
      </InfoBox>
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
        <input type="text" placeholder="Search skills…" value={skillSearch} onChange={e => setSkillSearch(e.target.value)} style={{ flex: 1 }} />
        <DPBadge spent={lu.dpSpent} total={lu.dpTotal} />
      </div>

      {Object.entries(grouped).map(([cat, skills]) => {
        const filtered = skills.filter(sk => {
          const label = (sk.displayName || sk.name).toLowerCase()
          return !query || label.includes(query) || cat.toLowerCase().includes(query)
        })
        if (!filtered.length) return null
        const isOpen = !!expanded[cat]
        const hasBuys = filtered.some(sk => lu.skillBuys[sk.name] > 0)

        return (
          <div key={cat} style={{ marginBottom: 3 }}>
            <div onClick={() => setExpanded(p => ({ ...p, [cat]: !p[cat] }))}
              style={{ padding: '7px 12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: isOpen ? '7px 7px 0 0' : 7, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8, userSelect: 'none' }}>
              {isOpen ? <ChevronDownIcon size={10} color="var(--text3)" /> : <ChevronRightIcon size={10} color="var(--text3)" />}
              <span style={{ fontWeight: 600, flex: 1, fontSize: 13 }}>{cat}</span>
              {hasBuys && <span style={{ fontSize: 10, background: 'var(--accent)', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>buying</span>}
              <span style={{ fontSize: 10, color: 'var(--text3)' }}>{filtered.length}</span>
            </div>
            {isOpen && (
              <div style={{ border: '1px solid var(--border)', borderTop: 'none', borderRadius: '0 0 7px 7px', overflow: 'hidden' }}>
                {filtered.map((skill, idx) => {
                  const displayName = skill.displayName || skill.name
                  const costs    = getSkillCostsForChar(skill, c.profession)
                  const curRanks = skill._isCustom ? (skill._curRanks || 0) : (c.skills?.[skill.name]?.ranks || 0)
                  const buying   = lu.skillBuys[skill.name] || 0
                  const newRanks = curRanks + buying
                  const curBonus = rankBonus(curRanks)
                  const newBonus = rankBonus(newRanks)
                  const nextCost = buying === 0 ? costs.first : costs.second
                  const canAfford1 = dpLeft >= nextCost

                  return (
                    <div key={skill.name} style={{
                      display: 'grid', gridTemplateColumns: '1fr 60px 80px 90px', padding: '6px 12px',
                      gap: 8, alignItems: 'center', fontSize: 12,
                      background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                    }}>
                      <div>
                        <span>{displayName}</span>
                        {skill._isCustom && <span style={{ marginLeft: 4, fontSize: 9, color: 'var(--text3)', background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 3, padding: '0 3px' }}>custom</span>}
                        <span style={{ marginLeft: 6, fontSize: 10, color: curRanks > 0 ? 'var(--accent)' : 'var(--text3)' }}>{costs.first}/{costs.second} DP · cur {curRanks} ranks</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <button onClick={() => buying > 0 && dispatch({ type: 'SKILL_BUY', name: skill.name, ranks: buying - 1, costs })}
                          style={pmBtn(buying > 0)}><MinusIcon size={12} color="currentColor" /></button>
                        <span style={{ width: 20, textAlign: 'center', fontWeight: 700, color: buying > 0 ? 'var(--accent)' : 'var(--text2)' }}>{buying}</span>
                        <button onClick={() => buying < 2 && canAfford1 && dispatch({ type: 'SKILL_BUY', name: skill.name, ranks: buying + 1, costs })}
                          style={pmBtn(buying < 2 && canAfford1)}>+</button>
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text2)' }}>
                        Bonus: <span style={{ color: buying > 0 ? 'var(--success)' : 'var(--text2)', fontWeight: buying > 0 ? 700 : 400 }}>
                          {curBonus >= 0 ? `+${curBonus}` : curBonus}
                          {buying > 0 && ` → +${newBonus}`}
                        </span>
                      </div>
                      <div style={{ fontSize: 11, color: buying > 0 ? 'var(--warning)' : 'var(--text3)' }}>
                        {buying > 0 ? `−${rankCostDelta(0, buying, costs)} DP` : ''}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}

      {/* ── Spell Lists section ── */}
      <SpellListsSection c={c} lu={lu} dispatch={dispatch} dpLeft={dpLeft}
        spellSearch={spellSearch} setSpellSearch={setSpellSearch}
        spellRealm={spellRealm} setSpellRealm={setSpellRealm} />
    </div>
  )
}

// ── Spell lists section (embedded at bottom of SkillStep) ─────────────────────
function SpellListsSection({ c, lu, dispatch, dpLeft, spellSearch, setSpellSearch, spellRealm, setSpellRealm }) {
  const query = spellSearch.toLowerCase()
  const REALMS = ['All', 'Channeling', 'Essence', 'Mentalism', 'Hybrid']
  const REALM_COLOR = REALM_COLORS   // shared CSS-variable map from theme.js

  const filtered = useMemo(() => Object.entries(spellLists).filter(([name, list]) => {
    const matchRealm  = spellRealm === 'All' || list.realm === spellRealm
    const matchSearch = !query || name.toLowerCase().includes(query)
    return matchRealm && matchSearch
  }), [spellRealm, query])

  return (
    <div style={{ marginTop: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Spell Lists</span>
        <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
      </div>
      <InfoBox>
        Spell list costs: Base (4), Open (6), Closed (8), Evil (12) DP per rank. Max <strong>2 ranks</strong> per list per level. Buy new lists here too — they'll be added to your character on confirm.
      </InfoBox>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <input type="text" placeholder="Search spell lists…" value={spellSearch} onChange={e => setSpellSearch(e.target.value)} style={{ flex: 1, minWidth: 140 }} />
        <DPBadge spent={lu.dpSpent} total={lu.dpTotal} />
      </div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12, flexWrap: 'wrap' }}>
        {REALMS.map(r => (
          <button key={r} onClick={() => setSpellRealm(r)} style={{
            background: spellRealm === r ? (REALM_COLOR[r] || 'var(--accent)') : 'var(--surface2)',
            color: spellRealm === r ? '#fff' : 'var(--text2)', border: '1px solid var(--border)',
            borderRadius: 5, padding: '4px 9px', cursor: 'pointer', fontWeight: spellRealm === r ? 700 : 400, fontSize: 11,
          }}>{r}</button>
        ))}
      </div>

      {filtered.map(([name, list], idx) => {
        const rc       = REALM_COLOR[list.realm] || 'var(--accent)'
        const cost     = getSpellCostForChar(name, list, c.profession)
        const curRanks = c.spell_lists?.[name]?.ranks || 0
        const buying   = lu.spellBuys[name] || 0
        const canAfford = dpLeft >= cost

        return (
          <div key={name} style={{
            display: 'grid', gridTemplateColumns: '1fr auto 80px', padding: '7px 12px',
            gap: 10, alignItems: 'center', fontSize: 12,
            background: idx % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
            borderBottom: '1px solid var(--border)',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 3, height: 14, background: rc, borderRadius: 2, flexShrink: 0 }} />
                <span style={{ fontWeight: 600 }}>{name}</span>
                <span style={{ fontSize: 10, color: rc }}>{list.realm}</span>
              </div>
              <span style={{ color: 'var(--text3)', fontSize: 10 }}>
                {curRanks} ranks · {cost} DP/rank · {list.section}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button onClick={() => buying > 0 && dispatch({ type: 'SPELL_BUY', name, ranks: buying - 1, cost })}
                style={pmBtn(buying > 0)}><MinusIcon size={12} color="currentColor" /></button>
              <span style={{ width: 20, textAlign: 'center', fontWeight: 700, color: buying > 0 ? 'var(--accent)' : 'var(--text2)' }}>{buying}</span>
              <button onClick={() => buying < 2 && canAfford && dispatch({ type: 'SPELL_BUY', name, ranks: buying + 1, cost })}
                style={pmBtn(buying < 2 && canAfford)}>+</button>
            </div>
            <div style={{ fontSize: 11, color: buying > 0 ? 'var(--warning)' : 'var(--text3)', textAlign: 'right' }}>
              {buying > 0 ? `−${buying * cost} DP` : ''}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Review step ───────────────────────────────────────────────────────────────
function ReviewStep({ c, lu, onConfirm }) {
  const statChanges  = STATS.filter(s => (lu.statGains[s] || 0) > 0 || (lu.potGains[s] || 0) > 0)
  const skillChanges = Object.entries(lu.skillBuys).filter(([, r]) => r > 0)
  const spellChanges = Object.entries(lu.spellBuys).filter(([, r]) => r > 0)
  const dpLeft = lu.dpTotal - lu.dpSpent

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Section title="Summary">
        <Row label="Level"      value={`${c.level} → ${(c.level || 1) + 1}`} />
        <Row label="Profession" value={c.profession} />
        <Row label="DP used"    value={`${lu.dpSpent} / ${lu.dpTotal}`} />
        <Row label="DP unspent" value={dpLeft} color={dpLeft > 0 ? 'var(--warning)' : 'var(--success)'} />
        {lu.bonusDP > 0 && (
          <Row label="Racial bonus DP" value={`+${lu.bonusDP} (${lu.poolRemaining} → ${Math.max(0, lu.poolRemaining - Math.max(0, lu.dpSpent - 60))} pool remaining)`} color="var(--accent)" />
        )}
      </Section>

      {statChanges.length > 0 && (
        <Section title="Stat Changes">
          {statChanges.map(stat => {
            const s  = c.stats[stat] || {}
            const sg = lu.statGains[stat] || 0
            const pg = lu.potGains[stat] || 0
            return (
              <Row key={stat} label={stat}
                value={[sg > 0 && `Temp +${sg} (${s.temp} → ${Math.min(100, (s.temp||0)+sg)})`, pg > 0 && `Pot +${pg}`].filter(Boolean).join(' · ')}
                color="var(--success)" />
            )
          })}
        </Section>
      )}

      {skillChanges.length > 0 && (
        <Section title={`Skill Ranks (${skillChanges.length} skills)`}>
          {skillChanges.map(([name, ranks]) => {
            const cs          = c.custom_skills?.find(cs => cs.id === name)
            const displayName = cs ? (cs.label || cs.template_name) : name
            const skillDef    = cs ? { category: cs.category, dev_cost: cs.dev_cost } : (skillsData.find(s => s.name === name) || {})
            const costs       = getSkillCostsForChar(skillDef, c.profession)
            const cur         = cs ? (cs.ranks || 0) : (c.skills?.[name]?.ranks || 0)
            return <Row key={name} label={displayName} value={`+${ranks} rank${ranks > 1 ? 's' : ''} (${cur} → ${cur + ranks}) · −${rankCostDelta(0, ranks, costs)} DP`} color="var(--accent)" />
          })}
        </Section>
      )}

      {spellChanges.length > 0 && (
        <Section title={`Spell List Ranks (${spellChanges.length} lists)`}>
          {spellChanges.map(([name, ranks]) => {
            const list = spellLists[name]
            const cost = getSpellCostForChar(name, list || {}, c.profession)
            const cur  = c.spell_lists?.[name]?.ranks || 0
            return <Row key={name} label={name} value={`+${ranks} rank (${cur} → ${cur + ranks}) · −${ranks * cost} DP`} color="var(--purple)" />
          })}
        </Section>
      )}

      {statChanges.length === 0 && skillChanges.length === 0 && spellChanges.length === 0 && (
        <InfoBox>No changes recorded yet. Go back and allocate your stat points and DP.</InfoBox>
      )}
    </div>
  )
}

function ConfirmedScreen({ char, lu, onDone }) {
  return (
    <div style={{ maxWidth: 400, margin: '4rem auto', padding: '2rem', textAlign: 'center' }}>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'center' }}><SparkleIcon size={48} color="var(--accent)" /></div>
      <h2 style={{ fontWeight: 700, fontSize: 20, marginBottom: 8 }}>Level {(char.level || 1)} reached!</h2>
      <p style={{ color: 'var(--text2)', fontSize: 13, lineHeight: 1.6, marginBottom: 24 }}>
        All stats, skills, and spell list ranks have been updated.
      </p>
      <button onClick={onDone} style={{ background: 'var(--accent)', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
        Back to Character Sheet
      </button>
    </div>
  )
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function DPBadge({ spent, total }) {
  const left = total - spent
  const pct  = total > 0 ? left / total : 1
  const color = pct > 0.5 ? 'var(--success)' : pct > 0.2 ? 'var(--warning)' : 'var(--danger)'
  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 12px', textAlign: 'center', flexShrink: 0 }}>
      <div style={{ fontSize: 9, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 2 }}>DP</div>
      <div style={{ fontWeight: 700, fontSize: 15, color }}>
        {left}<span style={{ color: 'var(--text3)', fontWeight: 400, fontSize: 11 }}>/{total}</span>
      </div>
    </div>
  )
}

function PointsBadge({ n, color }) {
  return (
    <span style={{ background: (color || 'var(--accent)') + '22', color: color || 'var(--accent)', border: '1px solid ' + (color || 'var(--accent)') + '44', borderRadius: 6, padding: '3px 10px', fontWeight: 700, fontSize: 13 }}>
      {n} left
    </span>
  )
}

function InfoBox({ children }) {
  return (
    <div style={{ background: 'var(--accent)12', border: '1px solid var(--accent)33', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'var(--text2)', lineHeight: 1.6, marginBottom: 14 }}>
      {children}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '8px 14px', borderBottom: '1px solid var(--border)', fontSize: 11, fontWeight: 700, color: 'var(--text2)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{title}</div>
      <div style={{ padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Row({ label, value, color }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', fontSize: 13 }}>
      <span style={{ color: 'var(--text2)' }}>{label}</span>
      <span style={{ fontWeight: 600, color: color || 'var(--text)' }}>{value}</span>
    </div>
  )
}

const pmBtn = (enabled) => ({
  width: 22, height: 22, borderRadius: 4, border: '1px solid var(--border)',
  background: enabled ? 'var(--surface)' : 'var(--surface2)',
  color: enabled ? 'var(--text)' : 'var(--text3)',
  cursor: enabled ? 'pointer' : 'not-allowed',
  fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
  flexShrink: 0,
})

const navBtn = (primary) => ({
  background: primary ? 'var(--accent)' : 'var(--surface2)',
  color: primary ? '#fff' : 'var(--text2)',
  border: '1px solid var(--border)',
  borderRadius: 8, padding: '8px 20px',
  fontWeight: 600, fontSize: 13, cursor: 'pointer',
})
