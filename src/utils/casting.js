// Spell casting rules for the Cast dialog.
//
// Sources: RMU Foundry system v1.3.5 — spells/prepare.js (known spells,
// overcasting, armor penalty), apps/perform-spell-dialog.js (situational
// modifier tables), xpose/scr.js (PP cost), spell-casting/scr.js (result bands,
// failure modifier) — checked against Spell Law ch. 2 and 4.
import armorData from '../data/armor.json'
import {
  getSpellCastingBonus, getSpellCastingBreakdown, getSpellMasteryBonus, getConditionPenalty,
  getSkillBonus, findSkillTemplate, getEncumbrance, getRealms, skillDisplayName, getTalentInstances,
} from './calc.js'

// ── Spell helpers ────────────────────────────────────────────────────────────

/** A spell is known once the character's ranks in its list reach its level. */
export function isSpellKnown(char, listName, spellLevel) {
  return (char?.spell_lists?.[listName]?.ranks ?? 0) >= spellLevel
}

/** −20 per level the spell is above the caster's level, before Grace. */
export function getRawOvercastPenalty(char, spellLevel) {
  const casterLevel = char?.level ?? 1
  return spellLevel > casterLevel ? -(spellLevel - casterLevel) * 20 : 0
}

// Spell Law symbols live in `mods` (older custom data may still put them in the name):
//   * instantaneous   • needs no Power Points   ‡ part of a set cast together
/** Instantaneous spells (*) cast as a 0 AP action and need no prep round to overcast. */
export function isInstantaneous(spell) {
  return (spell?.mods || '').includes('*') || /\*\s*$/.test(spell?.name || '')
}

/** Spells marked • cost no Power Points. */
export function needsNoPP(spell) {
  return (spell?.mods || '').includes('•') || /•/.test(spell?.name || '')
}

/** Spell type suffix "s" = subconscious (e.g. "Us"). Ignores injury, grapple, hands. */
export function isSubconscious(spell) {
  return /s$/.test(spell?.type || '')
}

/** First letter of the spell type: E, F, I, U or A. */
function spellTypeCode(spell) {
  return (spell?.type || 'U').charAt(0).toUpperCase()
}

/** The caster's realms for the situational tables (hybrids have two; none → Channeling). */
function castingRealms(char) {
  const r = getRealms(char)
  return r.length ? r : ['Channeling']
}

/** Talent tier for a per-list talent (Temporal/Spatial/Scope Skills, Quick Caster…) on this list: its own list or one of its extra lists. */
export function listTalentTier(char, talentId, listName) {
  const want = String(listName || '').toLowerCase()
  return (getTalentInstances(char) || [])
    .filter(t => t.talent_id === talentId && [t.param, ...(t.extra_params || [])].some(p => p && String(p).toLowerCase() === want))
    .reduce((max, t) => Math.max(max, Number(t.tier) || 0), 0)
}

export function hasTalent(char, talentId) {
  return (getTalentInstances(char) || []).some(t => t.talent_id === talentId)
}

// ── Magical Expertise skills ─────────────────────────────────────────────────

/** Full bonus of a per-list Magical Expertise skill (Grace / Spell Trickery) for this list, or 0. */
// Skill labels are title case ("Dark Summons"); spell list keys are upper case.
const sameList = (a, b) => (a || '').trim().toLowerCase() === (b || '').trim().toLowerCase()

function listExpertiseBonus(char, base, listName) {
  for (const [key, data] of Object.entries(char?.skills || {})) {
    if (!key.startsWith(base + ':')) continue
    const spec = key.includes('<') ? data?.label : key.slice(base.length + 1).trim()
    if (!sameList(spec, listName)) continue
    const ranks = (data?.ranks ?? 0) + (data?.culture_ranks ?? 0)
    if (ranks <= 0) return 0
    return getSkillBonus(char, findSkillTemplate(key), data, skillDisplayName(key, data?.label))
  }
  // Only two slots exist per skill, so a third list lives in custom_skills.
  for (const cs of char?.custom_skills || []) {
    if (!cs.template_name?.startsWith(base + ':') || !sameList(cs.label, listName)) continue
    const ranks = (cs.ranks ?? 0) + (cs.culture_ranks ?? 0)
    if (ranks <= 0) return 0
    return getSkillBonus(char, findSkillTemplate(cs.template_name), cs, skillDisplayName(cs.template_name, cs.label))
  }
  return 0
}

