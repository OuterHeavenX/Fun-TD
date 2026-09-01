/* Guards on the campaign-wide difficulty curve.
 *
 * Two mistakes were made deriving it, and both are cheap to assert against:
 * comparing Sector 01's armour-adjusted health to the others' raw health, and
 * re-fitting a sector on top of a curve it had already been given.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extract } from '../tools/curve-fit.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const FILES = { 1: 'runtime.js', 2: 'sector2.js', 3: 'sector3.js', 4: 'sector4.js', 5: 'sector5.js', 6: 'sector6.js' };
const LATER = [2, 3, 4, 5, 6];

const groupsOf = w => w.groups || w;
const scaleOf = m => (m.BAL
  ? i => 1 + i * m.BAL.hpScaleLinear + i * i * m.BAL.hpScaleQuadratic
  : m.hpScale || (() => 1));

function shape(sector) {
  const m = extract(FILES[sector]);
  const scale = scaleOf(m);
  const hp = m.WAVES.map((w, i) => groupsOf(w).reduce((t, g) => {
    const e = m.ENEMIES[g.type];
    return t + g.count * (e.noScale ? e.hp : e.hp * scale(i));
  }, 0));
  const counts = m.WAVES.map(w => groupsOf(w).reduce((n, g) => n + g.count, 0));
  const n = hp.length - 1;
  return {
    counts, hp,
    countRamp: counts[n] / counts[0],
    perEnemyRamp: (hp[n] / counts[n]) / (hp[0] / counts[0]),
    peak: Math.max(...counts)
  };
}

test('difficulty comes from tougher units, not just bigger crowds', () => {
  for (const sector of [1, ...LATER]) {
    const s = shape(sector);
    // This is the defect the whole exercise was about: a per-enemy ramp near 1
    // means a wave-20 unit is no tougher than a wave-1 one.
    assert.ok(s.perEnemyRamp > 10,
      `sector ${sector} per-enemy ramp is only ${s.perEnemyRamp.toFixed(1)}x`);
    assert.ok(s.perEnemyRamp > s.countRamp,
      `sector ${sector} still leans on crowd size (${s.countRamp.toFixed(1)}x) over toughness`);
  }
});

test('no wave fields an unreadable crowd', () => {
  for (const sector of [1, ...LATER]) {
    const s = shape(sector);
    assert.ok(s.peak <= 80, `sector ${sector} peaks at ${s.peak} units in one wave`);
  }
});

test('every sector keeps a real opening wave', () => {
  for (const sector of [1, ...LATER]) {
    const s = shape(sector);
    assert.ok(s.counts[0] >= 8,
      `sector ${sector} opens with only ${s.counts[0]} units`);
  }
});

test('the campaign gets harder from one sector to the next', () => {
  const finals = [1, ...LATER].map(s => shape(s).hp[19]);
  for (let i = 2; i < finals.length; i++) {
    assert.ok(finals[i] > finals[i - 1] * 0.9,
      `sector ${LATER[i - 1]} is easier than the sector before it`);
  }
});

test('the later sectors have no armour, so must not be tuned as if they did', () => {
  // Sector 01 is the only sector whose enemies carry armour and whose towers
  // pierce it. Targeting the others against its armour-adjusted health asked
  // them to field far more actual health, and its late waves ground to a halt.
  const ref = extract(FILES[1]);
  assert.ok(Object.values(ref.ENEMIES).some(e => e.armor > 0));
  assert.ok(Object.values(ref.TOWERS).some(t => t.pierce > 0));
  for (const sector of LATER) {
    const m = extract(FILES[sector]);
    const armoured = Object.values(m.ENEMIES).some(e => e.armor > 0);
    const pierces = Object.values(m.TOWERS).some(t => t.pierce > 0);
    assert.equal(armoured, pierces,
      `sector ${sector} has armour without pierce (or the reverse), which no tower can answer`);
  }
});

test('each later sector carries exactly one fitted curve', () => {
  for (const sector of LATER) {
    const src = read('src/' + FILES[sector]);
    assert.equal((src.match(/\/\* counts fitted \*\//g) || []).length, 1,
      `sector ${sector} has been fitted more than once, which compounds`);
    assert.equal((src.match(/WAVE_HP=waveHpScale/g) || []).length, 1);
    assert.ok(src.includes('this.noScale?1:WAVE_HP'),
      `sector ${sector} does not apply the wave curve to its enemies`);
  }
});

test('the boss is exempt from the wave curve', () => {
  for (const sector of LATER) {
    const m = extract(FILES[sector]);
    assert.ok(m.ENEMIES.boss.noScale,
      `sector ${sector} scales its boss on top of its authored health`);
    assert.ok(m.ENEMIES.boss.hp > 5000, `sector ${sector} boss is too soft to end a campaign`);
  }
});
