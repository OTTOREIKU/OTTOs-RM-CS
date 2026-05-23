// RMU Character+ Sync — shared schema constants and helpers
// Mirrors the mapping logic in the web app's foundryExport.js / foundryImport.js

export const MODULE_ID = 'rmu-character-plus-sync';
export const EXPORT_VERSION = 1;

// 10 Rolemaster stats. Foundry uses 2-letter abbreviations, the app uses full names.
export const STAT_ABBR = {
  'Agility':         'Ag',
  'Constitution':    'Co',
  'Empathy':         'Em',
  'Intuition':       'In',
  'Memory':          'Me',
  'Presence':        'Pr',
  'Quickness':       'Qu',
  'Reasoning':       'Re',
  'Self Discipline': 'SD',
  'Strength':        'St',
};

export const STAT_ABBR_TO_FULL = Object.fromEntries(
  Object.entries(STAT_ABBR).map(([full, abbr]) => [abbr, full])
);

// App's template base name → Foundry skill item's system.name
// Only entries where the two systems use different names need to appear here.
export const OUR_BASE_TO_FOUNDRY = {
  'Melee':               'Melee Weapons',
  'Ranged':              'Ranged Weapons',
  'Religion/Philosophy': 'Religion/Philosophy Lore',
  'Directed Spells':     'Directed Spell',
};

export const FOUNDRY_TO_OUR_BASE = Object.fromEntries(
  Object.entries(OUR_BASE_TO_FOUNDRY).map(([ours, fnd]) => [fnd, ours])
);

export function ourBaseToFoundryName(baseName) {
  return OUR_BASE_TO_FOUNDRY[baseName] ?? baseName;
}

export function foundryNameToOurBase(foundryName) {
  return FOUNDRY_TO_OUR_BASE[foundryName] ?? foundryName;
}

// Template names like "Melee: <weapon 1>" use angle-bracketed placeholders.
export function hasPlaceholder(name) {
  return /<[^>]+>/.test(name);
}

// Loaded lazily once per session
let _skillTemplates = null;

export async function loadSkillTemplates() {
  if (_skillTemplates) return _skillTemplates;
  const resp = await fetch(`modules/${MODULE_ID}/data/skills.json`);
  if (!resp.ok) {
    throw new Error(`Failed to load skill templates: HTTP ${resp.status}`);
  }
  _skillTemplates = await resp.json();
  return _skillTemplates;
}

// Returns: { [ourBaseName]: [slotName1, slotName2, ...] }
// where slotNames are the full template entries (with placeholders if any).
export function buildTemplateIndex(skillsData) {
  const index = {};
  for (const skill of skillsData) {
    const name = skill.name;
    // Skip leading-placeholder names like "<specialization 1> Lore"
    if (name.startsWith('<')) continue;
    const colonIdx = name.indexOf(':');
    const base = colonIdx >= 0 ? name.slice(0, colonIdx).trim() : name;
    if (!index[base]) index[base] = [];
    index[base].push(name);
  }
  return index;
}

// Detect a spell-list embedded item across RMU versions.
// RMU 1.2.x: dedicated item type 'spell-list'
// RMU 1.1.x: skill item with system.category === 'Spellcasting'
export function isSpellListItem(item) {
  if (!item) return false;
  if (item.type === 'spell-list') return true;
  if (item.type === 'skill' && item.system?.category === 'Spellcasting') return true;
  return false;
}

// Get the spell list's name in a version-agnostic way.
// RMU 1.2.x spell-list items: system.name is the list name (e.g. "D'rekian Disease")
//   ...or system.specialization, depending on how it was created — try both.
// RMU 1.1.x skill items: system.specialization is the list name.
export function getSpellListName(item) {
  if (!item) return null;
  const s = item.system ?? {};
  if (item.type === 'spell-list') {
    return s.specialization || s.name || item.name || null;
  }
  // legacy
  return s.specialization || null;
}

// Identify regular (non-spell) skill items in a version-agnostic way.
export function isRegularSkillItem(item) {
  if (!item) return false;
  if (item.type !== 'skill') return false;
  if (item.system?.category === 'Spellcasting') return false;
  return true;
}

// Normalize the wire payload — accepts:
//   { _version, _type: 'single', character: {...} }   ← canonical app export
//   { character: {...} }                              ← stripped wrapper
//   { name, stats, skills, ... }                      ← raw character object
// Returns { character, version, warnings: [] } or throws on bad shape.
export function unwrapExportPayload(raw) {
  const warnings = [];
  if (!raw || typeof raw !== 'object') {
    throw new Error('Payload is not a JSON object');
  }
  let character = null;
  let version = null;
  if (raw.character && typeof raw.character === 'object') {
    character = raw.character;
    version = raw._version ?? null;
  } else if (raw.stats || raw.skills || raw.name) {
    // Bare character object
    character = raw;
  } else {
    throw new Error("Doesn't look like a RMU Character+ export — expected `character` field or top-level character object");
  }
  if (version != null && version > EXPORT_VERSION) {
    warnings.push(`Payload version ${version} is newer than supported (${EXPORT_VERSION}) — fields may be ignored`);
  }
  return { character, version, warnings };
}
