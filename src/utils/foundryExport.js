// Foundry RMU Console Tools — generators for player-side console pushes.
//
// Two generators, both producing self-contained JS the user pastes into the
// Foundry F12 console. They work for a regular player on a character they OWN
// (no GM, no module install) — Foundry validates ownership server-side.
//
//  - generateFoundryScript(char)         → push stats/skills/spell-list ranks,
//                                           with a current→new diff preview and
//                                           a verify-after-write pass.
//  - generateTalentInjectionScript(char) → inject talents from the rmu.core
//                                           compendium, bypassing the RMU sheet's
//                                           "level up first" edit lock.
//  - analyzeSync(char)                   → pre-flight analysis the UI shows BEFORE
//                                           running (what will/won't sync + why).

import { getBaseHits, getPowerPoints } from './calc.js'
import skillsData from '../data/skills.json'
import talentsData from '../data/talents.json'

const STAT_ABBR = {
  'Agility':'Ag','Constitution':'Co','Empathy':'Em','Intuition':'In','Memory':'Me',
  'Presence':'Pr','Quickness':'Qu','Reasoning':'Re','Self Discipline':'SD','Strength':'St',
}

const OUR_BASE_TO_FOUNDRY = {
  'Melee':'Melee Weapons','Ranged':'Ranged Weapons',
  'Religion/Philosophy':'Religion/Philosophy Lore','Directed Spells':'Directed Spell',
}
const ourBaseToFoundryName = b => OUR_BASE_TO_FOUNDRY[b] || b
const hasPlaceholder = n => /<[^>]+>/.test(n)

// Bases that are specializable in Foundry (the app gives them placeholder slots).
// A custom skill whose template is NOT in this set can't map to a distinct
// Foundry item (e.g. a second "Perception" split for hearing) — it gets reported.
const SPECIALIZABLE_BASES = (() => {
  const bases = {}
  for (const s of skillsData) {
    const base = s.name.includes(':') ? s.name.split(':')[0].trim() : s.name
    ;(bases[base] = bases[base] || []).push(s.name)
  }
  return new Set(Object.keys(bases).filter(b => bases[b].some(hasPlaceholder)))
})()

// talent_id -> Foundry compendium name (prefer rmu_canonical_name)
const TALENT_ID_TO_NAME = (() => {
  const m = {}
  for (const t of talentsData) {
    if (t.id) m[t.id] = { name: t.rmu_canonical_name || t.name, hasCanonical: !!t.rmu_canonical_name, is_flaw: !!t.is_flaw }
  }
  return m
})()

function indent(jsonStr, spaces) {
  const pad = ' '.repeat(spaces)
  return jsonStr.split('\n').map((l, i) => i === 0 ? l : pad + l).join('\n')
}

