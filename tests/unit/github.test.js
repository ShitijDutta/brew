import { describe, it, expect, vi } from 'vitest';
import { createGithubDb, testConnection, saveConfig, readConfig, clearConfig, JOIN_KEY } from '../../src/sync/github.js';
import { fakeGithub, memoryStorage } from './fakeGithub.js';

const cfg = { owner: 'me', repo: 'brew-data', token: 'good' };
const tick = (ms = 0) => new Promise(r => setTimeout(r, ms));
function setup(opts = {}) {
  const gh = opts.gh || fakeGithub();
  const storage = opts.storage || memoryStorage();
  const db = createGithubDb(opts.cfg || cfg, { fetch: gh.fetch, storage, pollMs: 0, debounceMs: 5 });
  const col = db.doc('data/users/me/coffee').collection('brews');
  const pdoc = db.doc('data/users/me/coffee');
  return { gh, storage, db, col, pdoc };
}
function brew(id, at, extra = {}) { return Object.assign({ id: Number(id), at, rev: Number(id), recipe: 'black', calc: { dose: 16 }, steps: [] }, extra); }
function collect(col) {
  const snaps = [], errors = [];
  col.onSnapshot(s => snaps.push({ fromCache: s.metadata.fromCache, ids: s.docs.map(d => d.data().id).sort((a, b) => a - b) }), e => errors.push(e));
  return { snaps, errors, last: () => snaps[snaps.length - 1] };
}

