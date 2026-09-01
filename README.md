# FUN TD

FUN TD is a zero-build, Canvas 2D tower-defense game. Sector 01 — Dustwall Defense —
pits four upgradeable tower families against twenty data-driven waves ending on the
Sand Titan.

## Play

Open the GitHub Pages URL, press **Defend the Base**, tap a hexagonal build pad and
choose a tower. Tap a built tower to upgrade it, change what it shoots first, or sell
it back. Hold the command core through wave 20.

Mouse and touch share the same pointer input. Keyboard: `1`–`4` build on the selected
pad, `U` upgrade, `S` sell, `T` targeting, `Space` start wave or pause, `P` pause,
`F` speed, `M` mute, `?` help, `Esc` close.

## Towers

| Tower | Cost | Role |
| --- | --- | --- |
| **Gun Tower** | 110 | Rapid single-target fire. The backbone of every line. |
| **Frost Coil** | 170 | Low damage, but the slow buys every other tower time. |
| **Siege Mortar** | 240 | Lobs shells at a predicted spot. Splash, and it shreds armour. |
| **Arc Spire** | 300 | Lightning chains between packed enemies. Poor against a lone target. |

Each has four levels. Damage, fire rate and range all improve; the tower panel shows
`current → next` so an upgrade argues for itself. Selling returns 72% of what went in.

## Enemies

Grunt, Scout, Armoured, Heavy and the Sand Titan differ in health, speed, **armour**,
reward and breach damage. Armour is flat damage reduction that a tower's **pierce**
cancels part of — which is the whole reason to mix mortars and arc spires into a wall
of gun towers. Enemy health scales quadratically with the wave number, so a grunt in
wave 19 is a real threat rather than the same 46 HP it had in wave 1.

## Art pipeline

Every tower, enemy, prop and the command core is modelled procedurally in Blender by
`tools/blender/build_sprites.py` and rendered straight down through an orthographic
camera with Freestyle outlines. Towers render as two parts — a static base and a
turret pivoting about the image centre — so the 2D game can rotate the turret on top
of the base and keep the perspective honest. 46 parts in total: four tower families ×
four levels × two halves, nine enemy types, the command core and four props.

```bash
npm run sprites     # needs Blender on PATH; writes assets/sprites/ + manifest.json
```

Each part is framed individually and records its own pixels-per-unit in the manifest,
so the runtime places any sprite correctly without special-casing it.

`src/art/sprite-pack.js` loads the set once and is shared by the whole campaign. It
carries a terrain palette per sector — dust, frost, ash, tide, night, void — and two
installers, because the sector runtimes were written at different times and disagree on
their draw signatures (`drawTower(ctx, tower)` in sectors 01–03, `drawTower(tower)` with
the context on the instance in 04, 05 and 06). Sector 01 keeps `src/dustwall-art.js` for
its hand-placed scenery; `src/sector-art.js` drives the rest off the route the loader
exposes, so adding art to a sector needs no per-sector art code.

Every sector now takes the sprite towers, enemies, core and build pads. Sectors 01–05
also take the themed terrain and route; Sector 06 keeps its own background, which it
paints inline with no method to replace. Sectors 04 and 06 draw their pads inside a
loop rather than a method, so they defer to the pack through a one-line presence check
that is inert when the pack has not installed.

Nothing is required: if the manifest or any image fails to load, no installer runs and
every sector keeps its own procedural drawing. Static terrain is painted once into an
offscreen canvas rather than every frame.

## Balance tooling

```bash
npm run balance     # per-wave table for a scripted player (Sector 01)
npm run tune        # parameter sweep scored against three skill tiers
npm run audit       # difficulty-curve shape across all six sectors
npm run fit         # solve the later sectors' curve from their own capacity
```

`tools/balance-sim.js` lifts the balance data straight out of `src/runtime.js` — the
block between the `FUN-TD-DATA` sentinels — and re-implements the same combat maths, so
the curve it reports is the curve the game ships. There is no second copy to drift.

It runs three scripted players. Tuning against a single optimal bot is misleading: it
never mis-clicks, so it clears almost any curve and reports "too easy" for every
setting. What matters is the *spread* across skill tiers, and that waves resolve
promptly — a wave the player survives but that grinds on for two minutes is a balance
failure, so duration is scored explicitly.

## Architecture

`src/runtime.js` is Sector 01: a single plain script (no imports — `loader.js` injects
the source text) holding the data block, entities and the game loop. It reads
`window.FUN_TD_META` directly to apply persistent War Room research, rather than having
its numbers rewritten by `loader.js` string patching the way sectors 02–06 still are.
That patching silently stops applying the moment the numbers it matches on change.

