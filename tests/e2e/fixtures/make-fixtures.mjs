#!/usr/bin/env node
/*
 * Writes the synthetic test data the end-to-end tests run against, in the brew-data layout.
 * Nothing here is real: packs, brews and notes are made up (the code repository is public).
 *   node tests/e2e/fixtures/make-fixtures.mjs
 */
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = join(dirname(fileURLToPath(import.meta.url)), 'data');
const pretty = o => JSON.stringify(o, null, 2) + '\n';
const day = 86400000;

const pack = (id, name, roasted, bought, status, extra = {}) => Object.assign({
  id, name, roaster: 'Test Roasters', roasted, bought, ground: '', pre: true, grind: 'French Press Coarse',
  size: 250, base: 250, status, created: bought + 'T08:00:00.000Z', since: bought + 'T08:00:00.000Z'
}, extra);
const packs = [
  pack('p-old-reserve', 'Old Reserve', '2026-09-01', '2026-09-05', 'finished', { finishedAt: '2026-10-02' }),
  pack('p-old-select', 'Old Selection', '2026-09-03', '2026-09-08', 'finished', { finishedAt: '2026-10-08' }),
  pack('p-ridge', 'Ridge Honey', '2026-09-20', '2026-09-24', 'open'),
  pack('p-river', 'River Washed', '2026-09-25', '2026-10-01', 'open'),
  pack('p-valley', 'Valley Natural', '2026-10-01', '2026-10-05', 'open'),
  pack('p-hill', 'Hill Estate', '2026-10-06', '2026-10-10', 'open')
];

const steps = (steep, settle) => [
  { k: 'prep', t: 'Dose the carafe', target: 0, actual: 3 },
  { k: 'dose', t: 'Weigh the water', target: 0, actual: 4 },
  { k: 'pour', t: 'Boil and pour', target: 10, actual: 12 },
  { k: 'steep', t: 'Steep', target: 240, actual: steep },
  { k: 'crust', t: 'Break the crust', target: 45, actual: 46 },
  { k: 'settle', t: 'Settle', target: 300, actual: settle },
  { k: 'plunge', t: 'Plunge', target: 15, actual: 15 },
  { k: 'decant', t: 'Pour into the cup', target: 0, actual: 40 }
];
const CALC = {
  black: { boil: 395, cm: 0, decant: 300, dose: 18, ice: 0, jug: 300, milk: 0, pour: 300, press: 330, ro: 316, vedica: 79 },
  hoff: { boil: 395, cm: 0, decant: 300, dose: 22, ice: 0, jug: 300, milk: 0, pour: 300, press: 365, ro: 316, vedica: 79 },
  viet: { boil: 300, cm: 30, decant: 110, dose: 18, ice: 0, jug: 110, milk: 0, pour: 110, press: 170, ro: 240, vedica: 60 },
  iced: { boil: 260, cm: 0, decant: 170, dose: 18, ice: 130, jug: 170, milk: 0, pour: 170, press: 200, ro: 208, vedica: 52 }
};
const PARAMS = {
  black: { tgt: 300, ratio: 16.7, pratio: 12, temp: 98, ved: 20, loc: 'Delhi' },
  hoff: { tgt: 300, ratio: 16.7, pratio: 12, temp: 98, ved: 20, loc: 'Delhi' },
  viet: { tgt: 140, ratio: 7.3, pratio: 11, temp: 98, ved: 20, loc: 'Delhi', vmode: 'hot' },
  iced: { tgt: 300, ratio: 16.7, pratio: 12, temp: 98, ved: 20, loc: 'Delhi' }
};
const TASTES = [['Chocolatey'], ['Fruity', 'Sweet'], ['Nutty'], ['Caramel'], []];
const FAULTS = [[], [], ['Silty'], [], ['Bitter']];
const SCORES = [3, 3.5, 4, 2.5, 4.5, 3, 4, 3.5, 5, 2, 4, 3.5, 4, 3, 4.5, 3.5, 4, 3];

