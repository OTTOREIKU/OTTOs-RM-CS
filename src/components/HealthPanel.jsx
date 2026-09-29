// Hits (a.k.a. concussion hits), injuries, stun and bleeding tracker.
// Rules: Core Law ch.13 + RMU injury/hit-loss-penalty.js — see utils/calc.js.
import React, { useState } from 'react'
import { XIcon, PlusIcon } from './Icons.jsx'
import {
  getHitsMax, getHitsCurrent, getHitLossPenalty, getConditionPenalty,
  getBleedPerRound, getHealthStatus,
} from '../utils/calc.js'
import { advanceTime } from '../utils/time.js'

const STUN_TIERS = [{ i: 0, label: '−25' }, { i: 1, label: '−50' }, { i: 2, label: '−75' }]

// Core Law 8.1 / 9.5-9.8 reminders for each condition
const CONDITIONS = [
  { key: 'prone',      label: 'Prone',       note: 'Stand up: 2 AP (1 AP with Acrobatics). Attacking from prone −50. Foes: melee +30 vs you, ranged −30.' },
  { key: 'staggered',  label: 'Staggered',   note: 'Lose your next AP. Clears next round.' },
  { key: 'surprised',  label: 'Surprised',   note: 'Lose your first 2 AP (1 with a Perception roll). No shield DB. Foes +25. Clears next round.' },
  { key: 'flatfooted', label: 'Flat-footed', note: 'No actions this round. No Quickness DB or shield. Foes +60 in melee. Clears next round.' },
]

