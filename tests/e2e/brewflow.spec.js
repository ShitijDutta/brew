import { test, expect } from '@playwright/test';
import { noOverflow } from './helpers.js';

const numberRow = (page, label) => page.locator('#numbers .row', { hasText: label }).first().locator('.v');

/* every recipe and filter, as a dry run: each step is one short line, the tips are folded away */
test('steps are short, with the tips folded under More', async ({ page }) => {
  await page.goto('./');
  const setups = [
    ['black', []], ['black', ['#f-paper']], ['black', ['#pw-press']], ['black', ['#f-mesh', '#m-bypass']],
    ['hoff', []], ['hoff', ['#f-paper']], ['iced', []], ['iced', ['#f-paper', '#pw-press']],
    ['aulait', []], ['viet', ['#v-hot']], ['viet', ['#v-iced', '#f-paper']], ['cold', []], ['cold', ['#f-paper', '#pw-press']]
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

test('iced: settles like Black, and the ice comes out in the last minute of the settle, with a cue', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 60 })));
  await page.goto('./');
  await page.click('#rpick [data-r="iced"]');
  await page.click('#f-paper');
  await page.click('#pw-press');
  const ice = (await numberRow(page, 'Ice to brew onto').innerText()).trim();
  await page.click('#dry');
  const titles = [];
  while ((await page.innerText('#stage')) !== 'Settle') { titles.push(await page.innerText('#stage')); await page.click('#next'); }
  expect(titles).toEqual(['Dose the carafe', 'Weigh the water', 'Boil and pour', 'Steep', 'Break the crust']);
  const cue = page.locator('#wait li', { hasText: '1:00 left' });
  await expect(cue).toContainText(ice + ' RO + Vedica ice into the jug, dripper on top, on the scale, tared');
  await expect(cue).not.toHaveClass(/due/);
  await expect(cue).toHaveClass(/due/, { timeout: 8000 });   /* 5:00 at 60x is 5 s; due at 1:00 left */
  await page.click('#more summary');
  await expect(page.locator('#more-b')).toContainText('ice that melts early');
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Plunge');
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
    if ((await page.innerText('#stage')) === 'Settle') {
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

test('less out of the press: enter it, and the hot water after keeps the strength', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await page.click('#m-bypass');
  await page.click('#f-paper');
  await page.click('#pw-press');
  await page.fill('#tgt', '600');
  const planDec = Number((await numberRow(page, 'Decant to').innerText()).replace(/\D/g, ''));
  const planByp = Number((await numberRow(page, 'Add hot water').innerText()).replace(/\D/g, ''));
  await page.click('#start');
  while ((await page.innerText('#stage')) !== 'Pour through the paper') await page.click('#next');
  await expect(page.locator('#detail')).toContainText(`up to ${planDec} g. Stop early if it turns muddy.`);
  /* optional, folded away until asked for */
  await expect(page.locator('#gotlink')).toBeVisible();
  await expect(page.locator('#got')).toBeHidden();
  await page.click('#gotlink');
  await expect(page.locator('#got')).toBeFocused();
  await expect(page.locator('#gotres')).toBeHidden();

  const got = planDec - 10;
  const byp = Math.round(planByp * (got - 25) / (planDec - 25));
  await page.fill('#got', String(got));
  await expect(page.locator('#gotres')).toContainText(`Add ${byp} g of hot water next, for about ${got - 25 + byp} g`);
  await page.click('#runbar');
  await expect(page.locator('#runpanel .rp-sub')).toContainText(`adjusted for ${got} g poured`);
  await expect(page.locator('#runpanel .rp-nums')).toContainText(`Add hot water${byp} g`);
  await page.click('#runbar');

  await page.click('#next');                       /* drain */
  await expect(page.locator('#gotrow')).toBeHidden();
  await page.click('#next');                       /* add hot water */
  await expect(page.locator('#stage')).toHaveText('Add hot water');
  await expect(page.locator('#detail')).toContainText(`${byp} g of the leftover hot water`);
  await page.click('#next');
  await expect(page.locator('#detail')).toContainText(`about ${got - 25 + byp} g`);
  await page.click('#next');
  await expect(page.locator('#rv-dec')).toHaveValue(String(got));
});

