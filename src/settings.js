/* Settings: GitHub sync, theme, backups. */
import { readConfig, saveConfig, clearConfig, testConnection } from './sync/github.js';

const $ = id => document.getElementById(id);

function ago(t) {
  if (!t) return 'not yet';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return m + ' min ago';
  const h = Math.round(m / 60);
  if (h < 24) return h + ' h ago';
  return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function initSettings() {
  const app = window.__brewApp;
  const db = window.__ghdb || null;

  function themeLabel() {
    const t = document.documentElement.getAttribute('data-theme');
    $('theme').textContent = 'Theme: ' + (t === 'dark' ? 'dark' : t === 'light' ? 'light' : 'follows your phone') + ' — tap to change';
  }

  function paint() {
    const cfg = readConfig();
    $('gh-form').classList.toggle('hide', !!cfg);
    $('gh-on').classList.toggle('hide', !cfg);
    const st = $('gh-state');
    if (!cfg) {
      st.textContent = 'Not connected. Your brews are saved on this phone only. Connect your private GitHub repository to back them up and use them on any device.';
      st.style.color = '';
    } else {
      const s = db ? db.status() : { state: 'idle' };
      const appState = app && app.syncState ? app.syncState() : '';
      let line = 'Connected to ' + cfg.owner + '/' + cfg.repo + '. ';
      if (appState === 'auth') line += 'GitHub rejected the token or cannot reach the repository. Disconnect and connect again with a fresh token.';
      else if (s.state === 'syncing') line += 'Syncing…';
      else if (s.state === 'error') line += 'Sync paused: ' + (s.error || 'offline') + ' Brews stay on this phone until it is back.';
      else line += 'Last synced ' + ago(s.lastSync) + '.';
      st.textContent = line;
      st.style.color = (appState === 'auth' || s.state === 'error') ? 'var(--warn)' : '';
    }
    themeLabel();
    const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
    $('about').textContent = 'Brew, version ' + v + '. Installed apps update themselves the next time they open.';
  }

  $('open-settings').addEventListener('click', () => { paint(); app.show('sc-settings'); });
  $('set-back').addEventListener('click', () => app.show('sc-recipe'));
  /* the app's own handler switches the theme; this just keeps the label right */
  $('theme').addEventListener('click', () => setTimeout(themeLabel, 0));

  function showErr(msg) { const e = $('gh-err'); e.textContent = msg; e.classList.toggle('hide', !msg); }
  function showWarn(msg) { const e = $('gh-warn'); e.textContent = msg; e.classList.toggle('hide', !msg); }

  $('gh-connect').addEventListener('click', async () => {
    const cfg = { owner: $('gh-owner').value.trim(), repo: $('gh-repo').value.trim(), token: $('gh-token').value.trim() };
    showErr(''); showWarn('');
    if (!cfg.owner || !cfg.repo || !cfg.token) { showErr('Fill in your username, the repository and the token.'); return; }
    const btn = $('gh-connect');
    btn.disabled = true; btn.textContent = 'Checking…';
    const r = await testConnection(cfg);
    btn.disabled = false; btn.textContent = 'Connect';
    if (!r.ok) { showErr(r.message); return; }
    if (r.warn && !btn.dataset.armed) { showWarn(r.warn + ' Tap Connect again to use it anyway.'); btn.dataset.armed = '1'; return; }
    saveConfig(cfg);
    /* start fresh so the app picks up the connection and pulls everything from GitHub */
    location.reload();
  });
  ['gh-owner', 'gh-repo', 'gh-token'].forEach(id => {
    $(id).addEventListener('keydown', e => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      const next = { 'gh-owner': 'gh-repo', 'gh-repo': 'gh-token' }[id];
      if (next) $(next).focus(); else $('gh-connect').click();
    });
  });

  $('gh-sync').addEventListener('click', () => {
    if (!db) return;
    const btn = $('gh-sync'); btn.textContent = 'Syncing…';
    db.flush().then(() => db.refresh()).catch(() => {}).finally(() => { btn.textContent = 'Sync now'; paint(); });
  });

  $('gh-off').addEventListener('click', () => {
    const btn = $('gh-off');
    if (!btn.dataset.armed) {
      btn.dataset.armed = '1'; btn.textContent = 'Tap again to disconnect';
      setTimeout(() => { delete btn.dataset.armed; btn.textContent = 'Disconnect'; }, 4000);
      return;
    }
    clearConfig();
    location.reload();
  });

  $('dl-backup').addEventListener('click', () => {
    const data = app.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brew-backup-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  if (db) db.onStatus(() => { if (!$('sc-settings').classList.contains('hide')) paint(); });
  paint();
}