function transcendenceBonus(char) {
  const data = char?.skills?.Transcendence
  const ranks = (data?.ranks ?? 0) + (data?.culture_ranks ?? 0)
  return ranks > 0 ? getSkillBonus(char, findSkillTemplate('Transcendence'), data, 'Transcendence') : 0
}

// ── Armor spellcasting penalty ───────────────────────────────────────────────

const PART_TO_ARMOR_SLOT = { torso: 'torso', head: 'helmet', arms: 'vambraces', legs: 'greaves' }

function armorEnc(part, at) {
  const row = (armorData[PART_TO_ARMOR_SLOT[part]] || []).find(r => r.at === at)
  return row?.weight_pct ?? 0
}

/**
 * Channeling (In): AT 7+ pieces cost −3 × encumbrance%.
 * Essence (Em): any worn armor costs −4 × encumbrance%.
 * Mentalism (Pr): only the helmet counts — AT 2-3 −25, 4-6 −50, 7+ −75.
 */
export function getArmorCastingPenalty(char) {
  const realms = castingRealms(char)
  const parts = char?.armor_parts || {}
  let penalty = 0
  for (const part of Object.keys(PART_TO_ARMOR_SLOT)) {
    const at = parts[part]?.at ?? 1
    if (at <= 1) continue
    const per = realms.map(realm => {
      if (realm === 'Channeling') return at >= 7 ? -3 * armorEnc(part, at) : 0
      if (realm === 'Essence')    return -4 * armorEnc(part, at)
      if (realm === 'Mentalism')  return part === 'head' ? (at >= 7 ? -75 : at >= 4 ? -50 : -25) : 0
      return 0
    })
    penalty += Math.min(0, ...per)
  }
  return penalty
}

// ── Situational modifier tables (by caster realm) ────────────────────────────

export const HANDS_OPTIONS = {
  Channeling: [{ value: 0, label: 'No hands free', mod: -20 }, { value: 1, label: 'One hand', mod: 0 }, { value: 2, label: 'Both hands', mod: 5 }],
  Essence:    [{ value: 0, label: 'No hands free', mod: -40 }, { value: 1, label: 'One hand', mod: -10 }, { value: 2, label: 'Both hands', mod: 0 }],
  Mentalism:  [{ value: 0, label: 'No hands free', mod: 0 },   { value: 1, label: 'One hand', mod: 0 },   { value: 2, label: 'Both hands', mod: 0 }],
}

export const VOICE_OPTIONS = {
  Channeling: [{ value: 'silent', label: 'Silent', mod: -15 }, { value: 'whisper', label: 'Whisper', mod: -5 },  { value: 'normal', label: 'Normal', mod: 0 }, { value: 'shout', label: 'Shout', mod: 10 }],
  Essence:    [{ value: 'silent', label: 'Silent', mod: -25 }, { value: 'whisper', label: 'Whisper', mod: -10 }, { value: 'normal', label: 'Normal', mod: 0 }, { value: 'shout', label: 'Shout', mod: 5 }],
  Mentalism:  [{ value: 'silent', label: 'Silent', mod: 0 },   { value: 'whisper', label: 'Whisper', mod: 0 },   { value: 'normal', label: 'Normal', mod: 0 }, { value: 'shout', label: 'Shout', mod: 0 }],
}

// Penalty for casting subtly, by caster realm and spell type letter.
const SUBTLE_MOD = {
  Channeling: { E: -40, F: -25, I: -5,  U: -15, A: 0 },
  Essence:    { E: -60, F: -50, I: -10, U: -30, A: 0 },
  Mentalism:  { E: -30, F: -20, I: 0,   U: -5,  A: 0 },
}

