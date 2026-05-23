// RMU Character+ Sync — Pull (Foundry actor → App JSON)
// Mirrors the parsing logic from the app's foundryImport.js, but reads
// live from the actor inside Foundry and emits the app's wire format.

import {
  EXPORT_VERSION,
  STAT_ABBR_TO_FULL,
  foundryNameToOurBase,
  hasPlaceholder,
  loadSkillTemplates,
  buildTemplateIndex,
  isSpellListItem,
  isRegularSkillItem,
  getSpellListName,
} from './schema.js';

/**
 * Build a RMU Character+ export payload from a Foundry actor.
 * @param {Actor} actor
 * @returns {Promise<Object>} The full payload { _version, _type, character }
 */
export async function pullCharacterFromActor(actor) {
  if (!actor) throw new Error('No actor provided');

  const skillsData = await loadSkillTemplates();
  const templateIndex = buildTemplateIndex(skillsData);

  const sys = actor.system ?? {};

  // Find chargen items
  const raceItem = actor.items.find(i => i.type === 'race');
  const profItem = actor.items.find(i => i.type === 'profession');
  const cultItem = actor.items.find(i => i.type === 'culture');

  // ── Build character object ────────────────────────────────────────────────

  const character = makeMinimalCharacter();

  character.id   = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  character.name = actor.name || 'Imported Character';
  character.realm = sys.realm || '';
  character.level = sys.experience?.level ?? 1;
  character.experience = sys.experience?.xp ?? 0;

  if (raceItem) character.race       = raceItem.system?.race       || raceItem.name || character.race;
  if (profItem) character.profession = profItem.system?.profession || profItem.name || character.profession;
  if (cultItem) character.culture    = cultItem.system?.culture    || cultItem.name || character.culture;

  const app = sys.appearance || {};
  character.gender = sys.identity?.gender || '';
  character.age    = String(app.age || '');
  character.size   = app.size || 'Medium';
  character.player = sys.player?.name || '';

  // Health (use null when value === max, indicating "auto-calculated" in our app)
  if (sys.health?.hp) {
    const hpMax = sys.health.hp.max ?? null;
    const hpVal = sys.health.hp.value ?? null;
    character.hits_max     = hpMax;
    character.hits_current = (hpVal !== hpMax && hpVal != null) ? hpVal : null;
  }
  if (sys.health?.power) {
    const ppMax = sys.health.power.max ?? null;
    const ppVal = sys.health.power.value ?? null;
    character.power_points_max     = ppMax;
    character.power_points_current = (ppVal !== ppMax && ppVal != null) ? ppVal : null;
  }

  // Stats
  for (const [abbr, data] of Object.entries(sys.stats || {})) {
    const fullName = STAT_ABBR_TO_FULL[abbr];
    if (!fullName) continue;
    character.stats[fullName] = {
      temp:      data?.tmp   ?? 50,
      potential: data?.pot   ?? 50,
      racial:    0,
      special:   data?.other ?? 0,
    };
  }

  // Skills & spell lists
  let csSeq = 0;
  const slotCounts = {};
  const items = actor.items.contents;

  for (const item of items) {
    // ── Spell lists ──────────────────────────────────────────────────────────
    if (isSpellListItem(item)) {
      const listName = getSpellListName(item);
      if (!listName) continue;
      const ranks = item.system?.ranks ?? 0;
      const existing = character.spell_lists[listName] || {};
      character.spell_lists[listName] = { ...existing, ranks: (existing.ranks ?? 0) + ranks };
      continue;
    }

    // ── Regular skills ───────────────────────────────────────────────────────
    if (!isRegularSkillItem(item)) continue;

    const s            = item.system || {};
    const foundryName  = s.name || item.name || '';
    const spec         = s.specialization || '';
    const ranks        = s.ranks ?? 0;
    const cultureRanks = s.cultureRanks ?? 0;
    const hasSpec      = s.hasSpecialization ?? false;
    const fixedSpec    = s.fixedSpecializations ?? false;

    const ourBase = foundryNameToOurBase(foundryName);
    const slots   = templateIndex[ourBase] || [];

    if (hasSpec && spec && spec.trim() !== '') {
      const placeholderSlots = slots.filter(hasPlaceholder);
      const fixedSlots       = slots.filter(n => !hasPlaceholder(n));

      if (fixedSpec && fixedSlots.length > 0) {
        // "Influence: Duping" — exact match required
        const exactSlot = ourBase + ': ' + spec;
        const match = fixedSlots.find(n => n === exactSlot);
        if (match) {
          mergeSkill(character, match, ranks, cultureRanks);
        } else {
          addCustomSkill(character, slots[0] || ourBase, spec, ranks, cultureRanks, ++csSeq);
        }
      } else if (placeholderSlots.length > 0) {
        const count = slotCounts[ourBase] ?? 0;
        if (count < placeholderSlots.length) {
          const slot = placeholderSlots[count];
          slotCounts[ourBase] = count + 1;
          character.skills[slot] = {
            ...(character.skills[slot] || {}),
            ranks,
            culture_ranks: cultureRanks,
            label: spec,
          };
        } else {
          addCustomSkill(character, placeholderSlots[0], spec, ranks, cultureRanks, ++csSeq);
        }
      } else if (slots.length > 0) {
        // Foundry has hasSpecialization but our template doesn't — assign to first slot
        mergeSkill(character, slots[0], ranks, cultureRanks);
      } else {
        addCustomSkill(character, ourBase, spec, ranks, cultureRanks, ++csSeq);
      }
    } else {
      // No specialization — direct match
      if (slots.length > 0) {
        const directSlots = slots.filter(n => !hasPlaceholder(n));
        const slot = directSlots.length > 0 ? directSlots[0] : slots[0];
        if (!hasPlaceholder(slot)) {
          mergeSkill(character, slot, ranks, cultureRanks);
        }
      }
      // No matching template → silently skip
    }
  }

  // Wrap in export payload
  return {
    _version: EXPORT_VERSION,
    _type: 'single',
    character,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function mergeSkill(char, templateName, ranks, cultureRanks) {
  const existing = char.skills[templateName] || {};
  char.skills[templateName] = {
    ...existing,
    ranks:         (existing.ranks         ?? 0) + ranks,
    culture_ranks: (existing.culture_ranks ?? 0) + cultureRanks,
  };
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
  });
}

// Minimal blank — mirrors the relevant subset of makeBlankCharacter() in the app.
// Anything not assigned here will simply be absent in the export; the app fills in defaults on import.
function makeMinimalCharacter() {
  return {
    id: '',
    name: 'New Character',
    player: '',
    realm: '',
    culture: '',
    race: '',
    profession: '',
    level: 1,
    gender: '',
    age: '',
    size: 'Medium',
    stats: {},
    hits_max: null,
    hits_current: null,
    power_points_max: null,
    power_points_current: null,
    skills: {},
    custom_skills: [],
    spell_lists: {},
    talents: [],
    weapons: [],
    armor_parts: {
      torso:  { at: 1, db: 0 },
      head:   { at: 1, db: 0 },
      arms:   { at: 1, db: 0 },
      legs:   { at: 1, db: 0 },
      shield: { type: null, db: 0 },
    },
    rr_bonuses: { channeling: 0, essence: 0, mentalism: 0, physical: 0, fear: 0 },
    equipment: [],
    magic_items: [],
    traits: [],
    notes: '',
  };
}
