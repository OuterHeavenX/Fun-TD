/* Economy rules, asserted against the shipping Sector 01 model. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModel } from '../tools/balance-sim.js';

const M = loadModel();

test('upgrade prices escalate deterministically', () => {
  for (const type of Object.keys(M.TOWERS)) {
    const base = M.TOWERS[type].cost;
    let previous = 0;
    for (let level = 1; level < M.BAL.maxLevel; level++) {
      const cost = M.upgradeCost(type, level);
      assert.equal(cost, Math.round(M.BAL.upgradeMul[level] * base));
      assert.ok(cost > previous, 'each upgrade must cost more than the last');
      previous = cost;
    }
    assert.equal(M.upgradeCost(type, M.BAL.maxLevel), 0, 'a maxed tower has nothing to buy');
  }
});

test('refund is the configured percentage of what was invested', () => {
  assert.equal(Math.floor(100 * M.BAL.sellRate), Math.floor(100 * 0.72));
  for (const type of Object.keys(M.TOWERS)) {
    const invested = M.investedAt(type, M.BAL.maxLevel);
    const refund = Math.floor(invested * M.BAL.sellRate);
    assert.ok(refund < invested, 'selling must never be profitable');
    assert.ok(refund > invested * 0.5, 'selling must not feel punitive');
  }
});

test('armor and piercing', () => {
  assert.equal(M.damageAfterArmor(100, 0.4), 60);
  assert.equal(M.damageAfterArmor(100, 0.4, 0.2), 80);
});

test('a fresh build beats an upgrade on raw damage per gold', () => {
  // Pads are the scarce resource, so upgrades are allowed to be the expensive
  // option — but only while empty pads remain.
  for (const type of Object.keys(M.TOWERS)) {
    const fresh = M.dpsOf(type, 1, 0) / M.TOWERS[type].cost;
    const maxed = M.dpsOf(type, M.BAL.maxLevel, 0) / M.investedAt(type, M.BAL.maxLevel);
    assert.ok(fresh > maxed, `${type} upgrades are strictly better value than building`);
  }
});
