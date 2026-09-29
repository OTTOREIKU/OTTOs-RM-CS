// Cast dialog — itemized SCR modifiers for one spell, then spends the PP.
// Rules live in utils/casting.js; this file is only the UI.
import React, { useState, useMemo } from 'react'
import { XIcon } from './Icons.jsx'
import { getPowerPoints } from '../utils/calc.js'
import {
  getCastBreakdown, defaultCastOptions, interpretSCR, isSubconscious, isInstantaneous,
  HANDS_OPTIONS, VOICE_OPTIONS, PREP_OPTIONS, FAST_OPTIONS,
} from '../utils/casting.js'
import { parseSpellDuration, formatRounds, newEffectId, ROUNDS } from '../utils/time.js'
import { familiarName } from './ActiveEffects.jsx'

const signed = n => (n > 0 ? `+${n}` : `${n}`)
const label10 = { fontSize: 10, color: 'var(--text3)', marginBottom: 3, textTransform: 'uppercase', letterSpacing: '0.06em' }

function realmOf(char) {
  const r = (char?.realm || '').toLowerCase()
  return r.includes('essence') ? 'Essence' : r.includes('mental') ? 'Mentalism' : 'Channeling'
}

export default function CastModal({ char, listName, spell, updateCharacter, onClose }) {
  const [opts, setOpts]   = useState(() => defaultCastOptions(char, spell))
  const [cast, setCast]   = useState(null)   // { prevPP, afterPP } once PP are spent
  const [roll, setRoll]   = useState('')

  // Target + duration tracking
  const temporal = (char.talents || []).find(t => t.talent_id === 'temporal_skills' && t.param === listName)
  const durMult  = temporal ? 1 + 0.5 * (temporal.tier || 0) : 1
  const dur      = useMemo(() => parseSpellDuration(spell.duration, char.level ?? 1, durMult), [spell.duration, char.level, durMult])
  const [target, setTarget]   = useState('self')
  const [otherName, setOther] = useState('')
  const [track, setTrack]     = useState(dur.kind !== 'instant')
  const [manualAmt, setManualAmt]   = useState('')
  const [manualUnit, setManualUnit] = useState('minute')

  const bd      = useMemo(() => getCastBreakdown(char, listName, spell, opts), [char, listName, spell, opts])
  const realm   = realmOf(char)
  const ppMax   = getPowerPoints(char) ?? 0
  const ppNow   = char.power_points_current ?? ppMax
  const enoughPP = ppNow >= bd.ppCost
  const mute    = (char.talents || []).some(t => t.talent_id === 'mute')
  const prTier  = (char.talents || []).find(t => t.talent_id === 'power_recycling')?.tier ?? 0
  const sub     = isSubconscious(spell)

  const rollN   = roll === '' ? null : Number(roll)
  const result  = rollN == null || Number.isNaN(rollN) ? null : rollN + bd.total
  const outcome = result == null ? null : interpretSCR(result)

  function buildEffect() {
    const rounds = dur.kind === 'timed' ? dur.rounds
      : dur.kind === 'manual' && Number(manualAmt) > 0 ? Math.round(Number(manualAmt) * ROUNDS[manualUnit]) : null
    return {
      id: newEffectId(), name: spell.name.replace(/\s*\*\s*$/, ''), list: listName, level: spell.level,
      target: target === 'other' ? (otherName.trim() || 'Other') : target,
      remaining: rounds, total: rounds,
      concentration: dur.concentration || dur.kind === 'concentration', permanent: dur.kind === 'permanent',
    }
  }
  function spendPP() {
    const after = ppNow - bd.ppCost
    const patch = { power_points_current: after >= ppMax ? null : after }
    const eff = track && dur.kind !== 'instant' ? buildEffect() : null
    if (eff) patch.active_effects = [...(char.active_effects || []), eff]
    updateCharacter(patch)
    setCast({ prevPP: char.power_points_current ?? null, afterPP: after, effectId: eff?.id })
  }
  function undo() {
    const patch = { power_points_current: cast.prevPP }
    if (cast.effectId) patch.active_effects = (char.active_effects || []).filter(e => e.id !== cast.effectId)
    updateCharacter(patch)
    setCast(null)
    setRoll('')
  }
  function recycle() {
    const back = prTier >= 2 ? bd.ppCost : Math.floor(bd.ppCost / 2)
    const next = Math.min(ppMax, (cast?.afterPP ?? ppNow) + back)
    updateCharacter({ power_points_current: next >= ppMax ? null : next })
    setCast(c => ({ ...c, afterPP: next, recycled: back }))
  }

  const set = patch => setOpts(o => ({ ...o, ...patch }))
  const locked = !!cast   // options freeze once the spell is cast

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 9998, background: 'rgba(0,0,0,0.6)' }} />
      <div role="dialog" aria-modal="true" style={{
        position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)',
        zIndex: 9999, background: 'var(--surface)', border: '1px solid var(--border2)',
        borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        padding: '18px 20px', maxWidth: 440, width: '94vw', maxHeight: '90vh', overflowY: 'auto',
        fontSize: 13, color: 'var(--text)',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{spell.name}</div>
            <div style={{ fontSize: 11, color: 'var(--text3)' }}>
              {listName} · Level {spell.level} · Type {spell.type || '—'}
              {sub && ' · subconscious'}{isInstantaneous(spell) && ' · instantaneous'}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, display: 'flex' }}>
            <XIcon size={14} color="var(--text3)" />
          </button>
        </div>

        {/* Warnings */}
        {!bd.known && (
          <Warn color="var(--danger)">
            You don't know this spell: it needs {spell.level} ranks in {listName} (you have {char.spell_lists?.[listName]?.ranks ?? 0}).
          </Warn>
        )}
        {bd.overcast && (
          <Warn color="#f97316">
            Overcasting: this spell is level {spell.level} and you are level {char.level ?? 1}. That's −20 per level
            {isInstantaneous(spell) ? '.' : ', and it needs an extra round of preparation (+10, preselected below).'}
          </Warn>
        )}
        {mute && !sub && <Warn color="var(--danger)">Mute: you can only cast spells that need no voice (set Voice to Silent).</Warn>}

        {/* Options */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, opacity: locked ? 0.6 : 1 }}>
          <Opt label="Hands free">
            <select disabled={locked || sub} value={opts.hands} onChange={e => set({ hands: Number(e.target.value) })} style={{ width: '100%' }}>
              {HANDS_OPTIONS[realm].map(o => <option key={o.value} value={o.value}>{o.label} ({signed(o.mod)})</option>)}
            </select>
          </Opt>
          <Opt label="Voice">
            <select disabled={locked} value={opts.voice} onChange={e => set({ voice: e.target.value })} style={{ width: '100%' }}>
              {VOICE_OPTIONS[realm].map(o => <option key={o.value} value={o.value}>{o.label} ({signed(o.mod)})</option>)}
            </select>
          </Opt>
          <Opt label="Extra preparation">
            <select disabled={locked} value={opts.prep} onChange={e => set({ prep: Number(e.target.value) })} style={{ width: '100%' }}>
              {PREP_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({signed(o.mod)})</option>)}
            </select>
          </Opt>
          <Opt label="Fast casting">
            <select disabled={locked} value={opts.fast} onChange={e => set({ fast: Number(e.target.value) })} style={{ width: '100%' }}>
              {FAST_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label} ({signed(o.mod)})</option>)}
            </select>
          </Opt>
          <Opt label="Other modifier">
            <input disabled={locked} type="number" value={opts.other || ''} placeholder="0"
              onChange={e => set({ other: Number(e.target.value) || 0 })} style={{ width: '100%' }} />
          </Opt>
          <Opt label="Subtle casting">
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, height: 30 }}>
              <input disabled={locked} type="checkbox" checked={opts.subtle} onChange={e => set({ subtle: e.target.checked })} style={{ width: 'auto' }} />
              Hide the casting
            </label>
          </Opt>
        </div>

        {/* Target & duration */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 12, opacity: locked ? 0.6 : 1 }}>
          <Opt label="Target">
            <select disabled={locked} value={target} onChange={e => setTarget(e.target.value)} style={{ width: '100%' }}>
              <option value="self">{char.name || 'You'}</option>
              {char.familiar && <option value="familiar">{familiarName(char)}</option>}
              <option value="other">Someone else…</option>
            </select>
          </Opt>
          {target === 'other' ? (
            <Opt label="Who">
              <input disabled={locked} value={otherName} onChange={e => setOther(e.target.value)} placeholder="Name" style={{ width: '100%' }} />
            </Opt>
          ) : (
            <Opt label="Duration">
              <div style={{ fontSize: 12, padding: '6px 0', color: 'var(--text2)' }}>
                {dur.kind === 'timed' ? formatRounds(dur.rounds)
                  : dur.kind === 'concentration' ? 'while concentrating'
                  : dur.kind === 'permanent' ? 'permanent'
                  : dur.kind === 'instant' ? 'instant' : (spell.duration || 'varies')}
                {dur.concentration && dur.kind === 'timed' && ' (C)'}
                {durMult !== 1 && <span style={{ color: '#f59e0b' }}> ×{durMult} Temporal</span>}
              </div>
            </Opt>
          )}
          {dur.kind === 'manual' && track && (
            <Opt label={`Duration (${spell.duration || 'varies'})`}>
              <div style={{ display: 'flex', gap: 4 }}>
                <input disabled={locked} type="number" min={1} value={manualAmt} onChange={e => setManualAmt(e.target.value)} placeholder="#" style={{ width: 56 }} />
                <select disabled={locked} value={manualUnit} onChange={e => setManualUnit(e.target.value)}>
                  {['round', 'minute', 'hour', 'day'].map(u => <option key={u} value={u}>{u}s</option>)}
                </select>
              </div>
            </Opt>
          )}
          {dur.kind !== 'instant' && (
            <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text2)' }}>
              <input disabled={locked} type="checkbox" checked={track} onChange={e => setTrack(e.target.checked)} style={{ width: 'auto' }} />
              Track on Active Spells{target === 'familiar' && spell.range?.toLowerCase() === 'self' ? ' — self spell cast on the familiar (Investiture)' : ''}
            </label>
          )}
        </div>

        {/* Breakdown */}
        <div style={{ background: 'var(--surface2)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 12px', marginBottom: 12 }}>
          {bd.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', gap: 8, fontSize: 12, padding: '2px 0' }}>
              <span style={{ flex: 1, color: 'var(--text2)' }}>
                {l.label}{l.note && <span style={{ color: 'var(--text3)', fontSize: 10 }}> — {l.note}</span>}
              </span>
              <span style={{ fontWeight: 700, color: l.value < 0 ? 'var(--danger)' : l.value > 0 ? 'var(--success)' : 'var(--text3)' }}>
                {l.value === 0 && l.note ? '—' : signed(l.value)}
              </span>
            </div>
          ))}
          <div style={{ display: 'flex', alignItems: 'baseline', borderTop: '1px solid var(--border)', marginTop: 6, paddingTop: 6 }}>
            <span style={{ flex: 1, fontWeight: 700 }}>Add to your d100 (open-ended)</span>
            <span style={{ fontSize: 22, fontWeight: 800, color: bd.total >= 0 ? 'var(--success)' : 'var(--danger)' }}>{signed(bd.total)}</span>
          </div>
        </div>

        {/* Spell Mastery — separate roll to change the spell as it's cast (e.g. disguise it) */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, border: '1px dashed var(--border2)', borderRadius: 8, padding: '6px 12px', marginBottom: 12 }}
          title="Core Law 3.22: the list's full skill bonus is used for Spell Mastery — changing the spell when it is cast (shape, look, etc.). Includes professional bonus and knacks.">
          <span style={{ flex: 1, fontSize: 12, color: 'var(--text2)' }}>
            Spell Mastery <span style={{ color: 'var(--text3)', fontSize: 10 }}>— to disguise or alter the spell
              {bd.masteryPenalty < 0 ? ` (includes ${bd.masteryPenalty} condition)` : ''}</span>
          </span>
          <span style={{ fontSize: 16, fontWeight: 800, color: bd.mastery >= 0 ? 'var(--accent)' : 'var(--danger)' }}>{signed(bd.mastery)}</span>
        </div>

        {/* PP + cast */}
        {!cast ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ flex: 1, fontSize: 12, color: enoughPP ? 'var(--text2)' : 'var(--danger)' }}>
              Costs <b>{bd.ppCost} PP</b> · you have {ppNow}/{ppMax}
              {!enoughPP && ' — not enough'}
            </span>
            <button onClick={onClose} style={btnStyle('var(--text3)')}>Cancel</button>
            <button disabled={!enoughPP || !bd.known} onClick={spendPP}
              style={{ ...btnStyle('var(--purple)', true), opacity: enoughPP && bd.known ? 1 : 0.45 }}>
              Cast (−{bd.ppCost} PP)
            </button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, fontSize: 12 }}>
              <span style={{ flex: 1, color: 'var(--purple)', fontWeight: 700 }}>
                Cast: PP {ppNow + bd.ppCost - (cast.recycled ?? 0)} → {cast.afterPP}
                {cast.recycled ? ` (${cast.recycled} recovered)` : ''}
                {cast.effectId && <span style={{ color: 'var(--text3)', fontWeight: 400 }}> · tracking on Active Spells</span>}
              </span>
              <button onClick={undo} style={btnStyle('var(--text3)')}>Undo</button>
            </div>
            <Opt label="Your d100 roll (optional)">
              <input type="number" value={roll} onChange={e => setRoll(e.target.value)} placeholder="e.g. 57" autoFocus style={{ width: '100%' }} />
            </Opt>
            {outcome && (
              <div style={{ marginTop: 8, padding: '8px 10px', borderRadius: 8, border: `1px solid ${outcome.color}`, fontSize: 12 }}>
                <b style={{ color: outcome.color }}>{signed(result)}: {outcome.label}</b>
                {outcome.code === 'fail' && (
                  <div style={{ color: 'var(--text2)', marginTop: 4 }}>
                    Spell failure roll modifier: <b>{signed(bd.failureMod)}</b>
                    {prTier > 0 && !cast.recycled && (
                      <button onClick={recycle} style={{ ...btnStyle('var(--purple)'), marginLeft: 8 }}>
                        Power Recycling: recover {prTier >= 2 ? bd.ppCost : Math.floor(bd.ppCost / 2)} PP
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 12 }}>
              <button onClick={onClose} style={btnStyle('var(--accent)', true)}>Done</button>
            </div>
          </div>
        )}
      </div>
    </>
  )
}

function Opt({ label, children }) {
  return <div><div style={label10}>{label}</div>{children}</div>
}

function Warn({ color, children }) {
  return (
    <div style={{ fontSize: 12, color, border: `1px solid ${color}`, borderRadius: 8, padding: '6px 10px', marginBottom: 8, lineHeight: 1.45 }}>
      {children}
    </div>
  )
}

function btnStyle(color, filled = false) {
  return {
    background: filled ? color : 'transparent', color: filled ? '#fff' : color,
    border: `1px solid ${color}`, borderRadius: 8, padding: '6px 14px',
    fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
  }
}
