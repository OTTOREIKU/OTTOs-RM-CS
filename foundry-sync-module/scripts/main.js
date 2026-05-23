// RMU Character+ Sync — entry point
// Registers the sheet header button hook so the Sync button appears on every
// Character actor sheet. Player- and GM-friendly.

import { MODULE_ID } from './schema.js';
import { openSyncDialog } from './sync-dialog.js';

Hooks.once('init', () => {
  console.log(`[${MODULE_ID}] init`);
});

Hooks.once('ready', () => {
  console.log(`[${MODULE_ID}] ready — Foundry ${game.version}, system ${game.system?.id} ${game.system?.version}`);
});

// Foundry's standard hook for adding header buttons to actor sheets.
// Fires for every ActorSheet subclass — we filter to Character type.
Hooks.on('getActorSheetHeaderButtons', (sheet, buttons) => {
  try {
    const actor = sheet.actor;
    if (!actor || actor.type !== 'Character') return;

    buttons.unshift({
      label: game.i18n.localize('RMUCPSync.SheetButton'),
      class: 'rmucp-sync-button',
      icon: 'fas fa-sync-alt',
      onclick: () => openSyncDialog(actor),
    });
  } catch (e) {
    console.error(`[${MODULE_ID}] Failed to add header button:`, e);
  }
});

// Foundry v13/v14 may also use a different hook for ApplicationV2 sheets.
// The RMU system currently uses legacy sheets, but in case it migrates, register the V2 hook too.
Hooks.on('renderActorSheetV2', (sheet, html) => {
  // Reserved for future V2 sheet support — no-op for now.
});

// Expose the API on game.modules for testing via the MCP exec-script tool
Hooks.once('ready', () => {
  const mod = game.modules.get(MODULE_ID);
  if (mod) {
    mod.api = {
      openSyncDialog,
      // Re-exported for scripting:
      push: async (actor, character) => {
        const { pushCharacterToActor } = await import(`./push.js`);
        return pushCharacterToActor(actor, character);
      },
      pull: async (actor) => {
        const { pullCharacterFromActor } = await import(`./pull.js`);
        return pullCharacterFromActor(actor);
      },
    };
    console.log(`[${MODULE_ID}] API exposed at game.modules.get("${MODULE_ID}").api`);
  }
});
