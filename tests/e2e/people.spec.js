import { test, expect } from '@playwright/test';
import { withGithub, connect } from './helpers.js';

const month = () => new Date().toISOString().slice(0, 7);
const TWO = { people: [{ id: 'shitij', name: 'Shitij', dir: '' }, { id: 'ananya', name: 'Ananya', dir: 'people/ananya' }], rev: 1 };

async function connectAs(page, id) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.fill('#gh-owner', 'shitij');
  await page.fill('#gh-repo', 'brew-data');
  await page.fill('#gh-token', 'good');
  await page.click('#gh-connect');
  await expect(page.locator('#gh-who')).toBeVisible();
  await Promise.all([page.waitForEvent('load'), page.click('[data-gwho="' + id + '"]')]);
}
async function switchTo(page, id) {
  await page.click('#who-sw');
  await Promise.all([page.waitForEvent('load'), page.click('#who-pick [data-who="' + id + '"]')]);
  await expect(page.locator('#who-name')).toHaveText(id === 'ananya' ? 'Ananya' : 'Shitij');
}
async function brewToReview(page) {
  await page.click('#rpick [data-r="black"]');
  await page.click('#start');
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
  await expect(page.locator('#sc-review')).toBeVisible();
}
const puts = gh => gh.log.filter(l => l.startsWith('PUT'));
const brewsIn = (gh, dir) => {
  const out = {};
  for (const [p] of gh.files) if (p.startsWith(dir + 'brews/')) Object.assign(out, gh.read(p));
  return out;
};

test('adding a person gives them their own empty space, and their brews go to their folder', async ({ page, context }) => {
  const gh = await withGithub(context);
  gh.put('people.json', { people: [{ id: 'shitij', name: 'Shitij', dir: '' }], rev: 1 });
  await page.goto('./');
  await connect(page);
  await expect(page.locator('#who-row')).toBeHidden();      /* one person: nothing changes on screen */
  await page.click('#open-settings');
  await expect(page.locator('#ppl')).toBeVisible();
  await page.click('#ppl-add summary');
  await page.fill('#ppl-name', 'Ananya');
  await Promise.all([page.waitForEvent('load'), page.click('#ppl-save')]);
  expect(gh.read('people.json').people).toEqual(TWO.people);
  await expect(page.locator('#who-name')).toHaveText('Shitij');
  await switchTo(page, 'ananya');
  await expect(page.locator('#pack-sum')).toContainText('No pack in use');
  await expect(page.locator('#loc-pick')).toContainText('Home');
  await page.click('#open-try');
  await expect(page.locator('#try-sum')).toHaveText('Nothing on the list yet.');
  await page.click('#try-back');
  await expect.poll(() => gh.read('people/ananya/coffee.json') && gh.read('people/ananya/coffee.json').trySeed).toBe(1);
  expect(gh.read('people/ananya/coffee.json').profiles.map(p => p.name)).toEqual(['Home']);
  await brewToReview(page);
  await page.click('#rv-score [data-v="4"]');
  await page.fill('#rv-note', 'Her first brew');
  await page.click('#rv-save');
  await expect(page.locator('#log-sync')).toContainText('Synced to GitHub');
  const hers = Object.values(brewsIn(gh, 'people/ananya/'));
  expect(hers.map(b => b.log.note)).toEqual(['Her first brew']);
  expect(Object.values(brewsIn(gh, '')).some(b => b.log && b.log.note === 'Her first brew')).toBe(false);
  expect(puts(gh).every(l => /people/.test(l))).toBe(true); /* nothing of Shitij's was rewritten */
  await expect(page.locator('.entry')).toHaveCount(1);
});

