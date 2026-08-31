/* Campaign structure, asserted against the shipping Sector 01 wave table. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModel } from '../tools/balance-sim.js';

const M = loadModel();
const count = w => M.countWave(w);

test('the campaign is twenty waves ending on the boss', () => {
  assert.equal(M.WAVES.length, 20);
  assert.equal(M.WAVES[19].groups[0].type, 'boss');
  assert.equal(Object.values(M.WAVES).filter(w => w.groups.some(g => g.type === 'boss')).length, 1);
});

test('late campaign materially exceeds opening pressure', () => {
  // Difficulty now rides on per-enemy health, not on spawning ten times as many
  // bodies, so pressure is measured in effective HP rather than head count.
  assert.ok(M.waveEffectiveHp(17) > M.waveEffectiveHp(0) * 30);
  assert.ok(M.WAVES[19].bonus > M.WAVES[0].bonus);
  assert.ok(M.WAVES[19].flawless > M.WAVES[0].flawless);
});

test('waves four and five keep the early speed lesson readable', () => {
  assert.ok(count(3) <= 30);
  assert.ok(count(4) <= 46);
  assert.ok(M.WAVES[3].groups[0].interval >= 0.2);
});

test('waves six through ten form a controlled midgame ramp', () => {
  for (const w of [5, 6, 7, 8, 9]) assert.ok(count(w) <= 40, `wave ${w + 1} spawns ${count(w)}`);
  // The heavy brute must not gatecrash before the player can answer armour.
  assert.equal(M.WAVES[5].groups.some(g => g.type === 'heavy'), false);
});

test('every enemy type is introduced before it appears in bulk', () => {
  const firstSeen = {};
  M.WAVES.forEach((wave, i) => {
    for (const grp of wave.groups) if (firstSeen[grp.type] === undefined) firstSeen[grp.type] = { wave: i, count: grp.count };
  });
  for (const [type, seen] of Object.entries(firstSeen)) {
    // The boss is the finale, and the grunt is the baseline the player learns
    // the game on — both are meant to arrive in force the first time.
    if (type === 'boss' || type === 'grunt') continue;
    assert.ok(seen.count <= 6, `${type} debuts ${seen.count} at once in wave ${seen.wave + 1}`);
  }
});
