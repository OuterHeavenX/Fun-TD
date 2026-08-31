/* Opening-minutes guarantees, asserted against the shipping Sector 01 model
 * rather than the unused src/data stubs those numbers used to live in. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModel } from '../tools/balance-sim.js';

const M = loadModel();

test('direct fire decisively outruns the fastest enemy', () => {
  const fastest = Math.max(...Object.values(M.ENEMIES).map(e => e.speed));
  for (const type of ['gun', 'frost']) {
    const t = M.TOWERS[type];
    assert.ok(t.projectile > fastest * 5, `${type} shells barely outpace the swarm`);
    // Worst case is a target sprinting directly away at the edge of range.
    const intercept = t.range / (t.projectile - fastest);
    assert.ok(intercept < 0.25, `${type} takes ${intercept.toFixed(2)}s to connect`);
  }
});

test('battlefield movement stays readable at normal speed', () => {
  // Crossing the whole route should take long enough to react to.
  const route = M.pathLength();
  for (const [name, e] of Object.entries(M.ENEMIES)) {
    const seconds = route / e.speed;
    assert.ok(seconds > 12, `${name} crosses the map in ${seconds.toFixed(1)}s`);
  }
  assert.ok(M.ENEMIES.scout.speed > M.ENEMIES.grunt.speed);
  assert.ok(M.ENEMIES.boss.speed < M.ENEMIES.grunt.speed);
});

test('the opening is affordable without being a free ride', () => {
  const cheapest = Math.min(...Object.values(M.TOWERS).map(t => t.cost));
  const affordable = Math.floor(M.BAL.startGold / cheapest);
  assert.ok(affordable >= 3, 'the player must be able to open with a real line');
  assert.ok(affordable < M.MAP.pads.length, 'starting gold must not fill every pad');
});

test('wave one is survivable with the opening budget', () => {
  const opening = Math.floor(M.BAL.startGold / M.TOWERS.gun.cost) * M.dpsOf('gun', 1, 0);
  // Even at a fraction of theoretical uptime the opening wave must be clearable.
  assert.ok(opening * 0.35 * M.waveSpawnSeconds(0) > M.waveEffectiveHp(0));
});
