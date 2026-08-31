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
of the base and keep the perspective honest.

```bash
npm run sprites     # needs Blender on PATH; writes assets/sprites/ + manifest.json
```

Each part is framed individually and records its own pixels-per-unit in the manifest,
so the runtime places any sprite correctly without special-casing it. `src/dustwall-art.js`
consumes the set and falls back to the runtime's own procedural drawing if the manifest
or any image fails to load. Static scenery is painted once into an offscreen canvas
rather than every frame.

## Balance tooling

```bash
npm run balance     # per-wave table for a scripted player
npm run tune        # parameter sweep scored against three skill tiers
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

`npm test` — 32 deterministic tests covering pad placement against the route, the
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
- Sectors 02, 04, 06 and endless mode all boot clean against the shared HUD rewrite.
- `npm run balance`: effective health ramps 460 (wave 1) → 91,795 (wave 20); every wave
  resolves inside 62s for the scripted optimal player.

Not done: testing on physical phone hardware, and a full unassisted 20-wave human
playthrough.

## Known limitations

- The scripted optimal and average players both finish Sector 01 at full health; only the
  unpractised tier takes real damage. That suits an opening campaign sector, but the
  spread is narrower than it should be for the later ones, which have not been retuned.
- Sectors 02–06 keep the old three-tower balance and are still balanced by `loader.js`
  regex patching.
- Audio is synthesised at runtime; there is no authored music.

## Assets and licensing

No external art, fonts, music or sound files are used. The sprite set in `assets/sprites`
is rendered from the procedural Blender script in this repository; remaining visuals are
Canvas shapes and effects, and audio is synthesised with Web Audio. Source is MIT licensed.
