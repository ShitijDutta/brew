import { test, expect } from '@playwright/test';
import { noOverflow } from './helpers.js';

/* The coffee in use is a dropdown at the top of the recipe screen (open packs, last used first), and a brew logged
   against the wrong pack can be moved to the right one when scoring or later from the log. */
const log = page => page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1') || '[]'));
/* the packs are built in the page, so their dates are the browser's own days (the app counts ages in local time) */
const packs = () => { const day = n => { const d = new Date(Date.now() - n * 86400000), z = v => String(v).padStart(2, '0'); return d.getFullYear() + '-' + z(d.getMonth() + 1) + '-' + z(d.getDate()); }; return {
  rev: 1,
  active: 'pA',
  packs: [
    { id: 'pA', status: 'open', created: day(12) + 'T09:00:00.000Z', since: day(12) + 'T09:00:00.000Z', name: 'Paderu SV09', roaster: 'Subko',
      pre: true, roasted: day(40), ground: day(10), bought: day(10), grind: 'French Press', size: 250, base: 250 },
    { id: 'pB', status: 'open', created: day(5) + 'T09:00:00.000Z', since: day(5) + 'T09:00:00.000Z', name: 'Project Pearl Omni', roaster: 'Subko',
      pre: true, roasted: day(39), ground: day(10), bought: day(10), grind: 'French Press', size: 250, base: 250 }
  ]
}; };
function seed(packs) { if (!sessionStorage.getItem('seeded')) { localStorage.setItem('fp.packs.v1', JSON.stringify(packs())); sessionStorage.setItem('seeded', '1'); } }
async function pick(page, name) {
  if (!(await page.isVisible('#xpick'))) await page.click('#newdrinks summary');
  await page.locator('#xpick').getByRole('button', { name, exact: true }).click();
}

test('the coffee dropdown lists open packs, last used first, and switching it changes the pack in use', async ({ page }) => {
  await page.addInitScript('(' + seed + ')(' + packs + ')');
  await page.goto('./');
  const sel = page.locator('#pack-sel');
  await expect(sel.locator('option')).toHaveText(['Project Pearl Omni · 10 d ground · 250 g left', 'Paderu SV09 · 10 d ground · 250 g left', 'Add a pack']);
  await expect(sel).toHaveValue('pA');
  await expect(page.locator('#pack-line')).toContainText('Subko · pre-ground');
  await expect(page.locator('#pack-sum')).toHaveText('Manage packs');
  expect(await noOverflow(page)).toBe(true);
  await sel.selectOption('pB');
  await expect(sel).toHaveValue('pB');
  expect(JSON.parse(await page.evaluate(() => localStorage.getItem('fp.packs.v1'))).active).toBe('pB');
  await page.reload();
  await expect(page.locator('#pack-sel')).toHaveValue('pB');
  /* Add a pack opens the pack form */
  await page.locator('#pack-sel').selectOption('__new');
  await expect(page.locator('#pack-form')).toBeVisible();
});

test('a brew made with the wrong pack is moved when scoring, and again from the log', async ({ page }) => {
  await page.addInitScript('(' + seed + ')(' + packs + ')');
  await page.goto('./');
  await pick(page, 'V60 4:6');
  await page.click('#start');
  await expect(page.locator('#brewbean')).toHaveText('Coffee: Paderu SV09');
  for (let i = 0; i < 16 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
  await expect(page.locator('#sc-review')).toBeVisible();
  const rv = page.locator('#rv-bean');
  await expect(rv).toHaveValue('pA');
  await rv.selectOption('pB');
  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  let e = (await log(page))[0];
  expect(e.bean.packId).toBe('pB');
  expect(e.bean.name).toBe('Project Pearl Omni');
  expect(e.bean.roastAge).toBe(39);
  expect(e.bean.groundAge).toBe(10);
  /* the grams went with it */
  await page.click('#log-back').catch(() => {});
  await page.goto('./');
  await expect(page.locator('#pack-sel option[value="pB"]')).toHaveText('Project Pearl Omni · 10 d ground · 230 g left');
  await expect(page.locator('#pack-sel option[value="pA"]')).toHaveText('Paderu SV09 · 10 d ground · 250 g left');
  /* and back again from the log */
  await page.click('#open-log');
  await page.locator('.entry').first().click();
  await page.click('[data-edit]');
  await expect(page.locator('#ed-bean')).toHaveValue('pB');
  await page.locator('#ed-bean').selectOption('pA');
  await page.click('[data-elk="5"]');
  await expect(page.locator('#ed-lval')).toHaveText('5 / 5');
  await page.click('[data-esave]');
  e = (await log(page))[0];
  expect(e.bean.packId).toBe('pA');
  expect(e.bean.name).toBe('Paderu SV09');
  expect(e.log.like).toBe(5);
  expect(await noOverflow(page)).toBe(true);
});