`src/dustwall-art.js` decorates the running game by replacing its draw methods.
`styles/ui.css` settles the interface on top of the older sector stylesheets.

`src/data`, `src/core`, `src/combat` and friends are an earlier module tree the shipping
game does not load. `SpatialGrid`, `TargetingSystem`, `GameLoop`, `SaveManager` and
`Path` still carry their own tests; the data stubs beside them are stale and are no
longer asserted against.

## Local launch

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080`. No installation, build, API key or backend required
to play; Node is needed only for the tests and Blender only to regenerate art.

## Tests

`npm test` — 65 deterministic tests covering pad placement against the route, the
difficulty ramp, wave readability, upgrade pricing, refunds, armour and pierce, tower
role separation, targeting modes, path interpolation, save migration, 250-enemy spatial
indexing and duplicate-loop prevention, plus scripted-player runs asserting that a
competent player clears the sector and that no wave grinds on after it stops spawning.

Development mode is available through query parameters: `?sector=2`…`?sector=6` for the
later sectors, `?endless=1` for endless defence, `?challenge=rush|budget|fragile` for
modifiers.

### Validation record (2026-09-01)

Driven in headless Chromium at 430×932 (phone) and 1440×900 (desktop), against a local
static server.

- `npm test`: 65/65 passing.
- All six sectors and endless mode boot clean, load all 46 sprites, and play with towers
  built. Sectors 01–05 take the full themed treatment; 06 takes everything but its
  background, which it paints inline.
- **Research plumbing**: every sector's effective tower stats, enemy speeds, starting gold
  and base health captured in the browser under a heavy research load plus a challenge
  modifier, before and after moving off `loader.js` string patching. Sectors 02, 03, 05
  and 06 came out bit-identical; Sector 04 changed only in the intended direction, its
  gun damage moving 20.7 → 23.184 to match what the other five already had.
- **Refactor safety**: splitting Sector 05's `draw()` and Sector 06's world painting into
  overridable methods was verified pixel-identical — same PNG byte count and pixel hash
  with the sprite manifest blocked — as were the Sector 04/06 pad hooks.
- **Wave length**: every sector probed against a fully maxed line, at 3× speed. Waves 19
  and 20 are the ones worth reading:

  | Sector | wave 19 | wave 20 | leaked at wave 20 |
  | --- | --- | --- | --- |
  | 01 Dustwall | 13.1s | 16.1s | none |
  | 02 Frostline | 16.5s | 30.0s | 10 |
  | 03 Ashfall | 19.6s | 34.4s | 10 |
  | 04 Black Tide | 17.8s | 32.4s | 19 |
  | 05 Nightfall | 15.2s | 20.8s | none |
  | 06 Null Fortress | 18.4s | 31.1s | 42 |

  Every finale still costs a maxed line something, which is the intent. Sector 06 is the
  hardest wave in the game, which suits the final assault — and that figure is with only
  9 of its 12 pads built.

  Worth recording how that table was got wrong first: the probe drove each sector's own
  build and upgrade methods, and sectors 05 and 06 have neither — both live inside their
  menu handlers, and the upgrade one is called `upMenu`, which the probe did not know
  about. Those two were therefore measured with **level-1 towers** and looked disastrous
  (wave 20 at 49s and 52s, leaking 46 and 132). That was the measurement, not the game.
- **Load**: 60fps median in all six sectors, including with effects saturated to their
  420-effect cap, and at 220 concurrent enemies in Sector 01.

Not done: physical phone hardware, and a full unassisted human playthrough of any sector.

## Known limitations

- The scripted optimal and average players both finish Sector 01 at full health; only the
  unpractised tier takes real damage. That suits an opening campaign sector, but the
  spread is narrower than it should be for the later ones, which have not been retuned.
- The later sectors are tuned against Sector 01's verified curve and played through
  headlessly, but they have no scripted-player simulator of their own the way Sector 01
  does, so their economies are less rigorously checked than its is.
- Sector 06 keeps its own background: it paints the world inline with no method to
  replace, so it takes the sprite towers, enemies, core and pads but not the themed
  terrain.
- Audio is synthesised at runtime; there is no authored music.

## Assets and licensing

No external art, fonts, music or sound files are used. The sprite set in `assets/sprites`
is rendered from the procedural Blender script in this repository; remaining visuals are
Canvas shapes and effects, and audio is synthesised with Web Audio. Source is MIT licensed.