test('nothing entered means the planned amount came out', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await page.click('#f-mesh');
  await page.click('#m-direct');
  const planDec = (await numberRow(page, 'Decant to').innerText()).replace(/\D/g, '');
  await page.click('#start');
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) {
    if ((await page.innerText('#stage')) === 'Decant') await expect(page.locator('#got')).toBeHidden();
    await page.click('#next');
  }
  await expect(page.locator('#rv-dec')).toHaveValue(planDec);
});

test('a timer that runs out keeps counting, as minus time', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('fp.v1', JSON.stringify({ dspeed: 60 })));
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await page.click('#dry');
  while ((await page.innerText('#stage')) !== 'Steep') await page.click('#next');
  await expect(page.locator('#clock')).toHaveClass(/over/, { timeout: 9000 });   /* 4:00 at 60x */
  await expect(page.locator('#clock')).toHaveText(/^−\d+:\d\d$/);
  await page.waitForTimeout(1500);
  const over = await page.innerText('#clock');
  expect(Number(over.split(':')[0].slice(1)) * 60 + Number(over.split(':')[1])).toBeGreaterThanOrEqual(60);
  await expect(page.locator('#pause')).toHaveText('Restart');
  await page.click('#runbar');
  await expect(page.locator('#rp-left')).toContainText('over');
  await page.click('#runbar');

  /* still counting after the app is reopened */
  await page.reload();
  await page.click('[data-run="resume"]');
  await expect(page.locator('#clock')).toHaveText(/^−/);

  /* the next step starts clean */
  await page.click('#next');
  await expect(page.locator('#clock')).not.toHaveClass(/over/);
  await expect(page.locator('#clock')).toHaveText(/^\d+:\d\d$/);
});

test('cold brew: concentrate overnight, no timer, the run waits for you, diluted to the drink', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="cold"]');
  await expect(page.locator('#modeseg')).toBeHidden();
  await expect(page.locator('#iceseg')).toBeHidden();
  await expect(page.locator('#numbers')).toContainText('Water, not boiled');
  await expect(page.locator('#numbers')).not.toContainText('Boil');
  await page.click('#f-paper');
  await page.click('#pw-press');
  const dil = (await numberRow(page, 'Dilute with cold water').innerText()).replace(/\D/g, '');
  const total = (await numberRow(page, 'Finished drink').innerText()).replace(/\D/g, '');
  await page.click('#start');
  const titles = [];
  while ((await page.innerText('#stage')) !== 'Into the fridge') { titles.push(await page.innerText('#stage')); await page.click('#next'); }
  expect(titles).toEqual(['Dose the carafe', 'Weigh the water', 'Pour and stir']);
  await expect(page.locator('#detail')).toContainText('Set an alarm for 8 hours. Ready from');
  await expect(page.locator('#manual')).toBeVisible();
  await expect(page.locator('#wait')).toContainText('In the morning');

  /* back the next morning, 20 hours later: the run is still there */
  await page.evaluate(() => {
    const k = Object.keys(localStorage).find(x => x.startsWith('fp.run'));
    const r = JSON.parse(localStorage.getItem(k)); r.savedAt -= 20 * 3600000; localStorage.setItem(k, JSON.stringify(r));
  });
  await page.reload();
  await page.click('[data-run="resume"]');
  await expect(page.locator('#stage')).toHaveText('Into the fridge');
  const rest = [];
  for (let i = 0; i < 10 && !(await page.isVisible('#sc-review')); i++) {
    rest.push(await page.innerText('#stage'));
    if (rest[rest.length - 1] === 'Dilute and serve') await expect(page.locator('#detail')).toContainText(`Add ${dil} g of cold water, about ${total} g in all`);
    await page.click('#next');
  }
  expect(rest).toEqual(['Into the fridge', 'Plunge', 'Pour through the paper', 'Let it drain', 'Dilute and serve']);
  await expect(page.locator('#rv-wt-wrap')).toBeHidden();
  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  await expect(page.locator('.entry').first()).toContainText('Cold brew');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1'))[0]);
  expect(saved.recipe).toBe('cold');
  expect(saved.params.temp).toBeUndefined();
});

