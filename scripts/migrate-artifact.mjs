#!/usr/bin/env node
/*
 * One-off import from the old Claude artifact into the data repository layout.
 *   node scripts/migrate-artifact.mjs --brews <dir of brew .json files> --doc <coffee.json> --out <data repo dir>
 * Writes coffee.json and brews/YYYY-MM.json. Existing brews in --out are kept; the newer revision of each brew wins.
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => (a.startsWith('--') ? acc.concat([[a.slice(2), all[i + 1]]]) : acc), []));
if (!args.brews || !args.doc || !args.out) {
  console.error('usage: migrate-artifact.mjs --brews <dir> --doc <coffee.json> --out <dir>');
  process.exit(1);
}
const pretty = o => JSON.stringify(o, null, 2) + '\n';
const monthOf = b => { const d = new Date(b.at); return isNaN(d) ? 'undated' : d.toISOString().slice(0, 7); };

/* brews */
const incoming = readdirSync(args.brews).filter(f => f.endsWith('.json')).map(f => JSON.parse(readFileSync(join(args.brews, f), 'utf8')));
const problems = [];
incoming.forEach(b => {
  if (b.id === undefined || !b.at || !Array.isArray(b.steps) || !b.calc) problems.push('incomplete brew ' + (b.id || '?'));
  delete b.synced;
});
if (problems.length) { console.error(problems.join('\n')); process.exit(2); }

mkdirSync(join(args.out, 'brews'), { recursive: true });
const months = {};
incoming.forEach(b => { (months[monthOf(b)] = months[monthOf(b)] || []).push(b); });
let written = 0, kept = 0;
for (const m of Object.keys(months).sort()) {
  const path = join(args.out, 'brews', m + '.json');
  const cur = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {};
  months[m].forEach(b => {
    const id = String(b.id);
    if (cur[id] && (cur[id].rev || 0) > (b.rev || 0)) { kept++; return; }
    cur[id] = b; written++;
  });
  const sorted = {};
  Object.keys(cur).sort().forEach(k => { sorted[k] = cur[k]; });
  writeFileSync(path, pretty(sorted));
}

/* packs, locations, caffeine extras, To try */
const doc = JSON.parse(readFileSync(args.doc, 'utf8'));
for (const k of ['packs', 'profiles']) if (!Array.isArray(doc[k])) { console.error('coffee.json is missing ' + k); process.exit(3); }
const docPath = join(args.out, 'coffee.json');
const curDoc = existsSync(docPath) ? JSON.parse(readFileSync(docPath, 'utf8')) : null;
if (!curDoc || (curDoc.rev || 0) <= (doc.rev || 0)) writeFileSync(docPath, pretty(doc));

console.log(JSON.stringify({
  brews: incoming.length, written, keptNewer: kept, months: Object.keys(months).sort(),
  packs: doc.packs.length, openPacks: doc.packs.filter(p => p.status !== 'finished').map(p => p.name),
  locations: doc.profiles.map(p => p.name), tries: (doc.tries || []).length
}, null, 2));
