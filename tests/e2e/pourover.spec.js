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
  await expect(num(page, 'Pours')).toHaveText('5 × 60 g, the last at 2:45');
  await expect(num(page, 'Lift the dripper off at')).toHaveText('3:30');
  await expect(num(page, 'In the cup')).toHaveText('about 260 g');
  await expect(num(page, 'Boil')).toHaveText('350 g');
  await expect(num(page, 'Paper rinse')).toHaveText('100 g plain RO');
  await expect(page.locator('#fltseg')).toBeHidden();
  await expect(page.locator('#pwseg')).toBeHidden();
  await pick(page, 'V60 double bloom');
  await expect(num(page, 'Coffee')).toHaveText('15 g');
  await expect(num(page, 'Pours')).toHaveText('45 g, 45 g, then to 225 g');
  await expect(num(page, 'Done by about')).toHaveText('2:15');
  await expect(num(page, 'In the cup')).toHaveText('about 195 g');
  expect(await noOverflow(page)).toBe(true);
  /* the daily recipes are untouched */
  await page.click('#rpick [data-r="black"]');
  await expect(page.locator('#fltseg')).toBeVisible();
});

test('each pour is a step: the first waits for Start, the clock counts up without ending, 4:6 says when to lift the dripper off', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 60 })));
  await page.goto('./');
  await pick(page, 'V60 4:6');
  await page.click('#dry');
  await expect(page.locator('#stage')).toHaveText('Weigh the water');
  await expect(page.locator('#detail')).toContainText('cool to about 93 °C');
  await expect(page.locator('#wait')).toContainText('100 g plain RO for the paper rinse');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Rinse and dose');
  await expect(page.locator('#detail')).toContainText('20 g');
  await page.click('#next');
  /* the bloom waits for Start */
  await expect(page.locator('#stage')).toHaveText('Pour 1 of 5: the bloom');
  const pours = page.locator('#pours'), clock = page.locator('#clock');
  await expect(page.locator('#pause')).toHaveText('Start');
  await expect(pours.locator('.pnow')).toHaveText('Pour to 60 g');
  await expect(pours.locator('.pt')).toContainText('smaller first pour makes it sweeter');
  await expect(pours.locator('.pnext')).toHaveText('Tap Start as the water hits the coffee.');
  await page.waitForTimeout(700);
  await expect(clock).toHaveText('0:00');
  await expect(page.locator('#brewclk')).toBeHidden();
  expect(await noOverflow(page)).toBe(true);
  await page.click('#pause');
  await expect(page.locator('#pause')).toHaveText('Pause');
  await expect(pours.locator('.pnext')).toContainText('Kasuya starts here');
  await expect(page.locator('#brewclk')).toContainText('on time with Kasuya');
  await expect(clock).not.toHaveText('0:00');
  /* later pours start on Next, with no note, and show the brew clock against the recipe */
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Pour 2 of 5');
  await expect(page.locator('#pause')).toHaveText('Pause');
  await expect(pours.locator('.pnow')).toHaveText('Pour to 120 g');
  await expect(pours.locator('.pt')).toHaveCount(0);
  await expect(pours.locator('.pnext')).toHaveText('Kasuya pours this at 0:45');
  /* poured well before 0:45: ahead, then behind once the wait for the bed runs past 1:30 */
  await expect(page.locator('#brewclk')).toContainText(/Brew \d:\d\d · \d+ s ahead of Kasuya/);
  await expect(pours.locator('.plist li').first()).toHaveClass(/done/);
  await expect(pours.locator('.plist li').nth(1)).toHaveClass(/cur/);
  /* waiting for the bed: the clock runs past the recipe's 45 s without ending or turning red */
  await page.waitForTimeout(2000);
  await expect(page.locator('#brewclk')).toContainText(/\d+ s behind Kasuya/);
  expect(await noOverflow(page)).toBe(true);
  const sec = s => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);
  expect(sec(await clock.innerText())).toBeGreaterThan(60);
  await expect(clock).not.toHaveClass(/over/);
  await expect(page.locator('#pause')).toHaveText('Pause');
  for (const t of ['Pour 3 of 5', 'Pour 4 of 5', 'Pour 5 of 5']) {
    await page.click('#next');
    await expect(page.locator('#stage')).toHaveText(t);
  }
  await expect(pours.locator('.pnow')).toHaveText('Pour to 300 g');
  await expect(pours.locator('.pt')).toContainText('Kasuya lifts the dripper off at 3:30');
  await expect(pours.locator('.pnow')).toHaveText('Lift the dripper off', { timeout: 6000 });
  await expect(pours.locator('.plist li').last()).toHaveClass(/cur/);
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Swirl and serve');
  await expect(page.locator('#pours')).toBeHidden();
  await expect(page.locator('#detail')).toContainText('260 g');
  await expect(page.locator('#brewclk')).toContainText(/Brew took \d:\d\d · .*Kasuya \(3:30\)/);
});

