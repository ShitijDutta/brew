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
  await expect(num(page, 'Time to pour')).toHaveText('about 10 s each');
  await expect(num(page, 'Lift the dripper off at')).toHaveText('3:30');
  await expect(num(page, 'In the cup')).toHaveText('about 260 g');
  await expect(num(page, 'Boil')).toHaveText('350 g');
  await expect(num(page, 'Paper rinse')).toHaveText('100 g plain RO');
  await expect(page.locator('#fltseg')).toBeHidden();
  await expect(page.locator('#pwseg')).toBeHidden();
  await pick(page, 'V60 double bloom');
  await expect(num(page, 'Coffee')).toHaveText('15 g');
  await expect(num(page, 'Pours')).toHaveText('to 45, 90, then 225 g');
  await expect(num(page, 'Time to pour')).toHaveText('about 6, 6 and 13 s');
  await expect(num(page, 'Done by about')).toHaveText('2:15');
  await expect(num(page, 'In the cup')).toHaveText('about 195 g');
  expect(await noOverflow(page)).toBe(true);
  /* the daily recipes are untouched */
  await page.click('#rpick [data-r="black"]');
  await expect(page.locator('#fltseg')).toBeVisible();
});

const sec = s => s.split(':').reduce((a, b) => a * 60 + Number(b), 0);
/* the one button on a pour: start the next pour, tapping Bed shows first if that is what it offers */
async function nextPour(page) {
  if ((await page.locator('#next').innerText()) === 'Bed shows') await page.click('#next');
  await page.click('#next');
}

test('while a pour goes in, the box says what the scale should read at the recipe\'s pace and when to be done', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 2 })));   /* the slowest dry run */
  await page.goto('./');
  await pick(page, 'V60 4:6');
  await page.click('#dry');
  await page.click('#next'); await page.click('#next');
  await expect(page.locator('#p-b2')).toHaveText('Then pour to 60 g in about 10 s.');
  /* the recipe's pouring windows on the timeline, one per pour */
  await expect(page.locator('#pours .pline .pw')).toHaveCount(5);
  await page.click('#next');                       /* Start */
  await expect(page.locator('#p-box')).toHaveClass(/pouring/);
  await expect(page.locator('#p-b1')).toHaveText(/^Scale should read \d+ g$/);
  await expect(page.locator('#p-b2')).toHaveText('Pour to 60 g by 0:10, about 6 g a second.');
  await page.waitForTimeout(1500);
  const g = Number((await page.locator('#p-b1').innerText()).match(/(\d+) g/)[1]);
  expect(g).toBeGreaterThanOrEqual(6);
  expect(g).toBeLessThanOrEqual(40);
  await expect(page.locator('#next')).toHaveText('Bed shows');   /* the button keeps its job while pouring */
  expect(await noOverflow(page)).toBe(true);
  /* double bloom: the blooms at about 8 g a second */
  await page.click('#abandon'); if (await page.isVisible('#abandon')) await page.click('#abandon');
  await pick(page, 'V60 double bloom');
  await page.click('#dry');
  await page.click('#next'); await page.click('#next');
  await page.click('#next');
  await expect(page.locator('#p-b2')).toHaveText('Pour to 45 g by 0:06, about 8 g a second.');
});

