// App → Foundry VTT sync (RMU system 1.3.x).
//
//  buildDesiredState(char)        the character in Foundry terms (skill names,
//                                 specializations, list types, talent names, …)
//  generateSyncScript(desired)    console script: preview dialog → backup → apply
//                                 → verify. Uses live compendium data in Foundry.
//  buildImportFile(desired, exportJson, templates, options)
//                                 backup route: merge into an actor "Export Data"
//                                 file for Foundry's "Import Data".
//
// The matching/planning logic lives in foundryReconcile.js (self-contained, so the
// script can embed its source text).
import { rmuSkillName, getListCategory, getProfessionalSet, getRealms } from './calc.js'
import talentsData from '../data/talents.json'
import skillsData from '../data/skills.json'
import { reconcileActor, applyPlan } from './foundryReconcile.js'
import reconcileSource from './foundryReconcile.js?raw'

export const STAT_ABBR = {
  Agility: 'Ag', Constitution: 'Co', Empathy: 'Em', Intuition: 'In', Memory: 'Me',
  Presence: 'Pr', Quickness: 'Qu', Reasoning: 'Re', 'Self Discipline': 'SD', Strength: 'St',
}
// App skill base name → Foundry skill system.name (only where they differ)
const BASE_TO_FOUNDRY = {
  Melee: 'Melee Weapons', Ranged: 'Ranged Weapons',
  'Religion/Philosophy': 'Religion/Philosophy Lore', 'Directed Spells': 'Directed Spell',
}
const OWN_LANGUAGE = { 'Own Spoken': 'Spoken', 'Own Written': 'Written' }
const LANGUAGE_SKILLS = ['Spoken', 'Written', 'Signaled', 'Lip Reading']
// App list category → Foundry spell list skill
const LIST_TYPE = { 'Magic Ritual': 'Magical Ritual' }
const SKILL_CATEGORY = Object.fromEntries(skillsData.map(s => [s.name, s.category === 'Lore: Languages' ? 'Lore' : s.category]))

/** App skill key (+ label) → { name, spec, own } in Foundry terms, or { error }. */
export function appSkillToFoundry(templateKey, label) {
  if (OWN_LANGUAGE[templateKey]) return { name: OWN_LANGUAGE[templateKey], spec: 'Own' }
  if (/^<[^>]+> Lore$/.test(templateKey)) return { error: 'generic custom Lore slots have no Foundry skill' }
  const i = templateKey.indexOf(':')
  const base = i > 0 ? templateKey.slice(0, i).trim() : templateKey
  const rest = i > 0 ? templateKey.slice(i + 1).trim() : ''
  const placeholder = /<[^>]+>/.test(rest)
  return {
    name: BASE_TO_FOUNDRY[base] || base,
    spec: placeholder ? String(label || '').trim() : rest,
    own: /<own region>/i.test(rest),
  }
}

function foundryCategoryOf(appKey) {
  return SKILL_CATEGORY[appKey] || SKILL_CATEGORY[skillsData.find(s => rmuSkillName(s.name) === rmuSkillName(appKey))?.name] || ''
}

/** A professional skill / knack (RMU skill name) → Foundry profession entries. */
function professionalEntries(char, rmuName, appKey) {
  if (rmuName === 'Language') {
    const have = new Set()
    for (const k of Object.keys(char.skills || {})) {
      const f = appSkillToFoundry(k, '')
      if (LANGUAGE_SKILLS.includes(f.name)) have.add(f.name)
    }
    if (!have.size) have.add('Spoken').add('Written')
    return [...have].map(n => ({ category: 'Lore', name: n }))
  }
  const f = appSkillToFoundry(appKey || rmuName, '')
  return [{ category: foundryCategoryOf(appKey || rmuName), name: f.error ? rmuName : f.name }]
}

/** The app character as the Foundry actor should look.
 *  options.includeHealth — also send current hits / power points (off by default:
 *  the in-game values are usually the live ones). */
