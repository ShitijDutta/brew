# Notes for working on Brew

- Vanilla JS + Vite, no framework. `src/app.js` is the original app ported as one module; keep its style (ES5-ish, compact).
- The app talks to storage only through the small db API in `src/sync/github.js`
  (`doc().set/onSnapshot`, `collection().doc().set/delete`, `collection().onSnapshot`). Keep that contract.
- Never trust a read over this device's own recent write (see `isReplaced` / `wroteRecently`): the app deletes
  brews it had synced that the repository no longer has.
- Data lives in the private repo `ShitijDutta/brew-data`. Its CLAUDE.md has the editing rules (bump `rev`).
- People: `people.json` lists them; the root person keeps the root folder and local keys without a suffix, others use
  `people/<id>/` and local keys ending `@<id>`. The app runs as one person at a time (`window.__who`); switching reloads.
  Other people's brews are read-only (`window.__others`). A shared carafe is the brewer's brew with `with: [ids]`, plus a
  "cup" in each drinker's own folder (`ref: {who, id}`, same id as the brew; `skipped: true` when they had none).
- Brew steps (`buildSteps`): `d` is one line of what to do with the numbers; reasons and tips go in `more` (folded);
  prep goes in `w` on the step whose timer it runs under, with `at` = seconds left when it is due. Shitij asked for no long text mid-brew.
- Before deploying: `npm test && npm run test:e2e`. If port 4173 is busy, stop the old `vite preview` first.
- Deploy with `npm run deploy` (pushes `dist/` to `gh-pages`; GitHub Pages serves it at https://shitijdutta.github.io/brew/).
  Installed copies pick up the new version the next time they open.
- Phone UI rules learned the hard way: native inputs are fine in the installed app; never let anything make the page
  wider than the screen; don't rebuild DOM under a finger (update chips in place, defer repaints with `whenIdle`).
