// Reference library tabs built from the RMU Foundry compendiums: Creature Law
// creatures, Treasure Law herbs and magic items. The data files are large, so each
// tab loads its JSON only when opened.
import React, { useEffect, useMemo, useState } from 'react'
import { useLocalStorage } from '../hooks/persist.js'
import { ChevronDownIcon, ChevronRightIcon } from '../components/Icons.jsx'

const SIZE_NAMES = { Mi: 'Minuscule', D: 'Diminutive', T: 'Tiny', S: 'Small', M: 'Medium', B: 'Big', L: 'Large', H: 'Huge', G: 'Gigantic', E: 'Enormous', I: 'Immense' }
const SIZE_ORDER = ['Mi', 'D', 'T', 'S', 'M', 'B', 'L', 'H', 'G', 'E', 'I']
// Creature Law Table 3.1g (herbs use the same codes)
const BIOMES = {
  A: 'Alpine', O: 'Oceans', U: 'Underground', B: 'Boreal forest', I: 'Ice caps', T: 'Tundra',
  F: 'Temperate forest', P: 'Prairie/steppe', X: 'Desert & xeric shrubland', D: 'Hot desert', J: 'Tropical forest',
  S: 'Savanna/grassland', C: 'City', E: 'Enchanted/extraplanar', G: 'Farmland', H: 'Haunted', R: 'Ruins', V: 'Volcanic', Z: 'Anywhere',
}
function biomeText(code) {
  const out = []
  for (let i = 0; i < (code || '').length; i++) {
    const ch = code[i]
    if (ch === 'w' && out.length) { out[out.length - 1] += ' (water)'; continue }
    if (BIOMES[ch]) out.push(BIOMES[ch])
  }
  return out.join(', ')
}
// Dark Summons Binding spells: the highest creature level each can hold
const BINDINGS = [{ max: 2, spell: 'Binding II', lvl: 5 }, { max: 5, spell: 'Binding V', lvl: 9 }, { max: 10, spell: 'Binding X', lvl: 13 }, { max: 15, spell: 'Binding XV', lvl: 17 }]

function useLazyJson(loader) {
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  useEffect(() => { loader().then(m => setData(m.default || m)).catch(e => setError(e.message)) }, [])  // eslint-disable-line react-hooks/exhaustive-deps
  return [data, error]
}

const inputStyle = { padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface2)', color: 'var(--text)', fontSize: 12 }
const chip = color => ({ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: color + '22', color, border: `1px solid ${color}44`, whiteSpace: 'nowrap' })
const label = { fontSize: 10, fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.07em' }

function Loading({ error }) {
  return <div style={{ padding: 20, color: error ? 'var(--danger)' : 'var(--text3)', fontSize: 12 }}>{error ? 'Could not load: ' + error : 'Loading…'}</div>
}

function Row({ open, onToggle, children, detail }) {
  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <button onClick={onToggle} style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', background: open ? 'var(--surface2)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', color: 'var(--text)' }}>
        {open ? <ChevronDownIcon size={11} color="var(--text3)" /> : <ChevronRightIcon size={11} color="var(--text3)" />}
        {children}
      </button>
      {open && <div style={{ padding: '8px 12px 12px 27px', background: 'var(--surface2)', fontSize: 12, color: 'var(--text2)', lineHeight: 1.55 }}>{detail}</div>}
    </div>
  )
}

function Stat({ k, v }) {
  if (v == null || v === '') return null
  return <div><div style={label}>{k}</div><div style={{ fontWeight: 700, color: 'var(--text)' }}>{v}</div></div>
}

