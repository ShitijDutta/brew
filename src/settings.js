/* Settings: GitHub sync, people, theme, backups. */
import { readConfig, saveConfig, clearConfig, testConnection } from './sync/github.js';
import { fetchPeople, updatePeople, cachePeople, setWho, suffixFor, newPersonId } from './sync/people.js';

const $ = id => document.getElementById(id);
const esc = v => String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

/*
 * A phone joining as someone other than the first person: anything it logged before connecting is that person's,
 * so it moves to their keys. A phone whose log came from GitHub holds someone else's data and keeps it where it is.
 */
function moveLocal(sfx) {
  try {
    const log = JSON.parse(localStorage.getItem('fp.log.v1') || '[]');
    if (Array.isArray(log) && log.some(e => e && e.synced)) return;
    ['fp.v1', 'fp.log.v1', 'fp.log.test.v1', 'fp.log.del.v1', 'fp.run.v1'].forEach(k => {
      const v = localStorage.getItem(k);
      if (v !== null && localStorage.getItem(k + sfx) === null) localStorage.setItem(k + sfx, v);
      localStorage.removeItem(k);
    });
    /* packs only if real ones were added; the default places and list are not worth carrying over */
    const pk = localStorage.getItem('fp.packs.v1');
    const p = JSON.parse(pk || 'null');
    if (p && p.packs && p.packs.length && localStorage.getItem('fp.packs.v1' + sfx) === null) localStorage.setItem('fp.packs.v1' + sfx, pk);
    localStorage.removeItem('fp.packs.v1');
  } catch (e) { /* storage unavailable: nothing to move */ }
}

