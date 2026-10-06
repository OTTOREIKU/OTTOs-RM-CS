// App → Foundry (RMU 1.3.x) reconciler.
//
// SELF-CONTAINED ON PURPOSE: no imports, no module-level references. The console
// sync script embeds this file's source text (via Vite's ?raw import), and the
// import-file builder calls the same functions in the app — one source of truth.
//
//   reconcileActor(desired, actor, ctx, options) → plan
//     desired  — buildDesiredState() output (app character in Foundry terms)
//     actor    — Foundry actor data (actor.toObject() or an "Export Data" file)
//     ctx      — { skills: { [system.name]: { uuid, data } },
//                  talents: { [normalized name]: { uuid, data } },
//                  lists: [{ name, uuid, profession, listType }] }
//     options  — { zeroMissing: boolean }  zero ranks/tiers the app doesn't have
//   applyPlan(actor, plan) → new actor data with the plan applied (import file)
//
// Plan: { actorSet: { 'system.x.y': v }, updates: [{ _id, label, set, unset }],
//         creates: [{ label, data }], report: [{ kind, action, label, from, to }],
//         extras: [{ kind, label, value }], warnings: [string] }
// Nothing is ever deleted: extras are reported, and only zeroed on request.

export function reconcileActor(desired, actor, ctx, options) {
  options = options || {}
  ctx = ctx || {}
  const norm = s => String(s == null ? '' : s).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '')
  const lev = (a, b) => {
    if (Math.abs(a.length - b.length) > 1) return 2
    const d = Array.from({ length: a.length + 1 }, (_, i) => [i])
    for (let j = 1; j <= b.length; j++) d[0][j] = j
    for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++)
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    return d[a.length][b.length]
  }
  // Specializations match ignoring case/punctuation, tolerate one typo ("Babel"/"Babbel"),
  // and match a shortened name ("Valen" / "Valen Empire").
  const specMatch = (a, b) => {
    const x = norm(a), y = norm(b)
    if (x === y) return true
    if (Math.min(x.length, y.length) < 4) return false
    return lev(x, y) <= 1 || x.startsWith(y) || y.startsWith(x)
  }
  const clone = o => JSON.parse(JSON.stringify(o))
  const num = v => (v == null || v === '' ? 0 : Number(v) || 0)
  const titleCase = s => String(s).toLowerCase().replace(/(^|[\s(/'-])([a-z])/g, (m, p, c) => p + c.toUpperCase())

  const plan = { actorSet: {}, updates: [], creates: [], report: [], extras: [], warnings: [] }
  const items = actor.items || []
  const used = new Set()
  const updatesById = new Map()
  const queue = (item, label, set, unset) => {
    let u = updatesById.get(item._id)
    if (!u) { u = { _id: item._id, label, set: {}, unset: [] }; updatesById.set(item._id, u); plan.updates.push(u) }
    Object.assign(u.set, set || {})
    for (const p of unset || []) if (!u.unset.includes(p)) u.unset.push(p)
  }
  const note = (kind, action, label, from, to) => plan.report.push({ kind, action, label, from, to })
  const sys = it => it.system || {}

  // ── Actor fields ──────────────────────────────────────────────────────────
  const a = actor.system || {}
  const setActor = (path, value, label, from) => {
    if (value == null) return
    if (from === value) return
    plan.actorSet[path] = value
    note('actor', 'update', label, from == null ? '—' : from, value)
  }
  for (const [ab, st] of Object.entries(desired.stats || {})) {
    const cur = (a.stats || {})[ab] || {}
    setActor(`system.stats.${ab}.tmp`, st.tmp, `${ab} temporary`, cur.tmp)
    setActor(`system.stats.${ab}.pot`, st.pot, `${ab} potential`, cur.pot)
  }
  if (desired.realm) setActor('system.realm', desired.realm, 'Realm', a.realm)
  if (desired.level != null) setActor('system.experience.level', desired.level, 'Level', (a.experience || {}).level)
  if (desired.xp != null) setActor('system.experience.xp', desired.xp, 'Experience points', (a.experience || {}).xp)
  if (desired.hp != null) setActor('system.health.hp.value', desired.hp, 'Current hits', ((a.health || {}).hp || {}).value)
  if (desired.pp != null) setActor('system.health.power.value', desired.pp, 'Current power points', ((a.health || {}).power || {}).value)

  // ── Skills ────────────────────────────────────────────────────────────────
  const isList = it => it.type === 'skill' && sys(it).category === 'Spellcasting'
  const skillItems = items.filter(it => it.type === 'skill' && !isList(it))
  const pendingUnset = it => {
    const s = sys(it), set = {}, unset = []
    if (num(s.levelUpRanks)) set['system.levelUpRanks'] = 0
    if (num(s.levelUpDPCost)) set['system.levelUpDPCost'] = 0
    return { set, unset }
  }
  for (const d of desired.skills || []) {
    const tplSpec = (ctx.skills[d.name] || {}).data
    const hasSpec = tplSpec ? !!sys(tplSpec).hasSpecialization : !!d.spec
    const cands = skillItems.filter(it => !used.has(it._id) && sys(it).name === d.name)
    let hit = null
    if (!hasSpec) hit = cands[0] || null
    else {
      hit = cands.find(it => specMatch(sys(it).specialization, d.spec)) || null
      if (!hit && d.own) hit = cands.find(it => /^own\b/i.test(String(sys(it).specialization || '').trim())) || null
      if (!hit && !norm(d.spec)) hit = cands.find(it => !norm(sys(it).specialization)) || null
    }
    const label = d.display
    if (hit) {
      used.add(hit._id)
      const s = sys(hit), p = pendingUnset(hit), set = { ...p.set }
      if (num(s.ranks) !== d.ranks) set['system.ranks'] = d.ranks
      if (num(s.cultureRanks) !== d.culture) set['system.cultureRanks'] = d.culture
      if (Object.keys(set).length) {
        queue(hit, label, set, p.unset)
        const from = `${num(s.ranks)}${num(s.cultureRanks) ? ' + ' + num(s.cultureRanks) + ' culture' : ''}${num(s.levelUpRanks) ? ' + ' + num(s.levelUpRanks) + ' pending' : ''}`
        note('skill', 'update', label, from, `${d.ranks}${d.culture ? ' + ' + d.culture + ' culture' : ''}`)
      }
      continue
    }
    const tpl = ctx.skills[d.name]
    if (!tpl) { plan.warnings.push(`No Foundry skill named "${d.name}" to create ${label} from — add it by hand.`); continue }
    const data = clone(tpl.data)
    delete data._id
    data.system = { ...(data.system || {}), specialization: hasSpec ? d.spec : '', ranks: d.ranks, cultureRanks: d.culture }
    data.flags = { ...(data.flags || {}), rmu: { ...((data.flags || {}).rmu || {}), origin: { uuid: tpl.uuid } } }
    plan.creates.push({ label, data })
    note('skill', 'create', label, '—', `${d.ranks}${d.culture ? ' + ' + d.culture + ' culture' : ''}`)
  }

  // ── Spell lists (skill items in category Spellcasting) ────────────────────
  const listItems = items.filter(isList)
  const profItem = items.find(it => it.type === 'profession')
  const profName = profItem ? (sys(profItem).profession || profItem.name || '') : ''
  const pickList = name => {
    const all = (ctx.lists || []).filter(l => norm(l.name) === norm(name))
    return all.find(l => profName && norm(l.profession) === norm(profName)) || all.find(l => !l.profession) || all[0] || null
  }
  const listItemName = t => (t === 'Magical Ritual' ? 'Magical Ritual' : `${t} Spell List`)
  for (const d of desired.lists || []) {
    const hit = listItems.find(it => !used.has(it._id) && specMatch(sys(it).specialization, d.name))
    const label = `${titleCase(d.name)} (${d.listType} list)`
    if (hit) {
      used.add(hit._id)
      const s = sys(hit), p = pendingUnset(hit), set = { ...p.set }
      if (num(s.ranks) !== d.ranks) set['system.ranks'] = d.ranks
      if (s.name !== d.listType) {
        const tpl = ctx.skills[d.listType]
        set['system.name'] = d.listType
        set.name = listItemName(d.listType)
        if (tpl) set['system.stat'] = sys(tpl.data).stat
        note('list', 'update', label, `${s.name} list`, `${d.listType} list`)
      }
      if (!s.spellListUuid) { const l = pickList(d.name); if (l) set['system.spellListUuid'] = l.uuid }
      if (Object.keys(set).length) {
        queue(hit, label, set, p.unset)
        if (num(s.ranks) !== d.ranks || num(s.levelUpRanks)) note('list', 'update', label, `${num(s.ranks)}${num(s.levelUpRanks) ? ' + ' + num(s.levelUpRanks) + ' pending' : ''}`, d.ranks)
      }
      continue
    }
    const tpl = ctx.skills[d.listType]
    if (!tpl) { plan.warnings.push(`No "${d.listType}" spell list skill to create ${label} from.`); continue }
    const l = pickList(d.name)
    if (!l) plan.warnings.push(`${label}: no matching spell list in any compendium — created without a list link (spells won't show until you link it).`)
    const data = clone(tpl.data)
    delete data._id
    data.system = { ...(data.system || {}), specialization: l ? l.name : titleCase(d.name), ranks: d.ranks, cultureRanks: 0, favorite: true }
    if (l) data.system.spellListUuid = l.uuid
    data.flags = { ...(data.flags || {}), rmu: { ...((data.flags || {}).rmu || {}), origin: { uuid: tpl.uuid } } }
    plan.creates.push({ label, data })
    note('list', 'create', label, '—', d.ranks)
  }

  // ── Talents ───────────────────────────────────────────────────────────────
  const talentItems = items.filter(it => it.type === 'talent')
  for (const d of desired.talents || []) {
    const hit = talentItems.find(it => !used.has(it._id) && (norm(it.name) === norm(d.name) || norm(sys(it).name) === norm(d.name)))
    const label = `${d.name} ${d.tier > 1 ? 'tier ' + d.tier : ''}`.trim()
    if (hit) {
      used.add(hit._id)
      const s = sys(hit), set = {}, unset = []
      if (num(s.tier) !== d.tier) set['system.tier'] = d.tier
      if (s.levelUpTier != null) unset.push('system.levelUpTier')
      if (num(s.levelUpDPCost)) set['system.levelUpDPCost'] = 0
      if (Object.keys(set).length || unset.length) {
        queue(hit, label, set, unset)
        note('talent', 'update', d.name, `tier ${num(s.tier)}${s.levelUpTier != null ? ' (level-up pending: ' + s.levelUpTier + ')' : ''}`, `tier ${d.tier}`)
      }
      continue
    }
    const tpl = (ctx.talents || {})[norm(d.name)]
    if (!tpl) { plan.warnings.push(`Talent "${d.name}" isn't in any compendium — add it by hand (tier ${d.tier}).`); continue }
    const data = clone(tpl.data)
    delete data._id
    data.system = { ...(data.system || {}), tier: d.tier }
    delete data.system.levelUpTier
    data.flags = { ...(data.flags || {}), rmu: { ...((data.flags || {}).rmu || {}), origin: { uuid: tpl.uuid } } }
    plan.creates.push({ label, data })
    note('talent', 'create', d.name, '—', `tier ${d.tier}`)
  }

  // ── Professional skills and knacks (on the profession item) ───────────────
  if (profItem && (desired.professional || desired.knacks)) {
    const key = e => `${norm(e.skillCategory)}|${norm(e.skillName)}`
    const want = new Map()
    for (const p of desired.professional || []) want.set(key({ skillCategory: p.category, skillName: p.name }), { cat: p.category, name: p.name, selected: true, knack: 0 })
    for (const k of desired.knacks || []) {
      const kk = key({ skillCategory: k.category, skillName: k.name })
      const w = want.get(kk) || { cat: k.category, name: k.name, selected: false, knack: 0 }
      w.knack = k.bonus || 5
      want.set(kk, w)
    }
    const cur = clone(sys(profItem).professionalSkills || [])
    const next = cur.map(e => {
      const w = want.get(key(e))
      return { ...e, selected: !!(w && w.selected), knack: w ? w.knack : 0 }
    })
    for (const [kk, w] of want) if (!cur.some(e => key(e) === kk)) next.push({ skillCategory: w.cat, skillName: w.name, selected: w.selected, knack: w.knack })
    const strip = arr => JSON.stringify(arr.map(e => ({ c: e.skillCategory, n: e.skillName, s: !!e.selected, k: num(e.knack) })))
    if (strip(cur) !== strip(next)) {
      queue(profItem, 'Professional skills & knacks', { 'system.professionalSkills': next })
      const fmt = arr => arr.filter(e => e.selected).map(e => e.skillName).join(', ') || 'none'
      const fmtK = arr => arr.filter(e => num(e.knack)).map(e => `${e.skillName} +${num(e.knack)}`).join(', ') || 'none'
      note('profession', 'update', 'Professional skills', fmt(cur), fmt(next))
      note('profession', 'update', 'Knacks', fmtK(cur), fmtK(next))
    }
  }

  // ── Things in Foundry the app doesn't have ────────────────────────────────
  for (const it of [...skillItems, ...listItems]) {
    if (used.has(it._id)) continue
    const s = sys(it)
    const total = num(s.ranks) + num(s.cultureRanks) + num(s.levelUpRanks)
    if (!total) continue
    const label = isList(it) ? `${s.specialization} (${s.name} list)` : `${s.name}${s.specialization && s.specialization.trim() ? ': ' + s.specialization : ''}`
    plan.extras.push({ kind: isList(it) ? 'list' : 'skill', label, value: `${num(s.ranks)} ranks${num(s.cultureRanks) ? ' + ' + num(s.cultureRanks) + ' culture' : ''}` })
    if (options.zeroMissing) {
      const set = { 'system.ranks': 0 }
      if (num(s.cultureRanks)) set['system.cultureRanks'] = 0
      if (num(s.levelUpRanks)) set['system.levelUpRanks'] = 0
      queue(it, label, set)
      note(isList(it) ? 'list' : 'skill', 'zero', label, total, 0)
    }
  }
  for (const it of talentItems) {
    if (used.has(it._id)) continue
    const s = sys(it)
    if (!num(s.tier) && s.levelUpTier == null) continue
    plan.extras.push({ kind: 'talent', label: it.name, value: `tier ${num(s.tier)}${s.levelUpTier != null ? ' (pending ' + s.levelUpTier + ')' : ''}` })
    if (options.zeroMissing) {
      queue(it, it.name, { 'system.tier': 0 }, s.levelUpTier != null ? ['system.levelUpTier'] : [])
      note('talent', 'zero', it.name, `tier ${num(s.tier)}`, 'tier 0')
    }
  }

  for (const w of desired.unsynced || []) plan.warnings.push(`${w.display}: ${w.reason}`)
  return plan
}

/** Apply a plan to actor data (for the Foundry "Import Data" file). Returns a new object. */
export function applyPlan(actor, plan) {
  const out = JSON.parse(JSON.stringify(actor))
  const setPath = (obj, path, value) => {
    const parts = path.split('.')
    let o = obj
    for (let i = 0; i < parts.length - 1; i++) { if (o[parts[i]] == null || typeof o[parts[i]] !== 'object') o[parts[i]] = {}; o = o[parts[i]] }
    o[parts[parts.length - 1]] = value
  }
  const unsetPath = (obj, path) => {
    const parts = path.split('.')
    let o = obj
    for (let i = 0; i < parts.length - 1; i++) { o = o && o[parts[i]]; if (!o) return }
    delete o[parts[parts.length - 1]]
  }
  for (const [p, v] of Object.entries(plan.actorSet || {})) setPath(out, p, v)
  out.items = out.items || []
  for (const u of plan.updates || []) {
    const it = out.items.find(i => i._id === u._id)
    if (!it) continue
    for (const [p, v] of Object.entries(u.set || {})) setPath(it, p, v)
    for (const p of u.unset || []) unsetPath(it, p)
  }
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  const newId = () => Array.from({ length: 16 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
  for (const c of plan.creates || []) out.items.push({ ...JSON.parse(JSON.stringify(c.data)), _id: newId() })
  return out
}
