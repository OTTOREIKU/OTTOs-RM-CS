// Foundry VTT → RMU Character Sheet importer
// Converts a Foundry actor JSON export (produced via "Export Data" in Foundry)
// into our internal character schema.

import skillsData from '../data/skills.json'
import { makeBlankCharacter } from '../store/characters.js'

// ── Constants ───────────────────────────────────────────────────────────────

const STAT_ABBR_TO_FULL = {
  Ag: 'Agility',
  Co: 'Constitution',
  Em: 'Empathy',
  In: 'Intuition',
  Me: 'Memory',
  Pr: 'Presence',
  Qu: 'Quickness',
  Re: 'Reasoning',
  SD: 'Self Discipline',
  St: 'Strength',
}

// Maps Foundry system.name → our template base name for special cases.
// All other names are matched directly.
const FOUNDRY_TO_OUR_BASE = {
  'Melee Weapons':            'Melee',
  'Ranged Weapons':           'Ranged',
  'Religion/Philosophy Lore': 'Religion/Philosophy',
  // Directed Spell (singular in Foundry) → Directed Spells (plural in our templates)
  'Directed Spell':           'Directed Spells',
}

// ── Template index ───────────────────────────────────────────────────────────

// Returns: { [ourBaseName]: [slot1, slot2, ...] }
// Where baseName is the part before ": " (or the full name if no colon).
function buildTemplateIndex() {
  const index = {}
  for (const skill of skillsData) {
    const name = skill.name
    // Skip weird leading-placeholder names like "<specialization 1> Lore"
    if (name.startsWith('<')) continue
    const colonIdx = name.indexOf(':')
    const base = colonIdx >= 0 ? name.slice(0, colonIdx).trim() : name
    if (!index[base]) index[base] = []
    index[base].push(name)
  }
  return index
}

function hasPlaceholder(name) {
  return /<[^>]+>/.test(name)
}

// ── Main parser ──────────────────────────────────────────────────────────────

