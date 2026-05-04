// Foundry VTT RMU Sync Script Generator
// Produces a JavaScript string ready to paste into the Foundry F12 console.
// See memory/foundry_integration.md for schema reference.

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
  'Melee':             'Melee Weapons',
  'Ranged':            'Ranged Weapons',
  'Religion/Philosophy': 'Religion/Philosophy Lore',
  'Directed Spells':   'Directed Spell',
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
  // We only push development ranks (not culture_ranks — Foundry tracks those separately).
  const skillUpdates = []

  for (const [templateName, skillData] of Object.entries(char.skills || {})) {
    const ranks = skillData.ranks ?? 0
    if (ranks === 0) continue       // nothing to push
    const label = skillData.label || ''

    if (hasPlaceholder(templateName)) {
      // e.g. "Melee: <weapon 1>" with label "Dagger"
      // In Foundry these skills have system.name = the group-level name
      // and system.specialization = the specific weapon/item.
      // We translate our base name to the Foundry name (e.g. "Melee" → "Melee Weapons").
      if (label) {
        const ourBase     = templateName.split(':')[0].trim()
        const foundryName = ourBaseToFoundryName(ourBase)
        skillUpdates.push({
          name:           foundryName,
          specialization: label,
          ranks,
          _display:       `${ourBase}: ${label}`,
        })
      }
      // No label → nothing matchable, skip silently
    } else {
      skillUpdates.push({
        name:          templateName,
        specialization: null,
        ranks,
        _display:      templateName,
      })
    }
  }

  // Custom skill instances
  for (const cs of (char.custom_skills || [])) {
    const ranks = cs.ranks ?? 0
    if (!ranks) continue
    if (hasPlaceholder(cs.template_name)) {
      if (!cs.label) continue  // no label → nothing matchable in Foundry
      const ourBase     = cs.template_name.split(':')[0].trim()
      const foundryName = ourBaseToFoundryName(ourBase)
      skillUpdates.push({
        name:           foundryName,
        specialization: cs.label,
        ranks,
        _display:       `${ourBase}: ${cs.label}`,
      })
    } else {
      // Non-placeholder custom skill (rare): match by name directly
      skillUpdates.push({
        name:           cs.label || cs.template_name,
        specialization: null,
        ranks,
        _display:       cs.label || cs.template_name,
      })
    }
  }

  // ── Spell list updates ───────────────────────────────────────────────────────
  // Spell lists in Foundry are skill items with category "Spellcasting".
  // system.specialization = the list name (e.g. "D'rekian Disease")
  const spellUpdates = []
  for (const [listName, listData] of Object.entries(char.spell_lists || {})) {
    const ranks = listData.ranks ?? 0
    if (!ranks) continue
    spellUpdates.push({ listName, ranks })
  }

  // ── Build script ─────────────────────────────────────────────────────────────
  const now  = new Date().toLocaleString()
  const L    = []   // output lines

  L.push(`// ${'═'.repeat(65)}`)
  L.push(`// Foundry RMU Sync — ${char.name}`)
  L.push(`// Generated: ${now}`)
  L.push(`// Paste into the Foundry console (F12 → Console tab) and press Enter.`)
  L.push(`// Skills/spells must already exist as items on the actor.`)
  L.push(`// ${'═'.repeat(65)}`)
  L.push(``)
  L.push(`(async () => {`)
  L.push(`  const actorName = ${JSON.stringify(char.name)};`)
  L.push(`  const actor = game.actors.getName(actorName);`)
  L.push(`  if (!actor) {`)
  L.push(`    ui.notifications.error(\`Actor "\${actorName}" not found — check the name matches exactly.\`);`)
  L.push(`    return;`)
  L.push(`  }`)
  L.push(``)

  // Flat update
  L.push(`  // ── Stats · Health · Level ────────────────────────────────────────`)
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
    L.push(`  // ── Skill ranks (${skillUpdates.length} skills) ────────────────────────────────────`)
    L.push(`  // Skills must already exist as embedded items on the actor.`)
    L.push(`  // Any skill not found is listed in the console as a warning.`)
    // Strip internal _display field before serialising
    const exportSkills = skillUpdates.map(({ name, specialization, ranks }) => ({ name, specialization, ranks }))
    L.push(`  const skillUpdates = ${indent(JSON.stringify(exportSkills, null, 2), 2)};`)
    L.push(`  // Display names for warnings:`)
    const displayMap = Object.fromEntries(
      skillUpdates.map(u => [`${u.name}|${u.specialization ?? ''}`, u._display])
    )
    L.push(`  const _displayNames = ${indent(JSON.stringify(displayMap, null, 2), 2)};`)
    L.push(``)
    L.push(`  let skillsOk = 0; const skillsMissed = [];`)
    L.push(`  for (const upd of skillUpdates) {`)
    L.push(`    const item = actor.items.find(i =>`)
    L.push(`      i.type === 'skill' &&`)
    L.push(`      i.system.category !== 'Spellcasting' &&`)
    L.push(`      i.system.name === upd.name &&`)
    L.push(`      (upd.specialization == null || i.system.specialization === upd.specialization)`)
    L.push(`    );`)
    L.push(`    if (item) { await item.update({ 'system.ranks': upd.ranks }); skillsOk++; }`)
    L.push(`    else { skillsMissed.push(_displayNames[\`\${upd.name}|\${upd.specialization ?? ''}\`] || upd.name); }`)
    L.push(`  }`)
    L.push(`  if (skillsMissed.length) console.warn('[RMU Sync] Skills not found on actor:', skillsMissed);`)
    L.push(``)
  }

  // Spell lists
  if (spellUpdates.length > 0) {
    L.push(`  // ── Spell list ranks (${spellUpdates.length} lists) ─────────────────────────────────`)
    L.push(`  const spellUpdates = ${indent(JSON.stringify(spellUpdates, null, 2), 2)};`)
    L.push(``)
    L.push(`  let spellsOk = 0; const spellsMissed = [];`)
    L.push(`  for (const upd of spellUpdates) {`)
    L.push(`    const item = actor.items.find(i =>`)
    L.push(`      i.type === 'skill' &&`)
    L.push(`      i.system.category === 'Spellcasting' &&`)
    L.push(`      i.system.specialization === upd.listName`)
    L.push(`    );`)
    L.push(`    if (item) { await item.update({ 'system.ranks': upd.ranks }); spellsOk++; }`)
    L.push(`    else { spellsMissed.push(upd.listName); }`)
    L.push(`  }`)
    L.push(`  if (spellsMissed.length) console.warn('[RMU Sync] Spell lists not found:', spellsMissed);`)
    L.push(``)
  }

  // Summary notification
  L.push(`  // ── Summary ───────────────────────────────────────────────────────`)
  L.push(`  const parts = ['Stats & health synced'];`)
  if (skillUpdates.length)  L.push(`  parts.push(\`\${skillsOk}/${skillUpdates.length} skills\`);`)
  if (spellUpdates.length)  L.push(`  parts.push(\`\${spellsOk}/${spellUpdates.length} spell lists\`);`)
  L.push(`  ui.notifications.info('[RMU Sync] ' + parts.join(' · '));`)
  if (skillUpdates.length)  L.push(`  if (skillsMissed.length) ui.notifications.warn(\`[RMU Sync] \${skillsMissed.length} skill(s) not found on actor — see console\`);`)
  if (spellUpdates.length)  L.push(`  if (spellsMissed.length) ui.notifications.warn(\`[RMU Sync] \${spellsMissed.length} spell list(s) not found on actor — see console\`);`)
  L.push(`})();`)

  return L.join('\n')
}
