/* Parameter sweep over the Sector 01 balance block.
 *
 * Patches the data source in memory, re-runs the scripted-player simulation for
 * each candidate, and scores it against three targets at once.
 *
 * Tuning against a single optimal bot is misleading: it never mis-clicks, so it
 * clears almost any curve and reports "too easy" everywhere.  What the campaign
 * actually needs is a *spread* — mastery earns three stars, competent play earns
 * two, and a player who has not found the pattern yet is in real danger — plus
 * waves that resolve promptly.  A wave the player survives but that takes two
 * minutes to grind out is a balance failure, so duration is scored explicitly.
 *
 *   node tools/tune.js
 *   node tools/tune.js --top 20
 */
import fs from 'node:fs';
import { loadModel, run, SKILLS } from './balance-sim.js';

const SRC = fs.readFileSync(new URL('../src/runtime.js', import.meta.url), 'utf8');
const TOP = process.argv.includes('--top') ? +process.argv[process.argv.indexOf('--top') + 1] : 12;

function patched(overrides) {
  let s = SRC;
  for (const [find, replace] of overrides) {
    if (!s.includes(find)) throw new Error('tune: pattern not found -> ' + find);
    s = s.replace(find, replace);
  }
  return loadModel(s);
}

function measure(model, skill) {
  const { rows, state } = run({ model, skill });
  const drag = Math.max(...rows.map(r => r.seconds - r.spawnS));
  return {
    waves: rows.length,
    hp: Math.max(0, state.hp),
    leaks: rows.reduce((n, r) => n + r.leaks, 0),
    spare: state.gold,
    drag: +drag.toFixed(1),
    worst: Math.max(...rows.map(r => r.seconds))
  };
}

const band = (v, lo, hi, weight = 1) => (v < lo ? lo - v : v > hi ? v - hi : 0) * weight;

function score(model) {
  const o = measure(model, SKILLS.optimal);
  const a = measure(model, SKILLS.average);
  const w = measure(model, SKILLS.weak);
  if (o.waves < 20) return { bad: true, why: `optimal lost at ${o.waves}`, o, a, w };

  const cost =
    // Mastery should clear it nearly untouched, but not trivially.
    band(o.hp, 88, 100, 1.0) +
    // Competent play lands in the two-star band.
    band(a.hp, 62, 90, 0.8) +
    // The unpractised player should be genuinely at risk.
    band(w.hp, 0, 58, 0.8) +
    // Waves must resolve close to their spawn window rather than grinding on.
    band(o.drag, 0, 16, 2.2) +
    band(a.drag, 0, 26, 1.0) +
    // Gold should still be a live decision at wave 20.
    band(o.spare, 0, 700, 0.03);
  return { bad: false, cost, o, a, w };
}

const candidates = [];
for (const quad of [0.020, 0.026, 0.032, 0.038])
  for (const gold of [380, 440, 500])
    for (const reward of [0.015, 0.03])
      for (const [bonusBase, bonusStep] of [[40, 6], [55, 9]])
        for (const upgrade of ['[0, 1.3, 2.6, 5.0]', '[0, 1.6, 3.4, 6.8]'])
          candidates.push({ quad, gold, reward, bonusBase, bonusStep, upgrade });

const results = [];
for (const c of candidates) {
  const model = patched([
    ['hpScaleQuadratic: 0.038', `hpScaleQuadratic: ${c.quad}`],
    ['startGold: 480', `startGold: ${c.gold}`],
    ['rewardScalePerWave: 0.03', `rewardScalePerWave: ${c.reward}`],
    ['upgradeMul: [0, 1.3, 2.6, 5.0]', `upgradeMul: ${c.upgrade}`],
    ['bonus: 55 + i * 9', `bonus: ${c.bonusBase} + i * ${c.bonusStep}`]
  ]);
  results.push({ ...c, ...score(model) });
}

const ok = results.filter(r => !r.bad).sort((a, b) => a.cost - b.cost);
console.table(ok.slice(0, TOP).map(r => ({
  quad: r.quad, gold: r.gold, reward: r.reward,
  bonus: `${r.bonusBase}+${r.bonusStep}i`, upgrade: r.upgrade,
  optHp: r.o.hp, avgHp: r.a.hp, weakHp: r.w.hp, weakWave: r.w.waves,
  optDrag: r.o.drag, optWorst: r.o.worst, spare: r.o.spare,
  cost: +r.cost.toFixed(1)
})));
console.log(`${ok.length} viable / ${results.length} tried`);