export function buildDesiredState(char, options = {}) {
  const unsynced = []
  const desired = {
    version: 2,
    name: char.name || '',
    // Foundry writes hybrids as "Channeling,Essence"
    realm: getRealms(char).join(',') || char.realm || null,
    level: char.level ?? null,
    xp: Number(char.experience) > 0 ? Number(char.experience) : null,
    hp: options.includeHealth ? (char.hits_current ?? null) : null,
    pp: options.includeHealth ? (char.power_points_current ?? null) : null,
    stats: {},
    skills: [], lists: [], talents: [], professional: [], knacks: [], gear: [],
    unsynced,
  }
  for (const [full, s] of Object.entries(char.stats || {})) {
    const ab = STAT_ABBR[full]
    if (ab && s) desired.stats[ab] = { tmp: Number(s.temp) || 0, pot: Number(s.potential) || 0 }
  }

  // Skills: template slots and custom instances, merged by Foundry name + specialization
  const entries = []
  for (const [key, data] of Object.entries(char.skills || {})) entries.push({ key, label: data?.label, ranks: data?.ranks, culture: data?.culture_ranks, custom: false })
  for (const cs of char.custom_skills || []) entries.push({ key: cs.template_name, label: cs.label, ranks: cs.ranks, culture: cs.culture_ranks, custom: true })
  const merged = new Map()
  const keyOf = f => `${f.name}|${String(f.spec || '').toLowerCase().replace(/[^a-z0-9]+/g, '')}`
  for (const e of entries) {
    const ranks = Number(e.ranks) || 0, culture = Number(e.culture) || 0
    if (!ranks && !culture) continue
    const display = e.label ? `${e.key.split(':')[0].replace(/^<[^>]+>\s*/, '')}: ${e.label}` : e.key
    const f = appSkillToFoundry(e.key, e.label)
    if (f.error) { unsynced.push({ display, reason: f.error }); continue }
    // Custom labels on a skill Foundry can't specialize (a second "Perception") fold into the main skill
    const tplHasSlots = skillsData.some(s => s.name.startsWith(e.key.split(':')[0]) && /<[^>]+>/.test(s.name))
    if (e.custom && !/<[^>]+>/.test(e.key) && !tplHasSlots) f.spec = ''
    const k = keyOf(f)
    const prev = merged.get(k)
    const item = { name: f.name, spec: f.spec, own: !!f.own, ranks, culture, display: f.spec ? `${f.name}: ${f.spec}` : f.name, custom: e.custom }
    if (!prev) merged.set(k, item)
    else {
      const better = (item.ranks + item.culture > prev.ranks + prev.culture) || (item.ranks + item.culture === prev.ranks + prev.culture && prev.custom && !item.custom)
      const loser = better ? prev : item
      unsynced.push({ display: loser.custom ? `${display} (custom)` : display, reason: `same Foundry skill as ${better ? item.display : prev.display}, which is sent instead` })
      if (better) merged.set(k, item)
    }
  }
  desired.skills = [...merged.values()].map(({ custom, ...rest }) => rest)

  // Spell lists
  for (const [key, sl] of Object.entries(char.spell_lists || {})) {
    const ranks = Number(sl?.ranks) || 0
    if (!ranks) continue
    const cat = getListCategory(char, key)
    desired.lists.push({ name: key, listType: LIST_TYPE[cat] || cat, ranks })
  }

  // Talents
  for (const t of char.talents || []) {
    const meta = talentsData.find(x => x.id === t.talent_id)
    if (!meta) { unsynced.push({ display: t.talent_id, reason: 'unknown talent' }); continue }
    desired.talents.push({ name: meta.rmu_canonical_name || meta.name, tier: Number(t.tier) || 1 })
    if (t.param) unsynced.push({ display: `${meta.name} (${t.param})`, reason: 'talent targets are set in Foundry by hand if the talent needs one' })
  }

  // Professional skills (one RMU skill covers all its specializations) and knacks
  const prof = new Map()
  const addProf = list => { for (const p of list) prof.set(`${p.category}|${p.name}`, p) }
  // Same set the app uses for every total (char.professional_skills + older per-entry flags)
  const LIST_TYPES = ['Base', 'Open', 'Closed', 'Arcane', 'Restricted', 'Magical Ritual']
  for (const name of getProfessionalSet(char)) {
    if (LIST_TYPES.includes(name)) { addProf([{ category: 'Spellcasting', name }]); continue }
    const appKey = Object.keys(char.skills || {}).find(k => rmuSkillName(k) === name)
      || (char.custom_skills || []).find(cs => rmuSkillName(cs.template_name) === name)?.template_name
      || skillsData.find(s => rmuSkillName(s.name) === name)?.name
    addProf(professionalEntries(char, name, appKey))
  }
  desired.professional = [...prof.values()]
  for (const k of char.knacks || []) {
    if (!k) continue
    const m = /^Spellcasting:\s*(.+)$/i.exec(k)
    if (m) { desired.knacks.push({ category: 'Spellcasting', name: LIST_TYPE[m[1]] || m[1], bonus: 5 }); continue }
    const rmu = rmuSkillName(k)
    const appKey = skillsData.find(s => rmuSkillName(s.name) === rmu)?.name || k
    for (const e of professionalEntries(char, rmu, appKey)) desired.knacks.push({ ...e, bonus: 5 })
  }

  // Gear (console script only): added from a compendium when the actor doesn't have it
  for (const w of char.weapons || []) if (w?.name) desired.gear.push({ kind: 'weapon', name: w.name })
  for (const e of char.equipment || []) if (e?.name) desired.gear.push({ kind: 'equipment', name: e.name, qty: Number(e.qty) || 1 })
  for (const m of char.magic_items || []) if (m?.name) desired.gear.push({ kind: 'equipment', name: m.name, qty: 1 })
  return desired
}

