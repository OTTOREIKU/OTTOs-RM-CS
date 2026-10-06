// Per-character homebrew profession (e.g. a DM's custom class).
//
// Stored as char.custom_profession and active while char.profession equals its
// name. It never goes into professions.json, so other characters and players
// don't see it as a choice. Costs are borrowed from an existing profession.
import React, { useState } from 'react'
import professions from '../data/professions.json'
import professionSkillsData from '../data/profession_skills.json'
import spellLists from '../data/spell_lists.json'
import { ChevronDownIcon, ChevronUpIcon, XIcon } from './Icons.jsx'
import { getListCategory } from '../utils/calc.js'

// Every professional-skill choice any profession offers, for the "add" picker.
const ALL_PROF_SKILLS = (() => {
  const m = new Map()
  for (const list of Object.values(professionSkillsData)) for (const e of list) m.set(`${e.skillCategory}|${e.skillName}`, { skillCategory: e.skillCategory, skillName: e.skillName })
  return [...m.values()].sort((a, b) => a.skillCategory.localeCompare(b.skillCategory) || a.skillName.localeCompare(b.skillName))
})()
const LIST_NAMES = Object.keys(spellLists).sort()
const title = s => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (m, p, ch) => p + ch.toUpperCase())

function Chip({ children, onRemove }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, padding: '2px 6px', borderRadius: 4, background: 'var(--surface2)', border: '1px solid var(--border)' }}>
      {children}
      {onRemove && (
        <button onClick={onRemove} title="Remove" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex' }}>
          <XIcon size={9} color="var(--text3)" />
        </button>
      )}
    </span>
  )
}

const label = { display: 'block', fontSize: 10, fontWeight: 600, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 3 }

export default function HomebrewProfessionSubPanel({ char, updateCharacter }) {
  const cp = char.custom_profession
  const active = !!cp?.name && char.profession === cp.name
  const [open, setOpen] = useState(false)

  function setCP(patch) {
    const next = { ...cp, ...patch }
    const upd = { custom_profession: next }
    if (patch.name !== undefined && char.profession === cp.name) upd.profession = patch.name   // renaming the active one
    updateCharacter(upd)
  }

  // A list the character already has follows its base-list status: added → Base,
  // removed → back to the book's type (the List type selector can still override).
  function setBaseLists(next) {
    const upd = { custom_profession: { ...cp, base_lists: next } }
    const lists = { ...(char.spell_lists || {}) }
    let changed = false
    for (const n of Object.keys(lists)) {
      const isBase = next.includes(n), wasBase = (cp.base_lists || []).includes(n)
      if (isBase && !wasBase && lists[n]?.category !== 'Base') { lists[n] = { ...lists[n], category: 'Base' }; changed = true }
      if (!isBase && wasBase && lists[n]?.category === 'Base') { const { category: _c, ...rest } = lists[n]; lists[n] = rest; changed = true }
    }
    if (changed) upd.spell_lists = lists
    updateCharacter(upd)
  }

  function create() {
    const from = char.profession && professions.includes(char.profession) ? char.profession : 'No Profession'
    const name = 'Homebrew'
    updateCharacter({
      profession: name,
      custom_profession: {
        name,
        cost_profession: from,
        base_lists: Object.keys(char.spell_lists || {}).filter(n => getListCategory(char, n) === 'Base'),
        professional_skills: (professionSkillsData[from] || []).map(({ skillCategory, skillName }) => ({ skillCategory, skillName })),
      },
    })
    setOpen(true)
  }

  const summary = cp?.name
    ? `${cp.name}${active ? '' : ' (not in use)'} · costs as ${cp.cost_profession || 'No Profession'} · ${(cp.base_lists || []).length} base lists`
    : 'none'

  return (
    <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)' }}>
      <button onClick={() => setOpen(p => !p)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0',
        color: 'var(--text2)', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em',
      }}>
        <span>Homebrew Profession</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {!open && <span style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>{summary}</span>}
          {open ? <ChevronUpIcon size={12} color="var(--text3)" /> : <ChevronDownIcon size={12} color="var(--text3)" />}
        </div>
      </button>
      {open && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)' }}>
            For a DM's custom class. It's saved on this character only and doesn't appear in anyone else's profession list.
            It borrows another profession's development costs; its own base lists count as Base (SCR +5, Base cost).
          </div>
          {!cp?.name ? (
            <button onClick={create} style={{ alignSelf: 'flex-start', fontSize: 12, padding: '5px 12px' }}>
              Make a homebrew profession
            </button>
          ) : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 10 }}>
                <div>
                  <span style={label}>Name</span>
                  <input type="text" value={cp.name} onChange={e => setCP({ name: e.target.value })} style={{ width: '100%' }} />
                </div>
                <div>
                  <span style={label}>Costs as</span>
                  <select value={cp.cost_profession || 'No Profession'} onChange={e => setCP({ cost_profession: e.target.value })} style={{ width: '100%' }}>
                    {professions.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <span style={label}>Base lists ({(cp.base_lists || []).length})</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(cp.base_lists || []).map(l => (
                    <Chip key={l} onRemove={() => setBaseLists(cp.base_lists.filter(x => x !== l))}>{title(l)}</Chip>
                  ))}
                  <select value="" onChange={e => e.target.value && setBaseLists([...(cp.base_lists || []), e.target.value])}
                    style={{ fontSize: 11, maxWidth: 170 }}>
                    <option value="">+ add list…</option>
                    {LIST_NAMES.filter(n => !(cp.base_lists || []).includes(n)).map(n => <option key={n} value={n}>{title(n)}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <span style={label}>Professional skill choices ({(cp.professional_skills || []).length})</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {(cp.professional_skills || []).map(p => (
                    <Chip key={p.skillCategory + p.skillName}
                      onRemove={() => setCP({ professional_skills: cp.professional_skills.filter(x => !(x.skillName === p.skillName && x.skillCategory === p.skillCategory)) })}>
                      {p.skillName}
                    </Chip>
                  ))}
                  <select value="" onChange={e => {
                    const pick = ALL_PROF_SKILLS[Number(e.target.value)]
                    if (pick) setCP({ professional_skills: [...(cp.professional_skills || []), pick] })
                  }} style={{ fontSize: 11, maxWidth: 190 }}>
                    <option value="">+ add skill…</option>
                    {ALL_PROF_SKILLS.map((p, i) => (cp.professional_skills || []).some(x => x.skillName === p.skillName && x.skillCategory === p.skillCategory)
                      ? null : <option key={i} value={i}>{p.skillName} ({p.skillCategory})</option>)}
                  </select>
                  <button onClick={() => setCP({ professional_skills: (professionSkillsData[cp.cost_profession] || []).map(({ skillCategory, skillName }) => ({ skillCategory, skillName })) })}
                    style={{ fontSize: 11, padding: '2px 8px' }}>
                    Reset to {cp.cost_profession || 'No Profession'}'s list
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {!active && (
                  <button onClick={() => updateCharacter({ profession: cp.name })} style={{ fontSize: 12, padding: '4px 10px' }}>
                    Use {cp.name}
                  </button>
                )}
                {cp.source && <span style={{ fontSize: 10, color: 'var(--text3)' }}>From: {cp.source}</span>}
                <button onClick={() => updateCharacter({
                  custom_profession: null,
                  ...(active ? { profession: cp.cost_profession || '' } : {}),
                })} style={{ fontSize: 11, padding: '4px 10px', marginLeft: 'auto', color: 'var(--danger)' }}>
                  Delete homebrew
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  )
}
