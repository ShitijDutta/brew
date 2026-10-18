# Notes for working on Brew

- Vanilla JS + Vite, no framework. `src/app.js` is the original app ported as one module; keep its style (ES5-ish, compact).
- The app talks to storage only through the small db API in `src/sync/github.js`
  (`doc().set/onSnapshot`, `collection().doc().set/delete`, `collection().onSnapshot`). Keep that contract.
- Never trust a read over this device's own recent write (see `isReplaced` / `wroteRecently`): the app deletes
  brews it had synced that the repository no longer has.
- Data lives in the private repo `ShitijDutta/brew-data`. Its CLAUDE.md has the editing rules (bump `rev`).
- Before deploying: `npm test && npm run test:e2e`. If port 4173 is busy, stop the old `vite preview` first.
- Deploy with `npm run deploy` (pushes `dist/` to `gh-pages`; GitHub Pages serves it at https://shitijdutta.github.io/brew/).
  Installed copies pick up the new version the next time they open.
- Phone UI rules learned the hard way: native inputs are fine in the installed app; never let anything make the page
  wider than the screen; don't rebuild DOM under a finger (update chips in place, defer repaints with `whenIdle`).
