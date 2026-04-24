import React, { useState, useMemo, useEffect } from 'react'
import { useCharacter } from '../store/CharacterContext.jsx'
import { ChevronDownIcon, ChevronUpIcon } from '../components/Icons.jsx'
import { rankBonus, getTotalStatBonus } from '../utils/calc.js'
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

export default function SpellsView() {
  const { activeChar } = useCharacter()
  const [realm, setRealm]           = useState('All')
  const [search, setSearch]         = useState('')
  const [openList, setOpenList]     = useState(null)
  const [openSpell, setOpenSpell]   = useState(null)
  const [tab, setTab]               = useState('browse')
  const [showTypes, setShowTypes]   = useState(false)
  const [isMobile, setIsMobile]     = useState(() => window.innerWidth < 640)
  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])

  const c = activeChar
  const query = search.toLowerCase()
  const spellGrid = isMobile ? SPELL_GRID_M : SPELL_GRID

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
  function bonus(name)  {
    const rb     = rankBonus(ranks(name))
    // RS×2 + Me: Power Manipulation category (RS/RS) + individual skill stat (Me)
    const rStatName = c?.spell_cast_stat ?? REALM_STAT[spellLists[name]?.realm ?? c?.realm]
    const rsB    = rStatName && c?.stats?.[rStatName] ? getTotalStatBonus(c.stats[rStatName]) : 0
    const meB    = c?.stats?.Memory ? getTotalStatBonus(c.stats.Memory) : 0
    return rb + rsB * 2 + meB
  }

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
          {showTypes ? 'Hide' : 'Spell Types ▸'}
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
        const b  = bonus(listName)
        const spells = (query && tab === 'browse')
          ? list.spells?.filter(s => s.name.toLowerCase().includes(query)) ?? []
          : list.spells ?? []

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

              {/* Casting bonus (read-only; set ranks in Skills > Spell Lists) */}
              {c && r > 0 && (
                <span style={{ fontSize: 12, fontWeight: 700, color: b >= 0 ? 'var(--success)' : 'var(--danger)',
                  flexShrink: 0, minWidth: 36, textAlign: 'right' }}>
                  {b >= 0 ? `+${b}` : b}
                </span>
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
                        <span>{spell.name}{hasDetail && <span style={{ marginLeft: 4, color: 'var(--text3)', fontSize: 9 }}>ⓘ</span>}</span>
                        <span style={{ color: 'var(--text2)', fontSize: 11 }}>{spell.aoe || '—'}</span>
                        <span style={{ color: 'var(--text2)', fontSize: 11 }}>{spell.duration || '—'}</span>
                        <span style={{ color: 'var(--text2)', fontSize: 11 }}>{spell.range || '—'}</span>
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
