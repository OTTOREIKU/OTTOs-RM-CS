// Derived stat calculations for Rolemaster Unified
import statBonuses from '../data/stat_bonuses.json'
import racesData   from '../data/races.json'
import talentsData from '../data/talents.json'

// Aggregate all non-skill talent bonuses from a character's talent list.
// Returns: { spellcasting, db, hits, initiative, endurance, rr: { [realm]: bonus } }
export function getTalentBonuses(char) {
  const result = {
    spellcasting: 0, db: 0, hits: 0, initiative: 0, endurance: 0, rr: {},
    // Phase 2 additions
    stride: 0,       // increased/decreased_stride: metres/round bonus to BMR
    at: 0,           // natural_armor: AT bonus (all body parts)
    carry: 0,        // beast_of_burden: extra carry capacity in % of body weight
    bleed: 0,        // slow_bleeder (negative) / rapid_bleeder (positive): hits/round per wound
    size: 0,         // increased/decreased_size: character size tier modifier
    sizeHits: 0,     // light_boned: effective size for hit calculation only
    sizeAttack: 0,   // enhanced/lesser_attack: natural attack size modifier
    stat: {},        // superior/inferior_stat: { [statFullName]: flatBonus }
    elemental: {},   // elemental_resistance/susceptibility: { [element]: bonus }
  }
  for (const inst of (char.talents || [])) {
    const def = talentsData.find(t => t.id === inst.talent_id)
    if (!def?.effects) continue
    for (const eff of def.effects) {
      const val = eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
      if (!val) continue
      switch (eff.type) {
        case 'spellcasting_bonus': result.spellcasting += val; break
        case 'db_bonus':          result.db           += val; break
        case 'hits_bonus':        result.hits         += val; break
        case 'initiative_bonus':  result.initiative   += val; break
        case 'endurance_bonus':   result.endurance    += val; break
        case 'stride_bonus':      result.stride       += val; break
        case 'at_bonus':          result.at           += val; break
        case 'carry_bonus':       result.carry        += val; break
        case 'bleed_mod':         result.bleed        += val; break
        case 'size_mod': {
          const target = eff.target || 'size'
          if      (target === 'size')   result.size       += val
          else if (target === 'hits')   result.sizeHits   += val
          else if (target === 'attack') result.sizeAttack += val
          break
        }
        case 'stat_bonus': {
          // eff.stat === 'param' means use inst.param as the stat name
          const statName = eff.stat === 'param' ? (inst.param || '') : (eff.stat || '')
          if (statName) result.stat[statName] = (result.stat[statName] ?? 0) + val
          break
        }
        case 'elemental_bonus': {
          // eff.element === 'param' means use inst.param as the element name
          const elem = eff.element === 'param' ? (inst.param || '') : (eff.element || '')
          if (elem) result.elemental[elem] = (result.elemental[elem] ?? 0) + val
          break
        }
        case 'rr_bonus': {
          const realm = eff.realm === 'param'
            ? (inst.param || '').toLowerCase()
            : (eff.realm || '')
          if (realm) result.rr[realm] = (result.rr[realm] ?? 0) + val
          break
        }
      }
    }
  }
  return result
}

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
  const talentDB = getTalentBonuses(char).db
  return quBonus * 3 + talentDB
}

export function getInitiativeBonus(char) {
  const qu = char.stats?.Quickness
  const quBonus = qu ? getTotalStatBonus(qu) : 0
  const talentIni = getTalentBonuses(char).initiative
  return quBonus + talentIni
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
  const talentRR = getTalentBonuses(char).rr
  const result = {}
  for (const [type, statName] of Object.entries(RR_STATS)) {
    const stat = char.stats?.[statName]
    const statB = stat ? getTotalStatBonus(stat) : 0
    const special = char.rr_bonuses?.[type] ?? 0
    result[type] = statB + lvlBonus + special + (talentRR[type] ?? 0)
  }
  return result
}

// Per CoreLaw p.109: SCR uses raw rank count, NOT the scaled rank bonus.
// Complementary skill contributes its raw ranks (main) or floor(raw ranks / 2) (secondary).
function _realmStatBonus(char) {
  const realmStatMap = { Channeling: 'Intuition', Essence: 'Empathy', Mentalism: 'Presence' }
  const statName = char.spell_cast_stat ?? realmStatMap[char.realm]
  return statName && char.stats?.[statName] ? getTotalStatBonus(char.stats[statName]) : 0
}

/**
 * Sum of all skill_talent_bonus effects that explicitly target a given name
 * (checks inst.param and inst.extra_params). Used to apply skill-targeted
 * talent bonuses to spell lists when the list name is used as the param.
 */
export function getNamedTalentBonus(char, name) {
  if (!name) return 0
  let total = 0
  for (const inst of (char.talents || [])) {
    const def = talentsData.find(t => t.id === inst.talent_id)
    if (!def?.effects) continue
    for (const eff of def.effects) {
      if (eff.type !== 'skill_talent_bonus') continue
      const targets = eff.skill === 'param'
        ? [inst.param, ...(inst.extra_params || [])].filter(Boolean)
        : (eff.skill ? [eff.skill] : [])
      if (targets.includes(name)) {
        total += eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
      }
    }
  }
  return total
}

