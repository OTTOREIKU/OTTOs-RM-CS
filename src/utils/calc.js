// Derived stat calculations for Rolemaster Unified
import statBonuses        from '../data/stat_bonuses.json'
import racesData          from '../data/races.json'
import talentsData        from '../data/talents.json'
import skillCategoryStats from '../data/skill_category_stats.json'
import skillsData         from '../data/skills.json'
import armorData          from '../data/armor.json'

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
  // Professional only when the player marked it (Core Law 2.4: 10 chosen skills).
  // The old prof_type default from the spreadsheet silently granted hidden bonuses.
  const isProf        = !!skillData?.proficient
  const profBonus     = isProf ? Math.min(ranks, 30) : 0
  const knackBonus    = displayName ? getKnackBonus(char, displayName) : 0
  const autoTalent    = displayName
    ? getSkillTalentBonus(char, displayName, template?.name, skillData?.talent_excluded || [])
    : 0
  return rb + catB + skillStatB + item + talent + autoTalent + profBonus + knackBonus
}

/**
 * Skill-targeted talent bonuses (skill_talent_bonus effects) for one skill,
 * exactly as the Skills tab applies them: matched on the resolved name
 * ("Melee: Blade"), else the template name; talents the player excluded on
 * that skill (skillData.talent_excluded) are skipped.
 */
