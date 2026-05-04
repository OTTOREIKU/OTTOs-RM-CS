// Character store — persists to localStorage, supports multiple characters
import { scheduleBackup } from './fileSync.js'
import {
  loadTheme, saveTheme,
  loadDisplaySettings, saveDisplaySettings,
  loadNavPos, saveNavPos,
  applyTheme,
} from './theme.js'

function buildBackupPayload() {
  const EXPORT_V = 1
  const chars = loadCharacters()
  let nb = null
  try { nb = JSON.parse(localStorage.getItem(NB_KEY)) } catch {}
  return { _version: EXPORT_V, _type: 'backup', characters: chars, notebook: nb, _saved_at: new Date().toISOString() }
}

const STORAGE_KEY = 'rm_characters'
const ACTIVE_KEY  = 'rm_active_character'

export const STATS = [
  'Agility', 'Constitution', 'Empathy', 'Intuition',
  'Memory', 'Presence', 'Quickness', 'Reasoning',
  'Self Discipline', 'Strength'
]

export const REALMS = ['Channeling', 'Essence', 'Mentalism']

export function makeBlankCharacter(id) {
  return {
    id,
    name: 'New Character',
    player: '',
    realm: '',
    culture: '',
    race: 'Human, common',
    profession: 'Fighter',
    level: 1,
    gender: '',
    age: '',
    height_ft: '',
    height_in: '',
    weight: '',
    skin_color: '',
    hair_color: '',
    eye_color: '',
    vision: 'Normal',
    size: 'Medium',
    fate_points: 0,
    healing_multiplier: 1,
    hometown: '',
    nationality: '',

    // Stats: temporary value + potential
    stats: Object.fromEntries(STATS.map(s => [s, { temp: 50, potential: 50, racial: 0, special: 0 }])),

    // Derived overrides (null = auto-calculate)
    hits_max: null,
    hits_current: null,
    power_points_max: null,
    power_points_current: null,
    endurance: null,
    armor_type: 1,

    // Skills: { [skillName]: { ranks, item_bonus, talent_bonus, label } }
    skills: {},

    // Custom skill instances beyond the default slots
    // { id, template_name, label, ranks, item_bonus, talent_bonus }
    custom_skills: [],

    // Spell lists: { [listName]: { ranks } }
    spell_lists: {},

    // Talents & Flaws
    talents: [],

    // Weapons: [{id,name,fumble,str_req,item_bonus,skill_name,ob_type}]
    weapons: [],

    // Armor by body part: AT number per slot
    armor_parts: {
      torso:  { at: 1, db: 0 },
      head:   { at: 1, db: 0 },
      arms:   { at: 1, db: 0 },
      legs:   { at: 1, db: 0 },
      shield: { type: null, db: 0 },
    },

    // Resistance Roll special bonuses (racial/item overrides per type)
    rr_bonuses: { channeling: 0, essence: 0, mentalism: 0, physical: 0, fear: 0 },

    // Equipment: [{id,name,qty,weight,location}]
    equipment: [],

    // Magic items: [{id,name,properties,ob,db,weight,notes}]
    magic_items: [],

    // Traits: [{id,name,tier,effect}]
    traits: [],

    // Racial bonus DP pool (CoreLaw p.75: races start with a pool, up to 25 spendable/level)
    // null = not yet initialized (will be set to race's full pool at first level-up)
    race_dp_pool_remaining: null,

    // Notes
    notes: '',

    // Injuries / conditions
    injuries: [],

    // Fatigue tracking (CoreLaw §5.5)
    fatigue: {
      penalty: 0,   // accumulated from Endurance rolls (0 to -50)
      injury:  0,   // overflow past -50, treated as a true injury penalty
    },
    // Conditions feeding Table 5-5 Endurance roll modifier
    fatigue_conditions: {
      days_no_sleep:   0,   // -20 per day
      days_half_sleep: 0,   // -10 per day (4 hr)
      hours_no_water:  0,   // -5 per hour (after first day of none)
      days_no_food:    0,   // -10 per day
      days_half_food:  0,   // -10 per 3 days
      altitude_ft:     0,   // -10 per 2500 ft
      temp_offset_f:   0,   // -5 per 5°F outside acclimatized range
    },

    // Knacks (CoreLaw §2.X): 2 per character, each grants +5 to the chosen professional skill.
    // Stored as resolved display names (e.g. "Melee: Dagger", "Perception").
    knacks: [],

    // Combat Training DP cost group assignment (CoreLaw §3.X):
    // Player assigns which tier cost (1–4) applies to each training group.
    // Each tier should be unique; defaults spread 1–4 evenly across groups.
    combat_training_groups: {
      'Melee Weapons':   1,
      'Unarmed':         2,
      'Shield':          3,
      'Ranged Weapons':  4,
    },

    // XP
    experience: 0,
    experience_to_next: 10000,

    // Timestamps
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
}

export function loadCharacters() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function saveCharacters(characters) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(characters))
  scheduleBackup(buildBackupPayload)
}

export function loadActiveId() {
  return localStorage.getItem(ACTIVE_KEY) || null
}

