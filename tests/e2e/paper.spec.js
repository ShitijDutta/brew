import { test, expect } from '@playwright/test';

const row = (page, label) => page.locator('#numbers .row', { hasText: label }).locator('.v');
const grams = async loc => Number((await loc.innerText()).replace(/[^\d.]/g, ''));

test('paper filter: numbers, steps, the log tag and the score comparison', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await expect(page.locator('#f-mesh')).toHaveAttribute('aria-pressed', 'true');
  const boilMesh = await grams(row(page, 'Boil').first());
  await expect(page.locator('#numbers')).toContainText('Left in jug');

  await page.click('#f-paper');
  await expect(page.locator('#f-paper')).toHaveAttribute('aria-pressed', 'true');
  await expect(row(page, 'Paper rinse')).toHaveText('100 g plain RO');
  await expect(page.locator('#numbers')).toContainText('Left in decanter and paper');
  await expect(page.locator('#numbers')).not.toContainText('Jug total');
  await expect(page.locator('#numbers')).not.toContainText('Left in jug');
  const boilPaper = await grams(row(page, 'Boil').first());
  expect(Math.abs(boilPaper - boilMesh)).toBeLessThanOrEqual(15);   /* the rinse is separate plain RO, not part of the boil */
  await expect(page.locator('#blurb')).toContainText('Paper filter');

  /* remembered per recipe */
  await page.click('#rpick [data-r="hoff"]');
  await expect(page.locator('#f-mesh')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#rpick [data-r="black"]');
  await expect(page.locator('#f-paper')).toHaveAttribute('aria-pressed', 'true');

  /* the steps */
  await page.click('#start');
  const titles = [];
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) {
    titles.push(await page.innerText('#stage'));
    if (titles[titles.length - 1] === 'Steep') await expect(page.locator('#detail')).toContainText('100 g of plain RO');
    if (titles[titles.length - 1] === 'Settle') await expect(page.locator('#detail')).toContainText('Meanwhile, the paper');
    await page.click('#next');
  }
  expect(titles).toEqual(['Dose the carafe', 'Weigh the water', 'Boil and pour', 'Steep', 'Break the crust', 'Settle', 'Plunge',
    'Decant', 'Pour through the paper', 'Let it drain']);

  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  await expect(page.locator('.entry').first()).toContainText('paper');
  await expect(page.locator('#log-stats')).toContainText('Through paper 4.0 over 1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1'))[0]);
  expect(saved.params.paper).toBe(true);
  expect(saved.steps.map(s => s.k)).toEqual(expect.arrayContaining(['decant', 'filter', 'drain']));
});

test('mesh-only brews keep the decanter settle', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await page.click('#start');
  const titles = [];
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) { titles.push(await page.innerText('#stage')); await page.click('#next'); }
  expect(titles).toContain('Settle in the decanter');
  expect(titles).not.toContain('Let it drain');
});

test('paper straight from the press: its own steps, for Black and Iced', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await expect(page.locator('#pwseg')).toBeHidden();
  await page.click('#f-paper');
  await expect(page.locator('#pw-jug')).toHaveAttribute('aria-pressed', 'true');
  await page.click('#pw-press');
  await expect(page.locator('#blurb')).toContainText('from the press');
  await page.click('#start');
  const titles = [];
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) { titles.push(await page.innerText('#stage')); await page.click('#next'); }
  expect(titles.slice(-4)).toEqual(['Plunge', 'Pour through the paper', 'Let it drain', 'Swirl and pour']);
  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1'))[0]);
  expect(saved.params).toMatchObject({ paper: true, pfrom: 'press' });

  await page.click('#log-back');
  await page.click('#rpick [data-r="iced"]');
  await page.click('#f-paper');
  await page.click('#start');
  const iced = [];
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) { iced.push(await page.innerText('#stage')); await page.click('#next'); }
  expect(iced).toEqual(expect.arrayContaining(['Decant', 'Pour through the paper', 'Let it drain', 'Stir until cold']));
  expect(iced.indexOf('Let it drain')).toBeLessThan(iced.indexOf('Stir until cold'));
});