function _compBonus(char, sl) {
  const comp = sl?.complementary
  if (!comp?.skill) return 0
  const s = char.skills?.[comp.skill] || {}
  const rawRanks = (s.ranks ?? 0) + (s.culture_ranks ?? 0)
  return comp.type === 'secondary' ? Math.floor(rawRanks / 2) : rawRanks
}

/**
 * Spellcasting Roll (SCR) modifier — what you add to d100OE when casting.
 * Formula (CoreLaw p.109): raw ranks + realm stat (×1) + talent bonus + complementary
 */
export function getSpellCastingBonus(char, listName) {
  const sl            = char.spell_lists?.[listName] || {}
  const rawRanks      = sl.ranks ?? 0
  const talentSpell   = getTalentBonuses(char).spellcasting
  const customTalent  = sl.talent_bonus ?? 0
  const namedTalent   = getNamedTalentBonus(char, listName)
  const compB         = _compBonus(char, sl)
  return rawRanks + _realmStatBonus(char) + talentSpell + customTalent + namedTalent + compB
}

/**
 * Spell Mastery modifier — full skill bonus for shaping/modifying spells.
 * Formula: scaled rank bonus + (realm stat ×2 + Memory) + item + proficient + talent + complementary
 */
export function getSpellMasteryBonus(char, listName) {
  const sl           = char.spell_lists?.[listName] || {}
  const ranks        = sl.ranks ?? 0
  const rb           = rankBonus(ranks)
  const item         = sl.item_bonus  ?? 0
  const profB        = sl.proficient  ? Math.min(ranks, 30) : 0
  const customTalent = sl.talent_bonus ?? 0
  const namedTalent  = getNamedTalentBonus(char, listName)
  const rsB          = _realmStatBonus(char)
  const meB          = char.stats?.Memory ? getTotalStatBonus(char.stats.Memory) : 0
  const talentSpell  = getTalentBonuses(char).spellcasting
  const compB        = _compBonus(char, sl)
  return rb + rsB * 2 + meB + item + profB + talentSpell + customTalent + namedTalent + compB
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
  const talentHits = getTalentBonuses(char).hits
  return racialBase + rb + statBonus + itemB + talentB + profB + talentHits
}

export function getEndurance(char) {
  // CoreLaw p.74: Endurance = Body Development skill bonus + racial endurance modifier
  // The BD skill bonus is the same full-skill total used for base hits (rank bonus + stat + item + prof)
  // but WITHOUT the racial base_hits offset.
  //
  // Body Development is in the Brawn category (Co/SD), individual skill stat: Co
  // → stat contribution = 2×Co + SD  (matches getBaseHits)
  const co = char.stats?.Constitution
  const sd = char.stats?.['Self Discipline']
  const coBonus = co ? getTotalStatBonus(co) : 0
  const sdBonus = sd ? getTotalStatBonus(sd) : 0
  const bdSkill  = char.skills?.['Body Development'] || {}
  const bdRanks  = (bdSkill.ranks ?? 0) + (bdSkill.culture_ranks ?? 0)
  const rb       = rankBonus(bdRanks)
  const statBonus = 2 * coBonus + sdBonus
  const itemB    = bdSkill.item_bonus   ?? 0
  const talentB  = bdSkill.talent_bonus ?? 0
  const profB    = bdSkill.proficient ? Math.min(bdRanks, 30) : 0
  const bdBonus  = rb + statBonus + itemB + talentB + profB

  const raceEntry     = racesData.find(r => r.name === char.race)
  const racialEndurance = raceEntry?.endurance ?? 0
  const talentEndurance = getTalentBonuses(char).endurance
  return bdBonus + racialEndurance + talentEndurance
}

// ── Fatigue helpers (CoreLaw §5.5) ────────────────────────────────────────────

/** Total active penalty from fatigue (penalty + overflow injury). Always ≤ 0. */
export function getFatiguePenalty(char) {
  return (char.fatigue?.penalty ?? 0) + (char.fatigue?.injury ?? 0)
}

/**
 * Sum of Table 5-5 situational modifiers for an Endurance roll (conditions only —
 * does NOT include base endurance, armor, or accumulated fatigue; those are added
 * separately so each component can be shown in the UI).
 */
export function getEnduranceConditionModifier(char) {
  const fc = char.fatigue_conditions || {}
  let mod = 0
  mod += (fc.days_no_sleep   || 0) * -20
  mod += (fc.days_half_sleep || 0) * -10
  mod += (fc.hours_no_water  || 0) * -5
  mod += (fc.days_no_food    || 0) * -10
  mod += Math.floor((fc.days_half_food || 0) / 3) * -10
  mod += Math.floor((fc.altitude_ft    || 0) / 2500) * -10
  mod += Math.floor((fc.temp_offset_f  || 0) / 5) * -5
  return mod
}

export function getWeightAllowance(char) {
  const st = char.stats?.Strength
  const stBonus = st ? getTotalStatBonus(st) : 0
  const carryBonus = getTalentBonuses(char).carry ?? 0
  const pct = 15 + (2 * stBonus) + carryBonus
  const lbs = char.weight ? Math.round(pct * Number(char.weight) / 100) : null
  return { pct, lbs, carryBonus }
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
