/*
 * GitHub-backed storage for the brew log.
 *
 * The data lives in a private repository as plain JSON so it is readable, diffable and has full history:
 *   coffee.json            packs, locations, caffeine extras, To try list (one document, whole-doc revisions)
 *   brews/YYYY-MM.json     brews for that month, as { id: brew }
 *
 * It exposes the same small API the app's sync code was written against:
 *   db.doc(path).set(data) / .onSnapshot(next, error)
 *   db.doc(path).collection('brews').doc(id).set(data) / .delete()
 *   db.doc(path).collection('brews').onSnapshot(next, error)
 * so merging, revisions, pending brews and deletions keep working exactly as before.
 */

const CFG_KEY = 'fp.gh.v1';
const CACHE_KEY = 'fp.gh.cache.v1';
/* read by the app: set on connecting, so the first look at a repository keeps the repository's packs and settings */
export const JOIN_KEY = 'fp.gh.join.v1';
const DOC_PATH = 'coffee.json';
const BREW_DIR = 'brews';
/* how long a read that disagrees with this device's own write is treated as GitHub catching up */
const GRACE_MS = 2 * 60 * 1000;

export function readConfig(storage = globalThis.localStorage) {
  try {
    const c = JSON.parse(storage.getItem(CFG_KEY) || 'null');
    if (c && c.owner && c.repo && c.token) return c;
  } catch (e) { /* ignore */ }
  return null;
}
/* joinSuffix names the person this phone joins as ('' for the person whose data sits at the repository root) */
export function saveConfig(cfg, storage = globalThis.localStorage, joinSuffix = '') {
  const c = { owner: cfg.owner.trim(), repo: cfg.repo.trim(), token: cfg.token.trim() };
  storage.setItem(CFG_KEY, JSON.stringify(c));
  storage.setItem(JOIN_KEY + joinSuffix, c.owner + '/' + c.repo);
}
export function clearConfig(storage = globalThis.localStorage) {
  const kill = [CFG_KEY, CACHE_KEY, JOIN_KEY];
  try {
    for (let i = 0; i < (storage.length || 0); i++) {
      const k = storage.key(i);
      if (k && (k.indexOf(CACHE_KEY + '@') === 0 || k.indexOf(JOIN_KEY + '@') === 0)) kill.push(k);
    }
  } catch (e) { /* storage without key listing */ }
  kill.forEach(k => storage.removeItem(k));
}

export function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
export function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

/* stable, readable JSON: keys of brew maps sorted, 2-space indent, trailing newline */
function pretty(obj) { return JSON.stringify(obj, null, 2) + '\n'; }
function sortedMap(map) { const o = {}; Object.keys(map).sort().forEach(k => { o[k] = map[k]; }); return o; }
function monthOf(doc) {
  const d = new Date(doc && doc.at);
  return isNaN(d) ? 'undated' : d.toISOString().slice(0, 7);
}
function clone(x) { return x === undefined ? undefined : JSON.parse(JSON.stringify(x)); }

class SyncError extends Error {
  constructor(code, message, status) { super(message || code); this.code = code; this.status = status; }
}
function errFor(status, body) {
  const msg = (body && body.message) || ('GitHub responded ' + status);
  if (status === 401) return new SyncError('revoked', 'GitHub rejected the token. Reconnect in Settings.', status);
  if (status === 403 && /rate limit/i.test(msg)) return new SyncError('unavailable', 'GitHub rate limit reached. Sync resumes shortly.', status);
  if (status === 403 || status === 404) return new SyncError('revoked', 'The token cannot reach this repository. Check the name and the token’s access.', status);
  return new SyncError('unavailable', msg, status);
}

