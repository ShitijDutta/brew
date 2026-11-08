import { test, expect } from '@playwright/test';
import { withGithub, connect, noOverflow } from './helpers.js';

/* A brew reaches the log once the coffee is in the water (the pour step is done), marked unfinished.
   Later steps update the same entry; finishing completes it, and stopping or leaving it keeps it, unfinished. */
const log = page => page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1') || '[]'));
const run = page => page.evaluate(() => JSON.parse(localStorage.getItem('fp.run.v1') || 'null'));
async function toStage(page, title) {
  for (let i = 0; i < 12 && (await page.innerText('#stage')) !== title; i++) await page.click('#next');
  await expect(page.locator('#stage')).toHaveText(title);
}
async function startBlack(page) {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await page.click('#start');
}

test('nothing is saved before the pour; stopping there leaves the log empty', async ({ page }) => {
  await startBlack(page);
  await toStage(page, 'Boil and pour');
  expect(await log(page)).toEqual([]);
  await page.click('#abandon');
  await expect(page.locator('#abandon')).toHaveText('Tap again to stop');
  await page.click('#abandon');
  await expect(page.locator('#sc-recipe')).toBeVisible();
  expect(await log(page)).toEqual([]);
  await expect(page.locator('#banners')).not.toContainText('waiting for a score');
});

test('after the pour the brew is in the log, the same entry is updated step by step, and finishing completes it', async ({ page }) => {
  await startBlack(page);
  await toStage(page, 'Steep');
  let l = await log(page);
  expect(l).toHaveLength(1);
  const id = l[0].id;
  expect(l[0].unfinished).toBe(true);
  expect(l[0].pending).toBe(true);
  expect(l[0].steps.map(s => s.k)).toEqual(['prep', 'dose', 'pour']);
  expect(l[0].rev).toBe(id);
  expect(l[0].calc.dose).toBeGreaterThan(0);
  expect((await run(page)).runId).toBe(id);
  await page.click('#next');
  l = await log(page);
  expect(l).toHaveLength(1);
  expect(l[0].steps.map(s => s.k)).toEqual(['prep', 'dose', 'pour', 'steep']);
  expect(l[0].planned).toBeGreaterThan(4);
  const planned = l[0].planned;
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
  await expect(page.locator('#sc-review')).toBeVisible();
  l = await log(page);
  expect(l).toHaveLength(1);
  expect(l[0].id).toBe(id);
  expect(l[0].unfinished).toBeUndefined();
  expect(l[0].planned).toBeUndefined();
  expect(l[0].steps).toHaveLength(planned);
  expect(l[0].rev).toBeGreaterThan(id);
  await expect(page.locator('#rv-summary')).not.toContainText('Not finished');
  expect(await run(page)).toBe(null);
});

test('stopping after the pour keeps it in the log, unfinished, to score later', async ({ page }) => {
  await startBlack(page);
  await toStage(page, 'Break the crust');
  await page.click('#abandon');
  await expect(page.locator('#abandon')).toHaveText('Tap again to stop (kept in your log)');
  expect(await noOverflow(page)).toBe(true);
  await page.click('#abandon');
  await expect(page.locator('#sc-recipe')).toBeVisible();
  const l = await log(page);
  expect(l).toHaveLength(1);
  expect(l[0].unfinished).toBe(true);
  expect(l[0].steps.map(s => s.k)).toEqual(['prep', 'dose', 'pour', 'steep']);
  await expect(page.locator('#banners')).toContainText('waiting for a score');
  await page.click('#open-log');
  const entry = page.locator('.entry').first();
  await expect(entry.locator('.sc')).toHaveText('Unfinished · Not scored');
  await entry.click();
  await expect(page.locator('#dt-' + l[0].id)).toContainText('Unfinished: 4 of ' + l[0].planned + ' steps done');
  await page.click('[data-score="' + l[0].id + '"]');
  await expect(page.locator('#rv-summary')).toContainText('Not finished: 4 of ' + l[0].planned + ' steps done.');
  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  await expect(page.locator('.entry').first().locator('.sc')).toHaveText('Unfinished · 4/5');
  const after = await log(page);
  expect(after[0].log.score).toBe(4);
  expect(after[0].pending).toBeUndefined();
  expect(after[0].unfinished).toBe(true);
});

test('left half-done: the resume banner offers End it, which keeps it in the log; Resume carries on with the same entry', async ({ page }) => {
  await startBlack(page);
  await toStage(page, 'Steep');
  const id = (await log(page))[0].id;
  await page.reload();
  const banners = page.locator('#banners');
  await expect(banners).toContainText('already in your log');
  await expect(banners.locator('[data-run="end"]')).toBeVisible();
  await expect(banners.locator('[data-run="drop"]')).toHaveCount(0);
  await expect(banners).not.toContainText('waiting for a score');   /* still being brewed */
  expect(await noOverflow(page)).toBe(true);
  await page.click('#open-log');
  await expect(page.locator('.entry').first().locator('.sc')).toHaveText('In progress');
  await page.click('#log-back');
  /* resume and finish: still one entry, now complete */
  await page.click('[data-run="resume"]');
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
  let l = await log(page);
  expect(l).toHaveLength(1);
  expect(l[0].id).toBe(id);
  expect(l[0].unfinished).toBeUndefined();
  /* a second brew, left at the steep, then ended from the banner */
  await page.click('#later');
  await page.click('#start');
  await toStage(page, 'Steep');
  await page.click('#next');
  await page.reload();
  await page.click('[data-run="end"]');
  await page.click('[data-run="end"]');
  await expect(banners).not.toContainText('was interrupted');
  await expect(banners).toContainText('waiting for a score');
  l = await log(page);
  expect(l).toHaveLength(2);
  expect(l[0].unfinished).toBe(true);
  expect(l[0].steps.map(s => s.k)).toEqual(['prep', 'dose', 'pour', 'steep']);
  expect(await run(page)).toBe(null);
});

