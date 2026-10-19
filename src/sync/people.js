/*
 * The people who brew with the app.
 *
 * people.json at the root of the data repository lists them:
 *   { "people": [ { "id": "shitij", "name": "Shitij", "dir": "" },
 *                 { "id": "ananya", "name": "Ananya", "dir": "people/ananya" } ], "rev": 0 }
 * Each person's packs, places, To try list and brews live in their own folder. The first person keeps the
 * repository root ('') so their existing data stays where it is. Each phone remembers who it brews as.
 */
import { b64encode, b64decode } from './github.js';

export const PEOPLE_KEY = 'fp.people.v1';
export const WHO_KEY = 'fp.who.v1';
const PATH = 'people.json';

export function defaultPeople(owner) {
  return { people: [{ id: 'me', name: owner || 'Me', dir: '' }], rev: 0 };
}

/* a valid list: unique ids and folders, and always someone at the repository root */
export function cleanPeople(d, owner) {
  const ids = {}, dirs = {}, list = [];
  ((d && Array.isArray(d.people)) ? d.people : []).forEach(p => {
    if (!p || p.id === undefined || p.id === null || ids[p.id]) return;
    const id = String(p.id);
    let dir = typeof p.dir === 'string' ? p.dir.replace(/^\/+|\/+$/g, '') : 'people/' + id;
    if (dirs[dir]) dir = 'people/' + id;
    if (dirs[dir]) return;
    ids[id] = 1; dirs[dir] = 1;
    list.push({ id, name: String(p.name || '').trim() || id, dir });
  });
  if (!dirs['']) list.unshift(defaultPeople(owner).people[0]);
  return { people: list, rev: (d && d.rev) || 0 };
}

export function readPeople(storage = globalThis.localStorage, owner) {
  try {
    const c = JSON.parse(storage.getItem(PEOPLE_KEY) || 'null');
    if (c && Array.isArray(c.people) && c.people.length) return cleanPeople(c, owner);
  } catch (e) { /* ignore */ }
  return defaultPeople(owner);
}
export function cachePeople(d, storage = globalThis.localStorage) {
  try { storage.setItem(PEOPLE_KEY, JSON.stringify(d)); } catch (e) { /* ignore */ }
}

/* local storage keys of the person at the root stay as they always were; everyone else's get "@id" */
export function suffixFor(p) { return p && p.dir ? '@' + p.id : ''; }

export function whoAmI(people, storage = globalThis.localStorage) {
  let id = null;
  try { id = storage.getItem(WHO_KEY); } catch (e) { /* ignore */ }
  const list = people.people;
  return list.find(p => p.id === id) || list.find(p => p.dir === '') || list[0];
}
export function setWho(id, storage = globalThis.localStorage) { storage.setItem(WHO_KEY, id); }

export function newPersonId(name, people) {
  const base = String(name).toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 24) || 'person';
  const taken = new Set(people.people.map(p => p.id).concat(['me']));
  let id = base, n = 2;
  while (taken.has(id)) id = base + '-' + n++;
  return id;
}

function headers(cfg, json) {
  const h = { Authorization: 'Bearer ' + cfg.token, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}
function url(cfg) {
  return 'https://api.github.com/repos/' + encodeURIComponent(cfg.owner) + '/' + encodeURIComponent(cfg.repo) + '/contents/' + PATH;
}

/* { data, sha }; data is null when the repository has no people.json yet */
export async function fetchPeople(cfg, fetchImpl = globalThis.fetch.bind(globalThis)) {
  let res;
  try { res = await fetchImpl(url(cfg), { method: 'GET', headers: headers(cfg), cache: 'no-store' }); }
  catch (e) { throw new Error('Could not reach GitHub. Check your connection.'); }
  if (res.status === 404) return { data: null, sha: null };
  if (res.status === 401) throw new Error('GitHub rejected the token.');
  if (res.status !== 200) throw new Error('GitHub responded ' + res.status);
  const j = await res.json();
  let raw;
  try { raw = JSON.parse(b64decode(j.content || '')); } catch (e) { throw new Error('people.json in the data repository is not valid.'); }
  return { data: cleanPeople(raw, cfg.owner), sha: j.sha };
}

/* change(list) edits the list in place and returns the commit message; retried if another phone saved at the same time */
export async function updatePeople(cfg, change, opts = {}) {
  const fetchImpl = opts.fetch || globalThis.fetch.bind(globalThis);
  const storage = opts.storage || globalThis.localStorage;
  for (let attempt = 0; attempt < 4; attempt++) {
    const cur = await fetchPeople(cfg, fetchImpl);
    const next = cleanPeople(JSON.parse(JSON.stringify(cur.data || defaultPeople(cfg.owner))), cfg.owner);
    const message = change(next) || 'Update people';
    next.rev = Date.now();
    const body = { message, content: b64encode(JSON.stringify(next, null, 2) + '\n') };
    if (cur.sha) body.sha = cur.sha;
    let res;
    try { res = await fetchImpl(url(cfg), { method: 'PUT', headers: headers(cfg, true), body: JSON.stringify(body), cache: 'no-store' }); }
    catch (e) { throw new Error('Could not reach GitHub. Check your connection.'); }
    if (res.status === 200 || res.status === 201) { cachePeople(next, storage); return next; }
    if (res.status === 409 || res.status === 422) continue;
    if (res.status === 401) throw new Error('GitHub rejected the token.');
    if (res.status === 403 || res.status === 404) throw new Error('The token cannot write to this repository.');
    throw new Error('GitHub responded ' + res.status);
  }
  throw new Error('Could not save after several attempts. Try again.');
}
