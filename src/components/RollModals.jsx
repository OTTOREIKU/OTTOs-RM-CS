// Roll helpers: skill maneuvers, resistance rolls, initiative.
// Enter your own dice or let the app roll. Tables live in utils/dice.js.
import React, { useState } from 'react'
import { XIcon } from './Icons.jsx'
import { DIFFICULTIES, rollD100OE, rollDie, absoluteResult, percentageResult, resistanceResult } from '../utils/dice.js'
import { getResistanceBonuses, getRRBreakdown, getInitiativeBonus, getConditionInitiativePenalty } from '../utils/calc.js'

const signed = n => (n > 0 ? `+${n}` : `${n}`)
const label10 = { fontSize: 10, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }

function btn(color, filled = false) {
  return {
    background: filled ? color : 'transparent', color: filled ? '#fff' : color,
    border: `1px solid ${color}`, borderRadius: 6, padding: '5px 12px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

function Field({ label, children }) {
  return <div><div style={label10}>{label}</div>{children}</div>
}

/** Roll input with a dice button; shows the open-ended breakdown when rolled here. */
function RollInput({ value, onChange, dice }) {
  function roll() {
    const r = rollD100OE()
    onChange(String(r.total), r)
  }
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input type="number" value={value} onChange={e => onChange(e.target.value, null)} placeholder="d100"
        style={{ width: 80, textAlign: 'center' }} />
      <button style={btn('var(--accent)')} onClick={roll}>Roll d100</button>
      {dice && dice.rolls.length > 1 && (
        <span style={{ fontSize: 10, color: 'var(--text3)' }}>open-ended: {dice.rolls.map(signed).join(' ')}</span>
      )}
    </div>
  )
}

function Modal({ title, sub, onClose, children }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        padding: '16px 18px', maxWidth: 400, width: '94vw', maxHeight: '90vh', overflowY: 'auto', color: 'var(--text)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{title}</div>
            {sub && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sub}</div>}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <XIcon size={14} color="var(--text3)" />
          </button>
        </div>
        {children}
      </div>
    </>
  )
}

function ResultBox({ total, result, note }) {
  return (
    <div style={{ marginTop: 12, padding: '8px 10px', borderRadius: 8, border: `1px solid ${result.color}` }}>
      <div style={{ fontSize: 13 }}>
        <b style={{ fontSize: 16 }}>{total}</b> — <b style={{ color: result.color }}>{result.label}</b>
      </div>
      {note && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{note}</div>}
    </div>
  )
}

// ── Maneuver ─────────────────────────────────────────────────────────────────

/** `bonus` is the skill total already including condition penalties. */
export function ManeuverModal({ skillName, bonus, onClose }) {
  const [diff, setDiff]   = useState(0)
  const [type, setType]   = useState('absolute')
  const [other, setOther] = useState('')
  const [roll, setRoll]   = useState('')
  const [dice, setDice]   = useState(null)
  const r = roll === '' ? null : Number(roll)
  const mod = bonus + diff + (Number(other) || 0)
  const total = r == null || Number.isNaN(r) ? null : r + mod
  const first = dice ? dice.first : r
  return (
    <Modal title={skillName} sub={`Skill bonus ${signed(bonus)} (includes injury/fatigue penalties)`} onClose={onClose}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Difficulty">
          <select value={diff} onChange={e => setDiff(Number(e.target.value))} style={{ width: '100%' }}>
            {DIFFICULTIES.map(d => <option key={d.label} value={d.mod}>{d.label} ({signed(d.mod)})</option>)}
          </select>
        </Field>
        <Field label="Type">
          <select value={type} onChange={e => setType(e.target.value)} style={{ width: '100%' }}>
            <option value="absolute">Absolute (succeed / fail)</option>
            <option value="percentage">Percentage (how much done)</option>
          </select>
        </Field>
        <Field label="Other modifier">
          <input type="number" value={other} onChange={e => setOther(e.target.value)} placeholder="0" style={{ width: '100%' }} />
        </Field>
        <Field label="Total modifier">
          <div style={{ fontSize: 18, fontWeight: 800, padding: '2px 0', color: mod >= 0 ? 'var(--success)' : 'var(--danger)' }}>{signed(mod)}</div>
        </Field>
      </div>
      <div style={{ marginTop: 10 }}>
        <Field label="Your roll (d100 open-ended)">
          <RollInput value={roll} dice={dice} onChange={(v, d) => { setRoll(v); setDice(d) }} />
        </Field>
      </div>
      {total != null && (
        <ResultBox total={total}
          result={type === 'absolute' ? absoluteResult(total) : percentageResult(total)}
          note={first === 66 ? 'Unmodified 66 — Unusual Event: something unexpected happens as well.' : undefined} />
      )}
    </Modal>
  )
}

