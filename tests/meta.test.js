/* Guards for the War Room research plumbing.
 *
 * Research used to be applied by loader.js rewriting each sector's source with
 * regexes that matched literal values. That fails silently when a sector spells
 * a number differently — which had already happened in Sector 04 — so these
 * tests assert the string patching is gone and that every sector opts into the
 * shared module exactly once.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
const SECTORS = [2, 3, 4, 5, 6];

/* Load meta.js against a stub window so the pure logic can be exercised. */
function loadMeta(meta) {
  const win = { FUN_TD_META: meta };
  new Function('window', read('src/meta.js'))(win);
  return win;
}

test('loader.js no longer rewrites sector balance', () => {
  const loader = read('src/loader.js');
  for (const pattern of ['damage:18', 'rate:4\\.5', 'range:155', 'damage:55', 'splash:55',
                         'chains:3', 'chainRange:82', 'invested\\*\\.7', 'comboTimer=1\\.35']) {
    assert.ok(!loader.includes(pattern.replace(/\\\\/g, '')),
      `loader still patches ${pattern}`);
  }
  assert.ok(!/src\.replace\(\/damage/.test(loader), 'loader still has balance regexes');
});

test('every sector applies research exactly once', () => {
  for (const sector of SECTORS) {
    const src = read(`src/sector${sector}.js`);
    // Exactly one invocation. Applying twice would compound every multiplier,
    // so this is the assertion that matters, not merely that it is present.
    const calls = (src.match(/FUN_TD_APPLY_META\s*\(/g) || []).length;
    assert.equal(calls, 1, `sector ${sector} invokes applyMeta ${calls} times`);
    assert.ok(/window\.FUN_TD_APPLY_META&&window\.FUN_TD_APPLY_META\(/.test(src),
      `sector ${sector} must guard the call so a missing module cannot break boot`);
  }
});

test('no sector bakes research into its tower table any more', () => {
  for (const sector of SECTORS) {
    const src = read(`src/sector${sector}.js`);
    const table = src.match(/^const (?:TOWERS|T)=\{.*?\};$/m);
    assert.ok(table, `sector ${sector} has no tower table`);
    assert.ok(!table[0].includes('META'),
      `sector ${sector} still applies research inline, which would double-apply`);
  }
});

test('research scales each tower family by its own nodes', () => {
  const base = () => ({
    gun: { damage: 18, rate: 4.5, range: 155 },
    cannon: { damage: 55, splash: 55 },
    freeze: { damage: 8, range: 160, slow: 0.3 },
    arc: { damage: 32, chains: 3, chainRange: 82 }
  });
  const none = base();
  loadMeta({}).FUN_TD_APPLY_META(none, {});
  assert.deepEqual(none, base(), 'no research must leave the table untouched');

  const t = base();
  loadMeta({ gunLevel: 3, gun2: 2, cannonLevel: 3, cannon2: 3, freezeLevel: 3, freeze2: 1, arcLevel: 3, arc2: 3 })
    .FUN_TD_APPLY_META(t, {});
  // Tier-2 nodes must contribute; this is what Sector 04 was silently missing.
  assert.ok(t.gun.damage > 18 * 1.15, 'gun2 did not apply');
  assert.ok(t.cannon.damage > 55 * 1.18, 'cannon2 did not apply');
  assert.ok(t.arc.damage > 32 * 1.21, 'arc2 did not apply');
  assert.equal(t.arc.chains, 5, 'both arc chain thresholds should fire');
  assert.ok(t.gun.range > 155, 'gun range threshold at level 3');
});

test('the freeze slow is capped so research cannot stop the swarm dead', () => {
  const t = { freeze: { damage: 8, range: 160, slow: 0.3 } };
  loadMeta({ freezeLevel: 9, freeze2: 9 }).FUN_TD_APPLY_META(t, {});
  assert.ok(t.freeze.slow <= 0.62, 'slow must stay capped');
});

test('challenge modifiers speed the swarm up and never slow it', () => {
  const enemies = () => ({ grunt: { speed: 50 }, boss: { speed: 20 } });
  const plain = enemies();
  loadMeta({}).FUN_TD_APPLY_META({}, plain);
  assert.deepEqual(plain, enemies(), 'no modifier must leave speeds untouched');

  const rushed = enemies();
  loadMeta({ enemySpeed: 1.16 }).FUN_TD_APPLY_META({}, rushed);
  assert.ok(rushed.grunt.speed > 50 && rushed.boss.speed > 20);
});

test('scalar helpers clamp to survivable floors', () => {
  const util = loadMeta({ startGold: -9999, baseHp: -9999 }).FUN_TD_META_UTIL;
  assert.equal(util.startGold(650), 100, 'a challenge must not leave the player broke');
  assert.equal(util.baseHp(100), 40, 'a challenge must not leave the base at zero');
  assert.equal(loadMeta({}).FUN_TD_META_UTIL.sellRate(), 0.7);
});
