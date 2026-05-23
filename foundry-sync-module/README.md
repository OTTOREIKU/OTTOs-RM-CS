# RMU Character+ Sync

A small Foundry VTT module that pairs with the [RMU Character+ web app](https://ottoreiku.github.io/OTTOs-RM-CS/). Adds a **Sync** button to every Character actor sheet — players can push character data from the web app into Foundry, or pull updates back, without ever opening the developer console.

## Compatibility

- Foundry VTT v13 / v14
- Rolemaster Unified system v1.2.0+

## Install (local development)

1. Copy or junction this folder into your Foundry user data:
   `<UserData>/Data/modules/rmu-character-plus-sync/`
2. Start Foundry, load your RMU world
3. **Game Settings → Manage Modules** → enable **"RMU Character+ Sync"** → Save Module Settings

## Usage

Open a Character actor sheet. Click the new **🔄 RMU Character+ Sync** button in the sheet header.

### Push (App → Foundry)
1. In the RMU Character+ app, click **Export** to download a `.json` file (or copy the JSON contents)
2. In the Sync dialog → **Push** tab → paste the JSON or choose the file → **Import to actor**
3. Stats, health, experience, realm, skill ranks, and spell list ranks are updated on your actor
4. Skills that don't exist on the actor (e.g. a weapon skill the DM hasn't added yet) are reported as warnings

### Pull (Foundry → App)
1. In the Sync dialog → **Pull** tab → JSON is generated from your actor
2. Click **Copy** or **Download .json**
3. Paste/upload it into the RMU Character+ app's Import dialog

## What gets synced

Push and pull cover:
- Identity: name, realm, race/profession/culture (read-only — these come from chargen items the DM created)
- Stats (all 10 — temp + potential + special)
- Health: hits and power point pools (max + current)
- Experience: level + XP
- Skill ranks (regular skills, including specialized ones)
- Spell list ranks (RMU 1.2.x first-class `spell-list` items, plus backwards compat with 1.1.x's skill-as-spell-list)

What is **not** synced (yet):
- Talents / flaws
- Equipment / armor / weapons (the items themselves — only the skills tied to them)
- Notes, appearance, injuries

## Permissions

The module relies on Foundry's own permission system. You can only push to actors you **own** — typically your own character if you're a player, any actor if you're the GM. The button appears on every Character sheet, but the import button will refuse with a clear error if you don't have write permission.

## API (for testing)

Once loaded, the module exposes an API for scripting:

```js
const api = game.modules.get('rmu-character-plus-sync').api;
const actor = game.actors.getName('My Character');
const payload = await api.pull(actor);
console.log(JSON.stringify(payload, null, 2));
```

## Development notes

The push/pull logic mirrors the web app's `src/utils/foundryExport.js` and `src/utils/foundryImport.js`. The `data/skills.json` file is a copy of the app's data — keep these in sync when adding new skills. Future improvement: a small build script that copies `skills.json` from the app on each module rebuild.