describe('GitHub storage', () => {
  it('starts from an empty repository and creates month files on first save', async () => {
    const { gh, col, db } = setup();
    const c = collect(col);
    await db.refresh();
    expect(c.last()).toEqual({ fromCache: false, ids: [] });
    await col.doc('1792156919553').set(brew('1792156919553', '2026-10-16T13:21:59.553Z'));
    expect(gh.read('brews/2026-10.json')).toEqual({ 1792156919553: brew('1792156919553', '2026-10-16T13:21:59.553Z') });
    expect(gh.text('brews/2026-10.json')).toMatch(/^\{\n  "1792156919553": \{\n/);
    expect(c.last()).toEqual({ fromCache: false, ids: [1792156919553] });
  });

  it('batches several saves into one commit per month', async () => {
    const { gh, col, db } = setup();
    await db.refresh();
    await Promise.all([
      col.doc('1').set(brew('1', '2026-10-01T08:00:00Z')),
      col.doc('2').set(brew('2', '2026-10-02T08:00:00Z')),
      col.doc('3').set(brew('3', '2026-09-30T08:00:00Z'))
    ]);
    expect(gh.log.filter(l => l.startsWith('PUT')).sort()).toEqual(['PUT /contents/brews/2026-09.json', 'PUT /contents/brews/2026-10.json']);
    expect(Object.keys(gh.read('brews/2026-10.json'))).toEqual(['1', '2']);
  });

  it('reads brews and the packs document written elsewhere', async () => {
    const gh = fakeGithub();
    gh.put('coffee.json', { packs: [{ id: 'p1', name: 'Signature' }], rev: 5 });
    gh.put('brews/2026-10.json', { 10: brew('10', '2026-10-10T08:00:00Z') });
    gh.put('brews/2026-09.json', { 9: brew('9', '2026-09-10T08:00:00Z') });
    const { col, pdoc, db } = setup({ gh });
    const c = collect(col);
    const docs = [];
    pdoc.onSnapshot(s => docs.push({ exists: s.exists, fromCache: s.metadata.fromCache, data: s.exists ? s.data() : null }));
    await db.refresh(); await tick(5);
    expect(c.last()).toEqual({ fromCache: false, ids: [9, 10] });
    expect(docs[docs.length - 1]).toEqual({ exists: true, fromCache: false, data: { packs: [{ id: 'p1', name: 'Signature' }], rev: 5 } });
  });

  it('keeps edits made elsewhere when two saves collide', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    const { col, db } = setup({ gh });
    await db.refresh();
    /* someone (Claude, another phone) edits the same month file right before this save lands */
    gh.st.beforePut = () => gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z', { note: 'edited elsewhere' }), 2: brew('2', '2026-10-02T08:00:00Z') });
    await col.doc('3').set(brew('3', '2026-10-03T08:00:00Z'));
    const f = gh.read('brews/2026-10.json');
    expect(Object.keys(f)).toEqual(['1', '2', '3']);
    expect(f['1'].note).toBe('edited elsewhere');
  });

  it('on a packs conflict takes the newer remote copy instead of overwriting it', async () => {
    const gh = fakeGithub();
    gh.put('coffee.json', { packs: [], rev: 1 });
    const { pdoc, db } = setup({ gh });
    const docs = [];
    pdoc.onSnapshot(s => docs.push(s.exists ? s.data() : null));
    await db.refresh();
    gh.st.beforePut = () => gh.put('coffee.json', { packs: [{ id: 'x' }], rev: 99 });
    await pdoc.set({ packs: [{ id: 'mine' }], rev: 50 });
    expect(gh.read('coffee.json').rev).toBe(99);
    expect(docs[docs.length - 1].rev).toBe(99);
  });

  it('moves a brew if its date changes month and deletes cleanly', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z'), 2: brew('2', '2026-10-05T08:00:00Z') });
    const { col, db } = setup({ gh });
    await db.refresh();
    await col.doc('1').set(brew('1', '2026-09-29T08:00:00Z'));
    expect(Object.keys(gh.read('brews/2026-10.json'))).toEqual(['2']);
    expect(Object.keys(gh.read('brews/2026-09.json'))).toEqual(['1']);
    await col.doc('2').delete();
    expect(gh.read('brews/2026-10.json')).toEqual({});
    await col.doc('nope').delete(); /* unknown ids are a no-op */
  });

  it('reports offline, keeps the subscription, and recovers', async () => {
    const { gh, col, db } = setup();
    const c = collect(col);
    gh.st.offline = true;
    await expect(db.refresh()).rejects.toMatchObject({ code: 'unavailable' });
    expect(c.errors[0].code).toBe('unavailable');
    expect(c.snaps.some(s => !s.fromCache)).toBe(false);
    gh.st.offline = false;
    gh.put('brews/2026-10.json', { 7: brew('7', '2026-10-07T08:00:00Z') });
    await db.refresh();
    expect(c.last()).toEqual({ fromCache: false, ids: [7] });
  });

  it('rejects a save while offline so the brew stays pending', async () => {
    const { gh, col, db } = setup();
    await db.refresh();
    gh.st.offline = true;
    await expect(col.doc('1').set(brew('1', '2026-10-01T08:00:00Z'))).rejects.toMatchObject({ code: 'unavailable' });
    gh.st.offline = false;
    await col.doc('1').set(brew('1', '2026-10-01T08:00:00Z'));
    expect(Object.keys(gh.read('brews/2026-10.json'))).toEqual(['1']);
  });

  it('flags a bad token as revoked', async () => {
    const { col, db } = setup({ cfg: { ...cfg, token: 'bad' } });
    const c = collect(col);
    await expect(db.refresh()).rejects.toMatchObject({ code: 'revoked' });
    expect(c.errors[0].code).toBe('revoked');
  });

  it('never treats an unreadable file as "no brews"', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    gh.putRaw('brews/2026-09.json', '{ not json');
    const { col, db } = setup({ gh });
    const c = collect(col);
    await expect(db.refresh()).rejects.toMatchObject({ code: 'unavailable' });
    expect(c.snaps.some(s => !s.fromCache)).toBe(false);
  });

  it('uses conditional requests so an unchanged repository costs no file downloads', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    gh.put('coffee.json', { rev: 1 });
    const { db } = setup({ gh });
    await db.refresh();
    const before = gh.log.length;
    await db.refresh();
    const extra = gh.log.slice(before);
    expect(extra).toEqual(['GET /contents/', 'GET /contents/brews']);
  });

  it('serves the last synced copy instantly on the next start', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    const storage = memoryStorage();
    const a = setup({ gh, storage });
    await a.db.refresh();
    gh.st.offline = true;
    const b = setup({ gh, storage });
    const c = collect(b.col);
    await tick(5);
    expect(c.snaps[0]).toEqual({ fromCache: true, ids: [1] });
  });

  it('a refresh racing a save never drops the saved brew', async () => {
    const { gh, col, db } = setup();
    await db.refresh();
    const c = collect(col);
    let savedAt = -1;
    const save = col.doc('5').set(brew('5', '2026-10-05T08:00:00Z')).then(() => { savedAt = c.snaps.length; });
    await tick(1);
    const r = db.refresh();
    await Promise.all([save, r]);
    await db.refresh();
    const after = c.snaps.slice(savedAt).filter(s => !s.fromCache);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every(s => s.ids.includes(5))).toBe(true);
    expect(Object.keys(gh.read('brews/2026-10.json'))).toEqual(['5']);
  });

  it('a late subscriber after the first sync never gets a stale cached copy', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    const storage = memoryStorage();
    const { db, col } = setup({ gh, storage });
    await db.refresh();
    gh.put('brews/2026-10.json', {});           /* deleted elsewhere */
    await db.refresh();
    const c = collect(col);                     /* e.g. the app re-subscribing after being offline */
    await tick(5); await db.refresh();
    expect(c.snaps.every(s => !s.ids.includes(1))).toBe(true);
  });

  it('checks a connection before saving it', async () => {
    const gh = fakeGithub();
    expect(await testConnection(cfg, gh.fetch)).toEqual({ ok: true });
    expect((await testConnection({ ...cfg, token: 'nope' }, gh.fetch)).ok).toBe(false);
    expect((await testConnection({ ...cfg, repo: 'other' }, gh.fetch)).message).toMatch(/cannot see me\/other/);
    const pub = fakeGithub({ isPrivate: false });
    expect((await testConnection(cfg, pub.fetch)).warn).toMatch(/public/);
  });

  it('a read that lags behind a save never rolls the month back or drops the new brew', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    const { col, db } = setup({ gh });
    const c = collect(col);
    await db.refresh();
    const before = gh.files.get('brews/2026-10.json');
    await col.doc('2').set(brew('2', '2026-10-02T08:00:00Z'));
    await col.doc('3').set(brew('3', '2026-11-02T08:00:00Z'));    /* a brand-new month file */
    const after = gh.files.get('brews/2026-10.json'), nov = gh.files.get('brews/2026-11.json');
    gh.files.set('brews/2026-10.json', before);                    /* GitHub briefly serving the old version */
    gh.files.delete('brews/2026-11.json');                         /* and a listing that does not show the new file yet */
    await db.refresh();
    expect(c.last().ids).toEqual([1, 2, 3]);
    gh.files.set('brews/2026-10.json', after); gh.files.set('brews/2026-11.json', nov);
    await db.refresh();
    expect(c.last().ids).toEqual([1, 2, 3]);
  });

  it('still picks up a real change made elsewhere right after saving', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    const { col, db } = setup({ gh });
    let last = null;
    col.onSnapshot(s => { last = s; });
    await db.refresh();
    await col.doc('2').set(brew('2', '2026-10-02T08:00:00Z'));
    const cur = gh.read('brews/2026-10.json');
    cur[1] = Object.assign({}, cur[1], { rev: 99, log: { note: 'fixed by Claude' } });
    gh.put('brews/2026-10.json', cur);
    await db.refresh();
    expect(last.docs.map(d => d.id).sort()).toEqual(['1', '2']);
    expect(last.docs.find(d => d.id === '1').data().log.note).toBe('fixed by Claude');
  });

  it('saving something unchanged makes no commit', async () => {
    const gh = fakeGithub();
    gh.put('brews/2026-10.json', { 1: brew('1', '2026-10-01T08:00:00Z') });
    gh.put('coffee.json', { packs: [], rev: 1 });
    const { col, pdoc, db } = setup({ gh });
    collect(col);
    await db.refresh();
    await col.doc('1').set(brew('1', '2026-10-01T08:00:00Z'));
    await pdoc.set({ packs: [], rev: 1 });
    expect(gh.log.filter(l => l.startsWith('PUT'))).toEqual([]);
  });

  it('a packs save that collides only with another file saving at the same moment is still written', async () => {
    const gh = fakeGithub();
    gh.put('coffee.json', { packs: [], rev: 1 });
    const { pdoc, db } = setup({ gh });
    pdoc.onSnapshot(() => {});
    await db.refresh();
    gh.st.failNext = 409;                       /* the branch moved on, coffee.json itself did not change */
    await pdoc.set({ packs: [{ id: 'p2' }], rev: 2 });
    expect(gh.read('coffee.json')).toEqual({ packs: [{ id: 'p2' }], rev: 2 });
  });

  it('connecting marks the first look at the repository; disconnecting clears everything', () => {
    const s = memoryStorage();
    saveConfig({ owner: ' me ', repo: 'brew-data', token: ' t ' }, s);
    expect(readConfig(s)).toEqual({ owner: 'me', repo: 'brew-data', token: 't' });
    expect(s.getItem(JOIN_KEY)).toBe('me/brew-data');
    clearConfig(s);
    expect(readConfig(s)).toBe(null);
    expect(s.getItem(JOIN_KEY)).toBe(null);
  });
});
