// Foundry RMU Console-Push Script Generator
// Produces a self-contained JavaScript snippet the user pastes into the Foundry
// F12 console. Works for a regular player on a character they OWN — no GM rights,
// no module install. Foundry validates ownership server-side, so actor.update()
// and item.update() succeed for an owner.
//
// The generated script mirrors the proven push logic of the rmu-character-plus-sync
// module (version-agnostic spell-list handling for RMU 1.1.x and 1.2.x).

import { getBaseHits, getPowerPoints } from './calc.js'

const STAT_ABBR = {
  'Agility':        'Ag',
  'Constitution':   'Co',
  'Empathy':        'Em',
  'Intuition':      'In',
  'Memory':         'Me',
  'Presence':       'Pr',
  'Quickness':      'Qu',
  'Reasoning':      'Re',
  'Self Discipline':'SD',
  'Strength':       'St',
}

function hasPlaceholder(name) {
  return /<[^>]+>/.test(name)
}

// Our template base name → Foundry system.name for special cases where they differ
const OUR_BASE_TO_FOUNDRY = {
  'Melee':               'Melee Weapons',
  'Ranged':              'Ranged Weapons',
  'Religion/Philosophy': 'Religion/Philosophy Lore',
  'Directed Spells':     'Directed Spell',
}

function ourBaseToFoundryName(baseName) {
  return OUR_BASE_TO_FOUNDRY[baseName] || baseName
}

function indent(jsonStr, spaces) {
  const pad = ' '.repeat(spaces)
  return jsonStr.split('\n').map((l, i) => i === 0 ? l : pad + l).join('\n')
}

