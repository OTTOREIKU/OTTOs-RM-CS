import React, { useState, useMemo, useEffect } from 'react'
import { useCharacter } from '../store/CharacterContext.jsx'
import { ChevronDownIcon, ChevronUpIcon, ChevronRightIcon, InfoIcon } from '../components/Icons.jsx'
import { rankBonus, getTotalStatBonus, getTalentBonuses, getSpellCastingBonus, getSpellMasteryBonus } from '../utils/calc.js'
import spellLists from '../data/spell_lists.json'
import spellDescs from '../data/spell_descriptions.json'

const SPELL_GRID   = '36px 1fr 80px 90px 64px 32px'   // desktop
const SPELL_GRID_M = '28px 1fr 58px 78px 42px 28px'   // mobile: tighter fixed cols → ~128px for name

// Spell type codes from CoreLaw
const SPELL_TYPES = [
  { code: 'U',  label: 'Utility',              desc: 'General support / non-combat effect' },
  { code: 'F',  label: 'Force',                desc: 'Physical manipulation or movement' },
  { code: 'E',  label: 'Elemental',            desc: 'Involves elemental forces (fire, shadow, etc.)' },
  { code: 'I',  label: 'Information',          desc: 'Detection, divination, sensing' },
  { code: 'A',  label: 'Attack',               desc: 'Special offensive effect' },
  { code: 'b',  label: '+ Ball',               desc: 'Suffix: area-of-effect (e.g. Shock Ball)' },
  { code: 'd',  label: '+ Directed',           desc: 'Suffix: targeted — requires an attack roll' },
  { code: 'm',  label: '+ Maintained',         desc: 'Suffix: requires active concentration (dur: C)' },
  { code: 's',  label: '+ Self / Touch',       desc: 'Suffix: range limited to self or touch' },
]

const REALMS = ['All', 'Channeling', 'Essence', 'Mentalism', 'Hybrid']
const REALM_COLOR = { Channeling:'#f59e0b', Essence:'#4c8bf5', Mentalism:'#8b5cf6', Hybrid:'#22c55e' }
// Per CoreLaw: Mentalism realm stat is Presence, not Self Discipline
const REALM_STAT  = { Channeling:'Intuition', Essence:'Empathy', Mentalism:'Presence' }

// Duration "C" or anything containing "(C)" = concentration-maintained spell
function isConcentration(dur) {
  return dur === 'C' || !!(dur?.includes('(C)'))
}
// Spell property helpers for annotation talents
function hasRange(spell)        { const r = spell.range;    return !!(r && r !== '—' && r !== '-' && r.toLowerCase() !== 'self' && r.toLowerCase() !== 'touch') }
function hasAoE(spell)          { const a = spell.aoe;     return !!(a && a !== '—' && a !== '-') }
function hasNonCDuration(spell) { const d = spell.duration; return !!(d && d !== '—' && d !== '-' && !isConcentration(d)) }
function isTouchSelf(spell)     { return !!(spell.type?.includes('s')) }