test('a shared carafe: each person scores their own cup, and each sees the other’s', async ({ page, context }) => {
  const gh = await withGithub(context);
  gh.put('people.json', TWO);
  await page.goto('./');
  await connectAs(page, 'shitij');
  await expect(page.locator('#who-name')).toHaveText('Shitij');
  await brewToReview(page);
  await expect(page.locator('#rv-with-wrap')).toBeVisible();
  await page.click('#rv-with [data-wp="ananya"]');
  await expect(page.locator('#rv-share [data-sh="0.5"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#rv-score [data-v="4"]');
  await page.fill('#rv-note', 'His half');
  await page.click('#rv-save');
  await expect(page.locator('#log-sync')).toContainText('Synced to GitHub');
  const his = Object.values(brewsIn(gh, '')).find(b => b.log && b.log.note === 'His half');
  expect(his.with).toEqual(['ananya']);
  expect(his.log.share).toBe(0.5);

  await page.click('#log-back');
  await switchTo(page, 'ananya');
  await expect(page.locator('#banners')).toContainText('was shared with you');
  await page.click('[data-cup]');
  await expect(page.locator('#rv-title')).toHaveText('How was your cup');
  await expect(page.locator('#rv-summary')).toContainText('Brewed by Shitij');
  await expect(page.locator('#rv-wt-wrap')).toBeHidden();
  await expect(page.locator('#rv-steps')).toBeHidden();
  await expect(page.locator('#rv-share [data-sh="0.5"]')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#rv-score [data-v="5"]');
  await page.fill('#rv-note', 'Lovely');
  await page.click('#rv-save');
  await expect(page.locator('#log-sync')).toContainText('Synced to GitHub');
  const cup = Object.values(brewsIn(gh, 'people/ananya/')).find(b => b.ref);
  expect(cup.ref).toEqual({ who: 'shitij', id: String(his.id) });
  expect(cup.log).toMatchObject({ score: 5, note: 'Lovely', share: 0.5 });
  expect(cup.pending).toBeUndefined();
  await expect(page.locator('#banners')).not.toContainText('was shared with you');
  const entry = page.locator('.entry').first();
  await expect(entry).toContainText('Shitij’s brew');
  await entry.click();
  await expect(page.locator('#dt-' + cup.id)).toContainText('Brewed by Shitij, who scored it 4/5');

  await page.click('#log-back');
  await switchTo(page, 'shitij');
  await page.click('#open-log');
  await page.locator('.entry[data-id="' + his.id + '"]').click();
  await expect(page.locator('#dt-' + his.id)).toContainText('Ananya: 5/5');
  await expect(page.locator('#dt-' + his.id)).toContainText('Lovely');
  await page.click('#lv-all');
  await expect(page.locator('.entry')).toHaveCount(20);   /* 19 earlier brews + the shared one, listed once */
  await expect(page.locator('#log-stats')).toContainText('by everyone');
});

test('her own phone joins as her: earlier brews move to her folder and nothing of his changes', async ({ page, context }) => {
  const gh = await withGithub(context);
  gh.put('people.json', TWO);
  const rootBefore = gh.text('coffee.json');
  await page.goto('./');
  /* a brew made before connecting */
  await brewToReview(page);
  await page.click('#rv-score [data-v="3"]');
  await page.fill('#rv-note', 'Before connecting');
  await page.click('#rv-save');
  await page.click('#log-back');
  await connectAs(page, 'ananya');
  await expect(page.locator('#who-name')).toHaveText('Ananya');
  await expect.poll(() => Object.values(brewsIn(gh, 'people/ananya/')).map(b => b.log.note)).toEqual(['Before connecting']);
  await expect(page.locator('#pack-sum')).toContainText('No pack in use');
  await page.click('#open-log');
  await expect(page.locator('.entry')).toHaveCount(1);
  await page.click('#lv-all');
  await expect(page.locator('.entry')).toHaveCount(20);
  expect(gh.text('coffee.json')).toBe(rootBefore);
  expect(puts(gh).every(l => /people\/ananya/.test(l))).toBe(true);
});

test('saying you didn’t have any clears the shared brew without adding to your log', async ({ page, context }) => {
  const gh = await withGithub(context);
  gh.put('people.json', TWO);
  const oct = gh.read('brews/' + month() + '.json') || {};
  const id = Date.now() - 3600000;
  const base = Object.values(gh.read('brews/2026-10.json'))[0];
  oct[id] = Object.assign({}, base, { id, at: new Date(id).toISOString(), rev: id, with: ['ananya'], log: Object.assign({}, base.log, { note: 'Made for two' }) });
  gh.put('brews/' + month() + '.json', oct);
  await page.goto('./');
  await connectAs(page, 'ananya');
  await expect(page.locator('#banners')).toContainText('Shitij’s brew from');
  await page.click('[data-cupskip]');
  await page.click('[data-cupskip]');
  await expect(page.locator('#banners')).not.toContainText('was shared with you');
  await expect.poll(() => (Object.values(brewsIn(gh, 'people/ananya/')).find(b => b.ref) || {}).skipped).toBe(true);
  await page.click('#open-log');
  await expect(page.locator('.entry')).toHaveCount(0);
});