test('4:6 runs on one brew clock: Start, Bed shows, waiting for the time, a slow pour, a late pour, lift-off, then the summary', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 20 })));
  await page.goto('./');
  await pick(page, 'V60 4:6');
  await page.click('#dry');
  await expect(page.locator('#stage')).toHaveText('Weigh the water');
  await expect(page.locator('#detail')).toContainText('cool to about 93 °C');
  await expect(page.locator('#wait')).toContainText('100 g plain RO for the paper rinse');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Rinse and dose');
  await page.click('#next');
  /* the bloom waits for Start: one button, no pause, no step clock */
  const pours = page.locator('#pours'), next = page.locator('#next'), b1 = page.locator('#p-b1');
  await expect(page.locator('#stage')).toHaveText('Pour 1 of 5: the bloom');
  await expect(next).toHaveText('Start');
  await expect(page.locator('#pause')).toBeHidden();
  await expect(page.locator('#timed')).toBeHidden();
  await expect(page.locator('#detail')).toBeHidden();
  await expect(pours.locator('.pnow')).toHaveText('Pour to 60 g');
  await expect(pours.locator('.pt')).toContainText('smaller first pour makes it sweeter');
  await expect(page.locator('#pc-t')).toHaveText('0:00');
  await expect(page.locator('#pc-c')).toHaveText('Starts when you tap Start');
  await expect(b1).toHaveText('Tap Start as the water hits the coffee.');
  /* the timeline: five pours and the lift, the short 30 s gap marked */
  await expect(pours.locator('.pline .tk')).toHaveCount(6);
  await expect(pours.locator('.pline .gs')).toHaveText('30 s');
  expect(await noOverflow(page)).toBe(true);
  await next.click();                                       /* Start */
  await expect(page.locator('#pc-c')).toHaveText('Brew clock, from your first pour');
  await expect(next).toHaveText('Bed shows');
  await expect(b1).toHaveText('Next: pour to 120 g at 0:45');
  await expect(page.locator('#p-lag')).toContainText('on time with Kasuya');
  await next.click();                                       /* the bed shows early: wait for 0:45 */
  await expect(next).toHaveText('Start pour 2');
  await expect(page.locator('#p-b2')).toContainText('Bed showed at');
  await expect(page.locator('#p-b2')).toContainText('wait for Kasuya’s time');
  await expect(b1).toHaveText('Pour now: to 120 g', { timeout: 6000 });
  await expect(page.locator('#p-box')).toHaveClass(/now/);
  await next.click();                                       /* Start pour 2 */
  await expect(page.locator('#stage')).toHaveText('Pour 2 of 5');
  await expect(pours.locator('.pnow')).toHaveText('Pour to 120 g');
  await expect(pours.locator('.pt')).toHaveCount(0);
  await expect(next).toHaveText('Bed shows');
  /* no Bed shows by the next time: this pour is the slow one, and one tap starts the next */
  await expect(b1).toHaveText(/^Pour 2 is draining slowly: \d:\d\d$/, { timeout: 10000 });
  await expect(page.locator('#p-box')).toHaveClass(/late/);
  await expect(page.locator('#p-b2')).toContainText('Kasuya allows 45 s. Wait for the bed, then pour.');
  await expect(next).toHaveText('Start pour 3');
  await expect(pours.locator('.pline .ov').first()).toBeVisible();
  await expect(page.locator('#p-lag')).toContainText(/\d+ s behind Kasuya/);
  expect(await noOverflow(page)).toBe(true);
  await page.waitForTimeout(500);                           /* let pour 2 run clearly long */
  await next.click();
  await expect(page.locator('#stage')).toHaveText('Pour 3 of 5');
  /* late now: the next pour is due the recipe's gap after this one, so the countdown still means something */
  await expect(b1).toHaveText(/^Next: pour to 240 g at \d+:\d\d$/);     /* once the pour itself is in */
  const due = sec((await b1.innerText()).match(/at (\d+:\d\d)$/)[1]);
  expect(due).toBeGreaterThan(135);
  for (const t of ['Pour 4 of 5', 'Pour 5 of 5']) { await nextPour(page); await expect(page.locator('#stage')).toHaveText(t); }
  await expect(pours.locator('.pnow')).toHaveText('Pour to 300 g');
  await expect(next).toHaveText('Drained');
  await expect(b1).toHaveText(/^Lift the dripper off at \d:\d\d$/);
  await expect(b1).toHaveText('Lift the dripper off now', { timeout: 15000 });
  await expect(next).toHaveText('Lifted off');
  await next.click();
  /* after the pours: the timeline and a row per pour */
  await expect(page.locator('#stage')).toHaveText('Swirl and serve');
  await expect(page.locator('#detail')).toContainText('260 g');
  await expect(pours).toHaveClass(/sum/);
  await expect(pours.locator('.phead')).toContainText(/Brew took \d:\d\d · .*Kasuya \(3:30\)/);
  await expect(pours.locator('.ptab tr')).toHaveCount(6);
  await expect(pours.locator('.ptab tr').nth(1)).toContainText('bed at');
  await expect(pours.locator('.ptab tr').nth(2).locator('td').nth(3)).toHaveClass('late');
  await expect(pours.locator('.ptab tr').nth(5)).toContainText('5 · lift');
  expect(await noOverflow(page)).toBe(true);
});

