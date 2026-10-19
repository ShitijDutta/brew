import { describe, it, expect } from 'vitest';
import { createGithubDb, clearConfig, saveConfig, readConfig, JOIN_KEY } from '../../src/sync/github.js';
import { cleanPeople, defaultPeople, fetchPeople, updatePeople, newPersonId, whoAmI, suffixFor, readPeople, cachePeople, WHO_KEY } from '../../src/sync/people.js';
import { fakeGithub, memoryStorage } from './fakeGithub.js';

const cfg = { owner: 'me', repo: 'brew-data', token: 'good' };
const brew = (id, at, extra = {}) => Object.assign({ id: Number(id), at, rev: Number(id), recipe: 'black', calc: { dose: 16 }, steps: [] }, extra);

describe('people', () => {
  it('always has someone at the repository root, with unique ids and folders', () => {
    expect(cleanPeople(null, 'me')).toEqual(defaultPeople('me'));
    const d = cleanPeople({ people: [{ id: 'ana', name: ' Ana ', dir: 'people/ana/' }, { id: 'ana', name: 'dup' }, { id: 'raj', name: 'Raj', dir: 'people/ana' }] }, 'me');
    expect(d.people).toEqual([
      { id: 'me', name: 'me', dir: '' },
      { id: 'ana', name: 'Ana', dir: 'people/ana' },
      { id: 'raj', name: 'Raj', dir: 'people/raj' }
    ]);
  });

  it('remembers who this phone brews as, falling back to the root person', () => {
    const s = memoryStorage();
    const list = cleanPeople({ people: [{ id: 'shitij', name: 'Shitij', dir: '' }, { id: 'ana', name: 'Ana', dir: 'people/ana' }] });
    expect(whoAmI(list, s).id).toBe('shitij');
    s.setItem(WHO_KEY, 'ana');
    expect(whoAmI(list, s).id).toBe('ana');
    s.setItem(WHO_KEY, 'gone');
    expect(whoAmI(list, s).id).toBe('shitij');
    expect(suffixFor(list.people[0])).toBe('');
    expect(suffixFor(list.people[1])).toBe('@ana');
    cachePeople(list, s);
    expect(readPeople(s).people.map(p => p.id)).toEqual(['shitij', 'ana']);
  });

  it('makes readable, unique ids from names', () => {
    const list = cleanPeople({ people: [{ id: 'shitij', name: 'Shitij', dir: '' }, { id: 'ana', name: 'Ana', dir: 'people/ana' }] });
    expect(newPersonId('Ana', list)).toBe('ana-2');
    expect(newPersonId('Riya Sharma', list)).toBe('riya-sharma');
    expect(newPersonId('मीरा', list)).toBe('person');
    expect(newPersonId('Me', list)).toBe('me-2');
  });

  it('creates people.json on the first addition and keeps both additions when two phones add at once', async () => {
    const gh = fakeGithub();
    const s = memoryStorage();
    expect(await fetchPeople(cfg, gh.fetch)).toEqual({ data: null, sha: null });
    await updatePeople(cfg, d => { d.people[0].name = 'Shitij'; d.people.push({ id: 'ana', name: 'Ana', dir: 'people/ana' }); return 'Add Ana'; }, { fetch: gh.fetch, storage: s });
    expect(gh.read('people.json').people.map(p => p.name)).toEqual(['Shitij', 'Ana']);
    /* someone else adds a person between our read and our write */
    gh.st.beforePut = () => { const d = gh.read('people.json'); d.people.push({ id: 'raj', name: 'Raj', dir: 'people/raj' }); gh.put('people.json', d); };
    await updatePeople(cfg, d => { d.people.push({ id: 'kim', name: 'Kim', dir: 'people/kim' }); return 'Add Kim'; }, { fetch: gh.fetch, storage: s });
    expect(gh.read('people.json').people.map(p => p.id)).toEqual(['me', 'ana', 'raj', 'kim']);
    expect(readPeople(s).people.map(p => p.id)).toEqual(['me', 'ana', 'raj', 'kim']);
  });
});

