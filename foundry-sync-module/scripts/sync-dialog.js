// RMU Character+ Sync — Dialog UI
// Two-tab dialog: Push (paste/upload JSON) and Pull (copy/download actor JSON)

import { MODULE_ID, unwrapExportPayload } from './schema.js';
import { pushCharacterToActor } from './push.js';
import { pullCharacterFromActor } from './pull.js';

const L = key => game.i18n.localize(key);
const F = (key, data) => game.i18n.format(key, data);

export function openSyncDialog(actor) {
  if (!actor) {
    ui.notifications?.error(L('RMUCPSync.NoActor'));
    return;
  }
  if (actor.type !== 'Character') {
    ui.notifications?.error(L('RMUCPSync.NotCharacter'));
    return;
  }

  const html = renderDialogHTML();

  // Use the legacy Dialog API (works in v13/v14, simpler than ApplicationV2 for a one-shot)
  const dlg = new Dialog({
    title: F('RMUCPSync.DialogTitle', { name: actor.name }),
    content: html,
    buttons: {
      close: {
        label: 'Close',
        callback: () => {},
      },
    },
    default: 'close',
    render: el => bindDialog(el, actor, dlg),
  }, {
    classes: ['rmucp-sync-dialog'],
    width: 560,
    height: 'auto',
    resizable: true,
  });

  dlg.render(true);
}

function renderDialogHTML() {
  return `
    <div class="rmucp-tabs">
      <button type="button" class="rmucp-tab active" data-panel="push">
        ${L('RMUCPSync.TabPush')}
      </button>
      <button type="button" class="rmucp-tab" data-panel="pull">
        ${L('RMUCPSync.TabPull')}
      </button>
    </div>

    <div class="rmucp-panel active" data-panel="push">
      <div class="rmucp-hint">${L('RMUCPSync.PushHint')}</div>
      <textarea class="rmucp-textarea" data-role="push-json" placeholder="${L('RMUCPSync.PasteHere')}"></textarea>
      <div class="rmucp-row">
        <input type="file" data-role="push-file" accept=".json,application/json" />
        <span class="rmucp-spacer"></span>
        <button type="button" class="rmucp-btn-push">${L('RMUCPSync.PushButton')}</button>
      </div>
      <div class="rmucp-status" data-role="push-status"></div>
    </div>

    <div class="rmucp-panel" data-panel="pull">
      <div class="rmucp-hint">${L('RMUCPSync.PullHint')}</div>
      <textarea class="rmucp-textarea" data-role="pull-json" readonly></textarea>
      <div class="rmucp-row">
        <button type="button" class="rmucp-btn-copy">${L('RMUCPSync.CopyButton')}</button>
        <button type="button" class="rmucp-btn-download">${L('RMUCPSync.DownloadButton')}</button>
      </div>
      <div class="rmucp-status" data-role="pull-status"></div>
    </div>
  `;
}