/** Offline route: merge the app character into a Foundry actor export. */
export function buildImportFile(desired, exportJson, templates, options = {}) {
  const ctx = { skills: templates.skills, talents: templates.talents, lists: templates.lists }
  const plan = reconcileActor(desired, exportJson, ctx, options)
  if ((desired.gear || []).length) plan.warnings.push(`${desired.gear.length} gear item(s) aren't added by the import file — use the sync script or add them in Foundry.`)
  return { plan, actor: applyPlan(exportJson, plan) }
}

export { reconcileActor }

/** The console script (runs inside Foundry as the GM or the actor's owner). */
export function generateSyncScript(desired) {
  const reconcile = reconcileSource.replace(/^export /gm, '')
  return `// RMU Character+ → Foundry sync for ${desired.name} (generated ${new Date().toISOString().slice(0, 10)})
// Paste into the Foundry console (F12 → Console) as the GM or the character's owner.
// Shows every change first, saves a backup of the actor to Downloads, applies,
// then re-checks. Nothing is deleted.
(async () => {
${reconcile}
const DESIRED = ${JSON.stringify(desired)};
${SCRIPT_RUNTIME}
})();
`
}

// Runtime part of the console script (plain JS, runs in Foundry).
const SCRIPT_RUNTIME = String.raw`
const TAG = '[RMU Character+ sync]'
const say = (m, type = 'info') => { console.log('%c' + TAG + ' ' + m, 'color:#4c8bf5;font-weight:bold'); ui.notifications?.[type]?.(m) }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]))
const norm = s => String(s ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')

// 1. Which actor? Selected token → your assigned character → actor with the same name
const picks = [canvas?.tokens?.controlled?.[0]?.actor, game.user.character, ...game.actors.filter(a => a.name === DESIRED.name)]
const actor = picks.find(a => a && a.type === 'Character')
if (!actor) return say('No Character actor found. Select ' + DESIRED.name + "'s token and run this again.", 'error')
if (!actor.isOwner) return say("You don't own " + actor.name + ' - ask your GM.', 'error')

// 2. Compendium data: skill templates, spell lists, the talents we need
const ctx = { skills: {}, talents: {}, lists: [] }
const core = game.packs.get('rmu.core')
if (!core) return say('The rmu.core compendium is missing - is this an RMU world?', 'error')
for (const doc of await core.getDocuments({ type: 'skill' })) ctx.skills[doc.system.name] = { uuid: doc.uuid, data: doc.toObject() }
const wantTalents = new Set((DESIRED.talents || []).map(t => norm(t.name)))
const gearIndex = []
const packs = game.packs.filter(p => p.documentName === 'Item').sort((a, b) => (b.collection === 'rmu.core') - (a.collection === 'rmu.core'))
for (const pack of packs) {
  let idx
  try { idx = await pack.getIndex({ fields: ['type', 'system.profession', 'system.listType'] }) } catch (e) { continue }
  for (const e of idx) {
    const uuid = e.uuid || ('Compendium.' + pack.collection + '.Item.' + e._id)
    if (e.type === 'spell-list') ctx.lists.push({ name: e.name, uuid, profession: e.system?.profession || '', listType: e.system?.listType || '' })
    else if (e.type === 'talent' && wantTalents.has(norm(e.name)) && !ctx.talents[norm(e.name)]) {
      const doc = await pack.getDocument(e._id)
      ctx.talents[norm(e.name)] = { uuid: doc.uuid, data: doc.toObject() }
    } else if (['weapon', 'equipment', 'armor', 'shield', 'herb', 'ammo'].includes(e.type)) gearIndex.push({ pack, e })
  }
}

// 3. Plan
const count = p => Object.keys(p.actorSet).length + p.updates.length + p.creates.length
let plan = reconcileActor(DESIRED, actor.toObject(), ctx, { zeroMissing: false })
const gearToAdd = []
for (const g of DESIRED.gear || []) {
  if (actor.items.some(i => norm(i.name) === norm(g.name))) continue
  const hit = gearIndex.find(x => norm(x.e.name) === norm(g.name))
  if (hit) gearToAdd.push({ ...g, hit }); else plan.warnings.push('Gear "' + g.name + '" not found in any compendium - add it by hand.')
}
const total = count(plan) + gearToAdd.length
console.groupCollapsed(TAG + ' planned changes for ' + actor.name)
console.table(plan.report)
if (plan.extras.length) { console.log('In Foundry but not in the app:'); console.table(plan.extras) }
plan.warnings.forEach(w => console.warn(w))
console.groupEnd()

const rows = plan.report.map(r => '<tr><td>' + esc(r.kind) + '</td><td>' + esc(r.action) + '</td><td>' + esc(r.label) + '</td><td>' + esc(r.from) + '</td><td>&rarr; ' + esc(r.to) + '</td></tr>').join('')
  + gearToAdd.map(g => '<tr><td>gear</td><td>create</td><td>' + esc(g.name) + '</td><td>&mdash;</td><td>&rarr; from ' + esc(g.hit.pack.title) + '</td></tr>').join('')
const html = '<div style="max-height:60vh;overflow:auto;font-size:12px">'
  + '<p>Updating <b>' + esc(actor.name) + '</b> from RMU Character+. A backup of the current actor is saved to your Downloads first.</p>'
  + (total ? '<table style="width:100%"><tr><th>Kind</th><th>Action</th><th>What</th><th>Now</th><th>New</th></tr>' + rows + '</table>' : '<p><b>Already in sync - nothing to change.</b></p>')
  + (plan.extras.length ? '<p style="margin-top:8px"><b>In Foundry but not in the app</b> (kept unless you choose "zero"):</p><ul>' + plan.extras.map(x => '<li>' + esc(x.label) + ' - ' + esc(x.value) + '</li>').join('') + '</ul>' : '')
  + (plan.warnings.length ? '<p style="margin-top:8px"><b>Notes</b></p><ul>' + plan.warnings.map(w => '<li>' + esc(w) + '</li>').join('') + '</ul>' : '')
  + '</div>'
const DialogV2 = foundry.applications?.api?.DialogV2
const buttons = [{ action: 'apply', label: 'Apply ' + total + ' change(s)', default: true }]
if (plan.extras.length) buttons.push({ action: 'zero', label: 'Apply + zero the extras' })
buttons.push({ action: 'cancel', label: 'Cancel' })
let choice
if (!total && !plan.extras.length) return say(actor.name + ' is already in sync - nothing to change.')
if (DialogV2) choice = await DialogV2.wait({ window: { title: 'RMU Character+ sync: ' + actor.name }, position: { width: 680 }, content: html, buttons, rejectClose: false })
else choice = window.confirm('Apply ' + total + ' change(s) to ' + actor.name + '? (details in the console)') ? 'apply' : 'cancel'
if (!choice || choice === 'cancel') return say('Sync cancelled - nothing changed.')
if (choice === 'zero') plan = reconcileActor(DESIRED, actor.toObject(), ctx, { zeroMissing: true })
const applied = count(plan) + gearToAdd.length
if (!applied) return say(actor.name + ' is already in sync.')

// 4. Backup, then apply
const save = foundry.utils?.saveDataToFile || globalThis.saveDataToFile
const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
if (save) save(JSON.stringify(actor.toObject(), null, 2), 'text/json', actor.name.replace(/[^a-z0-9]+/gi, '_') + '_before_sync_' + stamp + '.json')
try {
  if (Object.keys(plan.actorSet).length) await actor.update(plan.actorSet)
  if (plan.updates.length) await actor.updateEmbeddedDocuments('Item', plan.updates.map(u => {
    const o = { _id: u._id, ...u.set }
    for (const p of u.unset) { const i = p.lastIndexOf('.'); o[p.slice(0, i + 1) + '-=' + p.slice(i + 1)] = null }
    return o
  }))
  if (plan.creates.length) await actor.createEmbeddedDocuments('Item', plan.creates.map(c => c.data))
  if (gearToAdd.length) {
    const docs = []
    for (const g of gearToAdd) {
      const d = (await g.hit.pack.getDocument(g.hit.e._id)).toObject()
      delete d._id
      if (g.qty > 1 && d.system && 'quantity' in d.system) d.system.quantity = g.qty
      d.flags = { ...(d.flags || {}), rmu: { ...(d.flags?.rmu || {}), origin: { uuid: 'Compendium.' + g.hit.pack.collection + '.Item.' + g.hit.e._id } } }
      docs.push(d)
    }
    await actor.createEmbeddedDocuments('Item', docs)
  }
} catch (err) {
  console.error(err)
  return say('Sync stopped with an error (see console). Restore from the backup file with "Import Data" if needed.', 'error')
}

// 5. Verify
const again = reconcileActor(DESIRED, actor.toObject(), ctx, { zeroMissing: choice === 'zero' })
if (count(again)) { console.table(again.report); say('Applied, but ' + count(again) + ' value(s) still differ - see the console.', 'warn') }
else say(actor.name + ' synced: ' + applied + ' change(s) applied and verified. Backup saved to Downloads.')
`