export function createGithubDb(cfg, opts = {}) {
  const fetchImpl = opts.fetch || globalThis.fetch.bind(globalThis);
  const storage = opts.storage || globalThis.localStorage;
  const pollMs = opts.pollMs === undefined ? 60000 : opts.pollMs;
  const debounceMs = opts.debounceMs === undefined ? 250 : opts.debounceMs;
  const base = 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + '/contents/';
  /* each person's packs and brews live in their own folder: '' (the repository root) or e.g. 'people/ananya' */
  const prefix = String(opts.prefix || '').replace(/^\/+|\/+$/g, '');
  const cacheKey = CACHE_KEY + (opts.suffix || '');
  const cacheId = cfg.owner + '/' + cfg.repo + (prefix ? ':' + prefix : '');
  const full = path => [prefix, path].filter(Boolean).join('/');
  const rel = path => (prefix && String(path).indexOf(prefix + '/') === 0 ? String(path).slice(prefix.length + 1) : String(path));

  /* files: path -> { sha, data }  — the last copy read from or written to GitHub (paths are relative to the person's folder) */
  let files = {};
  let etags = {};
  let listing = { root: null, brews: null };
  let loaded = false;           // a full refresh has completed at least once
  try {
    const c = JSON.parse(storage.getItem(cacheKey) || 'null');
    if (c && c.repo === cacheId) { files = c.files || {}; }
  } catch (e) { /* ignore */ }
  function saveCache() {
    try { storage.setItem(cacheKey, JSON.stringify({ repo: cacheId, files })); } catch (e) { /* quota: cache is optional */ }
  }

  const colListeners = new Set();
  const docListeners = new Set();
  const status = { state: 'idle', lastSync: null, error: null };
  const statusListeners = new Set();
  function setStatus(patch) { Object.assign(status, patch); statusListeners.forEach(fn => { try { fn({ ...status }); } catch (e) { /* ignore */ } }); }

  async function gh(method, path, body, etag) {
    const headers = { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
    if (etag) headers['If-None-Match'] = etag;
    if (body) headers['Content-Type'] = 'application/json';
    const url = base + full(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
    let res;
    try {
      res = await fetchImpl(url, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store' });
    } catch (e) {
      throw new SyncError('unavailable', 'Offline or GitHub unreachable.');
    }
    if (res.status === 304) return { status: 304 };
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty body */ }
    return { status: res.status, json, etag: res.headers && res.headers.get ? res.headers.get('ETag') : null };
  }

  /* directory listing; [] for a missing directory or an empty repository */
  async function listDir(dir, key) {
    const r = await gh('GET', dir || '', null, etags[key] && listing[key] ? etags[key] : null);
    if (r.status === 304) return listing[key];
    if (r.status === 404) { listing[key] = []; etags[key] = null; return []; }
    if (r.status !== 200) throw errFor(r.status, r.json);
    const items = Array.isArray(r.json) ? r.json.map(x => ({ name: x.name, path: rel(x.path), sha: x.sha, type: x.type })) : [];
    listing[key] = items; etags[key] = r.etag;
    return items;
  }
  async function getFile(path) {
    const r = await gh('GET', path);
    if (r.status === 404) return null;
    if (r.status !== 200) throw errFor(r.status, r.json);
    let data;
    try { data = JSON.parse(b64decode(r.json.content || '')); } catch (e) {
      throw new SyncError('unavailable', 'Could not read ' + path + ' in the data repository.');
    }
    return { sha: r.json.sha, data };
  }
  async function putFile(path, data, sha, message) {
    const body = { message, content: b64encode(pretty(data)) };
    if (sha) body.sha = sha;
    const r = await gh('PUT', path, body);
    if (r.status === 200 || r.status === 201) return { ok: true, sha: r.json && r.json.content && r.json.content.sha };
    if (r.status === 409 || r.status === 422) return { ok: false, conflict: true };
    throw errFor(r.status, r.json);
  }

  /* Versions this device has just replaced with its own writes. A read that still shows one of them is GitHub catching up,
     not a change made elsewhere, so it must not roll the file back (which would make freshly saved brews vanish). */
  const replaced = {};   // path -> [{ sha, at }]
  const wroteAt = {};    // path -> time of this device's last write to it
  function isReplaced(path, sha) {
    const now = Date.now();
    return !!(sha && (replaced[path] || []).some(x => x.sha === sha && now - x.at < GRACE_MS));
  }
  function noteWrite(path, oldSha) {
    const now = Date.now();
    const list = (replaced[path] || []).filter(x => now - x.at < GRACE_MS);
    if (oldSha) list.push({ sha: oldSha, at: now });
    replaced[path] = list;
    wroteAt[path] = now;
  }
  function wroteRecently(path) { return !!wroteAt[path] && Date.now() - wroteAt[path] < GRACE_MS; }

  /* reads and writes run one at a time, so a refresh never races a save */
  let chain = Promise.resolve();
  function serial(fn) {
    const run = chain.then(fn, fn);
    chain = run.catch(() => {});
    return run;
  }

  /* ---------- reading ---------- */
  let refreshing = null;
  function refresh() {
    if (refreshing) return refreshing;
    refreshing = serial(async () => {
      setStatus({ state: 'syncing' });
      const root = await listDir('', 'root');
      const docEntry = root.find(x => x.path === DOC_PATH);
      const hasBrews = root.some(x => x.path === BREW_DIR && x.type === 'dir');
      const brewEntries = hasBrews ? (await listDir(BREW_DIR, 'brews')).filter(x => x.type === 'file' && /\.json$/.test(x.name)) : [];
      const wanted = {};
      if (docEntry) wanted[DOC_PATH] = docEntry.sha;
      brewEntries.forEach(x => { wanted[x.path] = x.sha; });
      /* drop files that no longer exist remotely (unless a write to them is queued, or this device has only just created them) */
      Object.keys(files).forEach(p => { if (!(p in wanted) && !pending[p] && !wroteRecently(p)) delete files[p]; });
      for (const p of Object.keys(wanted)) {
        if (files[p] && (files[p].sha === wanted[p] || isReplaced(p, wanted[p]))) continue;
        const f = await getFile(p);
        if (f && files[p] && isReplaced(p, f.sha)) continue;
        if (f) files[p] = f; else if (!wroteRecently(p)) delete files[p];
      }
      loaded = true;
      saveCache();
      setStatus({ state: 'idle', lastSync: Date.now(), error: null });
      emit(false);
    }).catch(err => {
      setStatus({ state: 'error', error: err.message });
      failListeners(err);
      throw err;
    }).finally(() => { refreshing = null; });
    return refreshing;
  }

  function brewDocs() {
    const out = [];
    Object.keys(files).forEach(p => {
      if (p.indexOf(BREW_DIR + '/') !== 0) return;
      const m = files[p].data || {};
      Object.keys(m).forEach(id => { if (m[id]) out.push({ id, doc: m[id] }); });
    });
    return out;
  }
  function colSnap(fromCache) {
    const docs = brewDocs().map(x => ({ id: x.id, exists: true, data: () => clone(x.doc), metadata: { fromCache } }));
    return { docs, size: docs.length, empty: !docs.length, docChanges: () => [], metadata: { fromCache, hasPendingWrites: false } };
  }
  function docSnap(fromCache) {
    const f = files[DOC_PATH];
    const exists = !!(f && f.data);
    return { id: 'coffee', exists, data: () => (exists ? clone(f.data) : undefined), metadata: { fromCache, hasPendingWrites: false } };
  }
  function emit(fromCache) {
    colListeners.forEach(l => { try { l.next(colSnap(fromCache)); } catch (e) { console.error(e); } });
    docListeners.forEach(l => { try { l.next(docSnap(fromCache)); } catch (e) { console.error(e); } });
  }
  function failListeners(err) {
    colListeners.forEach(l => { if (l.error) try { l.error(err); } catch (e) { /* ignore */ } });
  }
  function addListener(set, next, error) {
    /* subscribing again with the same handler replaces the old subscription */
    set.forEach(l => { if (l.next === next) set.delete(l); });
    const l = { next, error };
    set.add(l);
    return l;
  }

  /* ---------- writing ---------- */
  /* pending: path -> { ops: Map(id -> {type, data}) | null, doc: data | undefined, waiters: [] } */
  const pending = {};
  let flushTimer = null;
  let flushing = null;
  function queue(path, apply) {
    const p = pending[path] || (pending[path] = { ops: new Map(), doc: undefined, waiters: [] });
    apply(p);
    return new Promise((resolve, reject) => {
      p.waiters.push({ resolve, reject });
      clearTimeout(flushTimer);
      flushTimer = setTimeout(() => { flush(); }, debounceMs);
    });
  }
  function findBrewPath(id) {
    for (const p of Object.keys(files)) {
      if (p.indexOf(BREW_DIR + '/') === 0 && files[p].data && files[p].data[id]) return p;
    }
    for (const p of Object.keys(pending)) { if (pending[p].ops.has(id)) return p; }
    return null;
  }
  const who = opts.label ? opts.label + ': ' : '';
  function message(path, p) {
    if (path === DOC_PATH) return who + 'Update packs and settings';
    let set = 0, del = 0;
    p.ops.forEach(op => { if (op.type === 'set') set++; else del++; });
    const month = path.slice(BREW_DIR.length + 1, -5);
    const parts = [];
    if (set) parts.push(set + ' saved');
    if (del) parts.push(del + ' deleted');
    return who + 'Brews ' + month + ': ' + parts.join(', ');
  }
  async function writePath(path, p) {
    const isDoc = path === DOC_PATH;
    let refetch = !loaded && !files[path];
    for (let attempt = 0; attempt < 4; attempt++) {
      if (refetch) {
        const before = files[path];
        const fresh = await getFile(path);
        if (fresh && isReplaced(path, fresh.sha)) { /* GitHub still catching up with this device's last write: keep ours */ }
        else if (fresh) {
          if (isDoc && attempt > 0 && (!before || fresh.sha !== before.sha)) {
            /* someone else changed the shared document: take theirs; the app merges by revision and writes again if its copy is newer */
            files[path] = fresh;
            return;
          }
          files[path] = fresh; /* same document, the branch had just moved on (another file saved at that moment): write again */
        } else if (!wroteRecently(path)) delete files[path];
      }
      refetch = true;
      const cur = files[path];
      let next;
      if (isDoc) {
        next = clone(p.doc);
      } else {
        next = clone((cur && cur.data) || {});
        p.ops.forEach((op, id) => { if (op.type === 'set') next[id] = clone(op.data); else delete next[id]; });
        next = sortedMap(next);
      }
      /* nothing changed: no empty commit */
      if (cur && JSON.stringify(cur.data) === JSON.stringify(next)) return;
      if (!cur && !isDoc && !Object.keys(next).length) return;
      const r = await putFile(path, next, cur && cur.sha, message(path, p));
      if (r.ok) { noteWrite(path, cur && cur.sha); files[path] = { sha: r.sha, data: next }; return; }
    }
    throw new SyncError('unavailable', 'Could not save after several attempts. Will retry.');
  }
  function flush() {
    if (flushing) return flushing.then(() => (Object.keys(pending).length ? flush() : undefined));
    if (!Object.keys(pending).length) return Promise.resolve();
    flushing = serial(async () => {
      const batch = Object.assign({}, pending);
      Object.keys(batch).forEach(k => { delete pending[k]; });
      if (!Object.keys(batch).length) return;
      setStatus({ state: 'syncing' });
      let firstErr = null;
      for (const path of Object.keys(batch)) {
        const p = batch[path];
        try {
          await writePath(path, p);
          p.waiters.forEach(w => w.resolve());
        } catch (err) {
          firstErr = firstErr || err;
          p.waiters.forEach(w => w.reject(err));
        }
      }
      saveCache();
      if (firstErr) setStatus({ state: 'error', error: firstErr.message });
      else setStatus({ state: 'idle', lastSync: Date.now(), error: null });
      if (loaded) emit(false);
    }).finally(() => { flushing = null; });
    return flushing;
  }

  /* ---------- polling ---------- */
  let pollTimer = null;
  function startPolling() {
    if (pollTimer || !pollMs) return;
    pollTimer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      if (colListeners.size || docListeners.size) refresh().catch(() => {});
    }, pollMs);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => { if (!document.hidden && (colListeners.size || docListeners.size)) refresh().catch(() => {}); });
  }
  if (typeof window !== 'undefined' && window.addEventListener) {
    window.addEventListener('online', () => { if (colListeners.size || docListeners.size) refresh().catch(() => {}); });
  }

  /* ---------- the API the app uses ---------- */
  function collection() {
    return {
      doc(id) {
        id = String(id);
        return {
          set(data) {
            const path = BREW_DIR + '/' + monthOf(data) + '.json';
            const old = findBrewPath(id);
            const jobs = [queue(path, p => { p.ops.set(id, { type: 'set', data: clone(data) }); })];
            if (old && old !== path) jobs.push(queue(old, p => { p.ops.set(id, { type: 'del' }); }));
            return Promise.all(jobs).then(() => undefined);
          },
          delete() {
            const path = findBrewPath(id);
            if (!path) return Promise.resolve();
            return queue(path, p => { p.ops.set(id, { type: 'del' }); });
          }
        };
      },
      onSnapshot(next, error) {
        const l = addListener(colListeners, next, error);
        /* the cached copy only helps before the first real read; arriving later it could resurrect deleted brews */
        setTimeout(() => { if (!loaded && colListeners.has(l)) next(colSnap(true)); }, 0);
        refresh().catch(() => {});
        startPolling();
        return () => { colListeners.delete(l); };
      }
    };
  }
  function doc() {
    return {
      set(data) { return queue(DOC_PATH, p => { p.doc = clone(data); }); },
      onSnapshot(next, error) {
        const l = addListener(docListeners, next, error);
        setTimeout(() => { if (!loaded && docListeners.has(l)) next(docSnap(true)); }, 0);
        refresh().catch(() => {});
        startPolling();
        return () => { docListeners.delete(l); };
      },
      collection
    };
  }

  return {
    doc,
    refresh,
    flush,
    status: () => ({ ...status }),
    onStatus(fn) { statusListeners.add(fn); fn({ ...status }); return () => statusListeners.delete(fn); },
    config: { owner: cfg.owner, repo: cfg.repo },
    _files: () => files
  };
}

/* checks the token can read the repository before saving it */
export async function testConnection(cfg, fetchImpl = globalThis.fetch.bind(globalThis)) {
  let res;
  try {
    res = await fetchImpl('https://api.github.com/repos/' + encodeURIComponent(cfg.owner.trim()) + '/' + encodeURIComponent(cfg.repo.trim()), {
      headers: { Authorization: 'Bearer ' + cfg.token.trim(), Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' },
      cache: 'no-store'
    });
  } catch (e) {
    return { ok: false, message: 'Could not reach GitHub. Check your connection.' };
  }
  let body = null;
  try { body = await res.json(); } catch (e) { /* ignore */ }
  if (res.status === 200) {
    if (body && body.private === false) return { ok: true, warn: 'This repository is public, so anyone can read your brews. A private repository is better.' };
    return { ok: true };
  }
  if (res.status === 401) return { ok: false, message: 'GitHub rejected the token. Copy it again from GitHub.' };
  if (res.status === 404 || res.status === 403) return { ok: false, message: 'The token cannot see ' + cfg.owner + '/' + cfg.repo + '. Check the spelling, and that the token has access to this repository.' };
  return { ok: false, message: (body && body.message) || ('GitHub responded ' + res.status) };
}

