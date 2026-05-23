// Derived stat calculations for Rolemaster Unified
import statBonuses        from '../data/stat_bonuses.json'
import racesData          from '../data/races.json'
import talentsData        from '../data/talents.json'
import skillCategoryStats from '../data/skill_category_stats.json'
import skillsData         from '../data/skills.json'

// ── Stat key utilities ─────────────────────────────────────────────────────
//
// Stat keys use 2-letter abbreviations matching RMU (Ag, Co, Em, …) plus 'RS'
// (= realm stat, resolved via char.realm) and '-' (no contribution).

const STAT_ABBR_TO_FULL = {
  Ag: 'Agility', Co: 'Constitution', Em: 'Empathy', In: 'Intuition',
  Me: 'Memory',  Pr: 'Presence',     Qu: 'Quickness', Re: 'Reasoning',
  SD: 'Self Discipline', St: 'Strength',
}

// Maps a realm name to its primary stat (per CoreLaw Table 3-0a footnote).
function realmToStatAbbr(realm) {
  const r = (realm || '').toLowerCase()
  if (r.includes('channel')) return 'In'
  if (r.includes('essence')) return 'Em'
  if (r.includes('mental'))  return 'Pr'
  return null
}

// Sum of stat bonuses for a slash-separated key string like "Ag/Em" or "RS/RS".
// '-' or empty returns 0. Each abbr looks up the character's stat bonus via
// getTotalStatBonus (which includes racial + special offsets).
export function sumStatBonuses(char, statKeys) {
  if (!statKeys || statKeys === '-') return 0
  const rsAbbr = realmToStatAbbr(char?.realm)
  return statKeys.split('/').reduce((sum, raw) => {
    const k = raw.trim()
    const abbr = k === 'RS' ? rsAbbr : k
    if (!abbr) return sum
    const full = STAT_ABBR_TO_FULL[abbr]
    const stat = full && char?.stats?.[full]
    return stat ? sum + getTotalStatBonus(stat) : sum
  }, 0)
}

// The category-stat contribution for a given skill category.
// (Skill category stats are SUMMED with the skill's own stat per RMU.)
export function getCategoryStatBonus(char, category) {
  return sumStatBonuses(char, skillCategoryStats[category] || '-')
}

// Find the skill template by exact name. Returns null if not found.
export function findSkillTemplate(name) {
  return skillsData.find(s => s.name === name) || null
}

// Full RMU skill bonus = rankBonus + skill.stat + category stats + item + talent +
//   prof (min(ranks,30)) + autoTalent + knack. Excludes fatigue penalty.
// `skillData` is the character's per-skill state ({ ranks, culture_ranks, item_bonus, talent_bonus, proficient, … }).
// Returns 0 if neither template nor skillData provided.
export function getSkillBonus(char, template, skillData, displayName) {
  if (!template && !skillData) return 0
  const ranks         = (skillData?.ranks ?? 0) + (skillData?.culture_ranks ?? 0)
  const rb            = rankBonus(ranks)
  const catB          = template?.category ? getCategoryStatBonus(char, template.category) : 0
  const skillStatB    = sumStatBonuses(char, template?.stat_keys || '-')
  const item          = skillData?.item_bonus   ?? 0
  const talent        = skillData?.talent_bonus ?? 0
  const isProf        = skillData?.proficient !== undefined
    ? !!skillData.proficient
    : (template?.prof_type === 'Professional' || template?.prof_type === 'Knack')
  const profBonus     = isProf ? Math.min(ranks, 30) : 0
  const knackBonus    = displayName ? getKnackBonus(char, displayName) : 0
  return rb + catB + skillStatB + item + talent + profBonus + knackBonus
}

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

// Weapon OB = full skill bonus (rb + skill.stat + categoryStats + bonuses)
// + the weapon's magical/quality bonus.
//
// Per RMU, weapon attacks use the corresponding Combat Training skill
// (e.g. "Melee: Blade"), whose bonus already includes 2×Ag + St for melee.
// This replaces an older approximation that averaged Ag/St only.
//
// Untrained weapons inherit the -25 rank bonus penalty automatically (no
// special case here — rankBonus(0) returns -25 for category-stat skills).
export function getWeaponOB(char, weapon) {
  const skillName = weapon.skill_name || ''

  // Find the character's skill entry, falling back to label match for
  // placeholder skills like "Melee: <weapon 1>" with label "Blade".
  let skillKey = null
  let charSkillData = char.skills?.[skillName] || null
  if (charSkillData) {
    skillKey = skillName
  } else {
    const found = Object.entries(char.skills || {}).find(
      ([key, data]) => data?.label === skillName && key !== skillName
    )
    if (found) {
      skillKey = found[0]
      charSkillData = found[1]
    }
  }

  // Find the template (for category + skill.stat lookup)
  const template = skillKey ? findSkillTemplate(skillKey) : null

  // If we have no template at all (weapon points at a skill we don't know),
  // fall back to legacy approximation so the weapon still shows *something*.
  if (!template) {
    const charSkill = charSkillData || {}
    const ranks = (charSkill.ranks ?? 0) + (charSkill.culture_ranks ?? 0)
    return rankBonus(ranks) + (weapon.item_bonus ?? 0)
  }

  // Resolved display name (used for knack matching, e.g. "Melee: Blade")
  const label = charSkillData?.label || ''
  const displayName = label
    ? (skillKey.includes('<') ? skillKey.replace(/<[^>]+>/, label) : `${skillKey}: ${label}`)
    : skillKey

  return getSkillBonus(char, template, charSkillData || {}, displayName)
    + (weapon.item_bonus ?? 0)
}

