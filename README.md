# Brew

A personal French press companion: recipes for Black, Hoffmann, Iced and Vietnamese, a guided timer, scoring,
pack tracking, caffeine, freshness charts and a To try list of coffees.

It is an installable web app (a PWA). Once installed it runs full screen with no browser bar, works offline,
and keeps every brew in a private GitHub repository as plain JSON.

- App: https://shitijdutta.github.io/brew/
- Data: [ShitijDutta/brew-data](https://github.com/ShitijDutta/brew-data) (private)

## Install on Android

1. Open https://shitijdutta.github.io/brew/ in Chrome.
2. Menu (⋮) → **Install app** (on some phones: **Add to Home screen** → **Install**).
3. Open **Brew** from the home screen, not from the Chrome tab.

## Connect your data

The app syncs through a GitHub token that only works for `brew-data` and is stored only on the phone.

1. GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → **Generate new token**.
2. Name `Brew phone`, expiration as long as you like (it can be renewed).
3. Repository access: **Only select repositories** → `brew-data`.
4. Permissions → Repository permissions → **Contents: Read and write**. Nothing else.
5. Generate, copy, and paste it in the app under **Settings → GitHub sync** with username `ShitijDutta` and repository `brew-data`.

Each saved brew becomes a commit in `brew-data`, so there is full history and nothing is ever silently overwritten.
Without a connection the app still works and keeps everything on the phone.

## How sync works

- `coffee.json` holds packs, locations, caffeine extras and the To try list; `brews/YYYY-MM.json` holds that month's brews keyed by id.
- Every record carries `rev` (a millisecond timestamp). The newer revision wins, per brew and for `coffee.json`.
- The app reads on start, when it comes back to the foreground, when the connection returns, and every minute while open.
  Unchanged files cost nothing (conditional requests).
- Saves are batched per file and retried on conflicts. Brews made offline wait on the phone and go up when the connection is back.
- The first time a phone connects, the repository's packs, places and To try list win over the phone's defaults.

## Develop

```sh
npm install
npm run dev          # local server with live reload
npm test             # unit tests for the sync engine (fake GitHub)
npm run test:e2e     # the real app in a Pixel 7-sized Chromium against a fake GitHub seeded with real data
npm run build        # production build in dist/
npm run deploy       # build and publish dist/ to the gh-pages branch
```

Layout:

```
index.html              screens and markup
src/app.js              the app: recipes, timer, review, log, packs, To try, sync logic
src/settings.js         Settings screen: GitHub connection, theme, backup
src/sync/github.js      GitHub contents-API storage with the same small API the app was written against
src/styles.css
public/                 manifest and icons
vite.config.js          build, plus the generated service worker (offline cache)
scripts/                deploy, and the one-off import from the old Claude artifact
tests/unit, tests/e2e
```

Ideas and next steps live in [ROADMAP.md](ROADMAP.md).