export function initSettings() {
  const app = window.__brewApp;
  const db = window.__ghdb || null;
  const who = window.__who || { id: 'me', name: '', people: [] };
  let renaming = null;

  function themeLabel() {
    const t = document.documentElement.getAttribute('data-theme');
    $('theme').textContent = 'Theme: ' + (t === 'dark' ? 'dark' : t === 'light' ? 'light' : 'follows your phone') + ' — tap to change';
  }

  function paintPeople() {
    const many = who.people.length > 1;
    $('ppl-me').textContent = many
      ? 'This phone brews as ' + who.name + '. Each person has their own packs, places, To try list and log.'
      : 'Just you so far. Add someone to give them their own packs, places, To try list and log, synced to the same repository.';
    $('ppl-list').innerHTML = who.people.map(p => {
      if (renaming === p.id) {
        return '<div class="prow"><label class="sr" for="ppl-rn">New name</label><input type="text" id="ppl-rn" class="tin" value="' + esc(p.name) + '" autocomplete="off" enterkeyhint="done">'
          + '<button class="ghost" data-prsave="' + esc(p.id) + '">Save</button><button class="ghost" data-prcancel="1">Cancel</button></div>';
      }
      return '<div class="prow"><span class="pn">' + esc(p.name) + '</span>'
        + (p.id === who.id ? '<span class="pt">this phone</span>' : '<button class="ghost" data-pswitch="' + esc(p.id) + '">Brew as</button>')
        + '<button class="ghost" data-pren="' + esc(p.id) + '">Rename</button></div>';
    }).join('');
  }

  function paint() {
    const cfg = readConfig();
    $('gh-form').classList.toggle('hide', !!cfg);
    $('gh-on').classList.toggle('hide', !cfg);
    $('ppl').classList.toggle('hide', !cfg);
    const st = $('gh-state');
    if (!cfg) {
      st.textContent = 'Not connected. Your brews are saved on this phone only. Connect your private GitHub repository to back them up and use them on any device.';
      st.style.color = '';
    } else {
      const s = db ? db.status() : { state: 'idle' };
      const appState = app && app.syncState ? app.syncState() : '';
      let line = 'Connected to ' + cfg.owner + '/' + cfg.repo + (who.people.length > 1 ? ' as ' + who.name : '') + '. ';
      if (appState === 'auth') line += 'GitHub rejected the token or cannot reach the repository. Disconnect and connect again with a fresh token.';
      else if (s.state === 'syncing') line += 'Syncing…';
      else if (s.state === 'error') line += 'Sync paused: ' + (s.error || 'offline') + ' Brews stay on this phone until it is back.';
      else line += 'Last synced ' + ago(s.lastSync) + '.';
      st.textContent = line;
      st.style.color = (appState === 'auth' || s.state === 'error') ? 'var(--warn)' : '';
      paintPeople();
    }
    themeLabel();
    const v = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev';
    $('about').textContent = 'Brew, version ' + v + '. Installed apps update themselves the next time they open.';
  }

  $('open-settings').addEventListener('click', () => { renaming = null; paint(); app.show('sc-settings'); });
  $('set-back').addEventListener('click', () => app.show('sc-recipe'));
  /* the app's own handler switches the theme; this just keeps the label right */
  $('theme').addEventListener('click', () => setTimeout(themeLabel, 0));

  function showErr(msg) { const e = $('gh-err'); e.textContent = msg; e.classList.toggle('hide', !msg); }
  function showWarn(msg) { const e = $('gh-warn'); e.textContent = msg; e.classList.toggle('hide', !msg); }
  function pplErr(msg) { const e = $('ppl-err'); e.textContent = msg; e.classList.toggle('hide', !msg); }

  /* connecting: check the token, then (if several people share the repository) ask who uses this phone */
  let pendingCfg = null, pendingPeople = null;
  function finish(cfg, data, person) {
    if (data) cachePeople(data);
    setWho(person.id);
    const sfx = suffixFor(person);
    if (sfx) moveLocal(sfx);
    saveConfig(cfg, localStorage, sfx);
    /* start fresh so the app picks up the connection and pulls everything from GitHub */
    location.reload();
  }
  $('gh-connect').addEventListener('click', async () => {
    const cfg = { owner: $('gh-owner').value.trim(), repo: $('gh-repo').value.trim(), token: $('gh-token').value.trim() };
    showErr(''); showWarn('');
    $('gh-who').classList.add('hide');
    $('gh-connect').classList.remove('hide');
    if (!cfg.owner || !cfg.repo || !cfg.token) { showErr('Fill in your username, the repository and the token.'); return; }
    const btn = $('gh-connect');
    btn.disabled = true; btn.textContent = 'Checking…';
    const r = await testConnection(cfg);
    let ppl = null;
    if (r.ok) { try { ppl = (await fetchPeople(cfg)).data; } catch (e) { ppl = null; } }
    btn.disabled = false; btn.textContent = 'Connect';
    if (!r.ok) { showErr(r.message); return; }
    if (r.warn && !btn.dataset.armed) { showWarn(r.warn + ' Tap Connect again to use it anyway.'); btn.dataset.armed = '1'; return; }
    if (ppl && ppl.people.length > 1) {
      pendingCfg = cfg; pendingPeople = ppl;
      $('gh-who-list').innerHTML = ppl.people.map(p => '<button class="chip" data-gwho="' + esc(p.id) + '">' + esc(p.name) + '</button>').join('');
      $('gh-who').classList.remove('hide');
      btn.classList.add('hide');
      return;
    }
    finish(cfg, ppl, (ppl && ppl.people.find(p => p.dir === '')) || { id: 'me', dir: '' });
  });
  $('gh-who-list').addEventListener('click', e => {
    const b = e.target.closest('[data-gwho]');
    if (!b || !pendingCfg) return;
    const person = pendingPeople.people.find(p => p.id === b.dataset.gwho);
    if (person) finish(pendingCfg, pendingPeople, person);
  });
  ['gh-owner', 'gh-repo', 'gh-token'].forEach(id => {
    /* changing the details means checking again before picking who you are */
    $(id).addEventListener('input', () => { pendingCfg = null; $('gh-who').classList.add('hide'); $('gh-connect').classList.remove('hide'); });
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

  /* people: switch, rename, add */
  async function savePeople(change, btn) {
    const cfg = readConfig();
    if (!cfg) return;
    pplErr('');
    const label = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
    try {
      await updatePeople(cfg, change);
      location.reload();
    } catch (e) {
      pplErr(e.message || 'Could not save. Try again.');
      if (btn) { btn.disabled = false; btn.textContent = label; }
    }
  }
  $('ppl-list').addEventListener('click', e => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.pswitch) {
      if (app.busy && app.busy()) { pplErr('Finish the brew in progress first.'); return; }
      app.switchTo(b.dataset.pswitch);
      return;
    }
    if (b.dataset.pren) { renaming = b.dataset.pren; paintPeople(); const i = $('ppl-rn'); if (i) { i.focus(); i.select(); } return; }
    if (b.dataset.prcancel) { renaming = null; pplErr(''); paintPeople(); return; }
    if (b.dataset.prsave) {
      const id = b.dataset.prsave, name = ($('ppl-rn').value || '').trim();
      if (!name) { pplErr('Give them a name.'); return; }
      savePeople(d => {
        const p = d.people.find(x => x.id === id);
        if (!p) return 'Update people';
        const old = p.name; p.name = name;
        return 'Rename ' + old + ' to ' + name;
      }, b);
    }
  });
  $('ppl-list').addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.target.id !== 'ppl-rn') return;
    e.preventDefault();
    const b = document.querySelector('[data-prsave]');
    if (b) b.click();
  });
  $('ppl-save').addEventListener('click', () => {
    const name = $('ppl-name').value.trim();
    if (!name) { pplErr('Give them a name.'); return; }
    savePeople(d => {
      const id = newPersonId(name, d);
      d.people.push({ id, name, dir: 'people/' + id });
      return 'Add ' + name;
    }, $('ppl-save'));
  });
  $('ppl-name').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('ppl-save').click(); } });

  $('dl-backup').addEventListener('click', () => {
    const data = app.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'brew-backup-' + (who.people.length > 1 && who.name ? who.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' : '') + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  });

  if (db) db.onStatus(() => { if (!$('sc-settings').classList.contains('hide')) paint(); });
  window.addEventListener('brew:people', () => { if (!$('sc-settings').classList.contains('hide')) paint(); });
  paint();
}