// Returns +5 if skillDisplayName is in the character's knack list, else 0.
// Pass the *resolved* display name (e.g. "Melee: Dagger"), same as stored in char.knacks.
export function getKnackBonus(char, skillDisplayName) {
  const knacks = char.knacks || []
  // Direct match (e.g. "Perception", "Melee: Blade")
  if (knacks.includes(skillDisplayName)) return 5
  // Category match for spell lists:
  // A knack of "Spellcasting: Closed" applies to all Closed spell lists the character knows.
  const listData = (char.spell_lists || {})[skillDisplayName]
  if (listData) {
    const category = listData.category || 'Base'
    if (knacks.includes(`Spellcasting: ${category}`)) return 5
  }
  return 0
}

// Per CoreLaw: a character trained in a Realm receives +10 to RRs vs. that realm's magic.
const REALM_RR_TYPE = { Channeling: 'channeling', Essence: 'essence', Mentalism: 'mentalism' }

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
  // Realm bonus: +10 to the RR type matching the character's realm
  const realmType = char.realm ? (REALM_RR_TYPE[char.realm] || null) : null
  const talentRR = getTalentBonuses(char).rr
  const result = {}
  for (const [type, statName] of Object.entries(RR_STATS)) {
    const stat = char.stats?.[statName]
    const statB     = stat ? getTotalStatBonus(stat) : 0
    const special   = char.rr_bonuses?.[type] ?? 0
    const realmBonus = realmType === type ? 10 : 0
    result[type] = statB + lvlBonus + realmBonus + special + (talentRR[type] ?? 0)
  }
  return result
}

// Returns just the breakdown for a single RR type (used in UI tooltips).
export function getRRBreakdown(char, type) {
  const RR_STATS = { channeling:'Intuition', essence:'Empathy', mentalism:'Presence', physical:'Constitution', fear:'Self Discipline' }
  const statName  = RR_STATS[type] || ''
  const stat      = char.stats?.[statName]
  const statB     = stat ? getTotalStatBonus(stat) : 0
  const lvlBonus  = (char.level ?? 1) * 2
  const realmType = char.realm ? (REALM_RR_TYPE[char.realm] || null) : null
  const realmBonus = realmType === type ? 10 : 0
  const special   = char.rr_bonuses?.[type] ?? 0
  return { statB, lvlBonus, realmBonus, special }
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
  const knackB        = getKnackBonus(char, listName)
  return rawRanks + _realmStatBonus(char) + talentSpell + customTalent + namedTalent + compB + knackB
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
  const knackB       = getKnackBonus(char, listName)
  return rb + rsB * 2 + meB + item + profB + talentSpell + customTalent + namedTalent + compB + knackB
}

// RMU CreatureSize.hitMultiplier table from systems/rmu/module/rmu/size.js.
// Values are percentages — 100 = Medium baseline.
const SIZE_HIT_MULT = {
  Minuscule:  0.25, Diminutive: 0.50, Tiny:       0.67,
  Small:      0.75, Medium:     1.00, Big:        1.50,
  Large:      2.00, Huge:       3.00, Gigantic:   4.00,
  Enormous:   5.00, Immense:    6.00, Behemoth:   7.00, Leviathan: 8.00,
}

function getSizeHitMultiplier(char) {
  const raceEntry = racesData.find(r => r.name === char.race)
  // Prefer the character's own appearance.size override if set
  const sizeName = char.size || raceEntry?.frame?.size || 'Medium'
  return SIZE_HIT_MULT[sizeName] ?? 1.0
}

export function getBaseHits(char) {
  // RMU: Base Hits = (race base + full Body-Development skill bonus) × size mult
  // BD skill bonus already includes Brawn category stats: cat=[Co,SD] + skill.stat=Co → 2×Co + SD
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
  const sizeMult  = getSizeHitMultiplier(char)
  const raw       = racialBase + rb + statBonus + itemB + talentB + profB + talentHits
  return Math.max(1, Math.floor(raw * sizeMult))
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
