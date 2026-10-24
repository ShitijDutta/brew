# Roadmap

Ideas collected while using the app, loosely inspired by Beanconqueror and other brew loggers.
Roughly in the order they would help.

## Next

- **Grinder settings.** When the K6 arrives: grinder profiles, click setting saved with each brew and pack,
  "last good setting for this bean" shown before brewing.
- **Vietnamese sweetness.** Condensed milk as a setting (grams or a sweetness level) instead of a fixed share.
- **Scale over Bluetooth.** Chrome on Android supports Web Bluetooth; live weight during the pour and decant
  would replace typing grams.
- **Home screen shortcuts.** Long-press the icon for *Start a brew* and *Score last brew* (manifest shortcuts).

## Done

- Something new: nine occasional drinks (milk with a frother, tonic, coconut, orange, shaken, affogato), apart from the daily
  recipes (Oct 2026).

- Cold brew recipe; Iced settles like Black; optional 'poured a different amount' that rescales the next steps; timers
  count past zero (Oct 2026).

- Brew screen: one-line steps with tips under More, prep timed to when it is needed, a This brew panel with the run's
  numbers and steps, and an RO + Vedica / other ice switch recorded with iced brews (Oct 2026).
- People: separate packs, places, To try lists and logs; shared carafes scored by each person (Oct 2026).
- Paper filter option per recipe: rinse during the settle, pour through the paper, drain, no jug settle; brews tagged and
  compared against mesh only (Oct 2026).

## Brewing

- More methods with their own timers: Hario Switch, V60, AeroPress, moka pot.
- Water recipes as profiles (RO plus a Vedica share today; TDS later if a meter shows up).
- Per-recipe defaults by location kept in sync, so Delhi and Bangalore each remember their own numbers.

## Beans

- A bean library separate from packs: roaster, origin, estate, process, variety, roast level, tasting notes.
  Packs become purchases of a bean, so reordering the same coffee keeps its history together.
- Bag photo per pack, stored compressed in the data repository.
- Cost per cup from the pack price.

## Insight

- Shared carafes: both scores side by side, and where your tastes differ.
- Score against ratio, water temperature, contact time and days off roast, per bean.
- "What changed" between your best and worst cup of the same bean.
- Weekly caffeine and timing summary against the sleep target.

## Quality of life

- CSV export alongside the JSON backup.
- Share a brew as an image card.
- Gentle reminders when an open pack is getting old or nearly finished.

## Housekeeping

- Renew the GitHub token before it expires (Settings shows an error the day it stops working).
- Keep `npm test` and `npm run test:e2e` green before every deploy.