function btn(color, filled = false) {
  return {
    background: filled ? color : 'transparent', color: filled ? '#fff' : color,
    border: `1px solid ${color}`, borderRadius: 6, padding: '5px 10px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}

const label10 = { fontSize: 10, color: 'var(--text3)', marginBottom: 3 }

// Table 13-1a: severity from the penalty or the bleed rate, whichever is worse.
function severity(inj) {
  const p = -(Number(inj.penalty) || 0)
  const b = Number(inj.bleed) || 0
  if (p > 40 || b >= 7) return { label: 'Severe', color: 'var(--danger)' }
  if (p > 20 || b >= 4) return { label: 'Medium', color: '#f97316' }
  if (p > 0  || b > 0)  return { label: 'Light',  color: '#eab308' }
  return null
}

/** Applies a hit change; returning to full hits stores null (= auto/full). */
function setHits(c, updateCharacter, next) {
  const max = getHitsMax(c)
  const clamped = Math.min(max, next)
  updateCharacter({ hits_current: clamped >= max ? null : clamped })
}

// ── Hits box (sits beside Power Points) ─────────────────────────────────────

export function HitsBox({ c, updateCharacter, autoHitsMax, bleedTalent }) {
  const [amount, setAmount] = useState('')
  const max     = getHitsMax(c)
  const cur     = getHitsCurrent(c)
  const lost    = Math.max(0, max - cur)
  const pct     = max ? Math.round((lost * 100) / max) : 0
  const hitLoss = getHitLossPenalty(c)
  const { status, deathAt } = getHealthStatus(c)
  const n = Math.abs(Number(amount) || 0)

  const statusBadge = status === 'dead'
    ? { text: 'DEAD', color: 'var(--danger)' }
    : status === 'unconscious' ? { text: 'UNCONSCIOUS', color: '#f97316' } : null

  return (
    <div style={{ background: 'var(--surface2)', border: '1px solid ' + (statusBadge ? statusBadge.color : 'var(--border)'), borderRadius: 10, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--danger)', textTransform: 'uppercase', letterSpacing: '0.08em' }}
          title="Concussion hits — pain, injury and hold on consciousness (Core Law 13.1)">Concussion Hits</div>
        {bleedTalent !== 0 && (
          <span style={{ fontSize: 9, fontWeight: 700, padding: '1px 6px', borderRadius: 10,
            background: bleedTalent < 0 ? 'var(--success)' : 'var(--danger)', color: '#fff' }}
            title={bleedTalent < 0 ? 'Slow Bleeder: each bleeding wound bleeds less' : 'Rapid Bleeder: each bleeding wound bleeds more'}>
            {bleedTalent > 0 ? '+' : ''}{bleedTalent}/rnd per wound
          </span>
        )}
        {statusBadge && (
          <span style={{ fontSize: 9, fontWeight: 800, padding: '1px 6px', borderRadius: 10, background: statusBadge.color, color: '#fff', letterSpacing: '0.06em' }}>
            {statusBadge.text}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1 }}>
          <div style={label10}>Current</div>
          <input type="number"
            value={c.hits_current ?? ''}
            placeholder={String(max ?? '—')}
            onChange={e => updateCharacter({ hits_current: e.target.value === '' ? null : Number(e.target.value) })}
            style={{ width: '100%', fontSize: 28, fontWeight: 800, textAlign: 'center', padding: '4px 2px',
              color: cur <= 0 ? 'var(--danger)' : hitLoss < 0 ? '#f97316' : 'var(--text)',
              background: 'transparent', border: 'none', boxShadow: 'none' }} />
        </div>
        <div style={{ fontSize: 22, color: 'var(--text3)', fontWeight: 300, alignSelf: 'center', paddingTop: 16 }}>/</div>
        <div style={{ flex: 1 }}>
          <div style={label10}>Max</div>
          <input type="number"
            value={c.hits_max ?? ''}
            placeholder={String(autoHitsMax ?? '—')}
            onChange={e => updateCharacter({ hits_max: e.target.value === '' ? null : Number(e.target.value) })}
            style={{ width: '100%', fontSize: 22, fontWeight: 700, textAlign: 'center', padding: '4px 2px',
              color: c.hits_max != null ? 'var(--text)' : 'var(--text3)',
              background: 'transparent', border: 'none', boxShadow: 'none' }} />
          {c.hits_max == null && <div style={{ fontSize: 8, color: 'var(--accent)', textAlign: 'center', letterSpacing: '0.06em' }}>AUTO</div>}
        </div>
      </div>

      {/* Hit loss summary */}
      <div style={{ fontSize: 11, color: 'var(--text3)', textAlign: 'center', margin: '4px 0 10px' }}>
        {lost > 0
          ? <>Lost {lost} ({pct}%) · <span style={{ color: hitLoss < 0 ? '#f97316' : 'var(--text3)', fontWeight: 700 }}>
              {hitLoss < 0 ? `${hitLoss} to all actions` : 'no penalty yet'}</span></>
          : 'Unhurt'}
        <span title="Death when negative hits exceed the Body Development bonus"> · dies at {deathAt}</span>
      </div>

      {/* Damage / heal */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="number" min={0} value={amount} placeholder="Hits"
          onChange={e => setAmount(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && n) { setHits(c, updateCharacter, cur - n); setAmount('') } }}
          style={{ flex: 1, minWidth: 0, textAlign: 'center' }} />
        <button disabled={!n} style={{ ...btn('var(--danger)', true), opacity: n ? 1 : 0.5 }}
          onClick={() => { setHits(c, updateCharacter, cur - n); setAmount('') }}>Damage</button>
        <button disabled={!n} style={{ ...btn('var(--success)'), opacity: n ? 1 : 0.5 }}
          onClick={() => { setHits(c, updateCharacter, cur + n); setAmount('') }}>Heal</button>
      </div>
    </div>
  )
}

// ── Injuries, stun & bleeding (full-width, below Hits/PP) ────────────────────

export function InjuriesPanel({ c, updateCharacter }) {
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ label: '', hits: '', penalty: '', bleed: '', stunRounds: '', stunTier: 0 })
  const injuries = c.injuries || []
  const stun     = c.stun || [0, 0, 0]
  const cond     = getConditionPenalty(c)
  const bleed    = getBleedPerRound(c)
  const stunned  = stun.some(r => r > 0)

  function patchInjury(id, patch) {
    updateCharacter({ injuries: injuries.map(i => (i.id === id ? { ...i, ...patch } : i)) })
  }
  function removeInjury(id) {
    updateCharacter({ injuries: injuries.filter(i => i.id !== id) })
  }
  function setStun(i, rounds) {
    const next = [...stun]; next[i] = Math.max(0, Number(rounds) || 0)
    updateCharacter({ stun: next })
  }

  // One "critical result" entry: hits + optional wound (penalty/bleed) + stun.
  function applyCritical() {
    const hits    = Math.abs(Number(form.hits) || 0)
    const penalty = -Math.abs(Number(form.penalty) || 0)
    const bleedV  = Math.abs(Number(form.bleed) || 0)
    const rounds  = Math.abs(Number(form.stunRounds) || 0)
    const patch = {}
    if (hits) {
      const max = getHitsMax(c)
      const next = getHitsCurrent(c) - hits
      patch.hits_current = next >= max ? null : next
    }
    if (penalty || bleedV) {
      patch.injuries = [...injuries, {
        id: Date.now().toString(36),
        label: form.label.trim() || 'Wound',
        penalty, bleed: bleedV,
      }]
    }
    if (rounds) {
      const next = [...stun]; next[form.stunTier] = (next[form.stunTier] ?? 0) + rounds
      patch.stun = next
    }
    if (Object.keys(patch).length) updateCharacter(patch)
    setForm({ label: '', hits: '', penalty: '', bleed: '', stunRounds: '', stunTier: 0 })
    setAdding(false)
  }

  // End of round: bleeding costs hits, every stun tier ticks down one round.
  // One round of game time: bleeding, stun (worst tier first), active effects.
  function nextRound() {
    updateCharacter(advanceTime(c, 1).patch)
  }

  const penaltyParts = [
    ['Hit loss', cond.hitLoss], ['Injuries', cond.injury], ['Stun', cond.stun], ['Fatigue', cond.fatigue], ['Grappled', cond.grapple],
  ].filter(([, v]) => v)
  const conds = c.conditions || {}
  const setCond = p => updateCharacter({ conditions: { ...conds, ...p } })

  return (
    <div style={{ marginTop: 12, background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 10, padding: '12px 14px' }}>
      {/* Summary row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#f97316', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Injuries & Stun</div>
        <span style={{ fontSize: 12, fontWeight: 800, color: cond.total < 0 ? 'var(--danger)' : 'var(--text3)' }}
          title="Applied to skills, OB and spellcasting. Initiative loses 1 per −10.">
          {cond.total < 0 ? `${cond.total} to all actions` : 'No penalty'}
        </span>
        {penaltyParts.length > 1 && (
          <span style={{ fontSize: 10, color: 'var(--text3)' }}>
            ({penaltyParts.map(([k, v]) => `${k} ${v}`).join(', ')})
          </span>
        )}
        {bleed > 0 && (
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--danger)' }}>Bleeding {bleed}/rd</span>
        )}
        <span style={{ flex: 1 }} />
        {(bleed > 0 || stunned || conds.staggered || conds.surprised || conds.flatfooted) && (
          <button style={btn('var(--accent)', true)} onClick={nextRound}
            title="Apply bleeding, count stun down (worst tier first) and tick active effects">Next round</button>
        )}
      </div>

      {/* Conditions */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 8 }}>
        {CONDITIONS.map(k => (
          <button key={k.key} onClick={() => setCond({ [k.key]: !conds[k.key] })} title={k.note}
            style={{ ...btn(conds[k.key] ? '#f97316' : 'var(--text3)', !!conds[k.key]), padding: '3px 9px' }}>
            {k.label}
          </button>
        ))}
        <label style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: conds.grapple > 0 ? '#f97316' : 'var(--text3)' }}
          title="Grappled: this % is a penalty to all your actions. Break free: 2-4 AP contested Wrestling or Contortions.">
          Grappled
          <input type="number" min={0} max={100} value={conds.grapple || ''} placeholder="0"
            onChange={e => setCond({ grapple: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })}
            style={{ width: 52, textAlign: 'center', padding: '2px 4px' }} />%
        </label>
      </div>
      {CONDITIONS.filter(k => conds[k.key]).map(k => (
        <div key={k.key} style={{ fontSize: 11, color: 'var(--text2)', marginBottom: 4 }}>
          <b style={{ color: '#f97316' }}>{k.label}:</b> {k.note}
        </div>
      ))}

      {/* Stun tiers */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', marginBottom: 10, flexWrap: 'wrap' }}>
        {STUN_TIERS.map(({ i, label }) => (
          <div key={i} style={{ width: 84 }}>
            <div style={label10}>Stun {label} (rds)</div>
            <input type="number" min={0} value={stun[i] || ''} placeholder="0"
              onChange={e => setStun(i, e.target.value)}
              style={{ width: '100%', textAlign: 'center', color: stun[i] > 0 ? '#eab308' : 'var(--text)', fontWeight: stun[i] > 0 ? 700 : 400 }} />
          </div>
        ))}
        {stunned && (
          <button style={btn('var(--text3)')} onClick={() => updateCharacter({ stun: [0, 0, 0] })}>Clear stun</button>
        )}
      </div>

      {/* Injury list */}
      {injuries.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px 60px 24px', gap: 6 }}>
            {['Injury', 'Penalty', 'Bleed/rd', '', ''].map((h, k) => <span key={k} style={label10}>{h}</span>)}
          </div>
          {injuries.map(inj => {
            const sev = severity(inj)
            return (
              <div key={inj.id} style={{ display: 'grid', gridTemplateColumns: '1fr 64px 64px 60px 24px', gap: 6, alignItems: 'center' }}>
                <input value={inj.label || ''} onChange={e => patchInjury(inj.id, { label: e.target.value })} placeholder="Wound" style={{ minWidth: 0 }} />
                <input type="number" value={inj.penalty || ''} placeholder="0"
                  onChange={e => patchInjury(inj.id, { penalty: -Math.abs(Number(e.target.value) || 0) })}
                  style={{ textAlign: 'center', color: inj.penalty < 0 ? 'var(--danger)' : 'var(--text)' }} />
                <input type="number" min={0} value={inj.bleed || ''} placeholder="0"
                  onChange={e => patchInjury(inj.id, { bleed: Math.abs(Number(e.target.value) || 0) })}
                  style={{ textAlign: 'center', color: inj.bleed > 0 ? 'var(--danger)' : 'var(--text)' }} />
                <span style={{ fontSize: 10, fontWeight: 700, color: sev?.color || 'var(--text3)' }}>{sev?.label || '—'}</span>
                <button onClick={() => removeInjury(inj.id)} title="Healed — remove"
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, display: 'flex' }}>
                  <XIcon size={12} color="var(--text3)" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Add critical / wound */}
      {adding ? (
        <div style={{ border: '1px dashed var(--border2)', borderRadius: 8, padding: 10 }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            Enter what the critical result says. Anything left blank is skipped.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: 8 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <div style={label10}>Description</div>
              <input value={form.label} onChange={e => setForm({ ...form, label: e.target.value })} placeholder="e.g. Slash to the thigh" style={{ width: '100%' }} />
            </div>
            <div><div style={label10}>Extra hits</div>
              <input type="number" min={0} value={form.hits} onChange={e => setForm({ ...form, hits: e.target.value })} style={{ width: '100%' }} /></div>
            <div><div style={label10}>Penalty (−)</div>
              <input type="number" min={0} value={form.penalty} onChange={e => setForm({ ...form, penalty: e.target.value })} style={{ width: '100%' }} /></div>
            <div><div style={label10}>Bleed / rd</div>
              <input type="number" min={0} value={form.bleed} onChange={e => setForm({ ...form, bleed: e.target.value })} style={{ width: '100%' }} /></div>
            <div><div style={label10}>Stun rounds</div>
              <input type="number" min={0} value={form.stunRounds} onChange={e => setForm({ ...form, stunRounds: e.target.value })} style={{ width: '100%' }} /></div>
            <div><div style={label10}>Stun severity</div>
              <select value={form.stunTier} onChange={e => setForm({ ...form, stunTier: Number(e.target.value) })} style={{ width: '100%' }}>
                {STUN_TIERS.map(t => <option key={t.i} value={t.i}>{t.label}</option>)}
              </select></div>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, justifyContent: 'flex-end' }}>
            <button style={btn('var(--text3)')} onClick={() => setAdding(false)}>Cancel</button>
            <button style={btn('var(--danger)', true)} onClick={applyCritical}>Apply</button>
          </div>
        </div>
      ) : (
        <button style={{ ...btn('var(--text2)'), display: 'flex', alignItems: 'center', gap: 5 }} onClick={() => setAdding(true)}>
          <PlusIcon size={11} color="currentColor" /> Add critical / wound
        </button>
      )}
    </div>
  )
}
