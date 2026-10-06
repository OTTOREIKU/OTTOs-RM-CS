// Derived stat calculations for Rolemaster Unified
import statBonuses        from '../data/stat_bonuses.json'
import racesData          from '../data/races.json'
import talentsData        from '../data/talents.json'
import skillCategoryStats from '../data/skill_category_stats.json'
import skillsData         from '../data/skills.json'
import armorData          from '../data/armor.json'
import spellListsData     from '../data/spell_lists.json'
import weaponsData        from '../data/weapons.json'

// ── Profession (including a per-character homebrew profession) ───────────────
//
// A homebrew profession (e.g. a DM's custom class) lives only on the character,
// never in professions.json, so other players don't see it as a choice:
//   char.custom_profession = { name, realm?, cost_profession, base_lists: [LIST KEY],
//                              professional_skills: [{ skillCategory, skillName }], source? }
// It applies while char.profession equals its name.

export function getCustomProfession(char) {
  const cp = char?.custom_profession
  return cp?.name && (!char.profession || char.profession === cp.name) ? cp : null
}

/** Profession whose development costs apply (a homebrew profession borrows another's). */
export function getCostProfession(char) {
  const cp = getCustomProfession(char)
  return cp ? (cp.cost_profession || 'No Profession') : (char?.profession || '')
}

/** Is this one of the character's own base lists (homebrew list, or "<Profession> Base")? */
export function isOwnBaseList(char, listName, list) {
  const cp = getCustomProfession(char)
  if (cp) return (cp.base_lists || []).some(l => String(l).toUpperCase() === String(listName || '').toUpperCase())
  const sec = (list?.section || '').toLowerCase()
  return !!char?.profession && sec === `${char.profession.toLowerCase()} base`
}

/** A spell list's type for this character: the stored type, else the default below. */
export function getListCategory(char, listName) {
  return char?.spell_lists?.[listName]?.category || defaultListCategory(char, listName, spellListsData[listName])
}

/** List type for a list bought for the first time: own base lists are Base; other
 *  professions' base lists and Evil lists are Restricted. */
export function defaultListCategory(char, listName, list) {
  if (isOwnBaseList(char, listName, list)) return 'Base'
  const sec = (list?.section || '').toLowerCase()
  if (sec.startsWith('open'))   return 'Open'
  if (sec.startsWith('closed')) return 'Closed'
  if (sec.includes('evil') || sec.includes('base')) return 'Restricted'
  return 'Base'
}

// ── Stat key utilities ─────────────────────────────────────────────────────
//
// Stat keys use 2-letter abbreviations matching RMU (Ag, Co, Em, …) plus 'RS'
// (= realm stat, resolved via char.realm) and '-' (no contribution).

const STAT_ABBR_TO_FULL = {
  Ag: 'Agility', Co: 'Constitution', Em: 'Empathy', In: 'Intuition',
  Me: 'Memory',  Pr: 'Presence',     Qu: 'Quickness', Re: 'Reasoning',
  SD: 'Self Discipline', St: 'Strength',
}

// ── Realms and the realm stat ───────────────────────────────────────────────
// Channeling → Intuition, Essence → Empathy, Mentalism → Presence (Core Law 3.22).
// Hybrid casters ("Channeling/Essence", Foundry "Channeling,Essence") use the
// LOWER of their realm stats (Spell Law 4.2) and get the own-realm RR bonus vs
// each of their realms. `char.spell_cast_stat` overrides the realm stat.
export const REALM_STAT = { Channeling: 'Intuition', Essence: 'Empathy', Mentalism: 'Presence' }

/** The character's realms: [] (none), ['Essence'], or two for a hybrid. */
export function getRealms(char) {
  const parts = String(char?.realm || '').split(/[,/&+]|\band\b/i).map(s => s.trim().toLowerCase()).filter(Boolean)
  const out = []
  for (const p of parts) {
    const realm = p.startsWith('channel') ? 'Channeling' : p.startsWith('essence') ? 'Essence' : p.startsWith('mental') ? 'Mentalism' : null
    if (realm && !out.includes(realm)) out.push(realm)
  }
  return out
}

/** Full name of the stat used as the realm stat (null when no realm). */
export function getRealmStatName(char) {
  if (char?.spell_cast_stat && char.stats?.[char.spell_cast_stat]) return char.spell_cast_stat
  const stats = getRealms(char).map(r => REALM_STAT[r])
  if (!stats.length) return null
  return stats.reduce((lo, s) => (getCharStatBonus(char, s) < getCharStatBonus(char, lo) ? s : lo))
}

export function getRealmStatBonus(char) {
  const name = getRealmStatName(char)
  return name ? getCharStatBonus(char, name) : 0
}

/**
 * A stat's full bonus for this character: table value of the temp stat + racial
 * + special + Superior/Inferior Stat talents (+1/−1 per tier, Core Law ch.4).
 * Talents the race already has are part of the race's stat bonuses (see
 * getTalentInstances), so only extra tiers count here.
 */
export function getCharStatBonus(char, statName) {
  const s = char?.stats?.[statName]
  if (!s) return 0
  return getTotalStatBonus(s) + (getTalentBonuses(char).stat[statName] ?? 0)
}

