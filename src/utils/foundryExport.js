// Foundry RMU Console Tools — generators for player-side console pushes.
//
// Self-contained JS the user pastes into the Foundry F12 console. They work for a
// regular player on a character they OWN (no GM, no module install) — Foundry
// validates ownership server-side.
//
//  - generateFoundryScript(char)     → PUSH: update existing values — stats,
//                                       health, level, skill ranks, spell-list
//                                       ranks, and KNACKS — with a current→new
//                                       diff preview and a verify-after-write pass.
//  - generateInjectionScript(char)   → INJECT: add items from compendium — talents
//                                       (bypassing the sheet's "level up first"
//                                       lock), weapons, and equipment. Searches
//                                       ALL packs (system + module/PDF), so content
//                                       from non-core modules is found too.
//  - analyzeSync(char)               → pre-flight analysis the UI shows BEFORE
//                                       running (what will/won't sync + why).

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

  // Talents (for injection) — resolve id -> compendium name.
  // Searches ALL packs in Foundry at run time, so even talents WITHOUT a known
  // rmu-core canonical name are worth attempting (they may live in a PDF module).
  const talentInjects = []
  const unknownTalents = []
  for (const t of (char.talents || [])) {
    const meta = TALENT_ID_TO_NAME[t.talent_id]
    const name = meta?.name
    if (name) {
      talentInjects.push({ name, tier: t.tier ?? 1, param: t.param || null, is_flaw: !!meta.is_flaw, _id: t.talent_id })
    } else {
      unknownTalents.push({ display: t.talent_id, reason: `unknown talent id "${t.talent_id}" — no name to search for` })
    }
  }

  // Weapons (for injection) — match a compendium weapon by name; carry the
  // app's magical/item bonus onto system.magical.bonus.
  const weaponInjects = []
  for (const w of (char.weapons || [])) {
    if (!w?.name) continue
    weaponInjects.push({ name: w.name, magicBonus: Number(w.item_bonus) || 0, fumble: w.fumble ?? null })
  }

  // Equipment + magic items (for injection) — match a compendium equipment item
  // by name; fall back to a plain item if not found (inventory is freeform).
  const equipmentInjects = []
  for (const e of (char.equipment || [])) {
    if (!e?.name) continue
    equipmentInjects.push({ name: e.name, quantity: Number(e.qty) || 1, weight: Number(e.weight) || 0, kind: 'equipment' })
  }
  for (const m of (char.magic_items || [])) {
    if (!m?.name) continue
    equipmentInjects.push({ name: m.name, quantity: 1, weight: Number(m.weight) || 0, kind: 'magic', notes: m.notes || m.properties || '' })
  }

  // Knacks — RMU stores a knack on the PROFESSION item's professionalSkills[i].knack
  // (+5, capped at _maxKnack). Only PROFESSIONAL skills have a slot, so app knacks
  // on a spellcasting category or a non-professional skill can't be pushed.
  const knackUpdates = []   // [{ foundrySkillName, display }]
  for (const raw of (char.knacks || [])) {
    if (!raw) continue
    if (/^Spellcasting:/i.test(raw)) {
      cannotSync.push({ display: raw, reason: 'spellcasting-category knack has no professional-skill slot in Foundry — apply +5 manually on the relevant lists' })
      continue
    }
    // Strip a "Base: spec" specialization for matching — professionalSkills is keyed by base skill name.
    const base = raw.includes(':') ? raw.split(':')[0].trim() : raw
    knackUpdates.push({ foundrySkillName: ourBaseToFoundryName(base), display: raw })
  }

  return { skillUpdates, spellUpdates, cannotSync, talentInjects, unknownTalents, weaponInjects, equipmentInjects, knackUpdates }
}

