/* In-memory stand-in for the parts of the GitHub contents API the app uses. */
import { b64encode, b64decode } from '../../src/sync/github.js';

export function fakeGithub({ owner = 'me', repo = 'brew-data', token = 'good', isPrivate = true } = {}) {
  const files = new Map();        // path -> { text, sha }
  let shaN = 1;
  const log = [];
  const st = { offline: false, failNext: null, beforePut: null };
  const newSha = () => 'sha' + (shaN++);

  function listingFor(dir) {
    const out = [];
    const seenDirs = new Set();
    for (const [p, f] of files) {
      if (dir && p.indexOf(dir + '/') !== 0) continue;
      const rest = dir ? p.slice(dir.length + 1) : p;
      const i = rest.indexOf('/');
      if (i >= 0) {
        const d = (dir ? dir + '/' : '') + rest.slice(0, i);
        if (!seenDirs.has(d)) { seenDirs.add(d); out.push({ name: rest.slice(0, i), path: d, sha: 'tree-' + d, type: 'dir' }); }
      } else out.push({ name: rest, path: p, sha: f.sha, type: 'file' });
    }
    return out.sort((a, b) => a.path.localeCompare(b.path));
  }
  function etagOf(obj) { let h = 5381; const s = JSON.stringify(obj); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return '"' + h.toString(16) + '"'; }
  function res(status, body, headers = {}) {
    return {
      status,
      headers: { get: k => headers[k] || headers[k.toLowerCase()] || null },
      json: async () => { if (body === undefined) throw new Error('no body'); return body; }
    };
  }

  async function fetch(url, init = {}) {
    const method = (init.method || 'GET').toUpperCase();
    log.push(method + ' ' + url.replace('https://api.github.com/repos/' + owner + '/' + repo, ''));
    if (st.offline) throw new TypeError('Failed to fetch');
    if (st.failNext) { const f = st.failNext; st.failNext = null; return res(f, { message: 'boom' }); }
    const auth = (init.headers && init.headers.Authorization) || '';
    if (auth !== 'Bearer ' + token) return res(401, { message: 'Bad credentials' });
    const prefix = 'https://api.github.com/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo);
    if (url === prefix) return res(200, { full_name: owner + '/' + repo, private: isPrivate });
    if (url.indexOf(prefix + '/contents/') !== 0) return res(404, { message: 'Not Found' });
    const path = decodeURIComponent(url.slice((prefix + '/contents/').length));
    if (method === 'GET') {
      if (files.has(path)) {
        const f = files.get(path);
        return res(200, { type: 'file', path, sha: f.sha, content: b64encode(f.text).replace(/(.{60})/g, '$1\n') });
      }
      if (!files.size && path === '') return res(404, { message: 'This repository is empty.' });
      const items = listingFor(path);
      if (path !== '' && !items.length) return res(404, { message: 'Not Found' });
      const tag = etagOf(items);
      if (init.headers && init.headers['If-None-Match'] === tag) return res(304);
      return res(200, items, { ETag: tag });
    }
    if (method === 'PUT') {
      if (st.beforePut) { const fn = st.beforePut; st.beforePut = null; fn(path); }
      const body = JSON.parse(init.body);
      const cur = files.get(path);
      if (cur && !body.sha) return res(422, { message: '"sha" wasn\'t supplied.' });
      if (cur && body.sha !== cur.sha) return res(409, { message: path + ' does not match ' + body.sha });
      if (!cur && body.sha) return res(409, { message: 'sha given for a new file' });
      const text = b64decode(body.content);
      const sha = newSha();
      files.set(path, { text, sha });
      return res(cur ? 200 : 201, { content: { path, sha }, commit: { message: body.message } });
    }
    return res(405, { message: 'Method not allowed' });
  }

  return {
    fetch, log, st, files,
    put(path, obj) { files.set(path, { text: JSON.stringify(obj, null, 2) + '\n', sha: newSha() }); },
    putRaw(path, text) { files.set(path, { text, sha: newSha() }); },
    read(path) { const f = files.get(path); return f ? JSON.parse(f.text) : undefined; },
    text(path) { const f = files.get(path); return f ? f.text : undefined; }
  };
}

export function memoryStorage() {
  const m = new Map();
  return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
