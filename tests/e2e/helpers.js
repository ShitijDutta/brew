import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeGithub } from '../unit/fakeGithub.js';

const here = dirname(fileURLToPath(import.meta.url));
export const fixture = () => JSON.parse(readFileSync(join(here, 'fixtures', 'data', 'coffee.json'), 'utf8'));

/* a fake GitHub seeded with the synthetic test data, wired into the browser */
export async function withGithub(context, { seed = true, token = 'good' } = {}) {
  const gh = fakeGithub({ owner: 'shitij', repo: 'brew-data', token });
  if (seed) {
    const dir = process.env.BREW_FIXTURES || join(here, 'fixtures', 'data');
    gh.put('coffee.json', JSON.parse(readFileSync(join(dir, 'coffee.json'), 'utf8')));
    for (const f of readdirSync(join(dir, 'brews'))) gh.put('brews/' + f, JSON.parse(readFileSync(join(dir, 'brews', f), 'utf8')));
  }
  const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,PUT,OPTIONS', 'access-control-expose-headers': 'ETag' };
  await context.route('https://api.github.com/**', async route => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const h = req.headers();
    const headers = { Authorization: h['authorization'] };
    if (h['if-none-match']) headers['If-None-Match'] = h['if-none-match'];
    let r;
    try {
      r = await gh.fetch(req.url(), { method: req.method(), headers, body: req.postData() });
    } catch (e) {
      return route.abort('internetdisconnected');
    }
    const etag = r.headers.get('ETag');
    const out = { ...cors, 'content-type': 'application/json' };
    if (etag) out.etag = etag;
    if (r.status === 304) return route.fulfill({ status: 304, headers: out });
    let body = '';
    try { body = JSON.stringify(await r.json()); } catch (e) { body = ''; }
    return route.fulfill({ status: r.status, headers: out, body });
  });
  return gh;
}

export async function connect(page, { owner = 'shitij', repo = 'brew-data', token = 'good' } = {}) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.fill('#gh-owner', owner);
  await page.fill('#gh-repo', repo);
  await page.fill('#gh-token', token);
  await Promise.all([page.waitForEvent('load'), page.click('#gh-connect')]);
}

export async function syncedLine(page) {
  await page.click('#open-log');
  return page.innerText('#log-sync');
}

export async function noOverflow(page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
}