/** Hands / voice options for this caster: hybrids take the worse value of their realms. */
export function getHandsOptions(char) {
  const realms = castingRealms(char)
  return HANDS_OPTIONS[realms[0]].map(o => ({ ...o, mod: Math.min(...realms.map(r => HANDS_OPTIONS[r].find(x => x.value === o.value)?.mod ?? 0)) }))
}
export function getVoiceOptions(char) {
  const realms = castingRealms(char)
  return VOICE_OPTIONS[realms[0]].map(o => ({ ...o, mod: Math.min(...realms.map(r => VOICE_OPTIONS[r].find(x => x.value === o.value)?.mod ?? 0)) }))
}
function subtleMod(char, typeC) {
  return Math.min(...castingRealms(char).map(r => SUBTLE_MOD[r][typeC] ?? 0))
}

export const PREP_OPTIONS = [
  { value: 0, label: 'None', mod: 0 }, { value: 1, label: '+1 round', mod: 10 }, { value: 2, label: '+2 rounds', mod: 20 },
]

// Casting is a 4 AP action, hastened to a minimum of 2 AP (Spell Law 4.2).
export const FAST_OPTIONS = [
  { value: 0, label: 'Normal', mod: 0 }, { value: 1, label: '1 AP less', mod: -25 },
  { value: 2, label: '2 AP less', mod: -50 },
]

/** Default dialog options for a spell (overcasting defaults to one extra prep round unless instantaneous). */
export function defaultCastOptions(char, spell) {
  const overcast = getRawOvercastPenalty(char, spell.level) < 0
  return {
    hands: isSubconscious(spell) ? 0 : 2,
    voice: hasTalent(char, 'mute') ? 'silent' : 'normal',   // a mute caster can't use their voice
    subtle: false,
    prep: overcast && !isInstantaneous(spell) ? 1 : 0,
    fast: 0,
    other: 0,
  }
}

// ── The full Cast breakdown ──────────────────────────────────────────────────

/**
 * Every modifier on the SCR for casting `spell` from `listName`.
 * Returns { lines: [{ label, value, note? }], total, ppCost, known, overcast, failureMod }.
 * `failureMod` is added to a spell failure roll if the cast fails (RMU: the sum
 * of negative modifiers, flipped positive, plus Graceful Recovery/Inglorious Failure).
 */
