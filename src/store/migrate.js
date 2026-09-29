// Character data migration — heals entries stored under skill names that the
// app has since renamed or split into specialization slots.
//
// Runs on every load (store/characters.js → loadCharacters). Must stay
// idempotent: a migrated character passes through unchanged.
//
// Pure module (no JSON imports) so it can be tested from Node:
//   migrateCharacter(char, templateNames) → { char, changed, log }

// Straight renames of skill template keys.
const RENAMES = {
  'Region Lore: <region 1>': 'Region Lore: <own region>',
  'Region Lore: <region 2>': 'Region Lore: <other region>',
  'Maneuver in Armor':       'Maneuvering in Armor',
}
const PREFIX_RENAMES = [['Writting: ', 'Written: ']]

const isSlot = name => /<[^>]+>/.test(name)

function isEmptyEntry(e) {
  return !e || (!e.label && !(e.ranks > 0) && !(e.culture_ranks > 0))
}

function isBlankOrphan(e) {
  return !e.label && !(e.ranks > 0) && !(e.culture_ranks > 0) && !e.item_bonus &&
    !e.talent_bonus && !e.proficient && !e.starred && !e.notes
}

/** Combine two entries for the same skill — keeps the higher ranks and any flags. */
function mergeEntries(a, b) {
  const out = { ...b, ...a }
  out.ranks         = Math.max(a.ranks ?? 0, b.ranks ?? 0)
  out.culture_ranks = Math.max(a.culture_ranks ?? 0, b.culture_ranks ?? 0)
  out.item_bonus    = a.item_bonus || b.item_bonus || 0
  out.talent_bonus  = a.talent_bonus || b.talent_bonus || 0
  if (a.proficient || b.proficient) out.proficient = true
  if (a.starred || b.starred) out.starred = true
  if (!out.culture_ranks) delete out.culture_ranks
  return out
}

export function migrateCharacter(input, templateNames) {
  const templates = templateNames instanceof Set ? templateNames : new Set(templateNames)
  const char   = JSON.parse(JSON.stringify(input))
  const skills = char.skills || {}
  const log    = []
  const moved  = {}   // old key → new key, for fixing references

  // Slot templates grouped by base: "Directed Spells" → ["Directed Spells: <type 1>", …]
  const slotsByBase = {}
  for (const t of templates) {
    const m = t.match(/^(.*?):\s*<[^>]+>$/)
    if (m) (slotsByBase[m[1]] ||= []).push(t)
  }

  function moveTo(oldKey, newKey, entry) {
    skills[newKey] = skills[newKey] && !isEmptyEntry(skills[newKey]) ? mergeEntries(skills[newKey], entry) : entry
    delete skills[oldKey]
    moved[oldKey] = newKey
    log.push(`${oldKey} → ${newKey}${entry.label ? ` [${entry.label}]` : ''}`)
  }

  for (const key of Object.keys(skills)) {
    if (templates.has(key)) continue
    const entry = skills[key] || {}

    // 1. Straight renames
    let target = RENAMES[key]
    for (const [from, to] of PREFIX_RENAMES) if (!target && key.startsWith(from)) target = to + key.slice(from.length)
    if (target && templates.has(target)) { moveTo(key, target, entry); continue }

    // 2. Unknown and holds nothing — drop it
    if (isBlankOrphan(entry)) { delete skills[key]; log.push(`removed empty ${key}`); continue }

    // 3. Bare base name that became specialization slots ("Fabric Craft" → "Fabric Craft: <specialty 1>")
    //    or a fixed specialization ("Directed Spells: Bolts" → "Directed Spells: <type 1>" labelled Bolts)
    const colon = key.indexOf(':')
    const base  = slotsByBase[key] ? key : colon > 0 ? key.slice(0, colon).trim() : null
    const spec  = slotsByBase[key] ? (entry.label || '') : colon > 0 ? key.slice(colon + 1).trim() : ''
    const slots = base && slotsByBase[base]
    if (!slots || isSlot(spec)) continue

    const withSpec = { ...entry, ...(spec ? { label: spec } : {}) }
    const same = spec && slots.find(s => skills[s]?.label === spec)
    if (same) { moveTo(key, same, withSpec); continue }
    const free = slots.find(s => isEmptyEntry(skills[s]))
    if (free) { moveTo(key, free, withSpec); continue }

    // All slots used — overflow into a custom skill on the first slot's template
    char.custom_skills = char.custom_skills || []
    char.custom_skills.push({
      id: `csk_mig_${Math.random().toString(36).slice(2, 9)}`,
      template_name: slots[0], label: spec,
      ranks: entry.ranks ?? 0, item_bonus: entry.item_bonus ?? 0, talent_bonus: entry.talent_bonus ?? 0,
      ...(entry.culture_ranks ? { culture_ranks: entry.culture_ranks } : {}),
      ...(entry.proficient ? { proficient: true } : {}),
      ...(entry.starred ? { starred: true } : {}),
    })
    delete skills[key]
    moved[key] = slots[0]
    log.push(`${key} → custom ${slots[0]} [${spec}]`)
  }

  // Custom skills whose template was split into slots ("Creature Lore" → "Creature Lore: <creature>")
  for (const cs of char.custom_skills || []) {
    if (!cs.template_name || templates.has(cs.template_name)) continue
    const slot = slotsByBase[cs.template_name]?.[0]
    if (slot) { log.push(`custom ${cs.template_name} [${cs.label}] → ${slot}`); cs.template_name = slot }
  }

  // Fix references to moved keys
  for (const sl of Object.values(char.spell_lists || {})) {
    const k = sl?.complementary?.skill
    if (k && moved[k]) sl.complementary.skill = moved[k]
  }
  for (const w of char.weapons || []) {
    if (w.skill_name && moved[w.skill_name]) w.skill_name = moved[w.skill_name]
  }

  char.skills = skills
  return { char: log.length ? char : input, changed: log.length > 0, log }
}
