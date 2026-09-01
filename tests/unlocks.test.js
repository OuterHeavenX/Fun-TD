/* Tower unlocks.
 *
 * The rules live in the data block so the game and the balance simulator gate
 * the same way; src/unlocks.js keeps a fallback copy for the screens that load
 * before any sector runtime does. Both are checked here, including that the
 * copy has not drifted from the original.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel, run, SKILLS } from '../tools/balance-sim.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const M = loadModel();

/* Load src/unlocks.js the way the browser does, with a stubbed window and an
   in-memory localStorage, and hand back the module it published.
 *
 * It runs in this realm rather than a vm context on purpose: a browser has one
 * realm, and objects built inside a vm carry that context's own prototypes,
 * which makes every deep comparison against a host array fail for a reason
 * that has nothing to do with the code under test. */
function loadUnlocks(store = {}, model = null) {
  const win = { FUN_TD_MODEL: model };
  const src = fs.readFileSync(path.join(HERE, '..', 'src', 'unlocks.js'), 'utf8');
  new Function('window', 'localStorage', src)(
    win,
    { getItem: k => (k in store ? String(store[k]) : null) }
  );
  return win.FUN_TD_UNLOCKS;
}

test('a fresh account has exactly the four starting families', () => {
  const U = loadUnlocks();
  const open = U.all().filter(t => t.unlocked).map(t => t.type);
  assert.deepEqual(open.sort(), ['arc', 'cannon', 'frost', 'gun']);
  assert.ok(U.totalCount() > open.length, 'there must be something left to earn');
});

test('every locked tower says how to earn it', () => {
  const U = loadUnlocks();
  for (const t of U.all()) {
    if (t.unlocked) {
      assert.equal(t.requirement, '', `${t.type} is already earned but states a requirement`);
    } else {
      assert.ok(t.requirement && t.requirement.length > 8,
        `${t.type} has no usable requirement text`);
    }
  }
});

test('anti-air is earned in time for the wave that needs it', () => {
  // Air debuts in one specific wave; flak has to be buildable in the build
  // phase before it, not after the player has already been hit by it.
  const firstAir = M.WAVES.findIndex(w => w.groups.some(g => M.ENEMIES[g.type].flying));
  assert.ok(firstAir > 0, 'no air wave found');
  const rule = M.UNLOCKS.flak;
  assert.equal(rule.from, 'wave');
  assert.ok(rule.wave <= firstAir,
    `flak unlocks after wave ${rule.wave} but air arrives in wave ${firstAir + 1}`);
  assert.equal(M.isUnlocked('flak', { bestWave: firstAir }), true);
  assert.equal(M.isUnlocked('flak', { bestWave: rule.wave - 1 }), false);
});

test('sector-gated towers need that sector actually cleared', () => {
  for (const [type, rule] of Object.entries(M.UNLOCKS)) {
    if (rule.from !== 'sector') continue;
    assert.equal(M.isUnlocked(type, { cleared: new Set() }), false);
    assert.equal(M.isUnlocked(type, { cleared: new Set([rule.sector]) }), true);
    // Clearing a later sector implies the earlier one, but the rule should not
    // rely on that: it must name its own sector.
    assert.equal(M.isUnlocked(type, { cleared: new Set([rule.sector + 1]) }), false);
  }
});

test('the unlocks module agrees with the data block', () => {
  const store = { funTD_sector1BestWave: 12, funTD_sector2Clear: '1' };
  const U = loadUnlocks(store, M);
  const p = U.progress();
  assert.equal(p.bestWave, 12);
  assert.deepEqual([...p.cleared], [2]);
  for (const type of M.TOWER_ORDER) {
    assert.equal(U.isUnlocked(type, p), M.isUnlocked(type, p),
      `${type} disagrees between the module and the data block`);
  }
});

test('the fallback rules in unlocks.js have not drifted from the data block', () => {
  // With no model published, the module must answer identically to the model.
  const store = { funTD_sector1BestWave: 12, funTD_sector2Clear: '1' };
  const withModel = loadUnlocks(store, M);
  const without = loadUnlocks(store, null);
  // The model side is built inside the simulator's vm context, so its arrays
  // carry that realm's prototypes; compare the values, not the identities.
  const rows = U => JSON.parse(JSON.stringify(
    U.all().map(t => [t.type, t.unlocked, t.requirement]))).sort();
  assert.deepEqual(rows(without), rows(withModel));
});

test('an unlockable tower is worth unlocking', () => {
  // Nothing gated should be a sidegrade: each has to beat the best starter at
  // something the starter cannot do, or the reward is not a reward.
  const starters = ['gun', 'frost', 'cannon', 'arc'];
  const bestStarterDps = Math.max(...starters.map(k => M.dpsOf(k, 1, 0.4)));
  const bestStarterRange = Math.max(...starters.map(k => M.TOWERS[k].range));
  for (const [type, rule] of Object.entries(M.UNLOCKS)) {
    if (rule.from === 'start') continue;
    const t = M.TOWERS[type];
    const better = M.dpsOf(type, 1, 0.4) > bestStarterDps
      || t.range > bestStarterRange
      || t.targets === 'air';
    assert.ok(better, `${type} is gated but beats no starter at anything`);
    assert.ok(t.cost >= Math.min(...starters.map(k => M.TOWERS[k].cost)),
      `${type} is gated but cheaper than every starter`);
  }
});

test('the first playthrough curve is unchanged by towers it cannot build', () => {
  // The scripted player is a fresh account, so adding gated towers to the
  // table must not move the tuned curve at all.
  const { state, rows } = run({ skill: SKILLS.optimal });
  assert.ok(state.hp > 0);
  const built = new Set(state.towers.map(t => t.type));
  for (const [type, rule] of Object.entries(M.UNLOCKS)) {
    if (rule.from === 'sector') {
      assert.ok(!built.has(type), `the scripted fresh account built the gated ${type}`);
    }
  }
  for (const r of rows) assert.ok(r.seconds < 75, `wave ${r.wave} takes ${r.seconds}s`);
});
