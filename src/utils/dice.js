// Dice and roll-result tables (Core Law 5.1 / 5.6).

export function rollDie(sides) {
  return Math.floor(Math.random() * sides) + 1
}

/**
 * Open-ended d100: 96-100 rolls again and adds (repeating), 01-05 rolls
 * again and subtracts (the subtracted roll is itself open-ended upward).
 * Returns { total, first, rolls } — `first` is the unmodified roll (UM 66 etc.).
 */
export function rollD100OE() {
  const first = rollDie(100)
  const rolls = [first]
  let total = first
  if (first >= 96) {
    let r
    do { r = rollDie(100); rolls.push(r); total += r } while (r >= 96)
  } else if (first <= 5) {
    let sub = 0, r
    do { r = rollDie(100); rolls.push(-r); sub += r } while (r >= 96)
    total -= sub
  }
  return { total, first, rolls }
}

export const DIFFICULTIES = [
  { label: 'Casual', mod: 70 }, { label: 'Simple', mod: 50 }, { label: 'Routine', mod: 30 },
  { label: 'Easy', mod: 20 }, { label: 'Light', mod: 10 }, { label: 'Medium', mod: 0 },
  { label: 'Hard', mod: -10 }, { label: 'Very Hard', mod: -20 }, { label: 'Extremely Hard', mod: -30 },
  { label: 'Sheer Folly', mod: -50 }, { label: 'Absurd', mod: -70 }, { label: 'Nigh Impossible', mod: -100 },
]

/** Absolute maneuver result (Table 5-1). */
export function absoluteResult(total) {
  if (total < 1)    return { label: 'Absolute Failure', color: 'var(--danger)' }
  if (total <= 75)  return { label: 'Failure',          color: 'var(--danger)' }
  if (total <= 100) return { label: 'Partial Success',  color: '#f97316' }
  if (total <= 175) return { label: 'Success',          color: 'var(--success)' }
  return { label: 'Absolute Success', color: 'var(--success)' }
}

/** Percentage maneuver result (Table 5-1). */
export function percentageResult(total) {
  if (total <= -100) return { label: 'E critical (Unbalancing if moving)', color: 'var(--danger)' }
  if (total <= -80)  return { label: 'D critical (Unbalancing if moving)', color: 'var(--danger)' }
  if (total <= -60)  return { label: 'C critical (Unbalancing if moving)', color: 'var(--danger)' }
  if (total <= -40)  return { label: 'B critical (Unbalancing if moving)', color: 'var(--danger)' }
  if (total <= -20)  return { label: 'A critical (Unbalancing if moving)', color: 'var(--danger)' }
  if (total <= 0)    return { label: 'Fail to act', color: 'var(--danger)' }
  if (total <= 10)   return { label: '5% done', color: '#f97316' }
  if (total <= 100)  return { label: `${Math.floor((total - 1) / 10) * 10}% done`, color: '#f97316' }
  if (total <= 280)  return { label: `${100 + Math.floor((total - 101) / 30) * 10}% done`, color: 'var(--success)' }
  return { label: 'Exceptional Success (150% + advantage)', color: 'var(--success)' }
}

/** Resistance roll result: succeed on equal-or-exceed; failure bands per Core Law 5.6. */
export function resistanceResult(total, target) {
  if (total >= target) return { label: `Resisted (by ${total - target})`, color: 'var(--success)', failBy: 0 }
  const by = target - total
  const band = by <= 25 ? 'Mild' : by <= 50 ? 'Moderate' : by <= 99 ? 'Severe' : 'Extreme'
  return { label: `Failed by ${by} — ${band}`, color: 'var(--danger)', failBy: by }
}