function bindDialog(rootEl, actor, dlg) {
  // jQuery or HTMLElement — handle both (Foundry v13+ uses HTMLElement in some places)
  const root = rootEl instanceof HTMLElement ? rootEl : rootEl[0];

  // Tab switching
  root.querySelectorAll('.rmucp-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.panel;
      root.querySelectorAll('.rmucp-tab').forEach(b => b.classList.toggle('active', b === btn));
      root.querySelectorAll('.rmucp-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === target));
    });
  });

  // ── Push tab handlers ──────────────────────────────────────────────────────
  const pushTextarea = root.querySelector('[data-role="push-json"]');
  const pushFileInput = root.querySelector('[data-role="push-file"]');
  const pushStatus = root.querySelector('[data-role="push-status"]');
  const pushBtn = root.querySelector('.rmucp-btn-push');

  pushFileInput.addEventListener('change', async () => {
    const file = pushFileInput.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      pushTextarea.value = text;
      setStatus(pushStatus, `Loaded ${file.name} (${text.length.toLocaleString()} chars)`, 'success');
    } catch (e) {
      setStatus(pushStatus, `Failed to read file: ${e.message}`, 'error');
    }
  });

  pushBtn.addEventListener('click', async () => {
    const raw = pushTextarea.value.trim();
    if (!raw) {
      setStatus(pushStatus, 'Nothing to import — paste JSON or upload a file first', 'error');
      return;
    }

    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch (e) {
      setStatus(pushStatus, `${L('RMUCPSync.PushBadJson')}: ${e.message}`, 'error');
      return;
    }

    let unwrapped;
    try {
      unwrapped = unwrapExportPayload(parsed);
    } catch (e) {
      setStatus(pushStatus, `${L('RMUCPSync.PushBadShape')} — ${e.message}`, 'error');
      return;
    }

    pushBtn.disabled = true;
    setStatus(pushStatus, 'Importing…', '');
    try {
      const result = await pushCharacterToActor(actor, unwrapped.character);
      const summary = F('RMUCPSync.PushSuccess', {
        stats: countStatFields(result.flatUpdate),
        skills: result.skillsOk,
        totalSkills: result.totals.skills,
        spells: result.spellsOk,
        totalSpells: result.totals.spells,
      });
      setStatus(pushStatus, summary, 'success');
      ui.notifications?.info(`[RMU Sync] ${summary}`);
      if (result.skillsMissed.length) {
        console.warn(`[${MODULE_ID}] Skills not found on actor "${actor.name}":`, result.skillsMissed);
        ui.notifications?.warn(F('RMUCPSync.MissingSkills', { n: result.skillsMissed.length }));
      }
      if (result.spellsMissed.length) {
        console.warn(`[${MODULE_ID}] Spell lists not found on actor "${actor.name}":`, result.spellsMissed);
        ui.notifications?.warn(F('RMUCPSync.MissingSpells', { n: result.spellsMissed.length }));
      }
    } catch (e) {
      console.error(`[${MODULE_ID}] Push failed:`, e);
      setStatus(pushStatus, `Import failed: ${e.message}`, 'error');
      ui.notifications?.error(`[RMU Sync] ${e.message}`);
    } finally {
      pushBtn.disabled = false;
    }
  });

  // ── Pull tab — populate on first switch (lazy) ─────────────────────────────
  const pullTextarea = root.querySelector('[data-role="pull-json"]');
  const pullStatus = root.querySelector('[data-role="pull-status"]');
  const copyBtn = root.querySelector('.rmucp-btn-copy');
  const downloadBtn = root.querySelector('.rmucp-btn-download');

  let pullPopulated = false;
  const populatePull = async () => {
    if (pullPopulated) return;
    setStatus(pullStatus, 'Reading actor…', '');
    try {
      const payload = await pullCharacterFromActor(actor);
      pullTextarea.value = JSON.stringify(payload, null, 2);
      pullPopulated = true;
      setStatus(pullStatus, `Ready (${pullTextarea.value.length.toLocaleString()} chars)`, 'success');
    } catch (e) {
      console.error(`[${MODULE_ID}] Pull failed:`, e);
      setStatus(pullStatus, `Pull failed: ${e.message}`, 'error');
    }
  };

  const pullTab = root.querySelector('.rmucp-tab[data-panel="pull"]');
  pullTab.addEventListener('click', populatePull);

  copyBtn.addEventListener('click', async () => {
    if (!pullTextarea.value) await populatePull();
    try {
      await navigator.clipboard.writeText(pullTextarea.value);
      setStatus(pullStatus, L('RMUCPSync.CopiedToClipboard'), 'success');
      ui.notifications?.info(`[RMU Sync] ${L('RMUCPSync.CopiedToClipboard')}`);
    } catch (e) {
      setStatus(pullStatus, `Copy failed: ${e.message}`, 'error');
    }
  });

  downloadBtn.addEventListener('click', async () => {
    if (!pullTextarea.value) await populatePull();
    const safe = s => (s || '').replace(/[^a-z0-9]/gi, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
    const filename = `${safe(actor.name) || 'character'}_foundry_pull.json`;
    const blob = new Blob([pullTextarea.value], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    setStatus(pullStatus, `Downloaded ${filename}`, 'success');
  });
}

function setStatus(el, msg, kind) {
  el.textContent = msg;
  el.classList.remove('error', 'success');
  if (kind === 'error') el.classList.add('error');
  if (kind === 'success') el.classList.add('success');
}

function countStatFields(flatUpdate) {
  return Object.keys(flatUpdate?.system?.stats ?? {}).length;
}
