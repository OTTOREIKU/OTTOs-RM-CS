// Derived stat calculations for Rolemaster Unified
import statBonuses from '../data/stat_bonuses.json'
import racesData   from '../data/races.json'

export function getStatBonus(value) {
  const v = Math.max(1, Math.min(100, Math.round(value || 0)))
  return statBonuses[String(v)] ?? 0
}

export function getTotalStatBonus(stat) {
  // stat = { temp, potential, racial, special }
  const base = getStatBonus(stat.temp ?? 0)
  return base + (stat.racial ?? 0) + (stat.special ?? 0)
}

export function getDefensiveBonus(char) {
  const qu = char.stats?.Quickness
  const quBonus = qu ? getTotalStatBonus(qu) : 0
  return quBonus * 3
}

export function getInitiativeBonus(char) {
  const qu = char.stats?.Quickness
  return qu ? getTotalStatBonus(qu) : 0
}

export function getRankBonus(ranks) {
  // RMU rank bonus table
  if (!ranks || ranks <= 0) return -25
  const table = [
    [1,1,5],[2,5,10],[6,10,15],[11,15,20],[16,20,25],
    [21,25,30],[26,30,35],[31,40,45],[41,50,55],[51,60,60],
    [61,75,70],[76,90,80],[91,100,95],
  ]
  for (const [lo, hi, bonus] of table) {
    if (ranks >= lo && ranks <= hi) {
      const step = (bonus - (lo === 1 ? 5 : table[table.indexOf(table.find(r=>r[0]===lo))-1]?.[2] ?? 5)) / (hi - lo + 1)
      return Math.round((lo === 1 ? 5 : (table[table.indexOf(table.find(r=>r[0]===lo))-1]?.[2] ?? 5)) + step * (ranks - lo))
    }
  }
  return 95 + Math.floor((ranks - 100) / 10) * 5
}

// Rank bonus per CoreLaw Table 3-0b:
//   0 ranks → -25 (untrained penalty)
//   Ranks  1-10 → +5 each  (max +50 at rank 10)
//   Ranks 11-20 → +3 each  (max +80 at rank 20)
//   Ranks 21-30 → +2 each  (max +100 at rank 30)
//   Ranks 31+   → +1 each
export function rankBonus(ranks) {
  if (!ranks || ranks <= 0) return -25
  if (ranks <= 10) return ranks * 5
  if (ranks <= 20) return 50 + (ranks - 10) * 3
  if (ranks <= 30) return 80 + (ranks - 20) * 2
  return 100 + (ranks - 30)
}

export function getSkillTotal(char, skill, statBonusesMap) {
  // skill = { category, name, stat_keys, dev_cost }
  // char.skills[name] = { ranks, culture_ranks, item_bonus, talent_bonus }
  const charSkill = char.skills?.[skill.name] || {}
  const ranks = (charSkill.ranks ?? 0) + (charSkill.culture_ranks ?? 0)
  const rb = rankBonus(ranks)

  // Calculate combined stat bonus from skill's stat keys
  let statSum = 0
  if (skill.stat_keys && char.stats) {
    const keys = skill.stat_keys.split('/').map(k => k.trim())
    const STAT_MAP = {
      Ag: 'Agility', Co: 'Constitution', Em: 'Empathy', In: 'Intuition',
      Me: 'Memory', Pr: 'Presence', Qu: 'Quickness', Re: 'Reasoning',
      SD: 'Self Discipline', St: 'Strength'
    }
    const bonuses = keys.map(k => {
      const fullName = STAT_MAP[k] || k
      const stat = char.stats[fullName]
      return stat ? getTotalStatBonus(stat) : 0
    })
    statSum = bonuses.length === 1
      ? bonuses[0]
      : Math.round(bonuses.reduce((a, b) => a + b, 0) / bonuses.length)
  }

  return rb + statSum + (charSkill.item_bonus ?? 0) + (charSkill.talent_bonus ?? 0)
}

const OB_STATS = {
  melee:   ['Agility', 'Strength'],
  ranged:  ['Agility', 'Quickness'],
  unarmed: ['Agility', 'Strength'],
}

export function getWeaponOB(char, weapon) {
  const stats = OB_STATS[weapon.ob_type || 'melee'] || OB_STATS.melee
  const statBonus = Math.round(stats.reduce((sum, s) => {
    const st = char.stats?.[s]
    return sum + (st ? getTotalStatBonus(st) : 0)
  }, 0) / stats.length)

  const skillName = weapon.skill_name || ''
  // Exact key match (e.g. legacy flat skill like "Blade")
  let charSkill = char.skills?.[skillName] || null
  // Fallback: scan template slots whose label matches (Combat Training template skills like "Melee: <weapon 1>")
  if (!charSkill || (!(charSkill.ranks ?? 0) && !(charSkill.culture_ranks ?? 0))) {
    const found = Object.entries(char.skills || {}).find(
      ([key, data]) => data.label === skillName && key !== skillName
    )
    if (found) charSkill = found[1]
  }
  charSkill = charSkill || {}
  const ranks = (charSkill.ranks ?? 0) + (charSkill.culture_ranks ?? 0)
  const rb = ranks > 0 ? rankBonus(ranks) : 0

  return statBonus + rb + (weapon.item_bonus ?? 0)
}

