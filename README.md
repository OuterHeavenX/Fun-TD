# FUN TD

FUN TD is a zero-build, Canvas 2D tower-defense game. Dustwall Outpost pits four upgradeable tower families against twenty data-driven waves culminating in the multi-phase Dust Colossus.

## Play

Open the GitHub Pages URL, press **Defend Dustwall**, tap a hexagonal build pad, and choose a tower. Defeated enemies immediately award gold. Tap a built tower to upgrade, specialize at level 3, change targeting, or sell. Protect the core through wave 20.

Mouse and touch use the same pointer input. HUD buttons control pause, 1×/2×/3× speed, and sound. Tower targeting cycles through First, Last, Strongest, Weakest, and Closest.

## Towers

- **Bolt Bastion:** fast direct fire; Armor Piercing or Rapid Volley.
- **Blast Mortar:** slow splash fire; Incendiary or Cluster Bombs.
- **Frost Relay:** damage and slow; Deep Freeze or Wide Field.
- **Arc Spire:** lightning chains; Forked Current or Overcharge.

All towers have five visually and mechanically escalating levels. Upgrade prices are calculated from centralized multipliers, and selling returns 68% of total investment.

## Enemies

Runner, Raider, Bulwark, Splitter, Disruptor, Siege Beast, and the Dust Colossus use distinct health, speed, armor, resistance, reward, breach damage, and silhouettes. Splitters create two children, Disruptors slow nearby towers, and the boss breaks through three phases while shielding its army.

## Local launch

ES modules require an HTTP origin in many browsers. From this folder run:

```bash
python -m http.server 8080
```

Then open `http://localhost:8080`. No installation, build, API key, or backend is required.

## GitHub Pages

In repository Settings → Pages, choose **Deploy from a branch**, `main`, and `/ (root)`. The checked-in `index.html` is the static entry point.

## Architecture

`src/data` owns balance and campaign data. `world` owns route/build-pad/core models; `combat`, `enemies`, `towers`, `waves`, and `economy` own simulation concepts. `core/Game.js` coordinates without embedding data, while `Renderer` owns all procedural Canvas art. UI modules and DOM styles remain separate. This boundary permits later sprite-sheet replacement without rewriting combat.

## Save data

Versioned local storage records settings, tutorial completion, best results, lifetime totals, and tower usage. Version 1 migrates to version 2; unavailable or corrupt storage falls back safely.

## Performance strategy

The game uses one guarded `requestAnimationFrame` loop, fixed 60 Hz simulation, delta clamping, pooled enemies, bounded particles, high-DPI capping, ballistic projectile arrays, and page-hidden pausing. Rendering is resolution-independent and letterboxed without distortion.

## Assets and licensing

No external art, fonts, music, or sound files are used. Visuals are original procedural Canvas shapes and effects; audio is synthesized at runtime with Web Audio. Source is MIT licensed. Authored sprite sheets and richer music are pending production assets and must receive their own provenance records before addition.

## Tests

Run `npm test` (Node is needed only for tests). Deterministic tests cover upgrade prices, refunds, armor, path interpolation, target selection, wave structure, corrupt saves, save migration, 250-enemy spatial indexing, and duplicate-loop prevention across ten restart attempts.

Development mode is available only through a query parameter. Open `?dev=1` for the live performance panel, `?dev=stress` for a reproducible 250-enemy mixed swarm with ten maximum-level towers, or `?dev=wave4` through `?dev=wave20` to launch a selected wave with three level-2 Bolt Bastions. The panel reports FPS, frame time, active enemies, projectiles, particles, pool usage, and average target-query time.

Run `npm run balance` for a deterministic per-wave report of authored enemies, armor-adjusted effective health, available kill/completion gold, maximum breach damage, spawn duration, and pressure. It is an economy/content audit, not a substitute for human playtesting.

Manual QA checklist:

- Boot without console errors; start a run.
- Follow enemies around every route corner and confirm no wall crossing.
- Build/upgrade/branch/sell with pointer and touch; reject unaffordable actions.
- Exercise every targeting mode and tower family.
- Verify splitter children, slow expiry, disruptor effect, boss phase rewards/shields.
- Pause and change speed during cooldowns.
- Reach victory and defeat, then retry ten times and confirm one loop.
- Reload and confirm persisted settings; inject a corrupt save and confirm recovery.
- Inspect portrait and landscape layout without scrolling.
- Use a development stress scenario to observe 250 active enemies.

### Validation record (2026-08-30)

- `npm test`: 11/11 passing (economy, armor, path, targeting, wave data/pressure, save recovery/migration, 250-enemy spatial indexing, and duplicate-loop prevention).
- Codex in-app Chromium browser at `http://localhost:8765`: title and HUD loaded, run started, canvas pad opened the full build menu, Bolt Bastion purchase changed gold from 420 to 310, tower panel rendered, and combat continued with zero captured console warnings/errors.
- Development stress scenario in the available high-refresh Chromium session: started with 250 mixed enemies and ten level-5 towers; sampled at 163 surviving enemies, 5 projectiles, and 196 particles at approximately 7.8 ms/rendered frame with no captured warnings/errors. A separate paused sample held enemies/projectiles/particles/pool counts exactly constant for one second. This is desktop-browser evidence, not phone hardware evidence.
- `npm run balance`: wave 1 measured 1,047 armor-adjusted effective HP; wave 20 measured 41,740. Wave 19 is the highest burst-pressure wave, while wave 20 is the largest total-health encounter.
- Early-game rebalance browser check: wave 4 recorded 14 kills after seven seconds and wave 5 recorded four kills during its slower mixed opening; both retained 100% core health with no captured warnings/errors. Bolt worst-case runner intercept time is under 0.25 seconds.
- Midgame accessibility rebalance: the premature Siege Beast was removed from wave 6; waves 6–10 now use smaller, slower groups. Wave 6 pressure fell from 303 to 138 effective HP/second and its release window increased from 7.8 to 12.5 seconds.
- Combat-feel reset: enemy movement speeds were reduced by roughly one third, authored spawn timing is 55% slower, and each wave gains an additional setup second. Starting gold is 560, flawless bonuses are 35, and sell refunds are 72%. Bolt/Frost attacks now resolve instantly with short straight tracers; Mortars commit to fixed ground impact points and never home.
- Procedural enemies now use animated toy-soldier silhouettes with legs, torsos, heads, helmets, weapons, armor plates, and type-specific energy details instead of circle-only markers.
- Static campaign count: 1,246 authored spawns before Splitter children, exceeding the 150-kill target.
- Not executed: physical iPhone/Android/iPad testing, ten full manual retries, full 20-wave human playthrough, and hardware profiling at 250 simultaneous enemies.

## Known limitations

- The release uses procedural synthesized effects rather than authored music and sprite sheets.
- A specialized `game-dev` capture/performance CLI was unavailable during initial implementation, so hardware-phone FPS evidence is pending.
- The first release has one stage; stage selection and a formal debug overlay are future work.

## Roadmap

Authored animation/audio, additional maps, challenge modifiers, accessibility narration, formal spatial-hash targeting for extreme late-game content, and device-lab profiling.
