import { test, expect } from '@playwright/test';
import { noOverflow } from './helpers.js';

/* Pour-over on the V60: two recipes under Something new, one counting-up timer through the pours,
   with the mark to pour to shown large and a chime-able schedule under it. */
const log = page => page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1') || '[]'));
async function pick(page, name) {
  if (!(await page.isVisible('#xpick'))) await page.click('#newdrinks summary');
  await page.locator('#xpick').getByRole('button', { name, exact: true }).click();
}
const num = (page, k) => page.locator('#numbers .row', { has: page.locator('.k', { hasText: k }) }).locator('.v');

test('the V60 recipes sit in their own group with water-to-pour numbers and no filter switch', async ({ page }) => {
  await page.goto('./');
  await page.click('#newdrinks summary');
  await expect(page.locator('#xpick .xgrp').nth(2)).toHaveText('Pour-over (V60)');
  await pick(page, 'V60 4:6');
  await expect(page.locator('#xnow')).toHaveText('Trying: V60 4:6');
  await expect(page.locator('#tgt-lab')).toHaveText('Water to pour');
  await expect(page.locator('#tgt')).toHaveValue('300');
  await expect(num(page, 'Coffee')).toHaveText('20 g');
  await expect(num(page, 'Water to pour')).toHaveText('300 g');
  await expect(num(page, 'Pours')).toHaveText('5 × 60 g, every 45 s');
  await expect(num(page, 'Lift the dripper off at')).toHaveText('3:30');
  await expect(num(page, 'In the cup')).toHaveText('about 260 g');
  await expect(num(page, 'Boil')).toHaveText('350 g');
  await expect(num(page, 'Paper rinse')).toHaveText('100 g plain RO');
  await expect(page.locator('#fltseg')).toBeHidden();
  await expect(page.locator('#pwseg')).toBeHidden();
  await pick(page, 'V60 double bloom');
  await expect(num(page, 'Coffee')).toHaveText('15 g');
  await expect(num(page, 'Pours')).toHaveText('45 g, 45 g, then to 225 g');
  await expect(num(page, 'Lift the dripper off at')).toHaveText('2:15');
  await expect(num(page, 'In the cup')).toHaveText('about 195 g');
  expect(await noOverflow(page)).toBe(true);
  /* the daily recipes are untouched */
  await page.click('#rpick [data-r="black"]');
  await expect(page.locator('#fltseg')).toBeVisible();
});

test('the pour timer counts up and moves through the marks, then says to lift the dripper off', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 60 })));
  await page.goto('./');
  await pick(page, 'V60 double bloom');
  await page.click('#dry');
  await expect(page.locator('#stage')).toHaveText('Weigh the water');
  await expect(page.locator('#wait')).toContainText('100 g plain RO for the paper rinse');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Rinse and dose');
  await expect(page.locator('#detail')).toContainText('15 g');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Pour');
  const pours = page.locator('#pours');
  await expect(pours.locator('.pnow')).toHaveText('Pour to 45 g');
  await expect(pours.locator('.plist li')).toHaveCount(4);
  expect(await noOverflow(page)).toBe(true);
  /* at 60x the 30 s bloom passes in half a second */
  await expect(pours.locator('.pnow')).toHaveText('Pour to 90 g', { timeout: 3000 });
  await expect(pours.locator('.plist li').first()).toHaveClass(/done/);
  await expect(pours.locator('.pnow')).toHaveText('Pour to 225 g', { timeout: 3000 });
  await expect(pours.locator('.pt')).toContainText('fast, from higher up');
  /* the clock counts up, past the end */
  const t1 = await page.innerText('#clock');
  await expect(pours.locator('.pnow')).toHaveText('Lift the dripper off', { timeout: 4000 });
  await expect(pours.locator('.plist li').last()).toHaveClass(/cur/);
  const t2 = await page.innerText('#clock');
  const sec = s => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);
  expect(sec(t2)).toBeGreaterThan(sec(t1));
  expect(sec(t2)).toBeGreaterThanOrEqual(135);
  await expect(page.locator('#clock')).toHaveClass(/over/);
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Swirl and serve');
  await expect(page.locator('#pours')).toBeHidden();
  await expect(page.locator('#detail')).toContainText('195 g');
});

test('a real V60 brew reaches the log at the pour and is scored without a decant field', async ({ page }) => {
  await page.goto('./');
  await pick(page, 'V60 4:6');
  await page.click('#start');
  await page.click('#next');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Pour');
  expect(await log(page)).toEqual([]);
  await page.waitForTimeout(1200);
  await page.click('#next');                       /* drained: the drawdown time is saved */
  let l = await log(page);
  expect(l).toHaveLength(1);
  expect(l[0].recipe).toBe('v_46');
  expect(l[0].unfinished).toBe(true);
  await page.click('#next');
  await expect(page.locator('#sc-review')).toBeVisible();
  await expect(page.locator('#rv-decg')).toBeHidden();
  await expect(page.locator('#rv-fin')).toBeVisible();
  await expect(page.locator('#rv-fin')).toHaveAttribute('placeholder', '260 planned');
  await expect(page.locator('#rv-wt-wrap')).toBeVisible();
  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  l = await log(page);
  expect(l).toHaveLength(1);
  const e = l[0];
  expect(e.unfinished).toBeUndefined();
  expect(e.steps.map(s => s.k)).toEqual(['dose', 'prep', 'pour', 'off']);
  expect(e.contact).toBe(e.steps[2].actual);
  expect(e.contact).toBeGreaterThanOrEqual(1);
  expect(e.params.paper).toBe(true);
  expect(e.params.pfrom).toBeUndefined();
  expect(e.calc).toMatchObject({ dose: 20, press: 300, pour: 260, decant: 0 });
  expect(e.log.decant).toBeNull();
  await expect(page.locator('.entry').first()).toContainText('V60 4:6');
});
