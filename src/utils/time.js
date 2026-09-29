// Game time: spell durations, active effects, and advancing the clock.
//
// A round is 5 seconds (Core Law ch.8): 12 rounds = 1 minute.
// Effects are stored on the character as
//   active_effects: [{ id, name, list?, level?, target, remaining, total, concentration, notes }]
// where `target` is 'self', 'familiar', or free text, and `remaining`/`total`
// are in rounds (null = no fixed end: concentration-only, permanent, or unknown).
import { getBleedPerRound, getHitsCurrent, getHitsMax } from './calc.js'

export const ROUNDS = { round: 1, minute: 12, hour: 720, day: 17280, week: 120960, month: 518400, year: 6307200 }

const UNIT_MAP = [
  [/^(rnds?|rounds?|rds?)$/, 'round'],
  [/^(mins?|minutes?)$/,     'minute'],
  [/^(hrs?|hours?)$/,        'hour'],
  [/^days?$/,                'day'],
  [/^(wks?|weeks?)$/,        'week'],
  [/^(mo|mon|months?)$/,     'month'],
  [/^years?$/,               'year'],
  [/^decades?$/,             'decade'],
]

function unitRounds(word) {
  for (const [re, unit] of UNIT_MAP) {
    if (re.test(word)) return unit === 'decade' ? ROUNDS.year * 10 : ROUNDS[unit]
  }
  return null
}

/**
 * Parse a spell's duration string for a caster of `casterLevel`.
 * Returns { kind, rounds, concentration } where kind is:
 *   'timed'         — rounds is the full duration
 *   'concentration' — lasts while you concentrate (no fixed end)
 *   'permanent'     — P
 *   'instant'       — "—": nothing to track
 *   'manual'        — varies / depends on RR failure / special: enter it yourself
 * `multiplier` scales timed durations (e.g. Temporal Skills talent).
 */
export function parseSpellDuration(raw, casterLevel = 1, multiplier = 1) {
  const s0 = (raw || '').trim().toLowerCase().replace(/ivl/g, 'lvl')
  const concentration = /\(c\)|\bor c\b/.test(s0) || s0 === 'c'
  const s = s0.replace(/\(c\)/g, '').replace(/\bor c\b/g, '').trim()

  if (!s || /^[—–-]+$/.test(s) || /^[—–-]{1,2}\s/.test(s)) return { kind: concentration ? 'concentration' : 'instant', rounds: null, concentration }
  if (s === 'c') return { kind: 'concentration', rounds: null, concentration: true }
  if (/^p\b/.test(s)) return { kind: 'permanent', rounds: null, concentration }
  if (/fail/.test(s)) return { kind: 'manual', rounds: null, concentration }   // per RR failure margin

  const m = s.match(/^(\d+)\s*([a-z]+)\s*(?:\/\s*(\d*)\s*lvl)?/)
  if (m) {
    const per = unitRounds(m[2])
    if (per) {
      let n = Number(m[1])
      if (/\/\s*\d*\s*lvl/.test(s)) {
        const every = Number(m[3]) || 1   // "1 rnd/5lvl" = per 5 levels
        n *= Math.max(1, Math.floor(Math.max(1, casterLevel) / every))
      }
      return { kind: 'timed', rounds: Math.round(n * per * multiplier), concentration }
    }
  }
  return { kind: concentration ? 'concentration' : 'manual', rounds: null, concentration }
}

/** "3 rnd", "4 min", "39 min 5 rnd", "23 h 59 min", "2 d 4 h". */
export function formatRounds(r) {
  if (r == null) return ''
  if (r <= 0) return 'ended'
  if (r < ROUNDS.minute) return `${r} rnd`
  if (r < ROUNDS.hour) {
    const min = Math.floor(r / ROUNDS.minute), rnd = r % ROUNDS.minute
    return rnd ? `${min} min ${rnd} rnd` : `${min} min`
  }
  if (r < ROUNDS.day) {
    const h = Math.floor(r / ROUNDS.hour), min = Math.floor((r % ROUNDS.hour) / ROUNDS.minute)
    return min ? `${h} h ${min} min` : `${h} h`
  }
  const d = Math.floor(r / ROUNDS.day), h = Math.floor((r % ROUNDS.day) / ROUNDS.hour)
  return h ? `${d} d ${h} h` : `${d} d`
}

export function newEffectId() {
  return `eff_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

/**
 * Stun wears off worst-first (Core Law 9.8): each round removes one round from
 * the most severe tier that still has rounds.
 */
export function tickStun(stun, rounds) {
  const s = [...(stun || [0, 0, 0])].map(v => Math.max(0, v || 0))
  let left = rounds
  for (let i = 2; i >= 0 && left > 0; i--) {
    const used = Math.min(s[i], left)
    s[i] -= used
    left -= used
  }
  return s
}

/**
 * Advance the clock by `rounds`: effects count down, stun wears off
 * worst-first, bleeding costs hits, stagger clears. Returns
 * { patch, bleedLoss, expired } — `patch` goes to updateCharacter.
 */
export function advanceTime(char, rounds) {
  const expired = []
  const active_effects = (char.active_effects || []).map(e => {
    if (e.remaining == null || e.remaining <= 0) return e
    const remaining = e.remaining - rounds
    if (remaining <= 0) expired.push(e)
    return { ...e, remaining }
  })
  const patch = { active_effects, stun: tickStun(char.stun, rounds) }
  const bleedLoss = getBleedPerRound(char) * rounds
  if (bleedLoss > 0) {
    const next = getHitsCurrent(char) - bleedLoss
    patch.hits_current = next >= getHitsMax(char) ? null : next
  }
  if (char.conditions?.staggered) patch.conditions = { ...char.conditions, staggered: false }
  return { patch, bleedLoss, expired }
}