export function getSkillTalentBonus(char, displayName, templateName, excluded = []) {
  const byName = {}
  for (const inst of (char.talents || [])) {
    const def = talentsData.find(t => t.id === inst.talent_id)
    for (const eff of def?.effects || []) {
      if (eff.type !== 'skill_talent_bonus') continue
      const targets = eff.skill === 'param'
        ? [inst.param, ...(inst.extra_params || [])].filter(Boolean)
        : (eff.skill ? [eff.skill] : [])
      const bonus = eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
      for (const t of targets) (byName[t] ||= []).push({ instId: inst.id, bonus })
    }
  }
  const entries = byName[displayName] || (templateName ? byName[templateName] : null) || []
  return entries.filter(e => !excluded.includes(e.instId)).reduce((s, e) => s + e.bonus, 0)
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

export function getRaceEntry(char) {
  return racesData.find(r => r.name === char?.race) || null
}

/** The race's stat bonuses as { Agility: n, … } (all 0 when unknown). */
export function getRaceStatBonuses(char) {
  return getRaceEntry(char)?.stat_bonuses || {}
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
/**
 * The character's skill entry behind a weapon: by key, else by label for
 * placeholder slots like "Melee: <weapon 1>" labelled "Blade".
 * Returns { skillKey, charSkillData } (both null when not found).
 */
export function resolveWeaponSkill(char, weapon) {
  const skillName = weapon?.skill_name || ''
  if (char.skills?.[skillName]) return { skillKey: skillName, charSkillData: char.skills[skillName] }
  const found = Object.entries(char.skills || {}).find(
    ([key, data]) => data?.label === skillName && key !== skillName
  )
  return found ? { skillKey: found[0], charSkillData: found[1] } : { skillKey: null, charSkillData: null }
}

/** Total ranks (incl. culture) in the weapon's skill — used for fumble reduction. */
export function getWeaponSkillRanks(char, weapon) {
  const { charSkillData } = resolveWeaponSkill(char, weapon)
  return (charSkillData?.ranks ?? 0) + (charSkillData?.culture_ranks ?? 0)
}

/** Two-handed melee weapons get +10 OB (Core Law Table 9-5). */
export function isTwoHandedMelee(weapon) {
  if ((weapon?.ob_type || 'melee') !== 'melee') return false
  return weapon?.handed === '2H' || /\(2H\)|two[- ]hand/i.test(weapon?.name || '')
}

export function getWeaponOB(char, weapon) {
  const { skillKey, charSkillData } = resolveWeaponSkill(char, weapon)
  const twoHanded = isTwoHandedMelee(weapon) ? 10 : 0
  const isRanged = weapon?.ob_type === 'ranged' || weapon?.ob_type === 'thrown' || /^ranged/i.test(weapon?.skill_name || '')
  const armorRanged = isRanged ? getArmorPenalties(char).ranged : 0

  // Find the template (for category + skill.stat lookup)
  const template = skillKey ? findSkillTemplate(skillKey) : null

  // If we have no template at all (weapon points at a skill we don't know),
  // fall back to legacy approximation so the weapon still shows *something*.
  if (!template) {
    const charSkill = charSkillData || {}
    const ranks = (charSkill.ranks ?? 0) + (charSkill.culture_ranks ?? 0)
    return rankBonus(ranks) + (weapon.item_bonus ?? 0) + twoHanded + armorRanged
  }

  // Resolved display name (used for knack matching, e.g. "Melee: Blade")
  const label = charSkillData?.label || ''
  const displayName = label
    ? (skillKey.includes('<') ? skillKey.replace(/<[^>]+>/, label) : `${skillKey}: ${label}`)
    : skillKey

  return getSkillBonus(char, template, charSkillData || {}, displayName)
    + (weapon.item_bonus ?? 0) + twoHanded + armorRanged
}

/**
 * Base Movement Rate in feet per round (Core Law 5.3 / 2.7; RMU movement.js):
 * 20' + ½ Quickness bonus (round up) + racial stride + stride talents.
 */
export function getBMR(char) {
  const qu = char.stats?.Quickness ? getTotalStatBonus(char.stats.Quickness) : 0
  const race = racesData.find(r => r.name === char.race)
  return 20 + Math.ceil(qu / 2) + (race?.frame?.stride ?? 0) + getTalentBonuses(char).stride
}

// App skill base → RMU skill name, the unit that professional bonuses and knacks
// attach to (Core Law 2.4: they cover all specializations). RMU's Language skill
// is specialized as spoken / written / signaled.
const RMU_SKILL_ALIAS = {
  'Spoken': 'Language', 'Written': 'Language', 'Signaled': 'Language',
  'Own Spoken': 'Language', 'Own Written': 'Language',
  'Melee': 'Melee Weapons', 'Ranged': 'Ranged Weapons', 'Directed Spells': 'Directed Spell',
}

/** "Spell Trickery: Dark Summons" → "Spell Trickery", "Spoken: Babbel" → "Language". */
export function rmuSkillName(appName) {
  const name = appName || ''
  const i = name.indexOf(':')
  const base = i > 0 ? name.slice(0, i).trim() : name
  return RMU_SKILL_ALIAS[base] || base
}

// Returns +5 if skillDisplayName is in the character's knack list, else 0.
// Pass the *resolved* display name (e.g. "Melee: Dagger"), same as stored in char.knacks.
export function getKnackBonus(char, skillDisplayName) {
  const knacks = char.knacks || []
  // Direct match (e.g. "Perception", "Melee: Blade")
  if (knacks.includes(skillDisplayName)) return 5
  // A knack covers every specialization of its skill (Core Law 2.4):
  // "Spell Trickery" → "Spell Trickery: Dark Summons", "Influence" → "Influence: Duping".
  const colon = (skillDisplayName || '').indexOf(':')
  if (colon > 0 && knacks.includes(skillDisplayName.slice(0, colon).trim())) return 5
  const rmuName = rmuSkillName(skillDisplayName)
  if (rmuName !== skillDisplayName && knacks.includes(rmuName)) return 5
  // Category match for spell lists:
  // A knack of "Spellcasting: Closed" applies to all Closed spell lists the character knows.
  const listData = (char.spell_lists || {})[skillDisplayName]
  if (listData) {
    const category = listData.category || 'Base'
    if (knacks.includes(`Spellcasting: ${category}`)) return 5
    // Lists store "Magic Ritual"; the knack picker offers RMU's "Magical Ritual".
    if (category === 'Magic Ritual' && knacks.includes('Spellcasting: Magical Ritual')) return 5
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
  const race = getRaceEntry(char)
  const result = {}
  for (const [type, statName] of Object.entries(RR_STATS)) {
    const stat = char.stats?.[statName]
    const statB     = stat ? getTotalStatBonus(stat) : 0
    const special   = char.rr_bonuses?.[type] ?? 0
    const realmBonus = realmType === type ? 10 : 0
    const raceB     = race?.[`${type}_rr`] ?? 0      // racial RR modifier (Core Law Table 2-2a)
    result[type] = statB + lvlBonus + realmBonus + raceB + special + (talentRR[type] ?? 0)
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
  const raceB     = getRaceEntry(char)?.[`${type}_rr`] ?? 0
  const talentB   = getTalentBonuses(char).rr[type] ?? 0
  return { statB, lvlBonus, realmBonus, raceB, talentB, special }
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

// SCR modifier by spell list type (RMU spells/prepare.js calculateSCRListModifier).
// Magic Ritual lists aren't cast with an SCR, so they get no modifier.
const SCR_LIST_TYPE_MOD = { Base: 5, Open: 0, Closed: -5, Arcane: -10, Restricted: -10, 'Magic Ritual': 0 }

export function getSCRListTypeModifier(char, listName) {
  const category = char.spell_lists?.[listName]?.category || 'Base'
  return SCR_LIST_TYPE_MOD[category] ?? 0
}

/**
 * Spellcasting Roll (SCR) modifier — what you add to d100OE when casting.
 * Formula (Core Law 3.22 + RMU): raw ranks + realm stat (×1) + list type
 * modifier + talent bonus + complementary. Knacks and the professional bonus
 * are NOT part of the SCR — they only raise the full skill bonus used for
 * Spell Mastery. Excludes situational modifiers (overcasting, armor,
 * condition) — see utils/casting.js.
 */
export function getSpellCastingBonus(char, listName) {
  const sl            = char.spell_lists?.[listName] || {}
  const rawRanks      = sl.ranks ?? 0
  const talentSpell   = getTalentBonuses(char).spellcasting
  const customTalent  = sl.talent_bonus ?? 0
  const namedTalent   = getNamedTalentBonus(char, listName)
  const compB         = _compBonus(char, sl)
  const listTypeB     = getSCRListTypeModifier(char, listName)
  return rawRanks + _realmStatBonus(char) + listTypeB + talentSpell + customTalent + namedTalent + compB
}

/** Itemized pieces of getSpellCastingBonus, for the Cast dialog. Sums to the same total. */
export function getSpellCastingBreakdown(char, listName) {
  const sl = char.spell_lists?.[listName] || {}
  return {
    ranks:    sl.ranks ?? 0,
    realmStat: _realmStatBonus(char),
    listType: getSCRListTypeModifier(char, listName),
    talents:  getTalentBonuses(char).spellcasting + (sl.talent_bonus ?? 0) + getNamedTalentBonus(char, listName),
    complementary: _compBonus(char, sl),
  }
}

/**
 * Spell Mastery modifier — the list's full skill bonus, rolled to change a
 * spell as it's cast (reshape it, disguise its look, etc.).
 * Formula (Core Law 3.22, verified): rank bonus + Spellcasting category
 * [RS + RS] + list skill stat [Me] + item + professional + knack + talents +
 * complementary. Eloquence/Mumbler are "Spellcasting roll" talents and apply
 * to the SCR only (RMU Foundry uses them only in the SCR).
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
  const compB        = _compBonus(char, sl)
  const knackB       = getKnackBonus(char, listName)
  return rb + rsB * 2 + meB + item + profB + customTalent + namedTalent + compB + knackB
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

// ── Hits, injuries & stun (Core Law ch.13; RMU injury/hit-loss-penalty.js) ──
//
// "Concussion hits" in RMU are the character's Hits. State lives on the char:
//   hits_current: number | null   (null = at full hits)
//   injuries:     [{ id, label, penalty (≤0), bleed (hits/rd ≥0) }]
//   stun:         [r25, r50, r75]  rounds remaining at each stun severity

/** Full Body Development skill bonus (the value that sets the death threshold). */
export function getBodyDevBonus(char) {
  const co = char.stats?.Constitution
  const sd = char.stats?.['Self Discipline']
  const coBonus = co ? getTotalStatBonus(co) : 0
  const sdBonus = sd ? getTotalStatBonus(sd) : 0
  const bdSkill = char.skills?.['Body Development'] || {}
  const bdRanks = (bdSkill.ranks ?? 0) + (bdSkill.culture_ranks ?? 0)
  const profB   = bdSkill.proficient ? Math.min(bdRanks, 30) : 0
  return rankBonus(bdRanks) + 2 * coBonus + sdBonus
    + (bdSkill.item_bonus ?? 0) + (bdSkill.talent_bonus ?? 0) + profB
}

export function getHitsMax(char) {
  return char.hits_max ?? getBaseHits(char)
}

export function getHitsCurrent(char) {
  return char.hits_current ?? getHitsMax(char)
}

/** RMU hit-loss penalty: 0 up to 25% lost, −10 to 50%, −20 to 75%, −30 beyond (and at ≤0 hits). */
export function getHitLossPenalty(char) {
  const max = getHitsMax(char)
  const cur = getHitsCurrent(char)
  if (cur <= 0) return -30
  if (!max) return 0
  const pct = Math.round(((max - cur) * 100) / max)
  if (pct <= 25) return 0
  if (pct <= 50) return -10
  if (pct <= 75) return -20
  return -30
}

/** Sum of per-injury penalties. Always ≤ 0. */
export function getInjuryPenalty(char) {
  return (char.injuries || []).reduce((sum, inj) => sum + Math.min(0, Number(inj.penalty) || 0), 0)
}

/** Stun penalty — only the worst active tier applies: −25 / −50 / −75. */
export function getStunPenalty(char) {
  const s = char.stun || [0, 0, 0]
  for (let i = 2; i >= 0; i--) if ((s[i] ?? 0) > 0) return (i + 1) * -25
  return 0
}

/**
 * Hits lost per round from bleeding. Slow/Rapid Bleeder talents adjust each
 * bleeding wound (never below 0 per wound).
 */
export function getBleedPerRound(char) {
  const perWound = getTalentBonuses(char).bleed
  return (char.injuries || []).reduce((sum, inj) => {
    const b = Number(inj.bleed) || 0
    return b > 0 ? sum + Math.max(0, b + perWound) : sum
  }, 0)
}

/**
 * Every penalty that applies to skills, OB and spellcasting from the
 * character's condition. `total` is always ≤ 0.
 */
export function getConditionPenalty(char) {
  const hitLoss = getHitLossPenalty(char)
  const injury  = getInjuryPenalty(char)
  const stun    = getStunPenalty(char)
  const fatigue = getFatiguePenalty(char)
  // Grappled %: a penalty to all actions (Core Law 9.8)
  const grapple = -Math.min(100, Math.max(0, Number(char.conditions?.grapple) || 0))
  return { hitLoss, injury, stun, fatigue, grapple, total: hitLoss + injury + stun + fatigue + grapple }
}

/** Initiative loses 1 per full −10 of condition penalty (RMU rounds the /10). */
export function getConditionInitiativePenalty(char) {
  return Math.round((getConditionPenalty(char).total + getEncumbrance(char).penalty) / 10)
}

/**
 * Unconscious at 0 or fewer hits. Dead once negative hits exceed the Body
 * Development bonus (+67 BD dies at −68).
 */
export function getHealthStatus(char) {
  const cur    = getHitsCurrent(char)
  const deathAt = -(Math.max(0, getBodyDevBonus(char)) + 1)
  if (cur <= deathAt) return { status: 'dead', deathAt }
  if (cur <= 0)       return { status: 'unconscious', deathAt }
  return { status: 'ok', deathAt }
}

/**
 * Sum of Table 5-5 situational modifiers for an Endurance roll (conditions only —
 * does NOT include base endurance, armor, or accumulated fatigue; those are added
 * separately so each component can be shown in the UI).
 */
/**
 * Fatigue recovery cap while short of food/water: the penalty can't recover
 * past half the deprivation penalty. null = no cap.
 */
export function getFatigueRecoveryCap(char) {
  const fc = char.fatigue_conditions || {}
  const dep = (fc.hours_no_water || 0) * 5 + (fc.days_no_food || 0) * 10 + Math.floor((fc.days_half_food || 0) / 3) * 10
  return dep > 0 ? -(dep / 2) : null
}

/** Fatigue penalty after resting N minutes (recovers 1 point per minute, Core Law 5.5). */
export function restFatiguePenalty(char, minutes) {
  const pen = char.fatigue?.penalty ?? 0
  const proposed = Math.min(0, pen + Math.max(0, minutes))
  const cap = getFatigueRecoveryCap(char)
  return cap !== null ? Math.min(proposed, cap) : proposed
}

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

// ── Armor penalties & encumbrance (Core Law 5.4 / 6; RMU armor.js, enc.js) ──

const ARMOR_PART_SLOT = { torso: 'torso', head: 'helmet', arms: 'vambraces', legs: 'greaves' }

function armorRow(part, at) {
  return (armorData[ARMOR_PART_SLOT[part]] || []).find(r => r.at === (at ?? 1)) || null
}

/** Full skill bonus of a single named skill (0 ranks → no offset). */
function namedSkillBonus(char, name) {
  const data = char.skills?.[name]
  const ranks = (data?.ranks ?? 0) + (data?.culture_ranks ?? 0)
  return ranks > 0 ? getSkillBonus(char, findSkillTemplate(name), data, name) : 0
}

/**
 * Summed armor penalties across worn pieces, plus weight as % of body weight.
 * `maneuver` is after Maneuvering in Armor (which offsets it up to its full size).
 */
export function getArmorPenalties(char) {
  const parts = char.armor_parts || {}
  let maneuverRaw = 0, ranged = 0, perception = 0, weightPct = 0
  for (const part of Object.keys(ARMOR_PART_SLOT)) {
    const row = armorRow(part, parts[part]?.at)
    if (!row) continue
    maneuverRaw += row.maneuver_penalty   || 0
    ranged      += row.ranged_penalty     || 0
    perception  += row.perception_penalty || 0
    weightPct   += row.weight_pct         || 0
  }
  const mia = Math.max(0, namedSkillBonus(char, 'Maneuvering in Armor'))
  const maneuver = Math.min(0, maneuverRaw + mia)
  return { maneuverRaw, maneuver, miaOffset: maneuver - maneuverRaw, ranged, perception, weightPct }
}

const NOT_CARRIED = ['Stored', 'Mount']

/** Weight carried in lbs: gear (not Stored/Mount), weapons, magic items, worn armor. */
export function getCarriedWeight(char) {
  const body = Number(char.weight) || 0
  const gear = (char.equipment || []).filter(e => !NOT_CARRIED.includes(e.location))
    .reduce((s, e) => s + (Number(e.weight) || 0) * (Number(e.qty) || 1), 0)
  const weapons = (char.weapons || []).reduce((s, w) => s + (Number(w.weight) || 0), 0)
  const magic   = (char.magic_items || []).reduce((s, m) => s + (Number(m.weight) || 0), 0)
  const armor   = body * getArmorPenalties(char).weightPct / 100
  return Math.round((gear + weapons + magic + armor) * 10) / 10
}

// Heaviest load (% of body weight) that still allows each pace (Core Law Table 5-3).
const PACE_MAX_LOAD = [['Dash', 15], ['Sprint', 30], ['Run', 45], ['Jog', 60], ['Walk', 90]]

/**
 * Encumbrance: penalty −1 per 1% of body weight carried over the allowance
 * (Core Law: −5 per 5%), and the fastest pace the load allows.
 * Returns nulls when body weight isn't set.
 */
export function getEncumbrance(char) {
  const body = Number(char.weight) || 0
  const carried = getCarriedWeight(char)
  const allowancePct = getWeightAllowance(char).pct
  if (!body) return { body: null, carried, loadPct: null, allowancePct, penalty: 0, maxPace: null }
  const loadPct = Math.round((carried / body) * 1000) / 10
  const penalty = Math.min(0, -Math.floor(loadPct - allowancePct))
  const maxPace = PACE_MAX_LOAD.find(([, max]) => loadPct <= max)?.[0] || 'Creep'
  return { body, carried, loadPct, allowancePct, penalty, maxPace }
}

// Categories that are NOT physical maneuvers: no armor/encumbrance penalty
// (RMU perform-skill-dialog.js), plus Combat Training (Core Law 5.1) and the
// casting/expertise categories, which have their own rules.
const NON_PHYSICAL = new Set([
  'Awareness', 'Composition', 'Crafting', 'Delving', 'Environmental', 'Lore', 'Lore: Languages',
  'Medical', 'Mental Discipline', 'Performance Art', 'Power Manipulation', 'Science', 'Social',
  'Vocation', 'Combat Training', 'Spellcasting', 'Magical Expertise',
])

/**
 * Armor + encumbrance penalty for a skill maneuver in `category`.
 * Perception takes the armor perception penalty instead; Fortitude is exempt.
 */
export function getMovementPenalty(char, category, skillName) {
  const base = (skillName || '').split(':')[0].trim()
  if (base === 'Perception') {
    const p = getArmorPenalties(char).perception
    return { armor: p, enc: 0, total: p }
  }
  if (NON_PHYSICAL.has(category) || base === 'Fortitude') return { armor: 0, enc: 0, total: 0 }
  const armor = getArmorPenalties(char).maneuver
  const enc = getEncumbrance(char).penalty
  return { armor, enc, total: armor + enc }
}

// ── Defense (Core Law 9.6; RMU db/db.js) ────────────────────────────────────

export const SHIELD_DB = { 'Target Shield': 15, 'Normal Shield': 20, 'Full Shield': 25, 'Wall Shield': 30 }
const COVER = { none: [0, 0], partial: [10, 20], half: [20, 40], full: [50, 100] }   // [melee, ranged]

/**
 * Full DB with the character's chosen defense (char.defense):
 *   dodge / block: 'none' | 'passive' | 'partial' | 'full'
 *   parry: OB moved to DB vs melee;  cover: 'none'|'partial'|'half'|'full', hardCover
 * Dodge uses Running; block uses Shield. Passive dodge and passive block don't
 * combine (the better one counts). Armor/encumbrance reduce dodge; injury
 * penalties reduce partial/full dodge and block. Dodge is halved vs ranged.
 * Returns { total, vsRanged, parts: { qu, talent, shield, dodge, parry, cover, coverRanged, armor, magic }, … }.
 */
export function getDefense(char) {
  const d     = char.defense || {}
  const cond  = char.conditions || {}
  const flat  = !!cond.flatfooted
  const shieldItem = char.armor_parts?.shield || {}
  const hasShield  = !!shieldItem.type && !flat && !cond.surprised
  const dodgeMode  = d.dodge ?? (shieldItem.type ? 'none' : 'passive')
  const blockMode  = hasShield ? (d.block ?? 'passive') : 'none'
  const injury     = getConditionPenalty(char).total
  const qu     = flat ? 0 : (char.stats?.Quickness ? getTotalStatBonus(char.stats.Quickness) : 0) * 3
  const talent = getTalentBonuses(char).db

  // Block (Shield skill)
  const shieldBase = hasShield ? (SHIELD_DB[shieldItem.type] ?? 0) + (shieldItem.db ?? 0) : 0
  const sData  = char.skills?.Shield
  const sRanks = (sData?.ranks ?? 0) + (sData?.culture_ranks ?? 0)
  const sBonus = sRanks > 0 ? namedSkillBonus(char, 'Shield') : 0
  let shield = shieldBase
  if (blockMode === 'passive') shield = Math.min(50, shieldBase + sRanks)
  if (blockMode === 'partial') shield = shieldBase + Math.max(0, Math.ceil(sBonus / 2) + injury)
  if (blockMode === 'full')    shield = shieldBase + Math.max(0, sBonus + injury)

  // Dodge (Running)
  const rData  = char.skills?.Running
  const rRanks = (rData?.ranks ?? 0) + (rData?.culture_ranks ?? 0)
  const rBonus = rRanks > 0 ? namedSkillBonus(char, 'Running') : 0
  const armorEnc = getArmorPenalties(char).maneuver + getEncumbrance(char).penalty
  let dodge = 0
  if (!flat) {
    if (dodgeMode === 'passive') dodge = Math.max(0, Math.min(50, rRanks) + armorEnc)
    if (dodgeMode === 'partial') dodge = Math.max(0, Math.ceil(rBonus / 2) + armorEnc + injury)
    if (dodgeMode === 'full')    dodge = Math.max(0, rBonus + armorEnc + injury)
  }
  // Passive dodge + passive block don't combine: keep the better
  if (dodgeMode === 'passive' && blockMode === 'passive') {
    if (dodge > shield - shieldBase) { shield = shieldBase } else { dodge = 0 }
  }

  const parry = Math.max(0, Number(d.parry) || 0)
  const [cm, cr] = COVER[d.cover || 'none'] || [0, 0]
  const hard = d.hardCover ? 2 : 1
  const armor = ['torso', 'head', 'arms', 'legs'].reduce((s, p) => s + (char.armor_parts?.[p]?.db ?? 0), 0)
  const magic = (char.magic_items || []).reduce((s, m) => s + (Number(m.db) || 0), 0)

  const common = qu + talent + shield + armor + magic
  return {
    total:    common + dodge + parry + cm * hard,
    vsRanged: common + Math.floor(dodge / 2) + cr * hard,
    parts: { qu, talent, shield, dodge, parry, cover: cm * hard, coverRanged: cr * hard, armor, magic },
    dodgeMode, blockMode, hasShield, rRanks, sRanks,
  }
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