// ── Pre-flight analysis (shown in the UI before the user runs anything) ──────
export function analyzeSync(char) {
  const skillUpdates = []
  const spellUpdates = []
  const cannotSync = []   // [{ display, reason }]

  // Regular skills
  for (const [templateName, data] of Object.entries(char.skills || {})) {
    const ranks = data?.ranks ?? 0
    if (ranks === 0) continue
    const label = data.label || ''
    if (hasPlaceholder(templateName)) {
      if (!label) { cannotSync.push({ display: templateName, reason: 'placeholder skill with no specialization filled in' }); continue }
      const ourBase = templateName.split(':')[0].trim()
      skillUpdates.push({ name: ourBaseToFoundryName(ourBase), specialization: label, ranks, _display: `${ourBase}: ${label}` })
    } else {
      const ci = templateName.indexOf(':')
      if (ci >= 0) {
        const ourBase = templateName.slice(0, ci).trim()
        const spec = templateName.slice(ci + 1).trim()
        skillUpdates.push({ name: ourBaseToFoundryName(ourBase), specialization: spec, ranks, _display: templateName })
      } else {
        skillUpdates.push({ name: templateName, specialization: null, ranks, _display: templateName })
      }
    }
  }

  // Custom skills — detect app-only splits (non-specializable base) that can't sync
  for (const cs of (char.custom_skills || [])) {
    const ranks = cs.ranks ?? 0
    if (!ranks) continue
    const base = cs.template_name || ''
    const label = cs.label || ''
    if (hasPlaceholder(base)) {
      if (!label) { cannotSync.push({ display: base, reason: 'custom placeholder skill with no specialization' }); continue }
      const ourBase = base.split(':')[0].trim()
      skillUpdates.push({ name: ourBaseToFoundryName(ourBase), specialization: label, ranks, _display: `${ourBase}: ${label}` })
    } else if (SPECIALIZABLE_BASES.has(base)) {
      // e.g. custom "Materials Lore" + label "Fabrics" → Foundry Materials Lore/Fabrics
      if (!label) { cannotSync.push({ display: base, reason: 'custom specializable skill with no specialization' }); continue }
      skillUpdates.push({ name: ourBaseToFoundryName(base), specialization: label, ranks, _display: `${base}: ${label}` })
    } else {
      // Non-specializable base (e.g. a 2nd "Perception" split for hearing) — no Foundry target
      cannotSync.push({
        display: label ? `${base} (${label})` : base,
        reason: `app-only split — Foundry has a single non-specialized "${base}", so a separate "${label || base}" entry can't be pushed. Your base ${base} ranks still sync.`,
      })
    }
  }

  // Spell lists
  for (const [listName, data] of Object.entries(char.spell_lists || {})) {
    const ranks = data?.ranks ?? 0
    if (!ranks) continue
    spellUpdates.push({ listName, ranks })
  }

  // Talents (for injection) — resolve id -> compendium name
  const talentInjects = []
  const unknownTalents = []
  for (const t of (char.talents || [])) {
    const meta = TALENT_ID_TO_NAME[t.talent_id]
    if (meta && meta.hasCanonical) {
      talentInjects.push({ name: meta.name, tier: t.tier ?? 1, param: t.param || null, is_flaw: meta.is_flaw, _id: t.talent_id })
    } else {
      unknownTalents.push({
        display: meta?.name || t.talent_id,
        reason: meta ? 'no RMU-core compendium match (likely a non-core / PDF talent) — add manually in Foundry' : `unknown talent id "${t.talent_id}"`,
      })
    }
  }

  return { skillUpdates, spellUpdates, cannotSync, talentInjects, unknownTalents }
}