test('double bloom: three pour steps, the main pour runs until it drains', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 60 })));
  await page.goto('./');
  await pick(page, 'V60 double bloom');
  await page.click('#dry');
  await page.click('#next'); await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Bloom');
  await expect(page.locator('#pours .pt')).toHaveText('Gently, then leave it.');
  await page.click('#pause');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Second bloom');
  await expect(page.locator('#pours .pnow')).toHaveText('Pour to 90 g');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Main pour');
  await expect(page.locator('#pours .pnow')).toHaveText('Pour to 225 g');
  await expect(page.locator('#pours .pt')).toContainText('Fast, from higher up');
  await expect(page.locator('#pours .pnext')).toContainText('Hedrick pours this at 1:00, done by about 2:15');
  await expect(page.locator('#detail')).toContainText('Tap Next when it has drained');
  await expect(page.locator('#pours .plist li')).toHaveCount(3);
  await page.waitForTimeout(3000);
  await expect(page.locator('#pours .pnow')).toHaveText('Pour to 225 g');   /* no lift-off cut for this recipe */
});

test('a real V60 brew reaches the log after the bloom and is scored without a decant field', async ({ page }) => {
  await page.goto('./');
  await pick(page, 'V60 4:6');
  await page.click('#start');
  await page.click('#next');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Pour 1 of 5: the bloom');
  expect(await log(page)).toEqual([]);
  await page.click('#pause');                      /* Start */
  await page.waitForTimeout(1100);
  await page.click('#next');                       /* the bloom has drained: the brew is in the log */
  let l = await log(page);
  expect(l).toHaveLength(1);
  expect(l[0].recipe).toBe('v_46');
  expect(l[0].unfinished).toBe(true);
  expect(l[0].steps.map(s => s.k)).toEqual(['dose', 'prep', 'pour']);
  expect(l[0].steps[2].actual).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < 5; i++) await page.click('#next');
  await expect(page.locator('#sc-review')).toBeVisible();
  await expect(page.locator('#rv-decg')).toBeHidden();
  await expect(page.locator('#rv-fin')).toBeVisible();
  await expect(page.locator('#rv-fin')).toHaveAttribute('placeholder', '260 planned');
  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  l = await log(page);
  expect(l).toHaveLength(1);
  const e = l[0];
  expect(e.unfinished).toBeUndefined();
  expect(e.steps.map(s => s.k)).toEqual(['dose', 'prep', 'pour', 'pour2', 'pour3', 'pour4', 'pour5', 'off']);
  expect(e.steps.slice(2, 7).map(s => s.target)).toEqual([45, 45, 45, 30, 45]);
  const pourTime = e.steps.slice(2, 7).reduce((a, s) => a + s.actual, 0);
  expect(Math.abs(e.contact - pourTime)).toBeLessThanOrEqual(1);
  expect(e.params.paper).toBe(true);
  expect(e.calc).toMatchObject({ dose: 20, press: 300, pour: 260, decant: 0 });
  expect(e.log.decant).toBeNull();
  await expect(page.locator('.entry').first()).toContainText('V60 4:6');
  await page.locator('.entry').first().click();
  await expect(page.locator('#dt-' + e.id)).toContainText(/Brew took 0:0\d · 3:2\d ahead of Kasuya \(3:30\)/);
});