// ── Creatures ────────────────────────────────────────────────────────────────
export function CreaturesPanel() {
  const [file, error] = useLazyJson(() => import('../data/creatures.json'))
  const [search, setSearch] = useLocalStorage('rm_ref_creature_search', '')
  const [cat, setCat] = useLocalStorage('rm_ref_creature_cat', 'All')
  const [maxLevel, setMaxLevel] = useLocalStorage('rm_ref_creature_maxlvl', '')
  const [animalOnly, setAnimalOnly] = useLocalStorage('rm_ref_creature_animal', false)
  const [open, setOpen] = useState(null)

  const cats = useMemo(() => file ? ['All', ...[...new Set(file.list.map(c => c.cat))].sort()] : ['All'], [file])
  const list = useMemo(() => {
    if (!file) return []
    const q = search.trim().toLowerCase()
    const max = maxLevel === '' ? null : Number(maxLevel)
    return file.list.filter(c =>
      (cat === 'All' || c.cat === cat) &&
      (!animalOnly || c.animal) &&
      (max == null || (c.level ?? 0) <= max) &&
      (!q || c.name.toLowerCase().includes(q) || c.variety.toLowerCase().includes(q) || c.type.toLowerCase().includes(q)))
  }, [file, search, cat, maxLevel, animalOnly])

  if (!file) return <Loading error={error} />
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10, alignItems: 'center' }}>
        <input type="text" placeholder="Search creatures…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: '1 1 180px' }} />
        <select value={cat} onChange={e => setCat(e.target.value)} style={inputStyle}>
          {cats.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="number" min={0} placeholder="Max lvl" value={maxLevel} onChange={e => setMaxLevel(e.target.value)} style={{ ...inputStyle, width: 80 }} />
        <label style={{ fontSize: 12, color: 'var(--text2)', display: 'flex', gap: 5, alignItems: 'center' }}>
          <input type="checkbox" checked={!!animalOnly} onChange={e => setAnimalOnly(e.target.checked)} /> Animal intelligence
        </label>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{list.length} of {file.list.length} creatures · Creature Law</div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {list.map(c => (
          <Row key={c.name} open={open === c.name} onToggle={() => setOpen(open === c.name ? null : c.name)}
            detail={<CreatureDetail c={c} desc={c.d >= 0 ? file.descs[c.d] : ''} />}>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{c.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', whiteSpace: 'nowrap' }}>{c.variety || c.type}</span>
            <span style={chip('#4c8bf5')}>Lvl {c.level ?? '?'}</span>
            <span style={chip('#a78bfa')}>{SIZE_NAMES[c.size] || c.size}</span>
          </Row>
        ))}
      </div>
    </div>
  )
}

function CreatureDetail({ c, desc }) {
  const [showDesc, setShowDesc] = useState(false)
  const binding = c.animal ? BINDINGS.find(b => (c.level ?? 0) <= b.max) : null
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={chip('#94a3b8')}>{c.cat}{c.type ? ' · ' + c.type : ''}</span>
        {c.outlook && <span style={chip('#f59e0b')}>{c.outlook}</span>}
        {c.lvv && <span style={chip('#4c8bf5')}>Level variance {c.lvv}</span>}
        {c.animal && <span style={chip('#22c55e')}>Animal intelligence</span>}
      </div>
      {c.animal && (
        <div style={{ fontSize: 11, color: 'var(--text2)' }}>
          {binding
            ? <>Binding: needs <strong>{binding.spell}</strong> (Dark Summons level {binding.lvl}) or higher to hold a level {c.level} creature.</>
            : <>Binding: above level 15, beyond the Binding spells.</>}
        </div>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))', gap: 8 }}>
        <Stat k="Hits" v={c.hits} />
        <Stat k="AT" v={c.at} />
        <Stat k="PP" v={c.pp} />
        <Stat k="Initiative" v={c.init != null ? (c.init >= 0 ? '+' : '') + c.init : null} />
        {c.moves.map(m => <Stat key={m.mode} k={m.mode} v={`${m.bmr}'/rnd${m.pace ? ' · ' + m.pace : ''}`} />)}
      </div>
      {c.attacks.length > 0 && (
        <div>
          <span style={label}>Attacks </span>
          {c.attacks.map(a => `${a.n} ${a.ob >= 0 ? '+' : ''}${a.ob}`).join(' · ')}
          {c.seq.length > 0 && <span style={{ color: 'var(--text3)' }}> · sequence {c.seq.join(', ')}</span>}
        </div>
      )}
      {c.rr && (
        <div>
          <span style={label}>RR </span>
          {Object.entries(c.rr).map(([k, v]) => `${k} ${v >= 0 ? '+' : ''}${v}`).join(' · ')}
        </div>
      )}
      {c.skills.length > 0 && <div><span style={label}>Skills </span>{c.skills.map(s => `${s.n} ${s.b >= 0 ? '+' : ''}${s.b}`).join(' · ')}</div>}
      {c.talents.length > 0 && <div><span style={label}>Talents </span>{c.talents.join(' · ')}</div>}
      {(c.sizeDesc || c.armorDesc) && <div><span style={label}>Body </span>{[c.sizeDesc, c.armorDesc].filter(Boolean).join(' · ')}</div>}
      {c.biome && <div><span style={label}>Found in </span>{biomeText(c.biome)}{c.number ? ` · encountered: ${c.number}` : ''}</div>}
      {c.variants && <div><span style={label}>Variants </span>{c.variants}</div>}
      {c.treasure && <div><span style={label}>Treasure </span>{c.treasure}</div>}
      {desc && (
        <div>
          <button onClick={() => setShowDesc(s => !s)} style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', fontSize: 12 }}>
            {showDesc ? 'Hide description' : 'Show description'}
          </button>
          {showDesc && <p style={{ margin: '6px 0 0', whiteSpace: 'pre-line' }}>{desc}</p>}
        </div>
      )}
    </div>
  )
}