test('Something new: drinks folded away from the daily recipes, each one brews through', async ({ page }) => {
  await page.goto('./');
  expect(await page.locator('#rpick button').allInnerTexts()).toEqual(['Black', 'Hoffmann', 'Iced', 'Cold brew', 'Café au lait', 'Vietnamese']);
  await expect(page.locator('#xpick')).toBeHidden();
  await page.click('#newdrinks summary');
  const drinks = await page.locator('#xpick button').allInnerTexts();
  expect(drinks).toEqual(['Latte', 'Iced latte', 'Kaapi-style', 'Shaken iced', 'Affogato', 'Cold brew + milk', 'Cold brew tonic', 'Coconut cold brew', 'Orange cold brew']);
  const ends = {
    'Latte': ['Froth the milk', 'Pour'], 'Iced latte': ['Add the milk'], 'Kaapi-style': ['Froth the milk', 'Pour back and forth'],
    'Shaken iced': ['Shake', 'Pour off the ice'], 'Affogato': ['Over the ice cream'], 'Cold brew + milk': ['Over ice with milk'],
    'Cold brew tonic': ['Build the tonic'], 'Coconut cold brew': ['Over ice'], 'Orange cold brew': ['Over ice']
  };
  for (const name of drinks) {
    await page.locator('#xpick').getByRole('button', { name, exact: true }).click();
    await expect(page.locator('#xnow')).toHaveText('Trying: ' + name);
    await expect(page.locator('#rpick button[aria-pressed="true"]')).toHaveCount(0);
    await expect(page.locator('#numbers')).toContainText('Concentrate to decant');
    await page.click('#dry');
    const titles = [];
    for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) {
      titles.push(await page.innerText('#stage'));
      const d = await page.innerText('#detail');
      expect(d.length, `${name} ${titles[titles.length - 1]}: ${d}`).toBeLessThanOrEqual(120);
      await page.click('#next');
    }
    expect(titles.slice(-ends[name].length), name).toEqual(ends[name]);
    await page.click('#skip');
    await expect(page.locator('#xpick')).toBeVisible();
  }
  await page.click('#rpick [data-r="black"]');
  await expect(page.locator('#xnow')).toHaveText('');
});

test('latte through paper: the milk warms during the drain, then the frother', async ({ page }) => {
  await page.goto('./');
  await page.click('#newdrinks summary');
  await page.locator('#xpick').getByRole('button', { name: 'Latte', exact: true }).click();
  await page.click('#f-paper');
  await page.click('#pw-press');
  const milk = (await numberRow(page, 'Full-cream milk').innerText()).replace(/\D/g, '');
  await page.click('#start');
  while ((await page.innerText('#stage')) !== 'Let it drain') await page.click('#next');
  await expect(page.locator('#wait')).toContainText(`Warm ${milk} g full-cream milk to 60–65 °C`);
  await page.click('#next');
  await expect(page.locator('#stage')).toHaveText('Froth the milk');
  await page.click('#more summary');
  await expect(page.locator('#more-b')).toContainText('Heat first, then froth');
});

test('the final drink can be weighed on the score screen, and is optional', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  const planned = (await numberRow(page, 'Pour off').innerText()).replace(/\D/g, '');
  const brew = async () => {
    await page.click('#start');
    for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
  };
  await brew();
  await expect(page.locator('#rv-fin')).toHaveValue('');
  await expect(page.locator('#rv-fin')).toHaveAttribute('placeholder', planned + ' planned');
  await page.fill('#rv-fin', '215');
  await page.click('#rv-score [data-v="5"]');
  await page.click('#rv-save');
  let saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1'))[0]);
  expect(saved.log.fin).toBe(215);
  expect(saved.log.drank).toBe(215);
  await page.locator('.entry').first().click();
  await expect(page.locator('.detwrap').first()).toContainText('215 g in the glass');

  /* left empty: nothing recorded, and how much was drunk follows the plan */
  await page.click('#log-back');
  await brew();
  await page.click('#rv-score [data-v="4"]');
  await page.click('#rv-save');
  saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fp.log.v1'))[0]);
  expect(saved.log.fin).toBeUndefined();
  expect(saved.log.drank).toBe(Number(planned));
});

test('with paper, the details show what the paper and jug kept', async ({ page }) => {
  await page.goto('./');
  await page.click('#rpick [data-r="black"]');
  await page.click('#f-paper');
  await page.click('#pw-press');
  await page.click('#start');
  for (let i = 0; i < 25 && !(await page.isVisible('#sc-review')); i++) await page.click('#next');
  await page.fill('#rv-dec', '226');
  await page.fill('#rv-fin', '215');
  await page.click('#rv-score [data-v="5"]');
  await page.click('#rv-save');
  await page.locator('.entry').first().click();
  await expect(page.locator('.detwrap').first()).toContainText('215 g in the glass · paper and jug kept about 11 g');
});
