/*
 * Runs before the app starts: works out who this phone brews as, and when GitHub is connected,
 * opens that person's folder in the data repository (plus everyone else's, read-only, for shared brews).
 */
import { readConfig, createGithubDb } from './github.js';
import { readPeople, cachePeople, whoAmI, suffixFor, fetchPeople } from './people.js';

const cfg = readConfig();
let people = readPeople(globalThis.localStorage, cfg && cfg.owner);
const me = whoAmI(people);
const who = globalThis.__who = { id: me.id, name: me.name, dir: me.dir, suffix: suffixFor(me), people: people.people.slice(), connected: !!cfg };

if (cfg) {
  const label = p => (people.people.length > 1 ? p.name : '');
  const db = createGithubDb(cfg, { prefix: me.dir, suffix: who.suffix, label: label(me) });
  globalThis.__ghdb = db;
  globalThis.claude = {
    use(name) {
      if (name === 'db') return Promise.resolve(db);
      if (name === 'user') return Promise.resolve({ id: () => Promise.resolve(cfg.owner) });
      return Promise.resolve(null);
    }
  };
  /* everyone else's brews, to show shared carafes and the Everyone log; this phone never writes to them */
  const others = globalThis.__others = [];
  const addOthers = list => list.forEach(p => {
    if (p.id === who.id) return;
    const o = others.find(x => x.id === p.id);
    if (o) { o.name = p.name; return; }
    others.push({ id: p.id, name: p.name, db: createGithubDb(cfg, { prefix: p.dir, suffix: suffixFor(p) }) });
  });
  addOthers(people.people);

  /* pick up people added or renamed on another phone */
  fetchPeople(cfg).then(r => {
    if (!r.data) return;
    if (JSON.stringify(r.data.people) === JSON.stringify(people.people)) return;
    people = r.data;
    cachePeople(r.data);
    const mine = r.data.people.find(p => p.id === who.id) || (who.dir === '' ? r.data.people.find(p => p.dir === '') : null);
    if (mine) { who.id = mine.id; who.name = mine.name; }
    who.people = r.data.people.slice();
    addOthers(r.data.people);
    globalThis.dispatchEvent(new CustomEvent('brew:people'));
  }).catch(() => {});
}
