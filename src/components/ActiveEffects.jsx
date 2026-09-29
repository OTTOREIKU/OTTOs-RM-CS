// Active spells & effects (on you, your familiar, or anyone else) with a game
// clock, plus a simple Familiar card. The familiar's stats are not tracked —
// it's a buff tracker and casting target. Rules/time math live in utils/time.js.
import React, { useState } from 'react'
import { XIcon, PlusIcon } from './Icons.jsx'
import { useConfirm } from './ConfirmModal.jsx'
import { ROUNDS, formatRounds, newEffectId, advanceTime } from '../utils/time.js'
import { getBleedPerRound } from '../utils/calc.js'

const label10 = { fontSize: 10, color: 'var(--text3)', marginBottom: 3 }

function btn(color, filled = false) {
  return {
    background: filled ? color : 'transparent', color: filled ? '#fff' : color,
    border: `1px solid ${color}`, borderRadius: 6, padding: '4px 9px',
    fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

export function familiarName(c) {
  return c.familiar?.name?.trim() || 'Familiar'
}

export function targetLabel(c, target) {
  if (!target || target === 'self') return c.name || 'You'
  if (target === 'familiar') return familiarName(c)
  return target
}

// ── Time controls ────────────────────────────────────────────────────────────

const STEPS = [
  { label: 'Next round', rounds: 1 },
  { label: '+1 min',     rounds: ROUNDS.minute },
  { label: '+10 min',    rounds: ROUNDS.minute * 10 },
  { label: '+1 hour',    rounds: ROUNDS.hour },
]

/** Advance game time; asks first when bleeding would cost hits over a long jump. */
export function useAdvanceTime(c, updateCharacter) {
  const [confirm, confirmEl] = useConfirm()
  async function advance(rounds) {
    const bleed = getBleedPerRound(c)
    if (bleed > 0 && rounds > 1) {
      const ok = await confirm(
        `You are bleeding ${bleed} hits/round. ${formatRounds(rounds)} of bleeding costs ${bleed * rounds} hits.\n\nTreat the wound first, or continue anyway?`,
        { title: 'Still bleeding', confirmLabel: 'Continue', cancelLabel: 'Cancel', dangerous: true })
      if (!ok) return
    }
    updateCharacter(advanceTime(c, rounds).patch)
  }
  return [advance, confirmEl]
}

function TimeBar({ c, updateCharacter }) {
  const [advance, confirmEl] = useAdvanceTime(c, updateCharacter)
  const [custom, setCustom] = useState('')
  const [unit, setUnit] = useState('minute')
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10 }}>
      {STEPS.map((s, i) => (
        <button key={s.label} style={btn('var(--accent)', i === 0)} onClick={() => advance(s.rounds)}>{s.label}</button>
      ))}
      <span style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
        <input type="number" min={1} value={custom} onChange={e => setCustom(e.target.value)} placeholder="#"
          style={{ width: 52, padding: '3px 4px' }} />
        <select value={unit} onChange={e => setUnit(e.target.value)} style={{ padding: '3px 4px' }}>
          {['round', 'minute', 'hour', 'day'].map(u => <option key={u} value={u}>{u}s</option>)}
        </select>
        <button style={{ ...btn('var(--accent)'), opacity: Number(custom) > 0 ? 1 : 0.5 }} disabled={!(Number(custom) > 0)}
          onClick={() => { advance(Number(custom) * ROUNDS[unit]); setCustom('') }}>Pass</button>
      </span>
      {confirmEl}
    </div>
  )
}

// ── Effect list ──────────────────────────────────────────────────────────────