// ── Herbs ────────────────────────────────────────────────────────────────────
export function HerbsPanel() {
  const [herbs, error] = useLazyJson(() => import('../data/herbs.json'))
  const [search, setSearch] = useLocalStorage('rm_ref_herb_search', '')
  const [open, setOpen] = useState(null)
  const list = useMemo(() => {
    if (!herbs) return []
    const q = search.trim().toLowerCase()
    return q ? herbs.filter(h => h.name.toLowerCase().includes(q) || h.effect.toLowerCase().includes(q) || biomeText(h.biome).toLowerCase().includes(q)) : herbs
  }, [herbs, search])
  if (!herbs) return <Loading error={error} />
  return (
    <div>
      <input type="text" placeholder="Search herbs, effects or biomes (e.g. heals, stun, forest)…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, width: '100%', marginBottom: 10, boxSizing: 'border-box' }} />
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{list.length} of {herbs.length} herbs · Treasure Law. Find with Survival; Herbalism to prepare.</div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {list.map(h => (
          <Row key={h.name} open={open === h.name} onToggle={() => setOpen(open === h.name ? null : h.name)}
            detail={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div>{h.effect}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
                  <Stat k="Form" v={h.form} />
                  <Stat k="Preparation" v={h.prep} />
                  <Stat k="Find" v={h.find} />
                  <Stat k="Season" v={h.season} />
                  <Stat k="Cost" v={h.cost} />
                  <Stat k="Weight" v={h.weight} />
                  {h.af > 0 && <Stat k="Addiction" v={h.af} />}
                </div>
                {h.biome && <div><span style={label}>Found in </span>{biomeText(h.biome) || h.biome}</div>}
              </div>
            }>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{h.name}</span>
            <span style={{ fontSize: 11, color: 'var(--text3)', flex: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.effect}</span>
          </Row>
        ))}
      </div>
    </div>
  )
}

// ── Magic items ──────────────────────────────────────────────────────────────
const KIND_COLOR = { weapon: '#ef4444', armor: '#4c8bf5', shield: '#06b6d4', equipment: '#a78bfa' }
export function MagicItemsPanel() {
  const [items, error] = useLazyJson(() => import('../data/magic_items.json'))
  const [search, setSearch] = useLocalStorage('rm_ref_magic_search', '')
  const [kind, setKind] = useLocalStorage('rm_ref_magic_kind', 'all')
  const [open, setOpen] = useState(null)
  const list = useMemo(() => {
    if (!items) return []
    const q = search.trim().toLowerCase()
    return items.filter(m => (kind === 'all' || m.kind === kind) && (!q || m.name.toLowerCase().includes(q) || m.desc.toLowerCase().includes(q)))
  }, [items, search, kind])
  if (!items) return <Loading error={error} />
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <input type="text" placeholder="Search magic items…" value={search} onChange={e => setSearch(e.target.value)} style={{ ...inputStyle, flex: '1 1 200px' }} />
        <select value={kind} onChange={e => setKind(e.target.value)} style={inputStyle}>
          {['all', 'weapon', 'armor', 'shield', 'equipment'].map(k => <option key={k} value={k}>{k === 'all' ? 'All kinds' : k[0].toUpperCase() + k.slice(1)}</option>)}
        </select>
      </div>
      <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>{list.length} of {items.length} items · Treasure Law magic item compendium</div>
      <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
        {list.map(m => (
          <Row key={m.name} open={open === m.name} onToggle={() => setOpen(open === m.name ? null : m.name)}
            detail={
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ whiteSpace: 'pre-line' }}>{m.desc}</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 8 }}>
                  <Stat k="Item level" v={m.level} />
                  <Stat k="Cost" v={m.cost} />
                  {m.bonus !== 0 && <Stat k="Bonus" v={(m.bonus > 0 ? '+' : '') + m.bonus} />}
                </div>
                {m.enchant.length > 0 && <div><span style={label}>Made with </span>{m.enchant.join(' · ')}</div>}
              </div>
            }>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 13 }}>{m.name}</span>
            <span style={chip(KIND_COLOR[m.kind] || '#94a3b8')}>{m.kind}</span>
            {m.level != null && <span style={chip('#4c8bf5')}>Lvl {m.level}</span>}
          </Row>
        ))}
      </div>
    </div>
  )
}