export function getCastBreakdown(char, listName, spell, opts) {
  const sub    = isSubconscious(spell)
  const typeC  = spellTypeCode(spell)
  const lines  = []
  const add = (label, value, note) => { if (value) lines.push({ label, value, note }) }

  // Base SCR
  const b = getSpellCastingBreakdown(char, listName)
  lines.push({ label: 'Ranks in list', value: b.ranks })
  add('Realm stat', b.realmStat)
  add(`List type (${char.spell_lists?.[listName]?.category || 'Base'})`, b.listType)
  add('Talents', b.talents)
  add('Complementary skill', b.complementary)
  const base = getSpellCastingBonus(char, listName)

  // Overcasting (−20/level above caster level), reduced by Grace for this list
  const rawOver = getRawOvercastPenalty(char, spell.level)
  let over = rawOver
  if (rawOver < 0) {
    const grace = listExpertiseBonus(char, 'Grace', listName)
    over = Math.min(0, rawOver + Math.max(0, grace))
    add(`Overcasting (lvl ${spell.level} > caster lvl ${char.level ?? 1})`, over,
      grace > 0 ? `${rawOver} reduced by Grace +${grace}` : undefined)
  }

  // Situational modifiers (these make up the spell failure modifier)
  let situational = 0
  const sit = (label, value, note) => { if (value) { situational += value; lines.push({ label, value, note }) } }

  const cond = getConditionPenalty(char)
  if (sub) {
    if (cond.total < 0) lines.push({ label: 'Condition penalty', value: 0, note: `subconscious spell ignores your ${cond.total}` })
  } else {
    sit('Hit loss', cond.hitLoss)
    sit('Injuries', cond.injury)
    sit('Stun', cond.stun)
    sit('Fatigue', cond.fatigue)
    sit('Grappled', cond.grapple)
    sit('Encumbrance', getEncumbrance(char).penalty)
  }

  const armor = getArmorCastingPenalty(char)
  if (armor < 0) {
    const tr = Math.min(Math.max(0, transcendenceBonus(char)), -armor)
    sit('Armor', armor + tr, tr > 0 ? `${armor} offset by Transcendence +${tr}` : undefined)
  }

  // Hands / voice / subtlety — Spell Trickery can offset these penalties
  let trickable = 0
  const handMod = sub ? 0 : (getHandsOptions(char).find(o => o.value === opts.hands)?.mod ?? 0)
  const voiceMod = getVoiceOptions(char).find(o => o.value === opts.voice)?.mod ?? 0
  const subtle = opts.subtle ? subtleMod(char, typeC) : 0
  sit('Hands', handMod); if (handMod < 0) trickable += handMod
  sit('Voice', voiceMod); if (voiceMod < 0) trickable += voiceMod
  sit('Subtle casting', subtle); if (subtle < 0) trickable += subtle
  if (trickable < 0) {
    const trick = Math.min(Math.max(0, listExpertiseBonus(char, 'Spell Trickery', listName)), -trickable)
    sit('Spell Trickery', trick)
  }

  sit('Extra preparation', PREP_OPTIONS.find(o => o.value === opts.prep)?.mod ?? 0)
  if (!isInstantaneous(spell)) sit('Fast casting', FAST_OPTIONS.find(o => o.value === opts.fast)?.mod ?? 0)
  sit('Other', Number(opts.other) || 0)

  // Spell failure modifier (RMU 1.3.5 spell-casting/scr.js): the whole SCR bonus —
  // base plus every modifier, overcasting included — if negative, flipped positive;
  // plus Graceful Recovery / Inglorious Failure.
  const total = base + over + situational
  const gr = (char.talents || []).find(t => t.talent_id === 'graceful_recovery')?.tier ?? 0
  const ig = (char.talents || []).find(t => t.talent_id === 'inglorious_failure')?.tier ?? 0
  const failureMod = (total < 0 ? -total : 0) - gr * 5 + ig * 5

  return {
    lines,
    base,
    total,
    ppCost: needsNoPP(spell) ? 0 : spell.level,
    rr: Number(spell.rr) || 0,
    attack: spell.attack || null,
    known: isSpellKnown(char, listName, spell.level),
    overcast: rawOver < 0,
    failureMod,
    // Spell Mastery (full list bonus) for changing the spell as it's cast —
    // a separate maneuver roll, so injury/fatigue penalties apply to it.
    mastery: getSpellMasteryBonus(char, listName) + cond.total,
    masteryPenalty: cond.total,
  }
}

/**
 * The SCR a list header shows: base SCR + standing penalties that apply to any
 * cast right now — condition, encumbrance, armor (after Transcendence). The
 * Cast dialog adds the per-cast choices (overcasting, hands, voice, prep…).
 * Returns { total, base, condition, encumbrance, armor }.
 */
export function getStandingSCR(char, listName) {
  const base = getSpellCastingBonus(char, listName)
  const condition = getConditionPenalty(char).total
  const encumbrance = getEncumbrance(char).penalty
  const rawArmor = getArmorCastingPenalty(char)
  const armor = rawArmor < 0 ? rawArmor + Math.min(Math.max(0, transcendenceBonus(char)), -rawArmor) : 0
  return { total: base + condition + encumbrance + armor, base, condition, encumbrance, armor }
}

/** RMU result bands for the final SCR total (d100OE + total). */
export function interpretSCR(result) {
  if (result > 0)  return { code: 'success', label: 'Success', color: 'var(--success)' }
  if (result === 0) return { code: 'none',   label: 'No effect', color: 'var(--text3)' }
  return { code: 'fail', label: 'Failure — roll on the spell failure table', color: 'var(--danger)' }
}