export function parseFoundryActor(json) {
  const sys   = json.system || {}
  const items = json.items  || []

  const templateIndex = buildTemplateIndex()
  // Track how many placeholder slots we've filled per base name
  const slotCounts = {}
  let csSeq = 0  // counter for unique custom-skill IDs

  const id   = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const char = makeBlankCharacter(id)

  // ── Identity ──────────────────────────────────────────────────────────────

  char.name  = json.name || 'Imported Character'
  char.realm = sys.realm || ''
  char.level = sys.experience?.level ?? 1
  char.experience = sys.experience?.xp ?? 0

  const raceItem = items.find(i => i.type === 'race')
  const profItem = items.find(i => i.type === 'profession')
  const cultItem = items.find(i => i.type === 'culture')

  if (raceItem) char.race       = raceItem.system?.race       || raceItem.name || char.race
  if (profItem) char.profession = profItem.system?.profession || profItem.name || char.profession
  if (cultItem) char.culture    = cultItem.system?.culture    || cultItem.name || char.culture

  const app = sys.appearance || {}
  char.gender = sys.identity?.gender || ''
  char.age    = String(app.age || '')
  char.size   = app.size || 'Medium'

  // ── Health ────────────────────────────────────────────────────────────────

  if (sys.health?.hp) {
    const hpMax = sys.health.hp.max   ?? null
    const hpVal = sys.health.hp.value ?? null
    char.hits_max     = hpMax
    char.hits_current = hpVal !== hpMax ? hpVal : null  // null = auto
  }
  if (sys.health?.power) {
    const ppMax = sys.health.power.max   ?? null
    const ppVal = sys.health.power.value ?? null
    char.power_points_max     = ppMax
    char.power_points_current = ppVal !== ppMax ? ppVal : null
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  for (const [abbr, data] of Object.entries(sys.stats || {})) {
    const fullName = STAT_ABBR_TO_FULL[abbr]
    if (!fullName) continue
    char.stats[fullName] = {
      temp:      data.tmp   ?? 50,
      potential: data.pot   ?? 50,
      racial:    0,
      special:   data.other ?? 0,
    }
  }

  // ── Skills & Spell Lists ──────────────────────────────────────────────────

  const skillItems = items.filter(i => i.type === 'skill')

  for (const item of skillItems) {
    const s            = item.system || {}
    const foundryName  = s.name       || item.name || ''
    const spec         = s.specialization || ''
    const ranks        = s.ranks        ?? 0
    const cultureRanks = s.cultureRanks ?? 0
    const category     = s.category     || ''
    const hasSpec      = s.hasSpecialization ?? false
    const fixedSpec    = s.fixedSpecializations ?? false

    // ── Spell lists (Spellcasting category) ────────────────────────────────
    if (category === 'Spellcasting') {
      if (spec) {
        const existing = char.spell_lists[spec] || {}
        char.spell_lists[spec] = { ...existing, ranks: (existing.ranks ?? 0) + ranks }
      }
      continue
    }

    // ── Map Foundry name → our base name ──────────────────────────────────
    const ourBase = FOUNDRY_TO_OUR_BASE[foundryName] || foundryName
    const slots   = templateIndex[ourBase] || []

    // ── Assign to template or custom_skills ───────────────────────────────

    if (hasSpec && spec && spec.trim() !== '') {
      const placeholderSlots = slots.filter(hasPlaceholder)
      const fixedSlots       = slots.filter(n => !hasPlaceholder(n))

      if (fixedSpec && fixedSlots.length > 0) {
        // Fixed specialization (e.g. "Influence: Duping") — exact match required
        const exactSlot = ourBase + ': ' + spec
        const match = fixedSlots.find(n => n === exactSlot)
        if (match) {
          mergeSkill(char, match, ranks, cultureRanks)
        } else {
          addCustomSkill(char, slots[0] || ourBase, spec, ranks, cultureRanks, ++csSeq)
        }

      } else if (placeholderSlots.length > 0) {
        // Placeholder slots — assign in sequence (e.g. "Animal Handling: <animal 1>")
        const count = slotCounts[ourBase] ?? 0
        if (count < placeholderSlots.length) {
          const slot = placeholderSlots[count]
          slotCounts[ourBase] = count + 1
          char.skills[slot] = {
            ...(char.skills[slot] || {}),
            ranks,
            culture_ranks: cultureRanks,
            label: spec,
          }
        } else {
          // All placeholder slots taken → overflow to custom_skills
          addCustomSkill(char, placeholderSlots[0], spec, ranks, cultureRanks, ++csSeq)
        }

      } else if (slots.length > 0) {
        // Foundry says hasSpecialization but our template is a direct (non-placeholder) skill.
        // e.g. "Fabric Craft" with spec "tbd" — just import as the direct template skill.
        mergeSkill(char, slots[0], ranks, cultureRanks)

      } else {
        // No matching template at all → custom skill
        addCustomSkill(char, ourBase, spec, ranks, cultureRanks, ++csSeq)
      }

    } else {
      // No meaningful specialization — direct match
      if (slots.length > 0) {
        // Use the first non-placeholder slot if available, otherwise first slot
        const directSlots = slots.filter(n => !hasPlaceholder(n))
        const slot = directSlots.length > 0 ? directSlots[0] : slots[0]
        // Only assign if slot has no placeholder (don't stomp a specialization slot
        // with an unspecialized entry — those need a label to be meaningful)
        if (!hasPlaceholder(slot)) {
          mergeSkill(char, slot, ranks, cultureRanks)
        }
      }
      // If no direct slot found, silently skip (can't do anything useful without a template)
    }
  }

  return char
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mergeSkill(char, templateName, ranks, cultureRanks) {
  const existing = char.skills[templateName] || {}
  char.skills[templateName] = {
    ...existing,
    ranks:        (existing.ranks        ?? 0) + ranks,
    culture_ranks: (existing.culture_ranks ?? 0) + cultureRanks,
  }
}

function addCustomSkill(char, templateName, label, ranks, cultureRanks, seq) {
  char.custom_skills.push({
    id:            `cs_${Date.now()}_${seq}_${Math.random().toString(36).slice(2, 5)}`,
    template_name: templateName,
    label,
    ranks,
    culture_ranks: cultureRanks,
    item_bonus:    0,
    talent_bonus:  0,
  })
}