export function generateFoundryScript(char) {
  const hitsMax = char.hits_max   ?? getBaseHits(char)    ?? 0
  const ppMax   = char.power_points_max ?? getPowerPoints(char) ?? 0
  const hitsVal = char.hits_current          ?? hitsMax
  const ppVal   = char.power_points_current  ?? ppMax

  // ── Stat block ──────────────────────────────────────────────────────────────
  const statsBlock = {}
  for (const [fullName, statData] of Object.entries(char.stats || {})) {
    const abbr = STAT_ABBR[fullName]
    if (!abbr) continue
    statsBlock[abbr] = {
      tmp:   statData.temp      ?? 50,
      pot:   statData.potential ?? 50,
      other: statData.special   ?? 0,
    }
  }

  // ── Skill updates ────────────────────────────────────────────────────────────
  // Push development ranks only (culture_ranks are managed by Foundry chargen).
  const skillUpdates = []

  for (const [templateName, skillData] of Object.entries(char.skills || {})) {
    const ranks = skillData.ranks ?? 0
    if (ranks === 0) continue       // nothing to push
    const label = skillData.label || ''

    if (hasPlaceholder(templateName)) {
      // "Melee: <weapon 1>" with label "Dagger" → Foundry {name:"Melee Weapons", specialization:"Dagger"}
      if (label) {
        const ourBase     = templateName.split(':')[0].trim()
        const foundryName = ourBaseToFoundryName(ourBase)
        skillUpdates.push({ name: foundryName, specialization: label, ranks, _display: `${ourBase}: ${label}` })
      }
    } else {
      // "Influence: Charm" (fixed spec) or plain "Perception"
      const colonIdx = templateName.indexOf(':')
      if (colonIdx >= 0) {
        const ourBase = templateName.slice(0, colonIdx).trim()
        const spec    = templateName.slice(colonIdx + 1).trim()
        const foundryName = ourBaseToFoundryName(ourBase)
        skillUpdates.push({ name: foundryName, specialization: spec, ranks, _display: templateName })
      } else {
        skillUpdates.push({ name: templateName, specialization: null, ranks, _display: templateName })
      }
    }
  }

  // Custom skill instances
  for (const cs of (char.custom_skills || [])) {
    const ranks = cs.ranks ?? 0
    if (!ranks) continue
    if (hasPlaceholder(cs.template_name)) {
      if (!cs.label) continue
      const ourBase     = cs.template_name.split(':')[0].trim()
      const foundryName = ourBaseToFoundryName(ourBase)
      skillUpdates.push({ name: foundryName, specialization: cs.label, ranks, _display: `${ourBase}: ${cs.label}` })
    } else {
      skillUpdates.push({ name: cs.label || cs.template_name, specialization: null, ranks, _display: cs.label || cs.template_name })
    }
  }

  // ── Spell list updates ───────────────────────────────────────────────────────
  const spellUpdates = []
  for (const [listName, listData] of Object.entries(char.spell_lists || {})) {
    const ranks = listData.ranks ?? 0
    if (!ranks) continue
    spellUpdates.push({ listName, ranks })
  }

  // ── Build script ─────────────────────────────────────────────────────────────
  const now  = new Date().toLocaleString()
  const L    = []

  L.push(`// ${'═'.repeat(68)}`)
  L.push(`// RMU Character+  →  Foundry console push — ${char.name}`)
  L.push(`// Generated: ${now}`)
  L.push(`//`)
  L.push(`// HOW TO USE:`)
  L.push(`//  1. Open YOUR character's actor sheet in Foundry (so it's the selected token,`)
  L.push(`//     or it's set as your assigned character).`)
  L.push(`//  2. Press F12 to open the browser console, click the "Console" tab.`)
  L.push(`//  3. If the browser shows a "Don't paste code here" warning, type  allow pasting`)
  L.push(`//     and press Enter (one-time safety prompt).`)
  L.push(`//  4. Paste this whole script and press Enter.`)
  L.push(`//`)
  L.push(`// You must OWN the character. Skills/spell lists must already exist on the actor`)
  L.push(`// (they're created when the GM builds your character). This only updates ranks +`)
  L.push(`// stats/health/level — it never deletes or replaces anything.`)
  L.push(`// ${'═'.repeat(68)}`)
  L.push(``)
  L.push(`(async () => {`)
  L.push(`  // ── Find your character: selected token → assigned character → by name ──`)
  L.push(`  const wantedName = ${JSON.stringify(char.name)};`)
  L.push(`  let actor = canvas?.tokens?.controlled?.[0]?.actor`)
  L.push(`           || game.user?.character`)
  L.push(`           || game.actors.getName(wantedName);`)
  L.push(`  if (!actor) {`)
  L.push(`    ui.notifications.error('[RMU Sync] No character found. Select your token or open your sheet, then re-run.');`)
  L.push(`    return;`)
  L.push(`  }`)
  L.push(`  if (actor.type !== 'Character') {`)
  L.push(`    ui.notifications.error('[RMU Sync] Selected actor is not a Character.');`)
  L.push(`    return;`)
  L.push(`  }`)
  L.push(`  if (!actor.isOwner) {`)
  L.push(`    ui.notifications.error('[RMU Sync] You do not own "' + actor.name + '" — ask your GM for ownership.');`)
  L.push(`    return;`)
  L.push(`  }`)
  L.push(`  console.log('[RMU Sync] Pushing to:', actor.name);`)
  L.push(``)
  L.push(`  // ── Version-agnostic helpers (RMU 1.1.x and 1.2.x) ──`)
  L.push(`  const isSpellList = (i) => i.type === 'spell-list' || (i.type === 'skill' && i.system?.category === 'Spellcasting');`)
  L.push(`  const spellListName = (i) => i.type === 'spell-list'`)
  L.push(`      ? (i.system?.specialization || i.system?.name || i.name)`)
  L.push(`      : (i.system?.specialization || null);`)
  L.push(`  const isRegularSkill = (i) => i.type === 'skill' && i.system?.category !== 'Spellcasting';`)
  L.push(``)

  // Flat update
  L.push(`  // ── Stats · Health · Level · Realm ──`)
  const flatUpdate = {
    system: {
      realm: char.realm || '',
      experience: { level: char.level ?? 1, xp: char.experience ?? 0 },
      stats: statsBlock,
      health: {
        hp:    { value: hitsVal, max: hitsMax },
        power: { value: ppVal,   max: ppMax   },
      },
    },
  }
  L.push(`  await actor.update(${indent(JSON.stringify(flatUpdate, null, 2), 2)});`)
  L.push(``)

  // Skills
  if (skillUpdates.length > 0) {
    L.push(`  // ── Skill ranks (${skillUpdates.length}) ──`)
    const exportSkills = skillUpdates.map(({ name, specialization, ranks }) => ({ name, specialization, ranks }))
    L.push(`  const skillUpdates = ${indent(JSON.stringify(exportSkills, null, 2), 2)};`)
    const displayMap = Object.fromEntries(
      skillUpdates.map(u => [`${u.name}|${u.specialization ?? ''}`, u._display])
    )
    L.push(`  const _names = ${indent(JSON.stringify(displayMap, null, 2), 2)};`)
    L.push(`  let skillsOk = 0; const skillsMissed = [];`)
    L.push(`  for (const upd of skillUpdates) {`)
    L.push(`    const item = actor.items.find(i =>`)
    L.push(`      isRegularSkill(i) &&`)
    L.push(`      i.system.name === upd.name &&`)
    L.push(`      (upd.specialization == null || i.system.specialization === upd.specialization)`)
    L.push(`    );`)
    L.push(`    if (item) { await item.update({ 'system.ranks': upd.ranks }); skillsOk++; }`)
    L.push(`    else { skillsMissed.push(_names[\`\${upd.name}|\${upd.specialization ?? ''}\`] || upd.name); }`)
    L.push(`  }`)
    L.push(`  if (skillsMissed.length) console.warn('[RMU Sync] Skills not found on actor:', skillsMissed);`)
    L.push(``)
  }

  // Spell lists
  if (spellUpdates.length > 0) {
    L.push(`  // ── Spell list ranks (${spellUpdates.length}) ──`)
    L.push(`  const spellUpdates = ${indent(JSON.stringify(spellUpdates, null, 2), 2)};`)
    L.push(`  let spellsOk = 0; const spellsMissed = [];`)
    L.push(`  for (const upd of spellUpdates) {`)
    L.push(`    const item = actor.items.find(i => isSpellList(i) && spellListName(i) === upd.listName);`)
    L.push(`    if (item) { await item.update({ 'system.ranks': upd.ranks }); spellsOk++; }`)
    L.push(`    else { spellsMissed.push(upd.listName); }`)
    L.push(`  }`)
    L.push(`  if (spellsMissed.length) console.warn('[RMU Sync] Spell lists not found:', spellsMissed);`)
    L.push(``)
  }

  // Summary
  L.push(`  // ── Summary ──`)
  L.push(`  const parts = ['Stats/health/level synced'];`)
  if (skillUpdates.length)  L.push(`  parts.push(skillsOk + '/' + ${skillUpdates.length} + ' skills');`)
  if (spellUpdates.length)  L.push(`  parts.push(spellsOk + '/' + ${spellUpdates.length} + ' spell lists');`)
  L.push(`  ui.notifications.info('[RMU Sync] ' + parts.join(' · '));`)
  if (skillUpdates.length)  L.push(`  if (skillsMissed.length) ui.notifications.warn('[RMU Sync] ' + skillsMissed.length + ' skill(s) not found — see console (F12).');`)
  if (spellUpdates.length)  L.push(`  if (spellsMissed.length) ui.notifications.warn('[RMU Sync] ' + spellsMissed.length + ' spell list(s) not found — see console (F12).');`)
  L.push(`})();`)

  return L.join('\n')
}