export default function SpellsView() {
  const { activeChar } = useCharacter()
  const [realm, setRealm]           = useState('All')
  const [search, setSearch]         = useState('')
  const [openList, setOpenList]     = useState(() => {
    try { const v = localStorage.getItem('rm_spells_openList'); return v != null ? JSON.parse(v) : null } catch { return null }
  })
  const [openSpell, setOpenSpell]   = useState(null)
  const [tab, setTab]               = useState('browse')
  const [showTypes, setShowTypes]   = useState(false)
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  useEffect(() => {
    try { localStorage.setItem('rm_spells_openList', JSON.stringify(openList)) } catch {}
  }, [openList])

  const c = activeChar
  const query = search.toLowerCase()
  const spellGrid = isMobile ? SPELL_GRID_M : SPELL_GRID

  // Subconscious Discipline: 0 = not taken, 1 = Tier I (½ linger), 2 = Tier II (full linger)
  const sdTier = useMemo(() => {
    if (!c) return 0
    const inst = c.talents?.find(t => t.talent_id === 'subconscious_discipline')
    return inst?.tier ?? 0
  }, [c?.talents])

  // Phase 3 spell annotation talents
  const spellTalents = useMemo(() => {
    if (!c) return { grTier: 0, ifTier: 0, prTier: 0, mute: false }
    const find = id => c.talents?.find(t => t.talent_id === id)
    return {
      temporal:  find('temporal_skills'),   // param = list name
      spatial:   find('spatial_skills'),    // param = list name
      scope:     find('scope_skills'),      // param = list name
      extReach:  find('extended_reach'),    // param = list name
      quickCast: find('quick_caster'),      // param = list name
      grTier:    find('graceful_recovery')?.tier ?? 0,   // global
      ifTier:    find('inglorious_failure')?.tier ?? 0,  // global
      prTier:    find('power_recycling')?.tier ?? 0,     // global
      mute:      !!find('mute'),                         // global
    }
  }, [c?.talents])

  const filteredLists = useMemo(() => Object.entries(spellLists).filter(([name, list]) => {
    const matchRealm  = realm === 'All' || list.realm === realm
    const matchSearch = !query || name.toLowerCase().includes(query) ||
      list.spells?.some(s => s.name.toLowerCase().includes(query))
    return matchRealm && matchSearch
  }), [realm, query])

  const myLists = useMemo(() =>
    c ? Object.entries(spellLists).filter(([name]) => (c.spell_lists?.[name]?.ranks ?? 0) > 0) : [],
  [c])

  function ranks(name)  { return c?.spell_lists?.[name]?.ranks ?? 0 }
  function scr(name)    { return c ? getSpellCastingBonus(c, name) : null }
  function mastery(name){ return c ? getSpellMasteryBonus(c, name) : null }

  const display = tab === 'myspells' ? myLists : filteredLists

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '16px 12px' }}>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 12, alignItems: 'center' }}>
        <TabBtn active={tab === 'browse'}   onClick={() => setTab('browse')}>All Spells</TabBtn>
        <TabBtn active={tab === 'myspells'} onClick={() => setTab('myspells')}>My Lists{myLists.length > 0 ? ` (${myLists.length})` : ''}</TabBtn>
      </div>

      {/* Filters */}
      {tab === 'browse' && (
        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
          <input type="text" placeholder="Search lists or spells…" value={search}
            onChange={e => setSearch(e.target.value)} style={{ flex: 1, minWidth: 180 }} />
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {REALMS.map(r => {
              const active = realm === r
              return (
                <button key={r} onClick={() => setRealm(r)} style={{
                  background: active ? (REALM_COLOR[r] || 'var(--accent)') : 'var(--surface2)',
                  color: active ? '#fff' : 'var(--text2)',
                  border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
                  borderRadius: 6, padding: '5px 10px', cursor: 'pointer',
                  fontWeight: active ? 700 : 400, fontSize: 12,
                }}>{r}</button>
              )
            })}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', flex: 1 }}>
          {display.length} list{display.length !== 1 ? 's' : ''}
        </span>
        <button onClick={() => setShowTypes(t => !t)} style={{
          background: showTypes ? 'var(--surface2)' : 'transparent',
          border: '1px solid var(--border)', borderRadius: 5,
          color: 'var(--text3)', fontSize: 11, padding: '3px 8px', cursor: 'pointer',
        }}>
          {showTypes ? 'Hide' : <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>Spell Types <ChevronRightIcon size={10} color="currentColor" /></span>}
        </button>
      </div>

      {showTypes && (
        <div style={{
          marginBottom: 10, padding: '10px 12px',
          background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '4px 16px',
        }}>
          {SPELL_TYPES.map(({ code, label, desc }) => (
            <div key={code} style={{ display: 'flex', gap: 8, alignItems: 'baseline', fontSize: 12 }}>
              <span style={{
                fontSize: 10, background: 'var(--accent)', color: '#fff',
                padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                fontFamily: 'monospace', flexShrink: 0, minWidth: 22, textAlign: 'center',
              }}>{code}</span>
              <span style={{ color: 'var(--text)', fontWeight: 600, flexShrink: 0 }}>{label}</span>
              <span style={{ color: 'var(--text3)', fontSize: 11 }}>{desc}</span>
            </div>
          ))}
        </div>
      )}

      {display.map(([listName, list]) => {
        const isOpen = openList === listName
        const rc = REALM_COLOR[list.realm] || 'var(--accent)'
        const r  = ranks(listName)
        const b  = scr(listName)
        const m  = mastery(listName)
        // If the list name matched the query, show all spells.
        // Only filter to matching spells when the list appeared because a spell name matched.
        const listNameMatches = !query || listName.toLowerCase().includes(query)
        const spells = (query && tab === 'browse' && !listNameMatches)
          ? list.spells?.filter(s => s.name.toLowerCase().includes(query)) ?? []
          : list.spells ?? []

        // Per-list annotation tier (0 = talent doesn't apply to this list)
        const temporalTier  = spellTalents.temporal?.param === listName  ? (spellTalents.temporal?.tier  ?? 0) : 0
        const spatialTier   = spellTalents.spatial?.param === listName   ? (spellTalents.spatial?.tier   ?? 0) : 0
        const scopeTier     = spellTalents.scope?.param === listName     ? (spellTalents.scope?.tier     ?? 0) : 0
        const extReachTier  = spellTalents.extReach?.param === listName  ? (spellTalents.extReach?.tier  ?? 0) : 0
        const quickCastTier = spellTalents.quickCast?.param === listName ? (spellTalents.quickCast?.tier ?? 0) : 0

        return (
          <div key={listName} style={{
            marginBottom: 4, border: '1px solid ' + (isOpen ? rc + '88' : 'var(--border)'),
            borderRadius: 8, overflow: 'hidden', background: 'var(--surface)',
          }}>
            {/* List header */}
            <div onClick={() => setOpenList(isOpen ? null : listName)} style={{
              padding: '10px 14px', cursor: 'pointer', display: 'flex',
              alignItems: 'center', gap: 10, background: isOpen ? rc + '12' : 'transparent',
            }}>
              <div style={{
                width: 3, height: 18, borderRadius: 2,
                background: rc, flexShrink: 0,
              }} />
              <span style={{ fontWeight: 600, flex: 1, fontSize: 13, color: 'var(--text)' }}>{listName}</span>
              <span style={{ fontSize: 10, background: rc + '22', color: rc, padding: '2px 7px', borderRadius: 10, fontWeight: 600, flexShrink: 0 }}>
                {list.realm}
              </span>
              {list.section && <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>{list.section}</span>}
              <span style={{ fontSize: 11, color: 'var(--text3)', flexShrink: 0 }}>{list.spells?.length ?? 0}</span>

              {/* SCR + Mastery (read-only; set ranks in Skills > Spell Lists) */}
              {c && r > 0 && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, gap: 1 }}>
                  <span style={{ fontSize: 11, fontWeight: 700, color: b >= 0 ? 'var(--success)' : 'var(--danger)' }}
                    title="Spellcasting Roll: raw ranks + realm stat + talents">
                    SCR {b >= 0 ? `+${b}` : b}
                  </span>
                  <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 500 }}
                    title="Spell Mastery: full skill bonus (rank bonus + stats×2 + Memory + item + prof + talents)">
                    MST {m >= 0 ? `+${m}` : m}
                  </span>
                </div>
              )}
              {c && r === 0 && (
                <span style={{ fontSize: 10, color: 'var(--text3)', flexShrink: 0 }}>no ranks</span>
              )}
              {isOpen ? <ChevronUpIcon size={12} color="var(--text3)" /> : <ChevronDownIcon size={12} color="var(--text3)" />}
            </div>

            {/* Spell rows */}
            {isOpen && (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: spellGrid, padding: '4px 14px', borderTop: '1px solid var(--border)', background: 'var(--surface2)' }}>
                  {['Lvl','Spell','AoE','Duration','Range','Type'].map(h => (
                    <span key={h} style={{ fontSize: 9, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{h}</span>
                  ))}
                </div>
                {/* ── Talent annotation banners ─────────────────────── */}
                {/* Mute — always shown on every list, most prominent */}
                {spellTalents.mute && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--danger)12' }}>
                    <span style={{ fontSize: 10, background: 'var(--danger)', color: '#fff', borderRadius: 3, padding: '1px 6px', fontWeight: 700, flexShrink: 0 }}>⚠ MUTE</span>
                    <span style={{ fontSize: 11, color: 'var(--danger)', fontWeight: 600 }}>Cannot cast verbal spells — all spell casting is blocked unless a silent casting option exists</span>
                  </div>
                )}
                {/* Graceful Recovery — global */}
                {spellTalents.grTier > 0 && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--success)0d' }}>
                    <span style={{ fontSize: 10, background: 'var(--success)22', color: 'var(--success)', border: '1px solid var(--success)44', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      GR {'I II III IV V'.split(' ')[spellTalents.grTier - 1]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Spell failure roll <strong style={{ color: 'var(--success)' }}>−{spellTalents.grTier * 5}</strong> (min 1)
                    </span>
                  </div>
                )}
                {/* Inglorious Failure — global */}
                {spellTalents.ifTier > 0 && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--danger)0d' }}>
                    <span style={{ fontSize: 10, background: 'var(--danger)22', color: 'var(--danger)', border: '1px solid var(--danger)44', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      IF {'I II III IV V'.split(' ')[spellTalents.ifTier - 1]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Spell failure roll <strong style={{ color: 'var(--danger)' }}>+{spellTalents.ifTier * 5}</strong>
                    </span>
                  </div>
                )}
                {/* Power Recycling — global */}
                {spellTalents.prTier > 0 && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--purple)0d' }}>
                    <span style={{ fontSize: 10, background: 'var(--purple)22', color: 'var(--purple)', border: '1px solid var(--purple)44', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      PR {spellTalents.prTier === 1 ? 'I' : 'II'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      On spell failure: recover <strong style={{ color: 'var(--purple)' }}>{spellTalents.prTier === 1 ? '½ PP used' : 'all PP used'}</strong>
                    </span>
                  </div>
                )}
                {/* Quick Caster — per list */}
                {quickCastTier > 0 && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--accent)0d' }}>
                    <span style={{ fontSize: 10, background: 'var(--accent)22', color: 'var(--accent)', border: '1px solid var(--accent)44', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      QC {quickCastTier === 1 ? 'I' : 'II'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Casting cost: <strong style={{ color: 'var(--accent)' }}>{quickCastTier === 1 ? '2–3 AP' : '2 AP'}</strong> (instead of standard)
                    </span>
                  </div>
                )}
                {/* Temporal Skills — per list, non-C duration spells */}
                {temporalTier > 0 && spells.some(s => hasNonCDuration(s)) && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: '#f59e0b0d' }}>
                    <span style={{ fontSize: 10, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      TS {'I II III IV V'.split(' ')[temporalTier - 1]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Duration <strong style={{ color: '#f59e0b' }}>×{(1 + 0.5 * temporalTier).toFixed(1)}</strong> on timed spells (not concentration)
                    </span>
                  </div>
                )}
                {/* Spatial Skills — per list, ranged spells */}
                {spatialTier > 0 && spells.some(s => hasRange(s)) && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: '#4c8bf50d' }}>
                    <span style={{ fontSize: 10, background: '#4c8bf522', color: '#4c8bf5', border: '1px solid #4c8bf544', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      SS {'I II III IV V'.split(' ')[spatialTier - 1]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Range <strong style={{ color: '#4c8bf5' }}>×{(1 + 0.5 * spatialTier).toFixed(1)}</strong> on ranged spells
                    </span>
                  </div>
                )}
                {/* Scope Skills — per list, AoE spells */}
                {scopeTier > 0 && spells.some(s => hasAoE(s)) && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: '#22c55e0d' }}>
                    <span style={{ fontSize: 10, background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      SK {'I II III IV V'.split(' ')[scopeTier - 1]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      AoE / targets <strong style={{ color: '#22c55e' }}>×{1 + scopeTier}</strong> on area spells
                    </span>
                  </div>
                )}
                {/* Extended Reach — per list, touch/self spells */}
                {extReachTier > 0 && spells.some(s => isTouchSelf(s)) && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--purple)0d' }}>
                    <span style={{ fontSize: 10, background: 'var(--purple)22', color: 'var(--purple)', border: '1px solid var(--purple)44', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      ER {'I II III IV V'.split(' ')[extReachTier - 1]}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Touch/self spells gain range <strong style={{ color: 'var(--purple)' }}>{extReachTier * 5}′</strong>
                    </span>
                  </div>
                )}
                {/* Subconscious Discipline — concentration spells */}
                {sdTier > 0 && spells.some(s => isConcentration(s.duration)) && (
                  <div style={{ padding: '5px 14px', display: 'flex', alignItems: 'center', gap: 8, borderTop: '1px solid var(--border)', background: 'var(--purple)0d' }}>
                    <span style={{ fontSize: 10, background: 'var(--purple)22', color: 'var(--purple)', border: '1px solid var(--purple)44', borderRadius: 3, padding: '1px 5px', fontWeight: 700, flexShrink: 0 }}>
                      SD {sdTier === 1 ? 'I' : 'II'}
                    </span>
                    <span style={{ fontSize: 11, color: 'var(--text3)' }}>
                      Concentration spells linger for <strong style={{ color: 'var(--purple)' }}>{sdTier === 1 ? 'half the' : 'equal'} rounds</strong> spent concentrating after ceasing
                    </span>
                  </div>
                )}
                {spells.map((spell, i) => {
                  const spKey = `${listName}-${spell.level}`
                  const open  = openSpell === spKey
                  const desc  = spellDescs[listName]?.[String(spell.level)]
                  const hasDetail = !!(desc || spell.notes)
                  return (
                    <div key={spKey}>
                      <div onClick={() => hasDetail ? setOpenSpell(open ? null : spKey) : null}
                        style={{
                          display: 'grid', gridTemplateColumns: spellGrid,
                          padding: '5px 14px', gap: 4, fontSize: 12, alignItems: 'start',
                          background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface2)',
                          cursor: hasDetail ? 'pointer' : 'default',
                          borderLeft: '2px solid ' + (hasDetail ? rc + '60' : 'transparent'),
                        }}>
                        <span style={{ color: rc, fontWeight: 700 }}>{spell.level}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 3 }}>{spell.name}{hasDetail && <InfoIcon size={9} color="var(--text3)" />}</span>
                        <span style={{ color: 'var(--text2)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap' }}>
                          {spell.aoe || '—'}
                          {scopeTier > 0 && hasAoE(spell) && (
                            <span style={{ fontSize: 9, background: '#22c55e22', color: '#22c55e', border: '1px solid #22c55e44', borderRadius: 3, padding: '0 3px', fontWeight: 700, flexShrink: 0 }}
                              title={`Scope Skills ${['I','II','III','IV','V'][scopeTier-1]}: AoE ×${1+scopeTier}`}>
                              ×{1 + scopeTier}
                            </span>
                          )}
                        </span>
                        <span style={{ color: 'var(--text2)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap' }}>
                          {spell.duration || '—'}
                          {sdTier > 0 && isConcentration(spell.duration) && (
                            <span style={{ fontSize: 9, background: 'var(--purple)22', color: 'var(--purple)', border: '1px solid var(--purple)44', borderRadius: 3, padding: '0 3px', fontWeight: 700, flexShrink: 0 }}
                              title={`Subconscious Discipline ${sdTier === 1 ? 'I' : 'II'}: lingers for ${sdTier === 1 ? '½×' : ''}the rounds you concentrated after ceasing`}>
                              +{sdTier === 1 ? '½T' : 'T'}
                            </span>
                          )}
                          {temporalTier > 0 && hasNonCDuration(spell) && (
                            <span style={{ fontSize: 9, background: '#f59e0b22', color: '#f59e0b', border: '1px solid #f59e0b44', borderRadius: 3, padding: '0 3px', fontWeight: 700, flexShrink: 0 }}
                              title={`Temporal Skills ${['I','II','III','IV','V'][temporalTier-1]}: Duration ×${(1+0.5*temporalTier).toFixed(1)}`}>
                              ×{(1 + 0.5 * temporalTier).toFixed(1)}
                            </span>
                          )}
                        </span>
                        <span style={{ color: 'var(--text2)', fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, flexWrap: 'nowrap' }}>
                          {spell.range || '—'}
                          {spatialTier > 0 && hasRange(spell) && (
                            <span style={{ fontSize: 9, background: '#4c8bf522', color: '#4c8bf5', border: '1px solid #4c8bf544', borderRadius: 3, padding: '0 3px', fontWeight: 700, flexShrink: 0 }}
                              title={`Spatial Skills ${['I','II','III','IV','V'][spatialTier-1]}: Range ×${(1+0.5*spatialTier).toFixed(1)}`}>
                              ×{(1 + 0.5 * spatialTier).toFixed(1)}
                            </span>
                          )}
                          {extReachTier > 0 && isTouchSelf(spell) && (
                            <span style={{ fontSize: 9, background: 'var(--purple)22', color: 'var(--purple)', border: '1px solid var(--purple)44', borderRadius: 3, padding: '0 3px', fontWeight: 700, flexShrink: 0 }}
                              title={`Extended Reach ${['I','II','III','IV','V'][extReachTier-1]}: +${extReachTier*5}′ range on touch/self spells`}>
                              +{extReachTier * 5}′
                            </span>
                          )}
                        </span>
                        <span style={{ fontSize: 10, color: rc, background: rc + '18', padding: '1px 4px', borderRadius: 3, textAlign: 'center' }}>{spell.type || '—'}</span>
                      </div>
                      {open && hasDetail && (
                        <div style={{ padding: '8px 14px 8px 50px', background: rc + '0d', borderLeft: '3px solid ' + rc, fontSize: 12, lineHeight: 1.6, color: 'var(--text2)' }}>
                          {desc && <p style={{ margin: '0 0 4px 0' }}>{desc}</p>}
                          {spell.notes && <p style={{ margin: 0, color: 'var(--text3)', fontStyle: 'italic' }}>{spell.notes}</p>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )
      })}

      {display.length === 0 && (
        <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)', fontSize: 13 }}>
          No spell lists match your search.
        </div>
      )}
    </div>
  )
}

function TabBtn({ active, onClick, children }) {
  return (
    <button onClick={onClick} style={{
      background: active ? 'var(--accent)' : 'var(--surface2)',
      color: active ? '#fff' : 'var(--text2)',
      border: '1px solid ' + (active ? 'transparent' : 'var(--border)'),
      borderRadius: 7, padding: '6px 14px', cursor: 'pointer',
      fontWeight: active ? 700 : 400, fontSize: 13,
    }}>{children}</button>
  )
}