// ── Console PUSH script (stats/skills/spell-list ranks) ──────────────────────
export function generateFoundryScript(char) {
  const { skillUpdates, spellUpdates, cannotSync, knackUpdates } = analyzeSync(char)

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
  L.push(`// Safe: only updates ranks/stats/health/level/knacks on a character you OWN.`)
  L.push(`// It previews a diff in the console, applies, then re-reads to verify. It never`)
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
  L.push(`  const knackUpdates = ${indent(JSON.stringify(knackUpdates, null, 2), 2)};`)
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
  L.push(`  // ── KNACKS: stored on the profession item's professionalSkills[i].knack (+5) ──`)
  L.push(`  const profItem = actor.items.find(i => i.type === 'profession');`)
  L.push(`  const profSkills = foundry.utils.deepClone(profItem?.system?.professionalSkills || []);`)
  L.push(`  const knackPlan = [];`)
  L.push(`  for (const k of knackUpdates) {`)
  L.push(`    if (!profItem) { missed.push({ display: 'Knack: '+k.display, reason: 'no profession item on actor' }); continue; }`)
  L.push(`    const idx = profSkills.findIndex(e => e.skillName === k.foundrySkillName);`)
  L.push(`    if (idx < 0) { missed.push({ display: 'Knack: '+k.display, reason: '"'+k.foundrySkillName+'" is not a professional skill in Foundry — no knack slot' }); continue; }`)
  L.push(`    const cap = profSkills[idx]._maxKnack ?? 5;`)
  L.push(`    const target = Math.min(5, cap);`)
  L.push(`    knackPlan.push({ idx, display: k.display, skillName: k.foundrySkillName, from: profSkills[idx].knack ?? 0, to: target });`)
  L.push(`  }`)
  L.push(``)
  L.push(`  console.log('%c[RMU Sync] Preview — '+actor.name, 'font-weight:bold;font-size:13px');`)
  L.push(`  console.table(plan.map(p => ({ type:p.kind, name:p.display, current:p.from, new:p.to, change:(p.to===p.from?'—':(p.to>p.from?'+':'')+(p.to-p.from)) })));`)
  L.push(`  if (knackPlan.length) console.table(knackPlan.map(k => ({ type:'knack', name:k.display, current:k.from, new:k.to, change:(k.to===k.from?'—':'+5') })));`)
  L.push(`  if (missed.length) console.warn('[RMU Sync] Will NOT update (' + missed.length + '):', missed.map(m=>m.display+' — '+m.reason));`)
  L.push(`  if (cannotSync.length) console.warn('[RMU Sync] App-only (cannot sync):', cannotSync.map(c=>c.display+' — '+c.reason));`)
  L.push(``)
  L.push(`  // ── APPLY ──`)
  L.push(`  await actor.update(flatUpdate);`)
  L.push(`  let applied = 0;`)
  L.push(`  for (const p of plan) { if (p.to !== p.from) { await p.item.update({ 'system.ranks': p.to }); applied++; } }`)
  L.push(`  let knacksApplied = 0;`)
  L.push(`  if (knackPlan.some(k => k.to !== k.from)) {`)
  L.push(`    for (const k of knackPlan) { if (k.to !== k.from) { profSkills[k.idx].knack = k.to; knacksApplied++; } }`)
  L.push(`    await profItem.update({ 'system.professionalSkills': profSkills });`)
  L.push(`  }`)
  L.push(``)
  L.push(`  // ── VERIFY (read back) ──`)
  L.push(`  const failed = [];`)
  L.push(`  for (const p of plan) { const cur = actor.items.get(p.item.id)?.system?.ranks; if (cur !== p.to) failed.push(p.display + ' (got ' + cur + ', wanted ' + p.to + ')'); }`)
  L.push(`  if (knackPlan.length) { const ps2 = actor.items.get(profItem.id)?.system?.professionalSkills || []; for (const k of knackPlan) { const cur = ps2[k.idx]?.knack; if (cur !== k.to) failed.push('Knack: '+k.display+' (got '+cur+', wanted '+k.to+')'); } }`)
  L.push(`  const f2 = game.actors.get(actor.id);`)
  L.push(`  const lvlOk = f2.system?.experience?.level === flatUpdate.system.experience.level;`)
  L.push(``)
  L.push(`  // ── REPORT ──`)
  L.push(`  const parts = ['stats/health/level' + (lvlOk ? ' ✓' : ' ⚠')];`)
  L.push(`  parts.push(applied + ' rank update' + (applied===1?'':'s') + ' applied');`)
  L.push(`  if (knacksApplied) parts.push(knacksApplied + ' knack' + (knacksApplied===1?'':'s') + ' set');`)
  L.push(`  if (missed.length) parts.push(missed.length + ' not found');`)
  L.push(`  if (cannotSync.length) parts.push(cannotSync.length + ' app-only');`)
  L.push(`  ui.notifications.info('[RMU Sync] ' + parts.join(' · '));`)
  L.push(`  if (knacksApplied) ui.notifications.warn('[RMU Sync] Knacks set — reopen your sheet (or F5) if the +5 isn\\'t reflected yet.');`)
  L.push(`  if (failed.length) ui.notifications.error('[RMU Sync] ' + failed.length + ' update(s) did NOT verify — see console (F12).');`)
  L.push(`  if (failed.length) console.error('[RMU Sync] Verify failures:', failed);`)
  L.push(`  if (missed.length || cannotSync.length) ui.notifications.warn('[RMU Sync] ' + (missed.length+cannotSync.length) + ' item(s) skipped — see console (F12) for the list + reasons.');`)
  L.push(`  console.log('%c[RMU Sync] Done.', 'color:#4c8bf5;font-weight:bold');`)
  L.push(`})();`)
  return L.join('\n')
}

