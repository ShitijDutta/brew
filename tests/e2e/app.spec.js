import { test, expect } from '@playwright/test';
import { withGithub, connect, noOverflow, fixture } from './helpers.js';

test.describe('on this phone only', () => {
  test('brew, score and log without any connection', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto('./');
    await expect(page.locator('h1').first()).toHaveText('French press');
    await page.click('#rpick [data-r="black"]');
    await expect(page.locator('#numbers')).not.toBeEmpty();
    await page.click('#dry');
    for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
    await page.fill('#rv-temp', '57');
    await page.click('#rv-score [data-v="4"]');
    await page.fill('#rv-note', 'Typed with the normal keyboard');
    await page.click('#rv-save');
    await expect(page.locator('#sc-log')).toBeVisible();
    await expect(page.locator('#log-sync')).toContainText('Dry runs stay on this device');
    expect(await noOverflow(page)).toBe(true);
    expect(errors).toEqual([]);
  });

  test('is installable: manifest, icons and an offline cache', async ({ page }) => {
    await page.goto('./');
    const manifest = await page.evaluate(async () => (await fetch(document.querySelector('link[rel=manifest]').href)).json());
    expect(manifest.display).toBe('standalone');
    expect(manifest.icons.map(i => i.sizes)).toEqual(expect.arrayContaining(['192x192', '512x512']));
    const swReady = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
    expect(swReady).toBe(true);
  });

  test('works offline once installed', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload();
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator('h1').first()).toHaveText('French press');
    await context.setOffline(false);
  });
});