test('a last pour that starts after 3:30 still says to pour, and the lift-off comes 45 s later', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 30 })));
  await page.goto('./');
  await pick(page, 'V60 4:6');
  await page.click('#dry');
  await page.click('#next'); await page.click('#next');
  await page.click('#next');                       /* Start */
  await page.waitForTimeout(7600);                 /* past 3:30 on the brew clock before pour 2 */
  for (let i = 0; i < 4; i++) await nextPour(page);
  await expect(page.locator('#stage')).toHaveText('Pour 5 of 5');
  await expect(page.locator('#pours .pnow')).toHaveText('Pour to 300 g');
  await expect(page.locator('#p-b1')).toHaveText(/^Lift the dripper off at \d+:\d\d$/);
  const at = (await page.locator('#p-b1').innerText()).match(/^Lift the dripper off at (\d+:\d\d)$/);
  expect(at).not.toBeNull();
  expect(sec(at[1])).toBeGreaterThan(210 + 45);
  await expect(page.locator('#p-b1')).toHaveText('Lift the dripper off now', { timeout: 5000 });
});

test('double bloom: the blooms go on time with no Bed shows, then the main pour drains', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 60 })));
  await page.goto('./');
  await pick(page, 'V60 double bloom');
  await page.click('#dry');
  await page.click('#next'); await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Bloom');
  await expect(page.locator('#pours .pt')).toHaveText('Gently, then leave it.');
  await expect(page.locator('#pours .pline .gs')).toHaveCount(0);
  await page.click('#next');                       /* Start */
  await expect(page.locator('#next')).toHaveText('Start second bloom');
  await expect(page.locator('#p-b1')).toHaveText('Next: second bloom to 90 g at 0:30');
  await expect(page.locator('#p-b1')).toHaveText('Pour now: second bloom to 90 g', { timeout: 3000 });
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Second bloom');
  await expect(page.locator('#pours .pnow')).toHaveText('Pour to 90 g');
  await expect(page.locator('#next')).toHaveText('Start main pour');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Main pour');
  await expect(page.locator('#pours .pnow')).toHaveText('Pour to 225 g');
  await expect(page.locator('#pours .pt')).toContainText('Fast, from higher up');
  await expect(page.locator('#p-b1')).toHaveText(/^Done by about \d:\d\d$/);
  await expect(page.locator('#next')).toHaveText('Drained');
  await expect(page.locator('#p-b1')).toHaveText(/^Draining slowly: \d:\d\d$/, { timeout: 5000 });
  await expect(page.locator('#p-b2')).toContainText('Hedrick is done by about 2:15');
});