function EffectRow({ c, e, onRemove, showTarget }) {
  const ended = e.remaining != null && e.remaining <= 0
  const low   = e.remaining != null && e.remaining > 0 && e.total && e.remaining <= Math.max(1, Math.round(e.total * 0.1))
  const time  = e.remaining != null ? formatRounds(e.remaining)
    : e.permanent ? 'permanent' : e.concentration ? 'while concentrating' : 'no timer'
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 22px', gap: 8, alignItems: 'center',
      padding: '6px 8px', borderRadius: 6, background: ended ? 'color-mix(in srgb, var(--danger) 10%, transparent)' : 'var(--surface)',
      border: '1px solid ' + (ended ? 'var(--danger)' : 'var(--border)') }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {e.name}
          {e.concentration && <span title="Concentration" style={{ marginLeft: 6, fontSize: 9, fontWeight: 800, color: 'var(--purple)' }}>C</span>}
        </div>
        <div style={{ fontSize: 10, color: 'var(--text3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          {[showTarget && `on ${targetLabel(c, e.target)}`, e.list && `${e.list}${e.level ? ` ${e.level}` : ''}`, e.notes].filter(Boolean).join(' · ')}
        </div>
      </div>
      <span style={{ fontSize: 12, fontWeight: 700, color: ended ? 'var(--danger)' : low ? '#f97316' : e.remaining != null ? 'var(--text)' : 'var(--text3)' }}>
        {ended ? 'ENDED' : time}
      </span>
      <button onClick={onRemove} title={ended ? 'Clear' : 'End effect'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
        <XIcon size={12} color="var(--text3)" />
      </button>
    </div>
  )
}

function AddEffectForm({ c, fixedTarget, onAdd, onCancel }) {
  const [f, setF] = useState({ name: '', target: fixedTarget || 'self', other: '', amount: '', unit: 'minute', mode: 'timed' })
  const set = p => setF(prev => ({ ...prev, ...p }))
  function submit() {
    if (!f.name.trim()) return
    const target = fixedTarget || (f.target === 'other' ? (f.other.trim() || 'Other') : f.target)
    const rounds = f.mode === 'timed' && Number(f.amount) > 0 ? Math.round(Number(f.amount) * ROUNDS[f.unit]) : null
    onAdd({
      id: newEffectId(), name: f.name.trim(), target,
      remaining: rounds, total: rounds,
      concentration: f.mode === 'concentration', permanent: f.mode === 'permanent',
    })
  }
  return (
    <div style={{ border: '1px dashed var(--border2)', borderRadius: 8, padding: 10, marginTop: 8 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <div style={label10}>Effect / spell</div>
          <input value={f.name} onChange={e => set({ name: e.target.value })} placeholder="e.g. Wings I" style={{ width: '100%' }} autoFocus />
        </div>
        {!fixedTarget && (
          <div>
            <div style={label10}>On</div>
            <select value={f.target} onChange={e => set({ target: e.target.value })} style={{ width: '100%' }}>
              <option value="self">{c.name || 'You'}</option>
              {c.familiar && <option value="familiar">{familiarName(c)}</option>}
              <option value="other">Someone else…</option>
            </select>
          </div>
        )}
        {!fixedTarget && f.target === 'other' && (
          <div><div style={label10}>Who</div>
            <input value={f.other} onChange={e => set({ other: e.target.value })} placeholder="Name" style={{ width: '100%' }} /></div>
        )}
        <div>
          <div style={label10}>Duration</div>
          <select value={f.mode} onChange={e => set({ mode: e.target.value })} style={{ width: '100%' }}>
            <option value="timed">Timed</option>
            <option value="concentration">Concentration</option>
            <option value="permanent">Permanent</option>
            <option value="none">No timer</option>
          </select>
        </div>
        {f.mode === 'timed' && (
          <div style={{ display: 'flex', gap: 4, alignItems: 'flex-end' }}>
            <input type="number" min={1} value={f.amount} onChange={e => set({ amount: e.target.value })} placeholder="#" style={{ width: 56 }} />
            <select value={f.unit} onChange={e => set({ unit: e.target.value })}>
              {['round', 'minute', 'hour', 'day'].map(u => <option key={u} value={u}>{u}s</option>)}
            </select>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
        <button style={btn('var(--text3)')} onClick={onCancel}>Cancel</button>
        <button style={{ ...btn('var(--purple)', true), opacity: f.name.trim() ? 1 : 0.5 }} onClick={submit}>Add</button>
      </div>
    </div>
  )
}

function EffectList({ c, updateCharacter, filter, fixedTarget, showTarget, emptyText }) {
  const [adding, setAdding] = useState(false)
  const all = c.active_effects || []
  const shown = all.filter(filter)
  const remove = id => updateCharacter({ active_effects: all.filter(e => e.id !== id) })
  const endedIds = shown.filter(e => e.remaining != null && e.remaining <= 0).map(e => e.id)
  return (
    <div>
      {shown.length === 0 && !adding && (
        <div style={{ fontSize: 12, color: 'var(--text3)', padding: '4px 0 8px' }}>{emptyText}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        {shown.map(e => <EffectRow key={e.id} c={c} e={e} showTarget={showTarget} onRemove={() => remove(e.id)} />)}
      </div>
      {adding ? (
        <AddEffectForm c={c} fixedTarget={fixedTarget}
          onAdd={eff => { updateCharacter({ active_effects: [...all, eff] }); setAdding(false) }}
          onCancel={() => setAdding(false)} />
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
          <button style={{ ...btn('var(--text2)'), display: 'flex', alignItems: 'center', gap: 4 }} onClick={() => setAdding(true)}>
            <PlusIcon size={10} color="currentColor" /> Add effect
          </button>
          {endedIds.length > 0 && (
            <button style={btn('var(--danger)')} onClick={() => updateCharacter({ active_effects: all.filter(e => !endedIds.includes(e.id)) })}>
              Clear ended ({endedIds.length})
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// ── Cards ────────────────────────────────────────────────────────────────────

/** Effects on you and anyone other than the familiar, with the game clock. */
export function ActiveEffectsPanel({ c, updateCharacter }) {
  return (
    <div>
      <TimeBar c={c} updateCharacter={updateCharacter} />
      <EffectList c={c} updateCharacter={updateCharacter} showTarget
        filter={e => e.target !== 'familiar'}
        emptyText="No active spells. Cast one from the Spells tab or add it here." />
      {!c.familiar && (
        <button onClick={() => updateCharacter({ familiar: { name: '', notes: '' } })}
          style={{ ...btn('var(--text3)'), marginTop: 8, borderStyle: 'dashed' }}>
          Add a familiar card
        </button>
      )}
    </div>
  )
}

/** Simple familiar card: name, notes, and the effects on it. */
export function FamiliarPanel({ c, updateCharacter }) {
  const [confirm, confirmEl] = useConfirm()
  const fam = c.familiar || {}
  const set = p => updateCharacter({ familiar: { ...fam, ...p } })
  async function removeFamiliar() {
    const ok = await confirm(`Remove the ${familiarName(c)} card and every effect on it?`,
      { title: 'Remove familiar', confirmLabel: 'Remove', dangerous: true })
    if (ok) updateCharacter({ familiar: null, active_effects: (c.active_effects || []).filter(e => e.target !== 'familiar') })
  }
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'flex-end' }}>
        <div style={{ flex: 1 }}>
          <div style={label10}>Name</div>
          <input value={fam.name || ''} onChange={e => set({ name: e.target.value })} placeholder="Familiar" style={{ width: '100%' }} />
        </div>
        <button onClick={removeFamiliar} title="Remove familiar card" style={btn('var(--text3)')}>Remove</button>
      </div>
      <div style={{ marginBottom: 10 }}>
        <div style={label10}>Notes</div>
        <input value={fam.notes || ''} onChange={e => set({ notes: e.target.value })}
          placeholder="e.g. Investiture I — AT 3, +10 DB/OB; self spells can be cast on it" style={{ width: '100%' }} />
      </div>
      <EffectList c={c} updateCharacter={updateCharacter} fixedTarget="familiar"
        filter={e => e.target === 'familiar'}
        emptyText={`No spells on ${familiarName(c)}.`} />
      {confirmEl}
    </div>
  )
}
