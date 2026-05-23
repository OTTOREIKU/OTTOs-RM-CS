// RMU Character+ Sync — Push (App → Foundry actor)
// Mirrors the translation logic from the app's foundryExport.js but executes
// directly inside Foundry (no console-paste script needed).

import {
  STAT_ABBR,
  ourBaseToFoundryName,
  hasPlaceholder,
  isRegularSkillItem,
  isSpellListItem,
  getSpellListName,
} from './schema.js';

/**
 * Push a RMU Character+ character object onto a Foundry actor.
 * @param {Actor} actor              - target Foundry actor (must be type 'Character')
 * @param {Object} character         - the character object from the app's export
 * @returns {Promise<PushResult>}
 *
 * @typedef {Object} PushResult
 * @property {boolean} ok
 * @property {Object}  flatUpdate
 * @property {number}  skillsOk
 * @property {string[]} skillsMissed     - human-readable names that didn't match
 * @property {number}  spellsOk
 * @property {string[]} spellsMissed
 * @property {string[]} warnings
 */
export async function pushCharacterToActor(actor, character) {
  if (!actor) throw new Error('No actor provided');
  if (actor.type !== 'Character') {
    throw new Error(`Actor type "${actor.type}" not supported — must be a Character`);
  }
  if (!character || typeof character !== 'object') {
    throw new Error('No character data');
  }

  // Permission gate — relies on Foundry's own permissions
  if (!actor.isOwner) {
    throw new Error("You don't own this actor — can't update it");
  }

  const warnings = [];

  // ── Flat actor update ──────────────────────────────────────────────────────
  const flatUpdate = buildFlatUpdate(character);

  await actor.update(flatUpdate);

  // ── Skill ranks ────────────────────────────────────────────────────────────
  const skillUpdates = collectSkillUpdates(character);

  let skillsOk = 0;
  const skillsMissed = [];
  for (const upd of skillUpdates) {
    const item = actor.items.find(i =>
      isRegularSkillItem(i) &&
      i.system?.name === upd.name &&
      (upd.specialization == null || i.system?.specialization === upd.specialization)
    );
    if (item) {
      await item.update({ 'system.ranks': upd.ranks });
      skillsOk++;
    } else {
      skillsMissed.push(upd._display);
    }
  }

  // ── Spell list ranks ───────────────────────────────────────────────────────
  const spellUpdates = collectSpellUpdates(character);

  let spellsOk = 0;
  const spellsMissed = [];
  for (const upd of spellUpdates) {
    const item = actor.items.find(i => {
      if (!isSpellListItem(i)) return false;
      const listName = getSpellListName(i);
      return listName === upd.listName;
    });
    if (item) {
      await item.update({ 'system.ranks': upd.ranks });
      spellsOk++;
    } else {
      spellsMissed.push(upd.listName);
    }
  }

  return {
    ok: true,
    flatUpdate,
    skillsOk,
    skillsMissed,
    spellsOk,
    spellsMissed,
    warnings,
    totals: {
      skills: skillUpdates.length,
      spells: spellUpdates.length,
    },
  };
}

// ── Flat update builder ──────────────────────────────────────────────────────

function buildFlatUpdate(char) {
  const update = { system: {} };

  if (char.realm) {
    update.system.realm = char.realm;
  }

  const lvl = char.level ?? null;
  const xp = char.experience ?? null;
  if (lvl != null || xp != null) {
    update.system.experience = {};
    if (lvl != null) update.system.experience.level = lvl;
    if (xp != null)  update.system.experience.xp    = xp;
  }

  // Stats — only push fields the app tracks; preserve Foundry's `bonus` and other untouched fields
  const stats = {};
  for (const [fullName, data] of Object.entries(char.stats || {})) {
    const abbr = STAT_ABBR[fullName];
    if (!abbr || !data) continue;
    stats[abbr] = {
      tmp:   data.temp      ?? 50,
      pot:   data.potential ?? 50,
      other: data.special   ?? 0,
    };
  }
  if (Object.keys(stats).length > 0) {
    update.system.stats = stats;
  }

  // Health — only push when the app has explicit values; let Foundry compute when null
  const health = {};
  const hpMax = char.hits_max ?? null;
  const hpVal = char.hits_current ?? hpMax;
  if (hpMax != null) {
    health.hp = { max: hpMax, value: hpVal ?? hpMax };
  }
  const ppMax = char.power_points_max ?? null;
  const ppVal = char.power_points_current ?? ppMax;
  if (ppMax != null) {
    health.power = { max: ppMax, value: ppVal ?? ppMax };
  }
  if (Object.keys(health).length > 0) {
    update.system.health = health;
  }

  return update;
}

// ── Skill collection (matches foundryExport.js logic) ────────────────────────

function collectSkillUpdates(char) {
  const updates = [];

  for (const [templateName, skillData] of Object.entries(char.skills || {})) {
    const ranks = skillData?.ranks ?? 0;
    if (ranks === 0) continue;
    const label = skillData.label || '';

    if (hasPlaceholder(templateName)) {
      // "Melee: <weapon 1>" with label "Dagger" → Foundry { name: "Melee Weapons", specialization: "Dagger" }
      if (!label) continue;  // can't match without a label
      const ourBase     = templateName.split(':')[0].trim();
      const foundryName = ourBaseToFoundryName(ourBase);
      updates.push({
        name:           foundryName,
        specialization: label,
        ranks,
        _display:       `${ourBase}: ${label}`,
      });
    } else {
      updates.push({
        name:           templateName,
        specialization: null,
        ranks,
        _display:       templateName,
      });
    }
  }

  // Custom skill instances
  for (const cs of (char.custom_skills || [])) {
    const ranks = cs.ranks ?? 0;
    if (!ranks) continue;
    if (hasPlaceholder(cs.template_name)) {
      if (!cs.label) continue;
      const ourBase     = cs.template_name.split(':')[0].trim();
      const foundryName = ourBaseToFoundryName(ourBase);
      updates.push({
        name:           foundryName,
        specialization: cs.label,
        ranks,
        _display:       `${ourBase}: ${cs.label}`,
      });
    } else {
      updates.push({
        name:           cs.label || cs.template_name,
        specialization: null,
        ranks,
        _display:       cs.label || cs.template_name,
      });
    }
  }

  return updates;
}

// ── Spell list collection ────────────────────────────────────────────────────

function collectSpellUpdates(char) {
  const updates = [];
  for (const [listName, listData] of Object.entries(char.spell_lists || {})) {
    const ranks = listData?.ranks ?? 0;
    if (!ranks) continue;
    updates.push({ listName, ranks });
  }
  return updates;
}