test.describe('synced through GitHub', () => {
  test('connecting pulls every brew, pack and To try coffee, and rewrites nothing', async ({ page, context }) => {
    const gh = await withGithub(context);
    /* things only the repository knows: a coffee marked ordered and a tweaked Delhi setting */
    const doc = gh.read('coffee.json');
    doc.tries.find(t => t.id === 'sb-pearl-omni').st = 'ordered';
    doc.profiles.find(p => p.id === 'delhi').ceil = 480;
    gh.put('coffee.json', doc);
    await page.goto('./');                       /* a fresh phone: defaults and the seeded list exist locally first */
    await connect(page);
    await page.click('#open-log');
    await expect(page.locator('#log-sync')).toContainText('Synced to GitHub');
    await expect(page.locator('.entry')).toHaveCount(19);
    await page.click('#log-back');
    await expect(page.locator('#pack-sum')).toContainText('Hill Estate');
    await expect(page.locator('#banners')).toContainText('waiting for a score');
    await page.click('#open-try');
    await expect(page.locator('#try-sum')).toContainText('of ' + fixture().tries.length + ' tried');
    await expect(page.locator('#try-sum')).toContainText('1 ordered');
    await expect(page.locator('[data-tord="sb-pearl-omni"]')).toHaveAttribute('aria-pressed', 'true');
    const kept = JSON.parse(await page.evaluate(() => localStorage.getItem('fp.packs.v1')));
    expect(kept.profiles.find(p => p.id === 'delhi').ceil).toBe(480);
    await page.waitForTimeout(1500);
    expect(gh.log.filter(l => l.startsWith('PUT'))).toEqual([]); /* nothing rewritten just by connecting */
  });

  test('a new brew lands in the month file with its score', async ({ page, context }) => {
    const gh = await withGithub(context);
    await page.goto('./');
    await connect(page);
    await page.click('#rpick [data-r="black"]');
    await page.click('#start');
    for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
    await page.fill('#rv-temp', '58');
    await page.click('#rv-score [data-v="5"]');
    await page.fill('#rv-note', 'From the new app');
    await page.click('#rv-save');
    await expect(page.locator('#log-sync')).toContainText('Synced to GitHub');
    const month = new Date().toISOString().slice(0, 7);
    const file = gh.read('brews/' + month + '.json');
    const mine = Object.values(file).find(b => b.log && b.log.note === 'From the new app');
    expect(mine).toBeTruthy();
    expect(mine.log.score).toBe(5);
    expect(mine.bean.name).toBe('Hill Estate');
    expect(mine.pending).toBeUndefined();
  });

  test('editing and deleting a brew update GitHub', async ({ page, context }) => {
    const gh = await withGithub(context);
    await page.goto('./');
    await connect(page);
    await page.click('#open-log');
    await expect(page.locator('#log-sync')).toContainText('Synced');
    const first = page.locator('.entry').first();
    const id = await first.getAttribute('data-id');
    await first.click();
    await page.click('[data-edit]');
    await page.fill('#ed-nt', 'Edited on the phone');
    await page.click('[data-esave]');
    await expect(page.locator('#log-sync')).toContainText('Synced to GitHub');
    const findIn = () => { for (const [p] of gh.files) { const d = gh.read(p); if (p.startsWith('brews/') && d[id]) return d[id]; } return null; };
    await expect.poll(() => findIn() && findIn().log.note).toBe('Edited on the phone');
    await expect(page.locator('#dt-' + id)).toBeVisible();   /* the brew stays open after saving */
    await page.click('[data-del="' + id + '"]');
    await page.click('[data-del="' + id + '"]');
    await expect.poll(() => findIn()).toBe(null);
  });

  test('changes made in the repository (for example by Claude) show up after a sync', async ({ page, context }) => {
    const gh = await withGithub(context);
    await page.goto('./');
    await connect(page);
    await page.click('#open-log');
    await expect(page.locator('#log-sync')).toContainText('Synced');
    const oct = gh.read('brews/2026-10.json');
    const id = Object.keys(oct)[0];
    oct[id].log = Object.assign({}, oct[id].log, { note: 'Fixed by Claude', score: 3.5 });
    oct[id].rev = Date.now();
    gh.put('brews/2026-10.json', oct);
    await page.click('#log-back');
    await page.click('#open-settings');
    await page.click('#gh-sync');
    await expect(page.locator('#gh-state')).toContainText('Last synced');
    await page.click('#set-back');
    await page.click('#open-log');
    await page.locator('.entry[data-id="' + id + '"]').click();
    await expect(page.locator('#dt-' + id)).toContainText('Fixed by Claude');
  });

  test('a brew made offline syncs when the connection is back', async ({ page, context }) => {
    const gh = await withGithub(context);
    await page.goto('./');
    await connect(page);
    await page.click('#open-log');
    await expect(page.locator('#log-sync')).toContainText('Synced');
    await page.click('#log-back');
    gh.st.offline = true;
    await page.click('#rpick [data-r="black"]');
    await page.click('#start');
    for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
    await page.click('#rv-score [data-v="4"]');
    await page.fill('#rv-note', 'Offline brew');
    await page.click('#rv-save');
    await expect(page.locator('#log-sync')).toContainText('Sync paused');
    gh.st.offline = false;
    await page.click('#log-back');
    await page.click('#open-settings');
    await page.click('#gh-sync');
    const month = new Date().toISOString().slice(0, 7);
    await expect.poll(() => Object.values(gh.read('brews/' + month + '.json') || {}).some(b => b.log && b.log.note === 'Offline brew')).toBe(true);
  });

  test('a wrong token is caught before it is saved', async ({ page, context }) => {
    await withGithub(context);
    await page.goto('./');
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.fill('#gh-owner', 'shitij');
    await page.fill('#gh-repo', 'brew-data');
    await page.fill('#gh-token', 'wrong');
    await page.click('#gh-connect');
    await expect(page.locator('#gh-err')).toContainText('rejected the token');
    await page.fill('#gh-token', 'good');
    await page.fill('#gh-repo', 'typo');
    await page.click('#gh-connect');
    await expect(page.locator('#gh-err')).toContainText('cannot see shitij/typo');
  });

  test('ticking a To try coffee syncs the shared document', async ({ page, context }) => {
    const gh = await withGithub(context);
    await page.goto('./');
    await connect(page);
    await page.click('#open-log');
    await expect(page.locator('#log-sync')).toContainText('Synced');
    await page.click('#log-back');
    await page.click('#open-try');
    await page.click('[data-tord="sb-pearl-omni"]');
    await expect.poll(() => (gh.read('coffee.json').tries.find(t => t.id === 'sb-pearl-omni') || {}).st).toBe('ordered');
    expect(gh.read('coffee.json').packs.length).toBe(6);
  });

  test('screens fit the phone with no sideways scrolling', async ({ page, context }) => {
    await withGithub(context);
    await page.goto('./');
    await connect(page);
    for (const open of [null, '#open-log', '#open-try', '#open-settings']) {
      if (open) { await page.goto('./'); await page.click(open); }
      expect(await noOverflow(page)).toBe(true);
    }
  });
});