export function getResistanceBonuses(char) {
  const level = char.level ?? 1
  const lvlBonus = level * 2
  const RR_STATS = {
    channeling: 'Intuition',
    essence:    'Empathy',
    mentalism:  'Presence',
    physical:   'Constitution',
    fear:       'Self Discipline',
  }
  const result = {}
  for (const [type, statName] of Object.entries(RR_STATS)) {
    const stat = char.stats?.[statName]
    const statB = stat ? getTotalStatBonus(stat) : 0
    const special = char.rr_bonuses?.[type] ?? 0
    result[type] = statB + lvlBonus + special
  }
  return result
}

export function getSpellCastingBonus(char, listName) {
  const sl = char.spell_lists?.[listName]
  const ranks = sl?.ranks ?? 0
  const rb = rankBonus(ranks)
  // Realm stat bonus
  // Per CoreLaw: Channeling→Intuition, Essence→Empathy, Mentalism→Presence
  // spell_cast_stat on character allows house-rule override (full stat name, e.g. 'Empathy')
  const realmStatMap = {
    Channeling: 'Intuition',
    Essence:    'Empathy',
    Mentalism:  'Presence',
  }
  const statName = char.spell_cast_stat ?? realmStatMap[char.realm]
  const statBonus = statName && char.stats?.[statName]
    ? getTotalStatBonus(char.stats[statName])
    : 0
  return rb + statBonus
}

export function getBaseHits(char) {
  // HP = Race base_hits + Body Development skill bonus
  // Brawn category stats: Co + SD (summed); Body Dev individual stat: Co
  // Total stat contribution = coBonus + sdBonus + coBonus  →  2×Co + SD
  const raceEntry  = racesData.find(r => r.name === char.race)
  const racialBase = raceEntry?.base_hits ?? 25
  const co = char.stats?.Constitution
  const sd = char.stats?.['Self Discipline']
  const coBonus = co ? getTotalStatBonus(co) : 0
  const sdBonus = sd ? getTotalStatBonus(sd) : 0
  const bdSkill   = char.skills?.['Body Development'] || {}
  const bdRanks   = (bdSkill.ranks ?? 0) + (bdSkill.culture_ranks ?? 0)
  const rb        = rankBonus(bdRanks)
  const statBonus = 2 * coBonus + sdBonus
  const itemB     = bdSkill.item_bonus   ?? 0
  const talentB   = bdSkill.talent_bonus ?? 0
  const profB     = bdSkill.proficient ? Math.min(bdRanks, 30) : 0
  return racialBase + rb + statBonus + itemB + talentB + profB
}

export function getEndurance(char) {
  // Racial base endurance from races.json (can be manually overridden on sheet)
  const raceEntry = racesData.find(r => r.name === char.race)
  return raceEntry?.endurance ?? 0
}

export function getPowerPoints(char) {
  if (char.power_points_max !== null && char.power_points_max !== undefined) return char.power_points_max
  // PP = Power Development skill bonus (the full skill total IS the PP pool)
  // Power Manipulation category stats: RS + RS (summed); Power Dev individual stat: Co
  // Total stat contribution = rsBonus + rsBonus + coBonus  →  2×RS + Co
  const realmStatMap = { Channeling: 'Intuition', Essence: 'Empathy', Mentalism: 'Presence' }
  const rsName = char.spell_cast_stat ?? realmStatMap[char.realm]
  if (!rsName) return null    // no realm selected
  const rsstat = char.stats?.[rsName]
  const co     = char.stats?.Constitution
  const rsBonus = rsstat ? getTotalStatBonus(rsstat) : 0
  const coBonus = co     ? getTotalStatBonus(co)     : 0
  const pdSkill   = char.skills?.['Power Development'] || {}
  const pdRanks   = (pdSkill.ranks ?? 0) + (pdSkill.culture_ranks ?? 0)
  const rb        = rankBonus(pdRanks)
  const statBonus = 2 * rsBonus + coBonus
  const itemB     = pdSkill.item_bonus   ?? 0
  const talentB   = pdSkill.talent_bonus ?? 0
  const profB     = pdSkill.proficient ? Math.min(pdRanks, 30) : 0
  return Math.max(0, rb + statBonus + itemB + talentB + profB)
}