const dates = [10, 13, 16, 19, 22, 25, 28].map(d => [8, d]).concat([1, 3, 5, 7, 9, 11, 12, 13, 14, 15, 16, 18].map(d => [9, d]));
const recipeFor = i => (i === 9 ? 'hoff' : i === 14 ? 'viet' : i === 16 ? 'iced' : 'black');
const packFor = t => {
  const open = packs.slice().reverse().find(p => Date.parse(p.bought) <= t) || packs[0];
  return open;
};

const months = {};
dates.forEach(([m, d], i) => {
  const at = Date.UTC(2026, m, d, 5, 30) + i * 7 * 60000;
  const recipe = recipeFor(i);
  const p = packFor(at);
  const last = i === dates.length - 1;
  const brew = {
    id: at, at: new Date(at).toISOString(), rev: last ? at : at + 3600000,
    recipe, mode: 'direct', params: PARAMS[recipe],
    bean: { name: p.name, roaster: p.roaster, roasted: p.roasted, bought: p.bought, ground: '', pre: true, grind: p.grind, packId: p.id,
      roastAge: Math.round((at - Date.parse(p.roasted)) / day), groundAge: Math.round((at - Date.parse(p.bought)) / day), groundAgeEst: true },
    calc: CALC[recipe], steps: steps(240 + (i % 3), 300 + (i % 4) * 10), total: 660 + i, contact: 600 + (i % 5) * 10,
    log: last
      ? { temp: null, decant: null, score: null, tastes: [], faults: [], note: '' }
      : { temp: 57 + (i % 3), decant: CALC[recipe].decant, score: SCORES[i], tastes: TASTES[i % 5], faults: FAULTS[i % 5],
          note: 'Test brew ' + (i + 1), share: 1, drank: CALC[recipe].pour }
  };
  if (last) brew.pending = true;
  const key = brew.at.slice(0, 7);
  (months[key] = months[key] || {})[String(at)] = brew;
});

const tries = [
  { id: 'sb-pearl-omni', g: 'now', n: 'Project Pearl, Ratnagiri — Naturals + Anaerobic Honey', b: 'Project Pearl Omni', r: 'Subko', st: 'todo', added: '2026-10-15' },
  { id: 'test-fruity', g: 'now', n: 'Test Fruity Natural', b: 'Fruity Natural', r: 'Test Roasters', notes: 'Berries, honey', st: 'todo', added: '2026-10-15' },
  { id: 'test-honey', g: 'now', n: 'Test Honey Process', b: 'Honey Process', r: 'Test Roasters', notes: 'Caramel, stone fruit', st: 'todo', added: '2026-10-15' },
  { id: 'test-later', g: 'later', n: 'Test Light Roast', b: 'Light Roast', r: 'Test Roasters', notes: 'Better with a grinder', st: 'todo', added: '2026-10-15' },
  { id: 'test-notify', g: 'notify', n: 'Test Micro Lot', b: 'Micro Lot', r: 'Test Roasters', notes: 'Sold out, waiting for restock', st: 'todo', added: '2026-10-15' }
];
const coffee = {
  active: 'p-hill', extras: [], loc: 'delhi', packs,
  profiles: [
    { ceil: 450, id: 'delhi', name: 'Delhi', panloss: 30, temp: 98, ved: 20 },
    { ceil: 450, id: 'bangalore', name: 'Bangalore', panloss: 30, temp: 96, ved: 20 }
  ],
  rev: Date.UTC(2026, 9, 17, 10, 0), tries, tryGone: [], trySeed: 1
};

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, 'brews'), { recursive: true });
writeFileSync(join(out, 'coffee.json'), pretty(coffee));
for (const m of Object.keys(months)) writeFileSync(join(out, 'brews', m + '.json'), pretty(months[m]));
console.log(JSON.stringify({ months: Object.fromEntries(Object.entries(months).map(([k, v]) => [k, Object.keys(v).length])), packs: packs.length, tries: tries.length }));
