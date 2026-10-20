import { test, expect } from '@playwright/test';
import { noOverflow } from './helpers.js';

const numberRow = (page, label) => page.locator('#numbers .row', { hasText: label }).first().locator('.v');

/* every recipe and filter, as a dry run: each step is one short line, the tips are folded away */
test('steps are short, with the tips folded under More', async ({ page }) => {
  await page.goto('./');
  const setups = [
    ['black', []], ['black', ['#f-paper']], ['black', ['#pw-press']], ['black', ['#f-mesh', '#m-bypass']],
    ['hoff', []], ['hoff', ['#f-paper']], ['iced', []], ['iced', ['#f-paper', '#pw-press']],
    ['aulait', []], ['viet', ['#v-hot']], ['viet', ['#v-iced', '#f-paper']]
  ];
  for (const [r, clicks] of setups) {
    await page.click(`#rpick [data-r="${r}"]`);
    for (const c of clicks) await page.click(c);
    await page.click('#dry');
    for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) {
      const d = await page.innerText('#detail');
      expect(d.length, `${r} ${await page.innerText('#stage')}: ${d}`).toBeLessThanOrEqual(110);
      if (await page.isVisible('#more')) expect(await page.locator('#more').evaluate(e => e.open)).toBe(false);
      await page.click('#next');
    }
    await page.click('#skip');   /* a dry run is discarded with one tap */
    await expect(page.locator('#sc-recipe')).toBeVisible();
  }
});

test('iced: the ice comes out in the last minute of the steep, with a cue', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 60 })));
  await page.goto('./');
  await page.click('#rpick [data-r="iced"]');
  await page.click('#f-paper');
  await page.click('#pw-press');
  const ice = (await numberRow(page, 'Ice to brew onto').innerText()).trim();
  await page.click('#dry');
  const titles = [];
  while ((await page.innerText('#stage')) !== 'Steep') { titles.push(await page.innerText('#stage')); await page.click('#next'); }
  expect(titles).toEqual(['Dose the carafe', 'Weigh the water', 'Boil and pour']);
  const cue = page.locator('#wait li', { hasText: '1:00 left' });
  await expect(cue).toContainText(ice + ' RO + Vedica ice into the jug, dripper on top, on the scale, tared');
  await expect(cue).not.toHaveClass(/due/);
  await expect(cue).toHaveClass(/due/, { timeout: 8000 });   /* 4:00 at 60x is 4 s; due at 1:00 left */
  await page.click('#more summary');
  await expect(page.locator('#more-b')).toContainText('ice that melts early');
});

test('This brew panel: the run’s numbers and steps, without touching the timer', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  const coffee = (await numberRow(page, 'Coffee').innerText()).trim();
  await page.click('#start');
  await expect(page.locator('#runbar')).toContainText('This brew · Black');
  for (let i = 0; i < 3; i++) await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Steep');
  await page.click('#runbar');
  const panel = page.locator('#runpanel');
  await expect(panel).toBeVisible();
  await expect(panel.locator('.rp-nums')).toContainText('Coffee' + coffee);
  await expect(panel).toContainText('3 of');
  await expect(panel.locator('li.cur')).toContainText('Steep');
  await expect(panel.locator('li.cur')).toContainText('left');
  expect(await noOverflow(page)).toBe(true);
  /* the timer keeps going while it is open */
  const before = await page.innerText('#rp-left');
  await page.waitForTimeout(1500);
  expect(await page.innerText('#rp-left')).not.toBe(before);
  /* tapping outside only closes it */
  await page.mouse.click(200, 60);
  await expect(panel).toBeHidden();
  await expect(page.locator('#stage')).toHaveText('Steep');
  /* the done steps open up with their times */
  await page.click('#runbar');
  await page.click('.rp-done summary');
  await expect(panel.locator('.rp-done li')).toHaveCount(3);
  await page.click('#runbar');
  await expect(panel).toBeHidden();

  /* reopening the app mid-brew keeps the run */
  await page.reload();
  await page.click('[data-run="resume"]');
  await expect(page.locator('#stage')).toHaveText('Steep');
  await expect(panel).toBeHidden();
  await page.click('#runbar');
  await expect(panel.locator('.rp-nums')).toContainText('Coffee' + coffee);
});

test('ice: RO + Vedica or other ice, recorded with the brew', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await expect(page.locator('#iceseg')).toBeHidden();
  await page.click('#rpick [data-r="viet"]');
  await page.click('#v-hot');
  await expect(page.locator('#iceseg')).toBeHidden();
  await page.click('#v-iced');
  await expect(page.locator('#iceseg')).toBeVisible();

  await page.click('#rpick [data-r="iced"]');
  await expect(page.locator('#ice-blend')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#numbers')).toContainText('frozen from');
  await page.click('#ice-other');
  await expect(page.locator('#ice-other')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#numbers')).toContainText('Other ice');
  await page.click('#start');
  await expect(page.locator('#runbar')).toContainText('Iced');
  await page.click('#runbar');
  await expect(page.locator('#runpanel .rp-h')).toContainText('other ice');
  await page.click('#runbar');
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) {
    if ((await page.innerText('#stage')) === 'Steep') {
      const cue = await page.innerText('#wait');
      expect(cue).toContain('g ice into the jug');
      expect(cue).not.toContain('Vedica ice');
    }
    await page.click('#next');
  }
  await page.click('#rv-score [data-v="3"]');
  await page.click('#rv-save');
  await expect(page.locator('.entry').first()).toContainText('other ice');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1'))[0]);
  expect(saved.params.ice).toBe('other');

  /* remembered for Iced only */
  await page.click('#log-back');
  await page.click('#rpick [data-r="iced"]');
  await expect(page.locator('#ice-other')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#rpick [data-r="viet"]');
  await expect(page.locator('#ice-blend')).toHaveAttribute('aria-pressed', 'true');
});