// Sum of stat bonuses for a slash-separated key string like "Ag/Em" or "RS/RS".
// '-' or empty returns 0. 'RS' is the realm stat.
export function sumStatBonuses(char, statKeys) {
  if (!statKeys || statKeys === '-') return 0
  return statKeys.split('/').reduce((sum, raw) => {
    const k = raw.trim()
    const full = k === 'RS' ? getRealmStatName(char) : STAT_ABBR_TO_FULL[k]
    return full ? sum + getCharStatBonus(char, full) : sum
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

// ── Skills: one calculation for every screen ────────────────────────────────
//
// Full RMU skill bonus (Core Law 2.7 / 3; RMU skills/skill-bonus.js):
//   rank bonus + category stats + skill stat (summed) + professional (+1/rank,
//   max 30) + knack (+5) + item + talent field + skill-targeted talents.
// Condition, armor and encumbrance penalties are situational and added by the
// caller (getSkillRollPenalty).

const num = v => Number(v) || 0

/** "Melee: <weapon 1>" + "Blade" → "Melee: Blade"; "Perception" + "Hearing" → "Perception: Hearing". */
export function skillDisplayName(templateName, label) {
  if (!label) return templateName
  if (/<[^>]+>/.test(templateName || '')) return templateName.replace(/<[^>]+>/, label)
  return `${templateName}: ${label}`
}

// Talent target matching. A target with no colon names a whole skill and covers
// every specialization ("Perception", "Influence", "Ranged Weapons"); Prodigy and
// Inept always cover the whole skill (Core Law ch.4).
const ALL_SPECS_TALENTS = new Set(['prodigy', 'inept'])
function skillTargetMatches(target, displayName, templateName, allSpecs) {
  const t = String(target || '').trim().toLowerCase()
  if (!t) return false
  const disp = String(displayName || '').toLowerCase()
  const tpl = String(templateName || '').toLowerCase()
  if (t === disp || t === tpl) return true
  const rmuT = rmuSkillName(target).toLowerCase()
  const rmuS = rmuSkillName(templateName || displayName).toLowerCase()
  if (!t.includes(':')) {
    if (disp.startsWith(t + ':') || tpl.startsWith(t + ':')) return true
    if (rmuT === rmuS) return true
  }
  return allSpecs && rmuT === rmuS
}

/**
 * Skill-targeted talent effects (skill_talent_bonus) for one skill row.
 * Situational talents (RMU marks them: senses, Light Sleeper, Golden Throat…)
 * only count where the row opts in (data.talent_included) — or when you picked
 * this skill as the talent's own target (param / extra lists). Others count
 * unless excluded on the row (data.talent_excluded).
 * Returns { applied, entries: [{ instId, talentId, name, bonus, situational, applied, source }] }.
 */
export function getSkillTalentInfo(char, displayName, templateName, data = {}) {
  const excluded = data?.talent_excluded || []
  const included = data?.talent_included || []
  const entries = []
  for (const inst of getTalentInstances(char)) {
    for (const eff of inst.def.effects || []) {
      if (eff.type !== 'skill_talent_bonus') continue
      const explicit = eff.skill === 'param'
      const targets = explicit ? [inst.param, ...(inst.extra_params || [])].filter(Boolean) : (eff.skill ? [eff.skill] : [])
      const allSpecs = ALL_SPECS_TALENTS.has(inst.def.id)
      if (!targets.some(t => skillTargetMatches(t, displayName, templateName, allSpecs))) continue
      const bonus = eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
      const situational = !!(eff.situational || inst.situational) && !explicit
      const applied = situational ? included.includes(inst.id) : !excluded.includes(inst.id)
      entries.push({ instId: inst.id, talentId: inst.def.id, name: inst.def.name, bonus, situational, applied, source: inst.source })
    }
  }
  return { applied: entries.filter(e => e.applied).reduce((s, e) => s + e.bonus, 0), entries }
}

/** Back-compat: applied skill-talent total for one skill. */
export function getSkillTalentBonus(char, displayName, templateName, excluded = []) {
  return getSkillTalentInfo(char, displayName, templateName, { talent_excluded: excluded }).applied
}

// ── Professional skills (Core Law 2.4) ───────────────────────────────────────
// A professional skill covers every specialization of the RMU skill, and a
// spell list type ("Base") covers every list of that type. Picks are kept as RMU
// skill names in char.professional_skills; older saves flagged single entries
// (`proficient`), which still count for the whole skill.
const PROF_ALIAS = { 'Magic Ritual': 'Magical Ritual' }
const profKey = n => PROF_ALIAS[n] || n
const _profCache = new WeakMap()

export function getProfessionalSet(char) {
  if (!char) return new Set()
  if (_profCache.has(char)) return _profCache.get(char)
  const set = new Set((char.professional_skills || []).map(profKey))
  for (const [k, d] of Object.entries(char.skills || {})) if (d?.proficient) set.add(profKey(rmuSkillName(k)))
  for (const cs of char.custom_skills || []) if (cs?.proficient) set.add(profKey(rmuSkillName(cs.template_name)))
  for (const [k, l] of Object.entries(char.spell_lists || {})) if (l?.proficient) set.add(profKey(getListCategory(char, k)))
  _profCache.set(char, set)
  return set
}

export function isProfessionalSkill(char, templateName) {
  return getProfessionalSet(char).has(profKey(rmuSkillName(templateName)))
}

/** Is this RMU skill name (or list type) one of the character's professional skills? */
export function isProfessionalName(char, rmuName) {
  return getProfessionalSet(char).has(profKey(rmuName))
}

export function isProfessionalList(char, listName) {
  return getProfessionalSet(char).has(profKey(getListCategory(char, listName)))
}

/**
 * Patch that makes an RMU skill (or list type) professional or not: updates
 * char.professional_skills and clears the old per-entry flags in that group.
 */
export function professionalPatch(char, rmuName, on) {
  const key = profKey(rmuName)
  const list = new Set((char.professional_skills || []).map(profKey))
  if (on) list.add(key); else list.delete(key)
  const patch = { professional_skills: [...list] }
  const inGroup = k => profKey(rmuSkillName(k)) === key
  if (Object.entries(char.skills || {}).some(([k, d]) => d?.proficient && inGroup(k))) {
    patch.skills = Object.fromEntries(Object.entries(char.skills).map(([k, d]) => [k, d?.proficient && inGroup(k) ? { ...d, proficient: false } : d]))
  }
  if ((char.custom_skills || []).some(cs => cs?.proficient && inGroup(cs.template_name))) {
    patch.custom_skills = char.custom_skills.map(cs => cs?.proficient && inGroup(cs.template_name) ? { ...cs, proficient: false } : cs)
  }
  if (Object.entries(char.spell_lists || {}).some(([k, l]) => l?.proficient && profKey(getListCategory(char, k)) === key)) {
    patch.spell_lists = Object.fromEntries(Object.entries(char.spell_lists).map(([k, l]) => [k, l?.proficient && profKey(getListCategory(char, k)) === key ? { ...l, proficient: false } : l]))
  }
  return patch
}

/**
 * Every part of a skill's bonus. `templateName` is the skills.json name
 * ("Melee: <weapon 1>"), `data` the character's entry (template slot or custom
 * skill), `displayName` the resolved name ("Melee: Blade") if already known.
 */
export function getSkillBreakdown(char, templateName, data = {}, displayName) {
  const tpl = templateName ? findSkillTemplate(templateName) : null
  const category = tpl?.category || null
  const catStats = category ? (skillCategoryStats[category] || '-') : '-'
  const ranks = num(data?.ranks), culture = num(data?.culture_ranks)
  const totalRanks = ranks + culture
  const rb = rankBonus(totalRanks, catStats)
  const catStat = sumStatBonuses(char, catStats)
  const skillStat = sumStatBonuses(char, tpl?.stat_keys || '-')
  const name = displayName || skillDisplayName(templateName, data?.label)
  const prof = templateName ? isProfessionalSkill(char, templateName) : !!data?.proficient
  const profBonus = prof ? Math.min(totalRanks, 30) : 0
  const knack = name ? getKnackBonus(char, name) : 0
  const item = num(data?.item_bonus), talentField = num(data?.talent_bonus)
  const talents = getSkillTalentInfo(char, name, templateName, data)
  const total = rb + catStat + skillStat + profBonus + knack + item + talentField + talents.applied
  return {
    category, ranks, culture, totalRanks, rankBonus: rb, catStat, skillStat, stat: catStat + skillStat,
    prof, profBonus, knack, item, talentField, talentAuto: talents.applied, talentEntries: talents.entries,
    total, displayName: name,
  }
}

// Full RMU skill bonus for a template + the character's entry. Excludes the
// condition/armor/encumbrance penalties (see getSkillRollPenalty).
export function getSkillBonus(char, template, skillData, displayName) {
  if (!template && !skillData) return 0
  return getSkillBreakdown(char, template?.name || null, skillData || {}, displayName).total
}

/** Penalties on a maneuver with a skill: condition + armor/encumbrance (physical skills). */
export function getSkillRollPenalty(char, templateName) {
  const tpl = findSkillTemplate(templateName)
  const cond = getConditionPenalty(char).total
  const move = getMovementPenalty(char, tpl?.category, templateName).total
  return { condition: cond, movement: move, total: cond + move }
}

/** Find the character's entry for a skill by key or label (template slots, then custom skills). */
export function findCharSkill(char, nameOrLabel) {
  const want = String(nameOrLabel || '').trim()
  if (!want) return null
  if (char.skills?.[want]) return { templateName: want, data: char.skills[want], displayName: skillDisplayName(want, char.skills[want].label) }
  const lw = want.toLowerCase()
  for (const [k, d] of Object.entries(char.skills || {})) {
    if ((d?.label && d.label.toLowerCase() === lw) || skillDisplayName(k, d?.label).toLowerCase() === lw) return { templateName: k, data: d, displayName: skillDisplayName(k, d?.label) }
  }
  for (const cs of char.custom_skills || []) {
    if ((cs.label && cs.label.toLowerCase() === lw) || skillDisplayName(cs.template_name, cs.label).toLowerCase() === lw) return { templateName: cs.template_name, data: cs, displayName: skillDisplayName(cs.template_name, cs.label), custom: true }
  }
  return null
}

// ── Talents: the character's own plus their race's ──────────────────────────
// Racial talents apply automatically (Fair Elf Defensive Aura, Troll Natural
// Armor, Avinarc Light-boned, elven Efficient Sleeper…), except those already
// built into the race data — base hits (Tough/Fragile), frame size, stat
// bonuses, RR values. For those, only tiers the character has beyond the race's
// own count apply (RMU pc.js talentOffset). A talent the character also has
// themselves is counted once (their own entry wins).
const RACE_BAKED = new Set([
  'tough', 'fragile', 'increased_size', 'decreased_size', 'superior_stat', 'inferior_stat',
  'magical_resistance', 'magical_vulnerability', 'physical_resistance', 'physical_vulnerability',
])
const talentByName = (() => {
  const m = new Map()
  for (const t of talentsData) for (const n of [t.name, t.rmu_canonical_name]) if (n) m.set(n.toLowerCase(), t)
  return m
})()

function racialParam(rt, def) {
  for (const o of rt.overrides || []) {
    if (o.key === 'skill' && o.skillName) return o.skillSpecialization ? `${o.skillName}: ${o.skillSpecialization}` : o.skillName
    if (o.key === 'resistance' && o.value) return o.value
  }
  return def.param ? null : (rt.param ?? null)
}

const _instCache = new WeakMap()
export function getTalentInstances(char) {
  if (!char) return []
  if (_instCache.has(char)) return _instCache.get(char)
  const racial = []
  for (const rt of getRaceEntry(char)?.racial_talents || []) {
    const def = talentByName.get(String(rt.name || '').toLowerCase())
    if (!def) continue
    racial.push({ def, tier: Number(rt.tier) || 1, param: racialParam(rt, def), situational: (rt.overrides || []).some(o => o.situational === true || (o.key === 'situational' && String(o.value) === 'true')) })
  }
  const out = []
  for (const inst of char.talents || []) {
    const def = talentsData.find(t => t.id === inst.talent_id)
    if (!def) continue
    let tier = Number(inst.tier) || 1
    if (RACE_BAKED.has(def.id)) {
      const raceTier = racial.filter(r => r.def.id === def.id && (!inst.param || !r.param || String(r.param).toLowerCase() === String(inst.param).toLowerCase()))
        .reduce((s, r) => s + r.tier, 0)
      tier = Math.max(0, tier - raceTier)
    }
    if (tier > 0) out.push({ ...inst, tier, def, source: 'char' })
  }
  racial.forEach((r, i) => {
    if (RACE_BAKED.has(r.def.id)) return
    if ((char.talents || []).some(t => t.talent_id === r.def.id && (!r.param || !t.param || String(t.param).toLowerCase() === String(r.param).toLowerCase()))) return
    if (r.def.param && !r.param) return   // needs a target the race data doesn't give
    out.push({ id: `race_${r.def.id}_${i}`, talent_id: r.def.id, tier: r.tier, param: r.param, situational: r.situational, def: r.def, source: 'race' })
  })
  _instCache.set(char, out)
  return out
}

// Aggregate all non-skill talent bonuses (own + racial, see getTalentInstances).
// Returns: { spellcasting, db, hits, initiative, endurance, rr: { [realm]: bonus }, … }
const _tbCache = new WeakMap()
export function getTalentBonuses(char) {
  if (char && _tbCache.has(char)) return _tbCache.get(char)
  const result = {
    spellcasting: 0, db: 0, hits: 0, initiative: 0, endurance: 0, rr: {}, rrSituational: [],
    stride: 0,       // increased/decreased_stride: feet/round on BMR
    at: 0,           // natural_armor: AT tiers
    carry: 0,        // beast_of_burden: extra carry allowance, % of body weight (not for dodging)
    bleed: 0,        // slow/rapid_bleeder: hits/round per wound
    size: 0,         // increased/decreased_size: size steps
    sizeHits: 0,     // light_boned: size steps for concussion hits only
    sizeAttack: 0,   // enhanced/lesser_attack: natural attack size steps
    stat: {},        // superior/inferior_stat: { [statFullName]: bonus }
    elemental: {},   // elemental_resistance/susceptibility: { [element]: bonus }
    sleep: 0,        // efficient (+) / restless (−) sleeper tier, for rest recovery
    bmrBase: null,   // walking quadrupedal: base movement rate
  }
  for (const inst of getTalentInstances(char)) {
    const def = inst.def
    for (const eff of def.effects || []) {
      const val = eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
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
        case 'sleep_mod':         result.sleep        += val; break
        case 'bmr_base':          result.bmrBase = Math.max(result.bmrBase ?? 0, eff.flat ?? 0); break
        case 'size_mod': {
          const target = eff.target || 'size'
          if      (target === 'size')   result.size       += val
          else if (target === 'hits')   result.sizeHits   += val
          else if (target === 'attack') result.sizeAttack += val
          break
        }
        case 'stat_bonus': {
          const statName = eff.stat === 'param' ? (inst.param || '') : (eff.stat || '')
          if (statName) result.stat[statName] = (result.stat[statName] ?? 0) + val
          break
        }
        case 'elemental_bonus': {
          const elem = eff.element === 'param' ? (inst.param || '') : (eff.element || '')
          if (elem) result.elemental[elem] = (result.elemental[elem] ?? 0) + val
          break
        }
        case 'rr_bonus': {
          const realm = eff.realm === 'param' ? (inst.param || '').toLowerCase() : (eff.realm || '')
          if (!realm) break
          // Situational RR talents (Iron Will: vs mental spells) are offered in the roll dialog
          if (eff.situational) result.rrSituational.push({ name: def.name, realm, bonus: val, note: eff.note || '' })
          else result.rr[realm] = (result.rr[realm] ?? 0) + val
          break
        }
      }
    }
  }
  if (char) _tbCache.set(char, result)
  return result
}

/** The race entry for char.race (exact, canonical RMU name, or case-insensitive — Foundry imports use RMU names). */
export function getRaceEntry(char) {
  const want = String(char?.race || '').trim()
  if (!want) return null
  const lw = want.toLowerCase()
  return racesData.find(r => r.name === want)
    || racesData.find(r => r.rmu_canonical_name && r.rmu_canonical_name.toLowerCase() === lw)
    || racesData.find(r => r.name.toLowerCase() === lw)
    || null
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
  // stat = { temp, potential, racial, special } — no talents (see getCharStatBonus)
  const base = getStatBonus(stat.temp ?? 0)
  return base + (stat.racial ?? 0) + (stat.special ?? 0)
}

/** Quickness ×3 + talent DB (the always-on part of DB; see getDefense for the full DB). */
export function getDefensiveBonus(char) {
  return getCharStatBonus(char, 'Quickness') * 3 + getTalentBonuses(char).db
}

export function getInitiativeBonus(char) {
  return getCharStatBonus(char, 'Quickness') + getTalentBonuses(char).initiative
}

// Rank bonus per Core Law Table 3-0b (RMU skills/ranks-bonus.js):
//   0 ranks → −25 untrained, except categories with no stats (Battle, Combat and
//   Magical Expertise) → 0. Ranks 1-10 +5 each, 11-20 +3, 21-30 +2, 31+ +1.
export function rankBonus(ranks, categoryStats) {
  if (!ranks || ranks <= 0) return categoryStats !== undefined && (!categoryStats || categoryStats === '-') ? 0 : -25
  if (ranks <= 10) return ranks * 5
  if (ranks <= 20) return 50 + (ranks - 10) * 3
  if (ranks <= 30) return 80 + (ranks - 20) * 2
  return 100 + (ranks - 30)
}

// ── Weapons ──────────────────────────────────────────────────────────────────
// Weapon OB = the full weapon skill bonus (e.g. "Melee: Blade": rank bonus +
// 2×St + Ag + …) + the weapon's item bonus + 10 for two-handed melee + the armor
// ranged penalty. Attacking adds condition penalties, prone and parry
// (getWeaponAttackOB).

const WEAPON_GROUP_TEMPLATE = { melee: 'Melee: <weapon 1>', ranged: 'Ranged: <weapon 1>', thrown: 'Ranged: <weapon 1>', unarmed: 'Unarmed: <weapon 1>' }

/**
 * The character's skill entry behind a weapon: a template key, a label on a
 * template slot ("Blade"), or a custom skill instance (case-insensitive).
 * Returns { skillKey, charSkillData, displayName } (nulls when not found).
 */
export function resolveWeaponSkill(char, weapon) {
  const hit = findCharSkill(char, weapon?.skill_name)
  if (hit) return { skillKey: hit.templateName, charSkillData: hit.data, displayName: hit.displayName }
  return { skillKey: null, charSkillData: null, displayName: null }
}

/** Total ranks (incl. culture) in the weapon's skill — used for fumble reduction. */
export function getWeaponSkillRanks(char, weapon) {
  const { charSkillData } = resolveWeaponSkill(char, weapon)
  return (charSkillData?.ranks ?? 0) + (charSkillData?.culture_ranks ?? 0)
}

// Greater Blade/Chain/Hafted and Pole Arm weapons are two-handed (Core Law 7.1).
const TWO_HANDED_GROUPS = /\b(greater blade|greater chain|greater hafted|pole ?arms?)\b/i

/** Two-handed melee weapons get +10 OB (Core Law Table 9-5). */
export function isTwoHandedMelee(weapon, char) {
  if ((weapon?.ob_type || 'melee') !== 'melee') return false
  if (weapon?.handed === '2H' || /\(2H\)|two[- ]hand/i.test(weapon?.name || '')) return true
  if (weapon?.handed === '1H') return false
  const db = weaponsData.find(w => w.name === weapon?.name)
  if (db?.handed === '2H') return true
  const skill = char ? resolveWeaponSkill(char, weapon).displayName : null
  return TWO_HANDED_GROUPS.test(`${weapon?.skill_name || ''} ${skill || ''} ${db?.skill || ''}`)
}

export function isRangedWeapon(weapon) {
  return weapon?.ob_type === 'ranged' || weapon?.ob_type === 'thrown' || /^ranged/i.test(weapon?.skill_name || '')
}

export function getWeaponOB(char, weapon) {
  const { skillKey, charSkillData, displayName } = resolveWeaponSkill(char, weapon)
  const twoHanded = isTwoHandedMelee(weapon, char) ? 10 : 0
  const armorRanged = isRangedWeapon(weapon) ? getArmorPenalties(char).ranged : 0
  // No matching skill: the weapon group at 0 ranks (−25 + the group's stat bonuses)
  const tplName = skillKey || WEAPON_GROUP_TEMPLATE[weapon?.ob_type || 'melee'] || WEAPON_GROUP_TEMPLATE.melee
  const skill = getSkillBreakdown(char, tplName, charSkillData || {}, displayName || undefined).total
  return skill + (Number(weapon?.item_bonus) || 0) + twoHanded + armorRanged
}

/**
 * OB when attacking now: weapon OB + condition penalties (hit loss, injuries,
 * stun, fatigue, grapple) − 50 for a melee attack from prone (Core Law 9.5)
 * − the OB moved into parry (melee).
 */
export function getWeaponAttackOB(char, weapon) {
  const melee = !isRangedWeapon(weapon)
  const prone = melee && char?.conditions?.prone ? -50 : 0
  const parry = melee ? Math.max(0, Number(char?.defense?.parry) || 0) : 0
  return getWeaponOB(char, weapon) + getConditionPenalty(char).total + prone - parry
}

/**
 * Base Movement Rate in feet per round (Core Law 5.3 / 2.7; RMU movement.js):
 * 20' (30' for quadrupeds) + ½ Quickness bonus (round up) + racial stride + stride talents.
 */
export function getBMR(char) {
  const qu = getCharStatBonus(char, 'Quickness')
  const tb = getTalentBonuses(char)
  return (tb.bmrBase ?? 20) + Math.ceil(qu / 2) + (getRaceEntry(char)?.frame?.stride ?? 0) + tb.stride
}

// App skill base → RMU skill name, the unit that professional bonuses and knacks
// attach to (Core Law 2.4: they cover all specializations). RMU's Language skill
// is specialized as spoken / written / signaled / lip reading.
const RMU_SKILL_ALIAS = {
  'Spoken': 'Language', 'Written': 'Language', 'Signaled': 'Language', 'Lip Reading': 'Language',
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

// Returns +5 if the skill (display name, e.g. "Melee: Dagger") is covered by one
// of the character's knacks. A knack covers every specialization of its skill
// (Core Law 2.4), and "Spellcasting: Closed" covers every Closed spell list.
export function getKnackBonus(char, skillDisplayName) {
  const knacks = (char.knacks || []).map(k => String(k).trim().toLowerCase())
  if (!knacks.length || !skillDisplayName) return 0
  const name = String(skillDisplayName).trim()
  const has = n => knacks.includes(String(n).trim().toLowerCase())
  if (has(name)) return 5
  const colon = name.indexOf(':')
  if (colon > 0 && has(name.slice(0, colon))) return 5
  const rmuName = rmuSkillName(name)
  if (rmuName !== name && has(rmuName)) return 5
  const listKey = Object.keys(char.spell_lists || {}).find(k => k.toLowerCase() === name.toLowerCase())
  if (listKey) {
    const category = getListCategory(char, listKey)
    if (has(`Spellcasting: ${category}`)) return 5
    if (category === 'Magic Ritual' && has('Spellcasting: Magical Ritual')) return 5
  }
  return 0
}

// ── Resistance rolls (Core Law 5.6, Table 5-6) ──────────────────────────────
// RR = stat bonus + 2 × level + race + 10 vs your own realm(s) + special + talents.
// Condition penalties don't apply to RRs ("only the character's stats, race and
// level"). Situational RR talents (Iron Will vs mental spells) are offered in the
// roll dialog, not added here.
const RR_STATS = { channeling: 'Intuition', essence: 'Empathy', mentalism: 'Presence', physical: 'Constitution', fear: 'Self Discipline' }

// Worn armor vs magic (Spell Law Table 4-5; RMU resistance.js): torso armor vs
// Channeling (metal only) and Essence, helmet vs Mentalism. Metal +15, organic
// +10; AT 7+ counts as metal, AT 2-6 as organic (RMU armor.js isMetallic).
function armorRRBonus(char, type) {
  const at = type === 'mentalism' ? (char.armor_parts?.head?.at ?? 1) : (char.armor_parts?.torso?.at ?? 1)
  if (type === 'channeling') return at >= 7 ? 15 : 0
  if (type === 'essence' || type === 'mentalism') return at >= 7 ? 15 : at >= 2 ? 10 : 0
  return 0
}

export function getRRBreakdown(char, type) {
  const statB      = getCharStatBonus(char, RR_STATS[type] || '')
  const lvlBonus   = (char.level ?? 1) * 2
  const realmBonus = getRealms(char).some(r => r.toLowerCase() === type) ? 10 : 0
  const special    = Number(char.rr_bonuses?.[type]) || 0
  const raceB      = getRaceEntry(char)?.[`${type}_rr`] ?? 0
  const tb         = getTalentBonuses(char)
  const talentB    = tb.rr[type] ?? 0
  const armorB     = armorRRBonus(char, type)
  // "vs mental spells" (Iron Will) applies to the three realm RRs only
  const situational = tb.rrSituational.filter(s => s.realm === type || (s.realm === 'mental' && REALM_STAT[type[0].toUpperCase() + type.slice(1)]))
  return { statB, lvlBonus, realmBonus, raceB, talentB, armorB, special, situational, total: statB + lvlBonus + realmBonus + raceB + armorB + special + talentB }
}

export function getResistanceBonuses(char) {
  const result = {}
  for (const type of Object.keys(RR_STATS)) result[type] = getRRBreakdown(char, type).total
  return result
}

// ── Spellcasting (Core Law 3.22, Spell Law 4) ───────────────────────────────

/**
 * Sum of skill_talent_bonus effects that name a spell list as their target
 * (talent param / extra lists). Applies to the list's SCR and Spell Mastery.
 */
export function getNamedTalentBonus(char, name) {
  if (!name) return 0
  const want = String(name).toLowerCase()
  let total = 0
  for (const inst of getTalentInstances(char)) {
    for (const eff of inst.def.effects || []) {
      if (eff.type !== 'skill_talent_bonus') continue
      const targets = eff.skill === 'param' ? [inst.param, ...(inst.extra_params || [])] : [eff.skill]
      if (targets.some(t => t && String(t).toLowerCase() === want)) total += eff.per_tier != null ? eff.per_tier * inst.tier : (eff.flat ?? 0)
    }
  }
  return total
}

// Complementary skill on a list (Core Law 3, Spell Law 5): the first adds its
// ranks, a second one half its ranks. A list stores one; "secondary" halves it.
function _compBonus(char, sl) {
  const comp = sl?.complementary
  if (!comp?.skill) return 0
  const s = char.skills?.[comp.skill] || findCharSkill(char, comp.skill)?.data || {}
  const rawRanks = (s.ranks ?? 0) + (s.culture_ranks ?? 0)
  return comp.type === 'secondary' ? Math.floor(rawRanks / 2) : rawRanks
}

// SCR modifier by spell list type (Spell Law 4.2: own Base +5, Open 0, Closed −5,
// any other −10; RMU spells/prepare.js). Magic Ritual lists aren't cast with an SCR.
const SCR_LIST_TYPE_MOD = { Base: 5, Open: 0, Closed: -5, Arcane: -10, Restricted: -10, 'Magic Ritual': 0, 'Magical Ritual': 0 }

export function getSCRListTypeModifier(char, listName) {
  return SCR_LIST_TYPE_MOD[getListCategory(char, listName)] ?? 0
}

/**
 * Spellcasting Roll (SCR) bonus — added to d100OE when casting.
 * raw ranks + realm stat (once) + list type + talents (+ complementary).
 * Knacks and the professional bonus are NOT part of the SCR (Core Law 3.22).
 * Standing penalties (condition, armor, encumbrance) are in casting.js
 * getStandingSCR; per-cast options in getCastBreakdown.
 */
export function getSpellCastingBonus(char, listName) {
  const b = getSpellCastingBreakdown(char, listName)
  return b.ranks + b.realmStat + b.listType + b.talents + b.complementary
}

/** Itemized pieces of getSpellCastingBonus, for the Cast dialog. Sums to the same total. */
export function getSpellCastingBreakdown(char, listName) {
  const sl = char.spell_lists?.[listName] || {}
  return {
    ranks:    sl.ranks ?? 0,
    realmStat: getRealmStatBonus(char),
    listType: getSCRListTypeModifier(char, listName),
    talents:  getTalentBonuses(char).spellcasting + (sl.talent_bonus ?? 0) + getNamedTalentBonus(char, listName),
    complementary: _compBonus(char, sl),
  }
}

/**
 * Spell Mastery — the list's full skill bonus, rolled to change a spell as it's
 * cast (Core Law 3.22, Spell Law 4.6): rank bonus + Spellcasting category
 * [RS + RS] + list stat [Me] + item + professional + knack + talents +
 * complementary. Eloquence/Mumbler are SCR-only.
 */
export function getSpellMasteryBonus(char, listName) {
  const sl           = char.spell_lists?.[listName] || {}
  const ranks        = sl.ranks ?? 0
  const rb           = rankBonus(ranks)
  const item         = sl.item_bonus  ?? 0
  const profB        = isProfessionalList(char, listName) ? Math.min(ranks, 30) : 0
  const customTalent = sl.talent_bonus ?? 0
  const namedTalent  = getNamedTalentBonus(char, listName)
  const rsB          = getRealmStatBonus(char)
  const meB          = getCharStatBonus(char, 'Memory')
  const compB        = _compBonus(char, sl)
  const knackB       = getKnackBonus(char, listName)
  return rb + rsB * 2 + meB + item + profB + customTalent + namedTalent + compB + knackB
}

// ── Size, hits, endurance ────────────────────────────────────────────────────
// RMU CreatureSize.hitMultiplier (systems/rmu/module/rmu/size.js); Medium = 1.
const SIZE_HIT_MULT = {
  Minuscule:  0.25, Diminutive: 0.50, Tiny:       0.67,
  Small:      0.75, Medium:     1.00, Big:        1.50,
  Large:      2.00, Huge:       3.00, Gigantic:   4.00,
  Enormous:   5.00, Immense:    6.00, Behemoth:   7.00, Leviathan: 8.00,
}
export const SIZE_ORDER = ['Minuscule', 'Diminutive', 'Tiny', 'Small', 'Medium', 'Big', 'Large', 'Huge', 'Gigantic', 'Enormous', 'Immense', 'Behemoth', 'Leviathan']

/**
 * The character's size, and the size used for concussion hits. A size picked in
 * Identity is final; otherwise the race's size + Increased/Decreased Size tiers
 * beyond the race's own. Light-boned counts hits as one size smaller per tier.
 */
export function getSizeInfo(char) {
  const tb = getTalentBonuses(char)
  const clamp = i => Math.max(0, Math.min(SIZE_ORDER.length - 1, i))
  const base = SIZE_ORDER.indexOf(char?.size || getRaceEntry(char)?.frame?.size || 'Medium')
  const index = char?.size ? clamp(base) : clamp((base < 0 ? 4 : base) + tb.size)
  const hitsIndex = clamp(index + tb.sizeHits)
  return { name: SIZE_ORDER[index], index, hitsName: SIZE_ORDER[hitsIndex], hitMultiplier: SIZE_HIT_MULT[SIZE_ORDER[hitsIndex]] ?? 1 }
}

// Body / Power Development with no ranks use their stat bonuses only, not −25
// (RMU skills/skills.js getNonDevelopedPenalty).
function devSkillBonus(char, name) {
  const b = getSkillBreakdown(char, name, char.skills?.[name] || {}, name)
  return b.totalRanks > 0 ? b.total : b.total - b.rankBonus
}

/** Full Body Development skill bonus (sets hits, endurance and the death threshold). */
export function getBodyDevBonus(char) {
  return devSkillBonus(char, 'Body Development')
}

/**
 * Concussion hits (Core Law 2.7; RMU pc.js): (race base hits + Body Development
 * bonus + Tough/Fragile tiers beyond the race's own) × size multiplier, rounded.
 */
export function getBaseHits(char) {
  const raw = (getRaceEntry(char)?.base_hits ?? 25) + getBodyDevBonus(char) + getTalentBonuses(char).hits
  return Math.max(1, Math.round(raw * getSizeInfo(char).hitMultiplier))
}

/** Endurance = Body Development bonus + racial endurance + talents (Vigorous/Feeble). */
export function getEndurance(char) {
  return getBodyDevBonus(char) + (getRaceEntry(char)?.endurance ?? 0) + getTalentBonuses(char).endurance
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

/** Max hits: the manual override if one is set, else the calculated value. */
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

/**
 * Initiative: −1 for every full −10 of penalties (Core Law 8.3, "round down" —
 * −16 → −1). Penalties = hit loss, injuries, stun, fatigue, grapple, encumbrance.
 */
export function getConditionInitiativePenalty(char) {
  return Math.trunc((getConditionPenalty(char).total + getEncumbrance(char).penalty) / 10) || 0
}

/**
 * Unconscious at 0 or fewer hits. Dead once negative hits exceed the Body
 * Development bonus (+67 BD dies at −68).
 */
export function getHealthStatus(char) {
  const cur    = getHitsCurrent(char)
  const deathAt = -(Math.max(0, getBodyDevBonus(char)) + 1)
  if (cur <= deathAt) return { status: 'dead', deathAt }
  // Systemic shock (Core Law 9.8): at −300 or worse in total penalties the
  // character dies at the next upkeep; from −200 they keep failing fatigue.
  const pen = getConditionPenalty(char).total
  if (pen <= -300)    return { status: 'dying', deathAt, reason: 'systemic shock: penalties at −300 or worse' }
  if (cur <= 0)       return { status: 'unconscious', deathAt }
  return { status: 'ok', deathAt }
}

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
  // Short of food/water, rest only recovers down to the cap — it never makes
  // fatigue worse than it already is.
  return cap !== null ? Math.min(proposed, Math.max(pen, cap)) : proposed
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

// ── Armor penalties & encumbrance (Core Law 5.4 / 6; RMU armor.js, enc.js) ──

const ARMOR_PART_SLOT = { torso: 'torso', head: 'helmet', arms: 'vambraces', legs: 'greaves' }

function armorRow(part, at) {
  return (armorData[ARMOR_PART_SLOT[part]] || []).find(r => r.at === (at ?? 1)) || null
}

/**
 * Full skill bonus of a fixed-name skill (Maneuvering in Armor, Shield, Running,
 * Transcendence); 0 ranks → 0 (no offset). `skipTalents` drops talents by id
 * (Recurved Musculature doesn't help dodging).
 */
function namedSkillBonus(char, name, skipTalents = []) {
  const data = char.skills?.[name]
  const b = getSkillBreakdown(char, name, data || {}, name)
  if (b.totalRanks <= 0) return 0
  const skipped = b.talentEntries.filter(e => e.applied && skipTalents.includes(e.talentId)).reduce((s, e) => s + e.bonus, 0)
  return b.total - skipped
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
  return { maneuverRaw, maneuver, mia, miaOffset: maneuver - maneuverRaw, ranged, perception, weightPct }
}

/** Natural Armor talent (own or racial): AT 1 + tiers; it never stacks with worn armor (use the higher AT). */
export function getNaturalArmor(char) {
  const tiers = getTalentBonuses(char).at
  const worn = char.armor_parts?.torso?.at ?? 1
  const at = tiers > 0 ? 1 + tiers : 1
  // Worn armor heavier than the natural AT: add the tiers as DB (Core Law ch.4)
  return { tiers, at, wornAT: worn, effectiveAT: Math.max(worn, at), db: tiers > 0 && worn > at ? tiers : 0 }
}

const NOT_CARRIED = ['Stored', 'Mount']
const SHIELD_WEIGHT = Object.fromEntries((armorData.shields || []).map(s => [s.name, Number(s.weight_lbs) || 0]))
const qtyOf = q => (q === '' || q == null ? 1 : Math.max(0, Number(q) || 0))

/** Gear weight in lbs: { carried (not Stored/Mount), all }. Quantity blank = 1, 0 = 0. */
export function getGearWeight(char) {
  let carried = 0, all = 0
  for (const e of char?.equipment || []) {
    const w = (Number(e.weight) || 0) * qtyOf(e.qty)
    all += w
    if (!NOT_CARRIED.includes(e.location)) carried += w
  }
  return { carried: Math.round(carried * 10) / 10, all: Math.round(all * 10) / 10 }
}

/** Weight carried in lbs: gear (not Stored/Mount) × quantity, weapons, magic items, worn armor, shield. */
export function getCarriedWeight(char) {
  const body = Number(char.weight) || 0
  const gear = (char.equipment || []).filter(e => !NOT_CARRIED.includes(e.location))
    .reduce((s, e) => s + (Number(e.weight) || 0) * qtyOf(e.qty), 0)
  const weapons = (char.weapons || []).reduce((s, w) => s + (Number(w.weight) || 0), 0)
  const magic   = (char.magic_items || []).reduce((s, m) => s + (Number(m.weight) || 0), 0)
  const armor   = body * getArmorPenalties(char).weightPct / 100
  const shieldType = char.armor_parts?.shield?.type
  const shield  = shieldType && !(char.weapons || []).some(w => w.name === shieldType) ? (SHIELD_WEIGHT[shieldType] ?? 0) : 0
  return Math.round((gear + weapons + magic + armor + shield) * 10) / 10
}

// Heaviest load (% of body weight) that still allows each pace (Core Law Table 5-3).
const PACE_MAX_LOAD = [['Dash', 15], ['Sprint', 30], ['Run', 45], ['Jog', 60], ['Walk', 90]]

/**
 * Encumbrance: penalty −1 per 1% of body weight carried over the allowance
 * (Core Law: −5 per 5%), and the fastest pace the load allows.
 * `forDodge`: Beast of Burden's extra allowance doesn't count (Core Law ch.4).
 * Returns nulls when body weight isn't set.
 */
export function getEncumbrance(char, { forDodge = false } = {}) {
  const body = Number(char.weight) || 0
  const carried = getCarriedWeight(char)
  const wa = getWeightAllowance(char)
  const allowancePct = forDodge ? Math.max(0, wa.pct - wa.carryBonus) : wa.pct
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
 * Swimming triples both before Maneuvering in Armor applies (Core Law 3.17).
 */
export function getMovementPenalty(char, category, skillName) {
  const base = (skillName || '').split(':')[0].trim()
  if (base === 'Perception') {
    const p = getArmorPenalties(char).perception
    return { armor: p, enc: 0, total: p }
  }
  if (NON_PHYSICAL.has(category) || base === 'Fortitude') return { armor: 0, enc: 0, total: 0 }
  const ap = getArmorPenalties(char)
  if (base === 'Swimming') {
    const armor = Math.min(0, ap.maneuverRaw * 3 + ap.mia)
    const enc = getEncumbrance(char).penalty * 3
    return { armor, enc, total: armor + enc }
  }
  const enc = getEncumbrance(char).penalty
  return { armor: ap.maneuver, enc, total: ap.maneuver + enc }
}

// ── Defense (Core Law 9.6; RMU db/db.js) ────────────────────────────────────

export const SHIELD_DB = { 'Target Shield': 15, 'Normal Shield': 20, 'Full Shield': 25, 'Wall Shield': 30 }
const COVER = { none: [0, 0], partial: [10, 20], half: [20, 40], full: [50, 100] }   // [melee, ranged]

/**
 * Full DB with the character's chosen defense (char.defense):
 *   dodge / block: 'none' | 'passive' | 'partial' | 'full'
 *   parry: OB moved to DB vs melee;  cover: 'none'|'partial'|'half'|'full', hardCover
 * Dodge uses Running (without Recurved Musculature); block uses Shield. Passive
 * dodge and passive block don't combine (the better one counts). Armor and
 * encumbrance (without Beast of Burden) reduce dodge; condition penalties reduce
 * partial/full dodge and block. Dodge is halved vs ranged. Flat-footed: no Qu
 * DB, shield, dodge or parry; surprised: no shield.
 * Returns { total, vsRanged, parts: { qu, talent, shield, dodge, parry, cover, coverRanged, armor, natural, magic }, … }.
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
  const qu     = flat ? 0 : getCharStatBonus(char, 'Quickness') * 3
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
  const rBonus = rRanks > 0 ? namedSkillBonus(char, 'Running', ['recurved_musculature']) : 0
  const armorEnc = getArmorPenalties(char).maneuver + getEncumbrance(char, { forDodge: true }).penalty
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

  const parry = flat ? 0 : Math.max(0, Number(d.parry) || 0)
  const [cm, cr] = COVER[d.cover || 'none'] || [0, 0]
  const hard = d.hardCover ? 2 : 1
  const armor = ['torso', 'head', 'arms', 'legs'].reduce((s, p) => s + (char.armor_parts?.[p]?.db ?? 0), 0)
  const natural = getNaturalArmor(char).db
  const magic = (char.magic_items || []).reduce((s, m) => s + (Number(m.db) || 0), 0)

  const common = qu + talent + shield + armor + natural + magic
  return {
    total:    common + dodge + parry + cm * hard,
    vsRanged: common + Math.ceil(dodge / 2) + cr * hard,
    parts: { qu, talent, shield, dodge, parry, cover: cm * hard, coverRanged: cr * hard, armor, natural, magic },
    dodgeMode, blockMode, hasShield, rRanks, sRanks,
  }
}

/** Weight allowance: 15% + 2 × Strength bonus + Beast of Burden (never below 0%, Core Law 5.4). */
export function getWeightAllowance(char) {
  const carryBonus = getTalentBonuses(char).carry ?? 0
  const pct = Math.max(0, 15 + 2 * getCharStatBonus(char, 'Strength') + carryBonus)
  const lbs = char.weight ? Math.round(pct * Number(char.weight) / 100) : null
  return { pct, lbs, carryBonus }
}

/**
 * Power points = the Power Development skill bonus (Spell Law 4.1): rank bonus +
 * 2 × realm stat + Co + professional + knack + talents + item. null without a realm.
 */
export function getPowerPointsAuto(char) {
  if (!getRealmStatName(char)) return null
  return Math.max(0, devSkillBonus(char, 'Power Development'))
}

/** Max PP: the manual override if one is set, else the calculated value. */
export function getPowerPoints(char) {
  if (char.power_points_max !== null && char.power_points_max !== undefined) return char.power_points_max
  return getPowerPointsAuto(char)
}