export function saveActiveId(id) {
  localStorage.setItem(ACTIVE_KEY, id)
}

export function createCharacter() {
  const id = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
  const chars = loadCharacters()
  chars[id] = makeBlankCharacter(id)
  saveCharacters(chars)
  saveActiveId(id)
  return chars[id]
}

export function deleteCharacter(id) {
  const chars = loadCharacters()
  delete chars[id]
  saveCharacters(chars)
  const ids = Object.keys(chars)
  const newActive = ids.length ? ids[ids.length - 1] : null
  saveActiveId(newActive)
  return newActive
}

export function updateCharacter(id, patch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id] = { ...chars[id], ...patch, updated_at: new Date().toISOString() }
  saveCharacters(chars)
  return chars[id]
}

export function updateCharacterStat(id, statName, field, value) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].stats[statName] = { ...chars[id].stats[statName], [field]: value }
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function updateSkill(id, skillName, field, value) {
  const chars = loadCharacters()
  if (!chars[id]) return
  if (!chars[id].skills[skillName]) {
    chars[id].skills[skillName] = { ranks: 0, item_bonus: 0, talent_bonus: 0 }
  }
  chars[id].skills[skillName][field] = value
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function addWeapon(id, patch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  const weapon = { id: `w_${Date.now()}`, name: '', fumble: 3, str_req: 0, item_bonus: 0, skill_name: '', ob_type: 'melee', ...patch }
  chars[id].weapons = [...(chars[id].weapons || []), weapon]
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function updateWeapon(id, weaponId, patch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].weapons = (chars[id].weapons || []).map(w => w.id === weaponId ? { ...w, ...patch } : w)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function removeWeapon(id, weaponId) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].weapons = (chars[id].weapons || []).filter(w => w.id !== weaponId)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function updateArmorPart(id, part, patch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].armor_parts = { ...(chars[id].armor_parts || {}), [part]: { ...(chars[id].armor_parts?.[part] || {}), ...patch } }
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function addEquipmentItem(id, item) {
  const chars = loadCharacters()
  if (!chars[id]) return
  const entry = { id: `eq_${Date.now()}`, name: '', qty: 1, weight: 0, location: '', ...item }
  chars[id].equipment = [...(chars[id].equipment || []), entry]
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function updateEquipmentItem(id, itemId, patch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].equipment = (chars[id].equipment || []).map(e => e.id === itemId ? { ...e, ...patch } : e)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function removeEquipmentItem(id, itemId) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].equipment = (chars[id].equipment || []).filter(e => e.id !== itemId)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function addMagicItem(id) {
  const chars = loadCharacters()
  if (!chars[id]) return
  const item = { id: `mi_${Date.now()}`, name: '', properties: '', ob: 0, db: 0, weight: 0, notes: '' }
  chars[id].magic_items = [...(chars[id].magic_items || []), item]
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function updateMagicItem(id, itemId, patch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].magic_items = (chars[id].magic_items || []).map(m => m.id === itemId ? { ...m, ...patch } : m)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function removeMagicItem(id, itemId) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].magic_items = (chars[id].magic_items || []).filter(m => m.id !== itemId)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function addCustomSkill(id, templateName, label) {
  const chars = loadCharacters()
  if (!chars[id]) return
  const entry = { id: `csk_${Date.now()}_${Math.random().toString(36).slice(2,5)}`, template_name: templateName, label, ranks: 0, item_bonus: 0, talent_bonus: 0 }
  chars[id].custom_skills = [...(chars[id].custom_skills || []), entry]
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function updateCustomSkill(id, customSkillId, patch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].custom_skills = (chars[id].custom_skills || []).map(s => s.id === customSkillId ? { ...s, ...patch } : s)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function removeCustomSkill(id, customSkillId) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].custom_skills = (chars[id].custom_skills || []).filter(s => s.id !== customSkillId)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function addTalent(id, talentId, tier, param) {
  const chars = loadCharacters()
  if (!chars[id]) return
  const inst = {
    id: `tal_${Date.now()}_${Math.random().toString(36).slice(2,5)}`,
    talent_id: talentId,
    tier,
    param: param || null,
  }
  chars[id].talents = [...(chars[id].talents || []), inst]
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function updateTalent(id, talentInstId, patch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].talents = (chars[id].talents || []).map(t => t.id === talentInstId ? { ...t, ...patch } : t)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function removeTalent(id, talentInstId) {
  const chars = loadCharacters()
  if (!chars[id]) return
  chars[id].talents = (chars[id].talents || []).filter(t => t.id !== talentInstId)
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function updateSpellList(id, listName, ranksOrPatch) {
  const chars = loadCharacters()
  if (!chars[id]) return
  const existing = chars[id].spell_lists?.[listName] || {}
  const patch = typeof ranksOrPatch === 'number' ? { ranks: ranksOrPatch } : ranksOrPatch
  chars[id].spell_lists[listName] = { ...existing, ...patch }
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

export function removeSpellList(id, listName) {
  const chars = loadCharacters()
  if (!chars[id]) return
  delete chars[id].spell_lists[listName]
  chars[id].updated_at = new Date().toISOString()
  saveCharacters(chars)
  return chars[id]
}

// ── Export / Import ────────────────────────────────────────────────────────────

const EXPORT_VERSION = 1
const NB_KEY = 'rm_notebook'

function triggerDownload(filename, jsonStr) {
  const blob = new Blob([jsonStr], { type: 'application/json' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

export function exportCharacter(id) {
  const chars = loadCharacters()
  const char  = chars[id]
  if (!char) return
  const _settings = { theme: loadTheme(), display: loadDisplaySettings(), navPos: loadNavPos() }
  const payload   = { _version: EXPORT_VERSION, _type: 'single', character: char, _settings }
  const safe      = s => (s || '').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')
  const name      = safe(char.name) || 'Character'
  triggerDownload(`${name}.json`, JSON.stringify(payload, null, 2))
}

export function exportAllCharacters() {
  const chars = loadCharacters()
  const payload = { _version: EXPORT_VERSION, _type: 'all', characters: chars }
  triggerDownload(`rm_all_characters_${Date.now()}.json`, JSON.stringify(payload, null, 2))
}

/**
 * Import characters from a JSON file (File object).
 * mode: 'merge'   — add imported chars, skip IDs that already exist
 *       'replace' — add imported chars, overwrite matching IDs
 * Returns { imported: number, skipped: number }
 */
export function importCharactersFromFile(file, mode = 'merge') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const payload = JSON.parse(e.target.result)
        const chars = loadCharacters()
        let imported = 0, skipped = 0

        const incomingList = payload._type === 'all'
          ? Object.values(payload.characters || {})
          : payload._type === 'single'
            ? [payload.character]
            : []

        if (incomingList.length === 0) {
          reject(new Error('No characters found in file'))
          return
        }

        for (const char of incomingList) {
          if (!char?.id) continue
          if (chars[char.id] && mode === 'merge') {
            skipped++
          } else {
            chars[char.id] = { ...char, updated_at: new Date().toISOString() }
            imported++
          }
        }

        saveCharacters(chars)

        // Apply embedded settings if present (travels with exported character)
        if (payload._settings) {
          const { theme, display, navPos } = payload._settings
          if (theme)   saveTheme(theme)
          if (display) saveDisplaySettings(display)
          if (navPos)  saveNavPos(navPos)
          applyTheme(theme || loadTheme(), display || loadDisplaySettings())
        }

        // Merge notebook if present
        if (payload.notebook) {
          try {
            const raw = localStorage.getItem(NB_KEY)
            const existing = raw ? JSON.parse(raw) : { folders: {}, notes: {} }
            const nb = payload.notebook
            if (mode === 'merge') {
              Object.keys(nb.folders || {}).forEach(k => { if (!existing.folders[k]) existing.folders[k] = nb.folders[k] })
              Object.keys(nb.notes   || {}).forEach(k => { if (!existing.notes[k])   existing.notes[k]   = nb.notes[k]   })
            } else {
              Object.assign(existing.folders, nb.folders || {})
              Object.assign(existing.notes,   nb.notes   || {})
            }
            localStorage.setItem(NB_KEY, JSON.stringify(existing))
          } catch {}
        }
        // Switch to first imported character if none active
        const activeId = loadActiveId()
        if (!activeId || !chars[activeId]) {
          const firstId = incomingList[0]?.id
          if (firstId && chars[firstId]) saveActiveId(firstId)
        }
        resolve({ imported, skipped })
      } catch (err) {
        reject(new Error('Invalid file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsText(file)
  })
}

/**
 * Import ONLY the notebook from a file — accepts notebook-only exports
 * OR full character/backup exports that contain a notebook field.
 * Returns { imported: number, skipped: number } for notes.
 */
export function importNotebookFromFile(file, mode = 'merge') {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const payload = JSON.parse(e.target.result)
        // Accept notebook-only JSON  {folders,notes}  OR any payload with a .notebook field
        const nb = payload.notebook ?? (payload.folders && payload.notes ? payload : null)
        if (!nb || (!nb.folders && !nb.notes)) {
          reject(new Error('No notebook data found in file')); return
        }
        const raw      = localStorage.getItem(NB_KEY)
        const existing = raw ? JSON.parse(raw) : { folders: {}, notes: {} }
        const incoming = { folders: nb.folders || {}, notes: nb.notes || {} }
        let imported = 0, skipped = 0
        if (mode === 'merge') {
          Object.keys(incoming.folders).forEach(k => { if (!existing.folders[k]) existing.folders[k] = incoming.folders[k] })
          Object.keys(incoming.notes).forEach(k => {
            if (!existing.notes[k]) { existing.notes[k] = incoming.notes[k]; imported++ } else { skipped++ }
          })
        } else {
          Object.assign(existing.folders, incoming.folders)
          Object.keys(incoming.notes).forEach(k => { existing.notes[k] = incoming.notes[k]; imported++ })
        }
        localStorage.setItem(NB_KEY, JSON.stringify(existing))
        resolve({ imported, skipped })
      } catch (err) {
        reject(new Error('Invalid file: ' + err.message))
      }
    }
    reader.onerror = () => reject(new Error('Could not read file'))
    reader.readAsText(file)
  })
}