test('a half-done brew too old to resume, or replaced by a new one, stays in the log unfinished', async ({ page }) => {
  await startBlack(page);
  await toStage(page, 'Steep');
  /* 13 hours later (aged as the page loads: leaving the page saves the run once more) */
  await page.addInitScript(() => {
    if (!sessionStorage.getItem('age')) return;
    sessionStorage.removeItem('age');
    const r = JSON.parse(localStorage.getItem('fp.run.v1'));
    if (r) { r.savedAt -= 13 * 3600000; localStorage.setItem('fp.run.v1', JSON.stringify(r)); }
  });
  await page.evaluate(() => sessionStorage.setItem('age', '1'));
  await page.reload();
  await expect(page.locator('#banners')).not.toContainText('was interrupted');
  await expect(page.locator('#banners')).toContainText('waiting for a score');
  let l = await log(page);
  expect(l).toHaveLength(1);
  expect(l[0].unfinished).toBe(true);
  expect(l[0].steps).toHaveLength(3);
  /* another, left at the steep, then a new brew started without resuming it */
  await page.click('#start');
  await toStage(page, 'Steep');
  await page.reload();
  await expect(page.locator('[data-run="end"]')).toBeVisible();
  await page.click('#start');
  await toStage(page, 'Steep');
  l = await log(page);
  expect(l).toHaveLength(3);
  expect(l.filter(e => e.unfinished)).toHaveLength(3);
  expect(l[1].planned).toBeGreaterThan(3);
  expect((await run(page)).runId).toBe(l[0].id);
});

test('a dry run never reaches the log', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await page.click('#dry');
  await toStage(page, 'Settle');
  expect(await log(page)).toEqual([]);
  await page.click('#abandon');
  await expect(page.locator('#sc-recipe')).toBeVisible();
  expect(await log(page)).toEqual([]);
});

test('every recipe reaches the log at the pour', async ({ page }) => {
  await page.goto('./');
  const setups = [['black', []], ['hoff', []], ['iced', []], ['aulait', []], ['viet', ['#v-hot']], ['cold', []]];
  for (const [r, clicks] of setups) {
    await page.evaluate(() => localStorage.removeItem('fp.log.v1'));
    await page.reload();
    await page.click(`#rpick [data-r="${r}"]`);
    for (const c of clicks) await page.click(c);
    await page.click('#start');
    let before = '';
    for (let i = 0; i < 6 && !(await log(page)).length; i++) { before = await page.innerText('#stage'); await page.click('#next'); }
    const l = await log(page);
    expect(l, r).toHaveLength(1);
    expect(l[0].recipe).toBe(r);
    expect(before, r).toMatch(/pour/i);
    await page.click('#abandon');
    await page.click('#abandon');
  }
  /* and the occasional drinks, hot base and cold base */
  for (const [name, key] of [['Latte', 'x_latte'], ['Cold brew tonic', 'x_tonic']]) {
    await page.evaluate(() => localStorage.removeItem('fp.log.v1'));
    await page.reload();
    if (!(await page.isVisible('#xpick'))) await page.click('#newdrinks summary');
    await page.locator('#xpick').getByRole('button', { name, exact: true }).click();
    await page.click('#start');
    let before = '';
    for (let i = 0; i < 6 && !(await log(page)).length; i++) { before = await page.innerText('#stage'); await page.click('#next'); }
    const l = await log(page);
    expect(l, name).toHaveLength(1);
    expect(l[0].recipe).toBe(key);
    expect(before, name).toMatch(/pour/i);
    await page.click('#abandon');
    await page.click('#abandon');
  }
});

test.describe('synced through GitHub', () => {
  test('it syncs once after the pour and once at the end, not at every step', async ({ page, context }) => {
    const gh = await withGithub(context);
    await page.goto('./');
    await connect(page);
    await page.click('#rpick [data-r="black"]');
    await page.click('#start');
    await toStage(page, 'Steep');
    const id = (await log(page))[0].id;
    const month = new Date().toISOString().slice(0, 7);
    const remote = () => (gh.read('brews/' + month + '.json') || {})[id];
    await expect.poll(() => remote() && remote().unfinished).toBe(true);
    const puts = () => gh.log.filter(x => x.startsWith('PUT') && x.includes('brews/')).length;
    const afterPour = puts();
    await toStage(page, 'Plunge');
    await page.waitForTimeout(1500);
    expect(puts()).toBe(afterPour);                  /* the steps in between stay on the phone */
    expect(remote().steps).toHaveLength(3);
    for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
    await expect.poll(() => remote() && remote().unfinished === undefined && remote().steps.length > 3).toBe(true);
    expect(remote().pending).toBe(true);
  });
});