describe('a person’s own folder', () => {
  it('reads and writes only inside that folder, with its own cache', async () => {
    const gh = fakeGithub();
    gh.put('coffee.json', { packs: [{ id: 'root-pack' }], rev: 1 });
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    gh.put('people.json', { people: [{ id: 'shitij', name: 'Shitij', dir: '' }, { id: 'ana', name: 'Ana', dir: 'people/ana' }] });
    gh.put('people/ana/brews/2026-10.json', { 5: brew('5', '2026-10-05T08:00:00Z') });
    const s = memoryStorage();
    const ana = createGithubDb(cfg, { fetch: gh.fetch, storage: s, pollMs: 0, debounceMs: 5, prefix: 'people/ana', suffix: '@ana', label: 'Ana' });
    const root = createGithubDb(cfg, { fetch: gh.fetch, storage: s, pollMs: 0, debounceMs: 5 });
    let a = null, r = null, aDoc = null;
    ana.doc('x').collection('brews').onSnapshot(x => { a = x; });
    ana.doc('x').onSnapshot(x => { aDoc = x; });
    root.doc('x').collection('brews').onSnapshot(x => { r = x; });
    await ana.refresh(); await root.refresh();
    expect(a.docs.map(d => d.id)).toEqual(['5']);
    expect(aDoc.exists).toBe(false);
    expect(r.docs.map(d => d.id)).toEqual(['1']);
    await ana.doc('x').collection('brews').doc('6').set(brew('6', '2026-11-02T08:00:00Z'));
    await ana.doc('x').set({ packs: [{ id: 'her-pack' }], rev: 2 });
    expect(gh.read('people/ana/brews/2026-11.json')).toEqual({ 6: brew('6', '2026-11-02T08:00:00Z') });
    expect(gh.read('people/ana/coffee.json')).toEqual({ packs: [{ id: 'her-pack' }], rev: 2 });
    expect(gh.read('coffee.json')).toEqual({ packs: [{ id: 'root-pack' }], rev: 1 });
    expect(gh.read('brews/2026-11.json')).toBeUndefined();
    expect(gh.log.filter(l => l.startsWith('PUT'))).toEqual(['PUT /contents/people/ana/brews/2026-11.json', 'PUT /contents/people/ana/coffee.json']);
    expect(JSON.parse(s.getItem('fp.gh.cache.v1@ana')).repo).toBe('me/brew-data:people/ana');
    expect(JSON.parse(s.getItem('fp.gh.cache.v1')).repo).toBe('me/brew-data');
    await root.refresh();
    expect(r.docs.map(d => d.id)).toEqual(['1']);
  });

  it('labels commits with the person’s name', async () => {
    const gh = fakeGithub();
    const msgs = [];
    const spy = (url, init) => { if (init && init.method === 'PUT') msgs.push(JSON.parse(init.body).message); return gh.fetch(url, init); };
    const ana = createGithubDb(cfg, { fetch: spy, storage: memoryStorage(), pollMs: 0, debounceMs: 5, prefix: 'people/ana', suffix: '@ana', label: 'Ana' });
    ana.doc('x').collection('brews').onSnapshot(() => {});
    await ana.refresh();
    await ana.doc('x').collection('brews').doc('7').set(brew('7', '2026-10-07T08:00:00Z'));
    expect(msgs).toEqual(['Ana: Brews 2026-10: 1 saved']);
  });

  it('disconnecting clears every person’s cache and join marker', () => {
    const s = memoryStorage();
    const keys = {};
    const store = { getItem: k => (k in keys ? keys[k] : null), setItem: (k, v) => { keys[k] = String(v); }, removeItem: k => { delete keys[k]; },
      get length() { return Object.keys(keys).length; }, key: i => Object.keys(keys)[i] };
    saveConfig({ owner: 'me', repo: 'brew-data', token: 't' }, store, '@ana');
    store.setItem('fp.gh.cache.v1', '{}'); store.setItem('fp.gh.cache.v1@ana', '{}'); store.setItem('fp.log.v1@ana', '[]');
    expect(store.getItem(JOIN_KEY + '@ana')).toBe('me/brew-data');
    clearConfig(store);
    expect(readConfig(store)).toBe(null);
    expect(Object.keys(keys)).toEqual(['fp.log.v1@ana']);
    expect(s.getItem('x')).toBe(null);
  });
});