// ── Console ITEM INJECTION script (talents + weapons + equipment) ────────────
// Searches ALL compendium packs (system + module/PDF), so content from non-core
// modules is found. Talents bypass the sheet's "level up first" edit lock.
export function generateInjectionScript(char) {
  const { talentInjects, unknownTalents, weaponInjects, equipmentInjects } = analyzeSync(char)

  const talents = talentInjects.map(t => ({ name: t.name, tier: t.tier, param: t.param }))
  const weapons = weaponInjects.map(w => ({ name: w.name, magicBonus: w.magicBonus }))
  const equipment = equipmentInjects.map(e => ({ name: e.name, quantity: e.quantity, weight: e.weight, kind: e.kind, notes: e.notes || '' }))
  const total = talents.length + weapons.length + equipment.length

  const L = []
  L.push(`// ${'═'.repeat(70)}`)
  L.push(`// RMU Character+  →  Foundry ITEM INJECTION — ${char.name}`)
  L.push(`// Generated: ${new Date().toLocaleString()}`)
  L.push(`//`)
  L.push(`// Adds talents, weapons and equipment to a character you OWN. Talents are`)
  L.push(`// added even when the RMU sheet's "level up first" lock blocks the buttons.`)
  L.push(`// Items are pulled from EVERY compendium pack (core + any installed module/PDF`)
  L.push(`// packs) so non-core content is found and properly configured.`)
  L.push(`//`)
  L.push(`// 1. Open YOUR character's sheet (or select its token).`)
  L.push(`// 2. F12 → Console. If warned, type  allow pasting  ↵`)
  L.push(`// 3. Paste this ↵   then reload the world (F5) so talent effects recompute.`)
  if (unknownTalents.length) {
    L.push(`//`)
    L.push(`// NOTE — ${unknownTalents.length} talent(s) have no resolvable name to search:`)
    for (const u of unknownTalents) L.push(`//   • ${u.display} — ${u.reason}`)
  }
  L.push(`// ${'═'.repeat(70)}`)
  L.push(``)
  L.push(`(async () => {`)
  L.push(`  let actor = canvas?.tokens?.controlled?.[0]?.actor || game.user?.character || game.actors.getName(${JSON.stringify(char.name)});`)
  L.push(`  if (!actor) return ui.notifications.error('[RMU Inject] No character found — select your token or open your sheet.');`)
  L.push(`  if (actor.type !== 'Character') return ui.notifications.error('[RMU Inject] Selected actor is not a Character.');`)
  L.push(`  if (!actor.isOwner) return ui.notifications.error('[RMU Inject] You do not own "' + actor.name + '".');`)
  L.push(``)
  L.push(`  const talents   = ${indent(JSON.stringify(talents, null, 2), 2)};`)
  L.push(`  const weapons   = ${indent(JSON.stringify(weapons, null, 2), 2)};`)
  L.push(`  const equipment = ${indent(JSON.stringify(equipment, null, 2), 2)};`)
  L.push(`  if (!talents.length && !weapons.length && !equipment.length) return ui.notifications.info('[RMU Inject] Nothing to inject on this character.');`)
  L.push(``)
  L.push(`  // ── Build a name→entry index across ALL Item compendium packs ──`)
  L.push(`  // Earlier packs win on duplicate names; type is matched per lookup.`)
  L.push(`  const norm = s => (s||'').toLowerCase().replace(/\\((?:1|2|1-|2-)?h\\)/g,'').replace(/[^a-z0-9]+/g,' ').trim();`)
  L.push(`  const idx = [];  // { pack, _id, type, name, nname }`)
  L.push(`  for (const pack of game.packs) {`)
  L.push(`    if (pack.metadata.type !== 'Item') continue;`)
  L.push(`    let entries; try { entries = await pack.getIndex({ fields: ['type','name'] }); } catch { continue; }`)
  L.push(`    for (const e of entries) idx.push({ pack, _id: e._id, type: e.type, name: e.name, nname: norm(e.name) });`)
  L.push(`  }`)
  L.push(`  const findEntry = (name, types) => {`)
  L.push(`    const nn = norm(name);`)
  L.push(`    return idx.find(e => types.includes(e.type) && e.name === name)`)
  L.push(`        || idx.find(e => types.includes(e.type) && e.nname === nn);  // normalized fallback ("Spear (2H)"→"spear")`)
  L.push(`  };`)
  L.push(`  const fetch = async (entry) => (await entry.pack.getDocument(entry._id)).toObject();`)
  L.push(``)
  L.push(`  const toCreate = []; const skipped = []; const notFound = [];`)
  L.push(``)
  L.push(`  // ── Talents ──`)
  L.push(`  for (const w of talents) {`)
  L.push(`    if (actor.items.find(i => i.type === 'talent' && (i.system?.name || i.name) === w.name)) { skipped.push('talent: ' + w.name + ' (already present)'); continue; }`)
  L.push(`    const entry = findEntry(w.name, ['talent']);`)
  L.push(`    if (!entry) { notFound.push('talent: ' + w.name); continue; }`)
  L.push(`    const data = await fetch(entry);`)
  L.push(`    data.system = data.system || {}; data.system.tier = w.tier ?? 1;`)
  L.push(`    toCreate.push({ data, label: 'talent: ' + w.name + (w.param ? ' ('+w.param+')' : '') + ' T' + (w.tier ?? 1) + ' [' + entry.pack.collection + ']' });`)
  L.push(`  }`)
  L.push(``)
  L.push(`  // ── Weapons ── (match a compendium weapon; carry the app's magic bonus)`)
  L.push(`  for (const w of weapons) {`)
  L.push(`    if (actor.items.find(i => i.type === 'weapon' && (i.system?.name || i.name) === w.name)) { skipped.push('weapon: ' + w.name + ' (already present)'); continue; }`)
  L.push(`    const entry = findEntry(w.name, ['weapon']);`)
  L.push(`    if (!entry) { notFound.push('weapon: ' + w.name + ' (no compendium match — add manually)'); continue; }`)
  L.push(`    const data = await fetch(entry);`)
  L.push(`    if (w.magicBonus) { data.system = data.system || {}; data.system.magical = data.system.magical || {}; data.system.magical.bonus = w.magicBonus; }`)
  L.push(`    toCreate.push({ data, label: 'weapon: ' + w.name + (w.magicBonus ? ' +'+w.magicBonus : '') + ' [' + entry.pack.collection + ']' });`)
  L.push(`  }`)
  L.push(``)
  L.push(`  // ── Equipment + magic items ── (compendium match preferred; else a plain item)`)
  L.push(`  for (const e of equipment) {`)
  L.push(`    if (actor.items.find(i => (i.type === 'equipment' || i.type === 'weapon') && (i.system?.name || i.name) === e.name)) { skipped.push('item: ' + e.name + ' (already present)'); continue; }`)
  L.push(`    const entry = findEntry(e.name, ['equipment','weapon','armor','shield','ammo','herb']);`)
  L.push(`    let data;`)
  L.push(`    if (entry) { data = await fetch(entry); }`)
  L.push(`    else { data = { name: e.name, type: 'equipment', system: {} }; }   // freeform inventory fallback`)
  L.push(`    data.system = data.system || {};`)
  L.push(`    if (e.quantity != null && 'quantity' in data.system) data.system.quantity = e.quantity;`)
  L.push(`    else if (e.quantity != null) data.system.quantity = e.quantity;`)
  L.push(`    toCreate.push({ data, label: 'item: ' + e.name + ' ×' + (e.quantity ?? 1) + (entry ? ' [' + entry.pack.collection + ']' : ' [plain]') });`)
  L.push(`  }`)
  L.push(``)
  L.push(`  console.log('%c[RMU Inject] Plan for '+actor.name, 'font-weight:bold;font-size:13px');`)
  L.push(`  console.table(toCreate.map(c => ({ inject: c.label })));`)
  L.push(`  if (skipped.length) console.warn('[RMU Inject] Skipped (already present):', skipped);`)
  L.push(`  if (notFound.length) console.warn('[RMU Inject] Not found in any compendium:', notFound);`)
  L.push(``)
  L.push(`  if (toCreate.length) await actor.createEmbeddedDocuments('Item', toCreate.map(c => c.data));`)
  L.push(``)
  L.push(`  // ── VERIFY (read back by name) ──`)
  L.push(`  const failed = toCreate.filter(c => !actor.items.find(i => (i.system?.name || i.name) === c.data.name)).map(c => c.label);`)
  L.push(``)
  L.push(`  const parts = [toCreate.length + ' item(s) injected'];`)
  L.push(`  if (skipped.length) parts.push(skipped.length + ' already present');`)
  L.push(`  if (notFound.length) parts.push(notFound.length + ' not found');`)
  L.push(`  ui.notifications.info('[RMU Inject] ' + parts.join(' · '));`)
  L.push(`  if (toCreate.some(c => c.label.startsWith('talent'))) ui.notifications.warn('[RMU Inject] Reload the world (F5) so talent effects recompute.');`)
  L.push(`  if (notFound.length) ui.notifications.warn('[RMU Inject] ' + notFound.length + ' item(s) had no compendium match — see console (F12).');`)
  L.push(`  if (failed.length) { ui.notifications.error('[RMU Inject] ' + failed.length + ' item(s) did NOT verify — see console.'); console.error('[RMU Inject] Verify failures:', failed); }`)
  L.push(`  console.log('%c[RMU Inject] Done.', 'color:#4c8bf5;font-weight:bold');`)
  L.push(`})();`)
  return L.join('\n')
}

// Back-compat alias — the modal previously imported a talent-only generator.
export const generateTalentInjectionScript = generateInjectionScript