// ── Console PUSH script (stats/skills/spell-list ranks) ──────────────────────
export function generateFoundryScript(char) {
  const { skillUpdates, spellUpdates, cannotSync } = analyzeSync(char)

  const hitsMax = char.hits_max   ?? getBaseHits(char)    ?? 0
  const ppMax   = char.power_points_max ?? getPowerPoints(char) ?? 0
  const hitsVal = char.hits_current          ?? hitsMax
  const ppVal   = char.power_points_current  ?? ppMax

  const statsBlock = {}
  for (const [fullName, statData] of Object.entries(char.stats || {})) {
    const abbr = STAT_ABBR[fullName]; if (!abbr) continue
    statsBlock[abbr] = { tmp: statData.temp ?? 50, pot: statData.potential ?? 50, other: statData.special ?? 0 }
  }

  const flatUpdate = {
    system: {
      realm: char.realm || '',
      experience: { level: char.level ?? 1, xp: char.experience ?? 0 },
      stats: statsBlock,
      health: { hp: { value: hitsVal, max: hitsMax }, power: { value: ppVal, max: ppMax } },
    },
  }
  const exportSkills = skillUpdates.map(({ name, specialization, ranks }) => ({ name, specialization, ranks }))
  const displayMap = Object.fromEntries(skillUpdates.map(u => [`${u.name}|${u.specialization ?? ''}`, u._display]))

  const L = []
  L.push(`// ${'═'.repeat(70)}`)
  L.push(`// RMU Character+  →  Foundry console PUSH — ${char.name}`)
  L.push(`// Generated: ${new Date().toLocaleString()}`)
  L.push(`//`)
  L.push(`// 1. Open YOUR character's sheet (or select its token) in Foundry.`)
  L.push(`// 2. F12 → Console tab. If warned, type  allow pasting  ↵`)
  L.push(`// 3. Paste this whole script ↵`)
  L.push(`//`)
  L.push(`// Safe: only updates ranks/stats/health/level on a character you OWN. It`)
  L.push(`// previews a diff in the console, applies, then re-reads to verify. It never`)
  L.push(`// deletes or replaces items.`)
  if (cannotSync.length) {
    L.push(`//`)
    L.push(`// NOTE — ${cannotSync.length} entr${cannotSync.length === 1 ? 'y' : 'ies'} can't be pushed (shown in the report at the end):`)
    for (const c of cannotSync) L.push(`//   • ${c.display} — ${c.reason}`)
  }
  L.push(`// ${'═'.repeat(70)}`)
  L.push(``)
  L.push(`(async () => {`)
  L.push(`  let actor = canvas?.tokens?.controlled?.[0]?.actor || game.user?.character || game.actors.getName(${JSON.stringify(char.name)});`)
  L.push(`  if (!actor) return ui.notifications.error('[RMU Sync] No character found — select your token or open your sheet, then re-run.');`)
  L.push(`  if (actor.type !== 'Character') return ui.notifications.error('[RMU Sync] Selected actor is not a Character.');`)
  L.push(`  if (!actor.isOwner) return ui.notifications.error('[RMU Sync] You do not own "' + actor.name + '".');`)
  L.push(``)
  L.push(`  const isSpellList = (i) => i.type === 'spell-list' || (i.type === 'skill' && i.system?.category === 'Spellcasting');`)
  L.push(`  const spellListName = (i) => i.type === 'spell-list' ? (i.system?.specialization || i.system?.name || i.name) : (i.system?.specialization || null);`)
  L.push(`  const isRegularSkill = (i) => i.type === 'skill' && i.system?.category !== 'Spellcasting';`)
  L.push(`  const validRanks = (n) => Number.isFinite(n) && n >= 0 && n <= 100;`)
  L.push(``)
  L.push(`  const flatUpdate = ${indent(JSON.stringify(flatUpdate, null, 2), 2)};`)
  L.push(`  const skillUpdates = ${indent(JSON.stringify(exportSkills, null, 2), 2)};`)
  L.push(`  const _names = ${indent(JSON.stringify(displayMap, null, 2), 2)};`)
  L.push(`  const spellUpdates = ${indent(JSON.stringify(spellUpdates, null, 2), 2)};`)
  L.push(`  const cannotSync = ${indent(JSON.stringify(cannotSync, null, 2), 2)};`)
  L.push(``)
  L.push(`  // ── PREVIEW: build a current→new diff before touching anything ──`)
  L.push(`  const plan = []; const missed = [];`)
  L.push(`  for (const upd of skillUpdates) {`)
  L.push(`    if (!validRanks(upd.ranks)) { missed.push({ display: _names[upd.name+'|'+(upd.specialization??'')]||upd.name, reason: 'invalid rank value '+upd.ranks }); continue; }`)
  L.push(`    const item = actor.items.find(i => isRegularSkill(i) && i.system.name === upd.name && (upd.specialization == null || i.system.specialization === upd.specialization));`)
  L.push(`    const display = _names[upd.name+'|'+(upd.specialization??'')] || upd.name;`)
  L.push(`    if (!item) { missed.push({ display, reason: 'no matching skill on actor (GM must add it in chargen)' }); continue; }`)
  L.push(`    plan.push({ kind:'skill', display, item, from: item.system.ranks ?? 0, to: upd.ranks });`)
  L.push(`  }`)
  L.push(`  for (const upd of spellUpdates) {`)
  L.push(`    if (!validRanks(upd.ranks)) { missed.push({ display: upd.listName, reason: 'invalid rank value '+upd.ranks }); continue; }`)
  L.push(`    const item = actor.items.find(i => isSpellList(i) && spellListName(i) === upd.listName);`)
  L.push(`    if (!item) { missed.push({ display: upd.listName, reason: 'no matching spell list on actor' }); continue; }`)
  L.push(`    plan.push({ kind:'spell', display: upd.listName, item, from: item.system.ranks ?? 0, to: upd.ranks });`)
  L.push(`  }`)
  L.push(``)
  L.push(`  console.log('%c[RMU Sync] Preview — '+actor.name, 'font-weight:bold;font-size:13px');`)
  L.push(`  console.table(plan.map(p => ({ type:p.kind, name:p.display, current:p.from, new:p.to, change:(p.to===p.from?'—':(p.to>p.from?'+':'')+(p.to-p.from)) })));`)
  L.push(`  if (missed.length) console.warn('[RMU Sync] Will NOT update (' + missed.length + '):', missed.map(m=>m.display+' — '+m.reason));`)
  L.push(`  if (cannotSync.length) console.warn('[RMU Sync] App-only (cannot sync):', cannotSync.map(c=>c.display+' — '+c.reason));`)
  L.push(``)
  L.push(`  // ── APPLY ──`)
  L.push(`  await actor.update(flatUpdate);`)
  L.push(`  let applied = 0;`)
  L.push(`  for (const p of plan) { if (p.to !== p.from) { await p.item.update({ 'system.ranks': p.to }); applied++; } }`)
  L.push(``)
  L.push(`  // ── VERIFY (read back) ──`)
  L.push(`  const failed = [];`)
  L.push(`  for (const p of plan) { const cur = actor.items.get(p.item.id)?.system?.ranks; if (cur !== p.to) failed.push(p.display + ' (got ' + cur + ', wanted ' + p.to + ')'); }`)
  L.push(`  const f2 = game.actors.get(actor.id);`)
  L.push(`  const lvlOk = f2.system?.experience?.level === flatUpdate.system.experience.level;`)
  L.push(``)
  L.push(`  // ── REPORT ──`)
  L.push(`  const parts = ['stats/health/level' + (lvlOk ? ' ✓' : ' ⚠')];`)
  L.push(`  parts.push(applied + ' rank update' + (applied===1?'':'s') + ' applied');`)
  L.push(`  if (missed.length) parts.push(missed.length + ' not found');`)
  L.push(`  if (cannotSync.length) parts.push(cannotSync.length + ' app-only');`)
  L.push(`  ui.notifications.info('[RMU Sync] ' + parts.join(' · '));`)
  L.push(`  if (failed.length) ui.notifications.error('[RMU Sync] ' + failed.length + ' update(s) did NOT verify — see console (F12).');`)
  L.push(`  if (failed.length) console.error('[RMU Sync] Verify failures:', failed);`)
  L.push(`  if (missed.length || cannotSync.length) ui.notifications.warn('[RMU Sync] ' + (missed.length+cannotSync.length) + ' item(s) skipped — see console (F12) for the list + reasons.');`)
  L.push(`  console.log('%c[RMU Sync] Done.', 'color:#4c8bf5;font-weight:bold');`)
  L.push(`})();`)
  return L.join('\n')
}