// ── Resistance roll + initiative (Quick Rolls card) ─────────────────────────

const RR_TYPES = [
  { key: 'channeling', label: 'Channeling' }, { key: 'essence', label: 'Essence' }, { key: 'mentalism', label: 'Mentalism' },
  { key: 'physical', label: 'Physical' }, { key: 'fear', label: 'Fear' },
]

// Spell Law Table 4-5 situational RR modifiers (worn armor is already in the RR bonus)
const RR_RANGE = [
  { value: 'none',  label: 'Range: not given',          mod: 0 },
  { value: 'touch', label: 'Touch (−15)',               mod: -15 },
  { value: 'close', label: "10' or less (−5)",          mod: -5 },
  { value: 'half',  label: 'Up to half range (0)',      mod: 0 },
  { value: 'far',   label: 'Over half range (+10)',     mod: 10 },
]
const RR_COVER = [
  { value: 'none',    label: 'No cover',          mod: 0 },
  { value: 'partial', label: 'Partial cover (+5)', mod: 5 },
  { value: 'full',    label: 'Full cover (+10)',   mod: 10 },
]

function ResistanceModal({ c, onClose }) {
  const bonuses = getResistanceBonuses(c)
  const stunnedNow = (c.stun || []).some(r => (r ?? 0) > 0) || !!c.conditions?.surprised
  const [stunned, setStunned] = useState(stunnedNow)
  const [range, setRange]   = useState('none')
  const [cover, setCover]   = useState('none')
  const [willing, setWilling] = useState(false)
  const [sitOn, setSitOn]   = useState({})   // situational talents ticked (e.g. Iron Will vs mental spells)
  const [type, setType]     = useState('essence')
  const [level, setLevel]   = useState('')
  const [vs, setVs]         = useState('spell')
  const [target, setTarget] = useState('')
  const [other, setOther]   = useState('')
  const [roll, setRoll]     = useState('')
  const [dice, setDice]     = useState(null)
  const lvl = Number(level) || 0
  const situational = getRRBreakdown(c, type).situational
  const magic = vs === 'spell'
  const sitMod = situational.reduce((s, x) => s + (sitOn[x.name] ? x.bonus : 0), 0)
  const tableMod = (stunned ? -5 : 0)
    + (magic ? (RR_RANGE.find(o => o.value === range)?.mod ?? 0) + (RR_COVER.find(o => o.value === cover)?.mod ?? 0) + (willing ? -50 : 0) : 0)
  const mod = bonuses[type] - 2 * lvl + sitMod + tableMod + (Number(other) || 0)
  const tgt = vs === 'fixed' ? 50 : vs === 'skill' ? (Number(target) || 0) - 100 : (Number(target) || 0)
  const needTarget = vs !== 'fixed' && target === ''
  const r = roll === '' ? null : Number(roll)
  const total = r == null || Number.isNaN(r) ? null : r + mod
  return (
    <Modal title="Resistance Roll" sub="Core Law 5.6 — roll + RR bonus − 2 × attack level; equal or beat the target" onClose={onClose}>
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 10 }}>
        {RR_TYPES.map(t => (
          <button key={t.key} onClick={() => setType(t.key)} style={{ ...btn('var(--purple)', type === t.key), padding: '4px 8px', fontSize: 11 }}>
            {t.label} {signed(bonuses[t.key])}
          </button>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <Field label="Attack level (caster/poison)">
          <input type="number" min={0} value={level} onChange={e => setLevel(e.target.value)} placeholder="0" style={{ width: '100%' }} />
        </Field>
        <Field label="Against">
          <select value={vs} onChange={e => setVs(e.target.value)} style={{ width: '100%' }}>
            <option value="spell">Spell — caster's SCR</option>
            <option value="skill">Poison/trap — their roll − 100</option>
            <option value="fixed">Other (disease, fear…) — 50</option>
          </select>
        </Field>
        {vs !== 'fixed' && (
          <Field label={vs === 'spell' ? "Caster's SCR result" : "Opponent's roll"}>
            <input type="number" value={target} onChange={e => setTarget(e.target.value)} placeholder="GM tells you" style={{ width: '100%' }} />
          </Field>
        )}
        {magic && (
          <Field label="Range from caster">
            <select value={range} onChange={e => setRange(e.target.value)} style={{ width: '100%' }}>
              {RR_RANGE.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        )}
        {magic && (
          <Field label="Cover">
            <select value={cover} onChange={e => setCover(e.target.value)} style={{ width: '100%' }}>
              {RR_COVER.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Other modifier">
          <input type="number" value={other} onChange={e => setOther(e.target.value)} placeholder="0" style={{ width: '100%' }} />
        </Field>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8, fontSize: 12, color: 'var(--text2)' }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
          <input type="checkbox" checked={stunned} onChange={e => setStunned(e.target.checked)} /> Stunned or surprised (−5)
        </label>
        {magic && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={willing} onChange={e => setWilling(e.target.checked)} /> Willing target (−50)
          </label>
        )}
        {situational.map(x => (
          <label key={x.name} style={{ display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer' }}>
            <input type="checkbox" checked={!!sitOn[x.name]} onChange={e => setSitOn(p => ({ ...p, [x.name]: e.target.checked }))} />
            {x.name} (+{x.bonus}{x.note ? `, ${x.note}` : ''})
          </label>
        ))}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text2)', margin: '10px 0' }}>
        Modifier <b>{signed(mod)}</b>{lvl ? ` (RR ${signed(bonuses[type])} − ${2 * lvl} for level ${lvl})` : ''}{tableMod || sitMod ? ` · situational ${signed(tableMod + sitMod)}` : ''}
        {!needTarget && <> · need <b>{tgt}</b></>}
        {type === 'fear' && <span style={{ color: 'var(--text3)' }}> · fear ignores injury/fatigue; add a present leader's Leadership ranks</span>}
      </div>
      <Field label="Your roll (d100 open-ended)">
        <RollInput value={roll} dice={dice} onChange={(v, d) => { setRoll(v); setDice(d) }} />
      </Field>
      {total != null && !needTarget && <ResultBox total={total} result={resistanceResult(total, tgt)} />}
      {total != null && needTarget && <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 10 }}>Total {total} — enter the target to see the result.</div>}
    </Modal>
  )
}

export function QuickRollsPanel({ c }) {
  const [open, setOpen] = useState(null)   // 'rr'
  const [ini, setIni]   = useState(null)
  const iniBonus = getInitiativeBonus(c) + getConditionInitiativePenalty(c)
  function rollInitiative() {
    const a = rollDie(10), b = rollDie(10)
    setIni({ a, b, total: a + b + iniBonus })
  }
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      <button style={btn('var(--purple)', true)} onClick={() => setOpen('rr')}>Resistance roll</button>
      <button style={btn('var(--accent)', true)} onClick={rollInitiative} title="2d10 + Quickness + talents − 1 per −10 penalty">
        Initiative {signed(iniBonus)}
      </button>
      {ini && (
        <span style={{ fontSize: 13 }}>
          <b style={{ fontSize: 16 }}>{ini.total}</b>
          <span style={{ color: 'var(--text3)', fontSize: 11 }}> (2d10: {ini.a} + {ini.b} {signed(iniBonus)})</span>
        </span>
      )}
      <span style={{ fontSize: 11, color: 'var(--text3)', flexBasis: '100%' }}>
        For a skill maneuver, tap any skill total (Starred Skills here, or the Skills tab).
      </span>
      {open === 'rr' && <ResistanceModal c={c} onClose={() => setOpen(null)} />}
    </div>
  )
}
