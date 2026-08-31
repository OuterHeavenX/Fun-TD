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

`npm test` — 41 deterministic tests covering pad placement against the route, the
difficulty ramp, wave readability, upgrade pricing, refunds, armour and pierce, tower
role separation, targeting modes, path interpolation, save migration, 250-enemy spatial
indexing and duplicate-loop prevention, plus scripted-player runs asserting that a
competent player clears the sector and that no wave grinds on after it stops spawning.

Development mode is available through query parameters: `?sector=2`…`?sector=6` for the
later sectors, `?endless=1` for endless defence, `?challenge=rush|budget|fragile` for
modifiers.

### Validation record (2026-08-31)

Driven in headless Chromium at 430×932 (phone) and 1440×900 (desktop), against a local
static server.

- `npm test`: 32/32 passing. Six of these were failing on `main` before this work — they
  asserted against the unused `src/data` stubs and have been repointed at the live model.
- Sector 01 boots, loads all 42 sprites, and plays: all four tower families build,
  upgrade, retarget and sell; 13 waves played through in one session; 334 kills recorded.
  No console errors and no failed requests.
- **Defeat**: building nothing overruns the base and raises the flow overlay
  (`BASE OVERRUN`, retry actions present).
- **Victory**: the Sand Titan spawns at 12,000 HP, dies to a maxed line in 8.5s at 3×,
  and the flow overlay reports `DUSTWALL HELD`, a ★★★ medal, and unlocks Frostline Pass.
  `funTD_sector1Clear` and `funTD_sector1Stars` persist.
- **Per-tower accounting**: each family fought waves 1–4 alone and was credited exactly
  62 kills and 3,352 damage — the authored enemy count and total health for those waves.
- **Load**: 260 enemies queued to arrive almost at once against 12 maxed towers holds a
  16.7ms median and 16.8ms p95 frame time (60fps) with 220 units alive.
- Sectors 02–06 and endless mode all boot clean, load all 46 sprites, and play a wave
  with towers built. Sectors 02–05 pick up the full themed treatment; 06 gets towers,
  enemies, core and pads over its own background.
- Splitting Sector 05's `draw()` into overridable methods was verified as a pure
  refactor: with the sprite manifest blocked, a pinned scene of 6 towers and all 6 enemy
  types renders to a byte-identical PNG and pixel hash before and after the change. The
  same check covers the Sector 04 and 06 pad hooks.
- `npm run balance`: effective health ramps 460 (wave 1) → 91,795 (wave 20); every wave
  resolves inside 62s for the scripted optimal player.
- **Load, later sectors**: the largest authored wave rendered with no towers so the whole
  crowd stays on screen holds a 16.7ms median frame time (60fps) in sectors 02, 03, 04
  and 06 at 59–66 concurrent sprite-drawn enemies.

Not done: testing on physical phone hardware, and a full unassisted 20-wave human
playthrough.

### Where the campaign's difficulty comes from

`npm run audit` reads every sector's wave table and separates the two ways a
tower-defense campaign can get harder — more enemies, or tougher ones:

| Sector | wave 1 → final HP | from crowd size | from tougher units | peak wave |
| --- | --- | --- | --- | --- |
| 01 Dustwall | 199× | 3.8× | **52×** | 58 |
| 02 Frostline | 24× | 10.4× | 2.3× | 161 |
| 03 Ashfall | 26× | 10.5× | 2.4× | 160 |
| 04 Black Tide | 23× | 10.5× | 2.2× | 162 |
| 05 Nightfall | 22× | 7.7× | 2.8× | 160 |
| 06 Null Fortress | 22× | 6.9× | 3.1× | 149 |

Sectors 02–06 lean on crowd size, peaking at roughly 160 units in a single wave.
That is a legitimate design for a swarm defence and it renders at 60fps, so it has
been measured and left alone rather than rewritten to match Sector 01's shape —
their per-enemy ramp of 2.2–3.1× means units *do* get tougher, which is the defect
Sector 01 actually had (its ramp was 1.0×, a wave-20 grunt had wave-1 health).

## Known limitations

- The scripted optimal and average players both finish Sector 01 at full health; only the
  unpractised tier takes real damage. That suits an opening campaign sector, but the
  spread is narrower than it should be for the later ones, which have not been retuned.
- Only Sector 01 has been rebalanced. Sectors 02–06 keep their original numbers and are
  still balanced by `loader.js` regex patching.
- Sector 06 keeps its own background: it paints the world inline with no method to
  replace, so it takes the sprite towers, enemies, core and pads but not the themed
  terrain.
- Audio is synthesised at runtime; there is no authored music.

## Assets and licensing

No external art, fonts, music or sound files are used. The sprite set in `assets/sprites`
is rendered from the procedural Blender script in this repository; remaining visuals are
Canvas shapes and effects, and audio is synthesised with Web Audio. Source is MIT licensed.
