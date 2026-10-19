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
  await expect(page.locator('#numbers')).toContainText('Pour through the paper');
  await expect(page.locator('#numbers')).toContainText('Kept by the paper');
  await expect(page.locator('#numbers')).not.toContainText('Left in jug');
  const boilPaper = await grams(row(page, 'Boil').first());
  expect(boilPaper).toBeLessThanOrEqual(boilMesh);   /* the rinse is separate plain RO, and there is no jug leftover to brew for */
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
    'Pour through the paper', 'Let it drain', 'Swirl and pour']);

  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  await expect(page.locator('.entry').first()).toContainText('paper');
  await expect(page.locator('#log-stats')).toContainText('Through paper 4.0 over 1');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1'))[0]);
  expect(saved.params.paper).toBe(true);
  expect(saved.steps.map(s => s.k)).toContain('drain');
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