test('a real V60 brew reaches the log after the bloom, keeps when the bed showed, and is scored twice', async ({ page }) => {
  await page.goto('./');
  await pick(page, 'V60 4:6');
  await page.click('#start');
  await page.click('#next');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Pour 1 of 5: the bloom');
  expect(await log(page)).toEqual([]);
  await page.click('#next');                       /* Start */
  await page.waitForTimeout(1100);
  await page.click('#next');                       /* Bed shows */
  await page.waitForTimeout(1100);
  await page.click('#next');                       /* Start pour 2: the brew is in the log */
  let l = await log(page);
  expect(l).toHaveLength(1);
  expect(l[0].recipe).toBe('v_46');
  expect(l[0].unfinished).toBe(true);
  expect(l[0].steps.map(s => s.k)).toEqual(['dose', 'prep', 'pour']);
  expect(l[0].steps[2].actual).toBeGreaterThanOrEqual(2);
  expect(l[0].steps[2].bed).toBeGreaterThanOrEqual(1);
  expect(l[0].steps[2].bed).toBeLessThan(l[0].steps[2].actual);
  for (let i = 0; i < 12 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
  await expect(page.locator('#sc-review')).toBeVisible();
  await expect(page.locator('#rv-decg')).toBeHidden();
  await expect(page.locator('#rv-fin')).toHaveAttribute('placeholder', '260 planned');
  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-like [data-v="3"]');
  await expect(page.locator('#rv-lval')).toHaveText('3 / 5');
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
  expect(e.log.score).toBe(4);
  expect(e.log.like).toBe(3);
  await expect(page.locator('.entry').first()).toContainText('V60 4:6');
  await expect(page.locator('.entry').first().locator('.sc')).toHaveText('4/5 · liked 3');
  await page.locator('.entry').first().click();
  const dt = page.locator('#dt-' + e.id);
  await expect(dt.locator('.phead')).toContainText(/Brew took 0:0\d · 3:2\d ahead of Kasuya \(3:30\)/);
  await expect(dt.locator('.ptab tr')).toHaveCount(6);
  expect(await noOverflow(page)).toBe(true);
});

test('Hoffmann and Rao: their own numbers, water and steps, on the same pour screen', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 20 })));
  await page.goto('./');
  await pick(page, 'V60 Hoffmann');
  await expect(num(page, 'Coffee')).toHaveText('30 g');                   /* his own 30 g to 500 g */
  await expect(num(page, 'Water to pour')).toHaveText('500 g');
  await expect(num(page, 'Pours')).toHaveText('to 60, 300, then 500 g');
  await expect(num(page, 'Time to pour')).toHaveText('about 10, 30 and 30 s');
  await expect(num(page, 'Done by about')).toHaveText('3:30');
  await expect(page.locator('#blurb')).toContainText('Water straight off the boil.');
  /* +/- from an odd amount lands on round tens */
  await page.fill('#tgt', '333');
  await page.click('[data-st="tgt"][data-d="10"]');
  await expect(page.locator('#tgt')).toHaveValue('340');
  await page.click('[data-st="tgt"][data-d="-10"]');
  await expect(page.locator('#tgt')).toHaveValue('330');
  await page.fill('#tgt', '500');
  await pick(page, 'V60 Hoffmann 1-cup');
  await expect(num(page, 'Coffee')).toHaveText('15 g');
  await expect(num(page, 'Water to pour')).toHaveText('250 g');
  await expect(num(page, 'Pours')).toHaveText('5 × 50 g, the last at 1:50');
  await expect(num(page, 'Time to pour')).toHaveText('about 10, 15, 10, 10 and 10 s');
  await expect(num(page, 'Done by about')).toHaveText('3:00');
  await expect(page.locator('#blurb')).toContainText('Water straight off the boil for a light roast');
  await pick(page, 'V60 Rao');
  await expect(num(page, 'Coffee')).toHaveText('20 g');
  await expect(num(page, 'Pours')).toHaveText('to 60, 200, then 330 g');
  await expect(num(page, 'Done by about')).toHaveText('4:00–4:30');
  await expect(page.locator('#blurb')).toContainText('Water at about 97 °C.');
  expect(await noOverflow(page)).toBe(true);
  /* Rao: the bloom and second pour go on time; the last waits on the drain alone, so nothing is late against it */
  await page.click('#dry');
  await expect(page.locator('#detail')).toContainText('settle to about 97 °C');
  await page.click('#next'); await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Bloom');
  await expect(page.locator('#pours .pt')).toHaveText('Then spin it hard straight away.');
  await expect(page.locator('#pours .pline .tk')).toHaveCount(3);          /* bloom, second pour, done: the last has no time */
  await page.click('#next');                                               /* Start */
  await expect(page.locator('#next')).toHaveText('Start second pour');
  await expect(page.locator('#p-b1')).toHaveText('Pour now: second pour to 200 g', { timeout: 5000 });
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Second pour');
  await expect(page.locator('#next')).toHaveText('Start last pour');
  await expect(page.locator('#p-b1')).toHaveText('Next: pour to 330 g once about 70% has drained', { timeout: 5000 });
  await page.waitForTimeout(2500);                                         /* no time to be late against */
  await expect(page.locator('#p-box')).not.toHaveClass(/late/);
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Last pour');
  await expect(page.locator('#p-b1')).toHaveText('Done by about 4:30', { timeout: 5000 });
  await expect(page.locator('#next')).toHaveText('Drained');
  await page.click('#next');
  await expect(page.locator('#pours .ptab tr')).toHaveCount(4);
  await expect(page.locator('#pours .ptab tr').nth(2).locator('td').nth(1)).toHaveText('—');
  await expect(page.locator('#pours .phead')).toContainText(/Brew took \d:\d\d · .*Rao \(4:30\)/);
});