// ── Console TALENT INJECTION script (bypasses the sheet's level-up edit lock) ─
export function generateTalentInjectionScript(char) {
  const { talentInjects, unknownTalents } = analyzeSync(char)

  const L = []
  L.push(`// ${'═'.repeat(70)}`)
  L.push(`// RMU Character+  →  Foundry TALENT INJECTION — ${char.name}`)
  L.push(`// Generated: ${new Date().toLocaleString()}`)
  L.push(`//`)
  L.push(`// Adds talents to a character you OWN, even when the RMU sheet's "level up`)
  L.push(`// first" lock blocks the edit buttons. Pulls the real talent items from the`)
  L.push(`// rmu.core compendium so they're properly configured.`)
  L.push(`//`)
  L.push(`// 1. Open YOUR character's sheet (or select its token).`)
  L.push(`// 2. F12 → Console. If warned, type  allow pasting  ↵`)
  L.push(`// 3. Paste this ↵   then reload the world (F5) so effects recompute.`)
  if (unknownTalents.length) {
    L.push(`//`)
    L.push(`// NOTE — ${unknownTalents.length} talent(s) can't be injected (not in rmu.core):`)
    for (const u of unknownTalents) L.push(`//   • ${u.display} — ${u.reason}`)
  }
  L.push(`// ${'═'.repeat(70)}`)
  L.push(``)
  L.push(`(async () => {`)
  L.push(`  let actor = canvas?.tokens?.controlled?.[0]?.actor || game.user?.character || game.actors.getName(${JSON.stringify(char.name)});`)
  L.push(`  if (!actor) return ui.notifications.error('[RMU Talents] No character found — select your token or open your sheet.');`)
  L.push(`  if (actor.type !== 'Character') return ui.notifications.error('[RMU Talents] Selected actor is not a Character.');`)
  L.push(`  if (!actor.isOwner) return ui.notifications.error('[RMU Talents] You do not own "' + actor.name + '".');`)
  L.push(``)
  L.push(`  const wanted = ${indent(JSON.stringify(talentInjects.map(t => ({ name: t.name, tier: t.tier, param: t.param })), null, 2), 2)};`)
  L.push(`  if (!wanted.length) return ui.notifications.info('[RMU Talents] No injectable talents on this character.');`)
  L.push(``)
  L.push(`  const pack = game.packs.get('rmu.core');`)
  L.push(`  if (!pack) return ui.notifications.error('[RMU Talents] rmu.core compendium not found on this server.');`)
  L.push(`  const index = await pack.getIndex();`)
  L.push(``)
  L.push(`  const toCreate = []; const skipped = []; const notFound = [];`)
  L.push(`  for (const w of wanted) {`)
  L.push(`    // already present?`)
  L.push(`    const existing = actor.items.find(i => i.type === 'talent' && (i.system?.name || i.name) === w.name);`)
  L.push(`    if (existing) { skipped.push(w.name + ' (already on character)'); continue; }`)
  L.push(`    const entry = index.find(e => e.type === 'talent' && e.name === w.name);`)
  L.push(`    if (!entry) { notFound.push(w.name); continue; }`)
  L.push(`    const doc = await pack.getDocument(entry._id);`)
  L.push(`    const data = doc.toObject();`)
  L.push(`    data.system.tier = w.tier ?? 1;`)
  L.push(`    toCreate.push({ data, label: w.name + (w.param ? ' ('+w.param+')' : '') + ' T' + (w.tier ?? 1) });`)
  L.push(`  }`)
  L.push(``)
  L.push(`  console.log('%c[RMU Talents] Plan for '+actor.name, 'font-weight:bold;font-size:13px');`)
  L.push(`  console.table({ inject: toCreate.map(c=>c.label), skipped, notFound });`)
  L.push(``)
  L.push(`  if (toCreate.length) await actor.createEmbeddedDocuments('Item', toCreate.map(c => c.data));`)
  L.push(``)
  L.push(`  const parts = [toCreate.length + ' talent(s) injected'];`)
  L.push(`  if (skipped.length) parts.push(skipped.length + ' already present');`)
  L.push(`  if (notFound.length) parts.push(notFound.length + ' not in compendium');`)
  L.push(`  ui.notifications.info('[RMU Talents] ' + parts.join(' · '));`)
  L.push(`  if (toCreate.length) ui.notifications.warn('[RMU Talents] Reload the world (F5) so talent effects recompute.');`)
  L.push(`  if (notFound.length) { ui.notifications.warn('[RMU Talents] ' + notFound.length + ' not found (non-core/PDF) — see console.'); console.warn('[RMU Talents] Not in rmu.core:', notFound); }`)
  L.push(`})();`)
  return L.join('\n')
}