test('Hoffmann: both main pours go on time, 30 s each, at the pace shown', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 10 })));
  await page.goto('./');
  await pick(page, 'V60 Hoffmann');
  await page.click('#dry');
  await expect(page.locator('#detail')).toContainText('straight off the boil');
  await page.click('#next'); await page.click('#next');
  await expect(page.locator('#pours .pt')).toHaveText('Then swirl until every ground is wet.');
  await page.click('#next');                                               /* Start */
  await expect(page.locator('#next')).toHaveText('Start first pour');
  await expect(page.locator('#p-b1')).toHaveText('Pour now: first pour to 300 g', { timeout: 8000 });
  await page.click('#next');
  await expect(page.locator('#p-b2')).toHaveText(/^Pour to 300 g by 1:\d\d, about 8 g a second\.$/);
  await expect(page.locator('#next')).toHaveText('Start second pour');
  await expect(page.locator('#p-b1')).toHaveText('Pour now: second pour to 500 g', { timeout: 8000 });
  await page.click('#next');
  await expect(page.locator('#p-b2')).toHaveText(/^Pour to 500 g by 1:\d\d, about 6\.7 g a second\.$/);
  await expect(page.locator('#pours .pt')).toContainText('stir once each way');
});

test('Hoffmann 1-cup: five fifths on time, the second over 15 s, a swirl at each end', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 10 })));
  await page.goto('./');
  await pick(page, 'V60 Hoffmann 1-cup');
  await page.click('#dry');
  await page.click('#next'); await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Bloom');
  await expect(page.locator('#pours .pt')).toHaveText('Then swirl gently until it is all wet.');
  await expect(page.locator('#pours .pline .tk')).toHaveCount(6);
  await page.click('#next');                                               /* Start */
  await expect(page.locator('#p-b2')).toHaveText('Pour to 50 g by 0:10, about 5 g a second.');
  await expect(page.locator('#next')).toHaveText('Start pour 2');
  await expect(page.locator('#p-b1')).toHaveText('Pour now: pour 2 of 5 to 100 g', { timeout: 8000 });
  await page.click('#next');
  await expect(page.locator('#p-b2')).toHaveText(/^Pour to 100 g by \d:\d\d, about 3\.3 g a second\.$/);
  for (const t of ['Pour 3 of 5', 'Pour 4 of 5', 'Pour 5 of 5']) {
    await expect(page.locator('#p-b1')).toHaveText(/^Pour now: /, { timeout: 8000 });
    await page.click('#next');
    await expect(page.locator('#stage')).toHaveText(t);
  }
  await expect(page.locator('#pours .pt')).toHaveText('Then swirl gently and let it drain.');
  await expect(page.locator('#p-b1')).toHaveText(/^Done by about \d:\d\d$/, { timeout: 5000 });
  expect(await noOverflow(page)).toBe(true);
});
