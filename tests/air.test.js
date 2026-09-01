/* Flying enemies, the ground/air targeting line, and phased bosses.
 *
 * These are rules the balance simulator and the game both have to obey, so
 * they are asserted against the model lifted out of runtime.js rather than
 * against either implementation's own copy of them.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModel, run, SKILLS } from '../tools/balance-sim.js';

const M = loadModel();

test('the targeting layers are mutually exclusive and complete', () => {
  const ground = { flying: false }, air = { flying: true };
  assert.equal(M.canTarget({ targets: 'ground' }, ground), true);
  assert.equal(M.canTarget({ targets: 'ground' }, air), false);
  assert.equal(M.canTarget({ targets: 'air' }, air), true);
  assert.equal(M.canTarget({ targets: 'air' }, ground), false);
  assert.equal(M.canTarget({ targets: 'both' }, ground), true);
  assert.equal(M.canTarget({ targets: 'both' }, air), true);
  // A tower that forgot to declare a layer must not silently gain both.
  assert.equal(M.canTarget({}, air), false);
  assert.equal(M.canTarget({}, ground), true);
});

test('an air wave is answerable without the dedicated anti-air tower', () => {
  // Flak is the efficient answer, never the only one: a player who never
  // builds it should be inconvenienced, not hard-locked out of the campaign.
  const canHitAir = Object.entries(M.TOWERS)
    .filter(([, t]) => t.targets === 'both' || t.targets === 'air');
  assert.ok(canHitAir.length >= 2, 'more than one tower must be able to reach air');
  assert.ok(canHitAir.some(([, t]) => t.targets === 'both'),
    'at least one dual-layer tower must exist as the fallback');
});

test('the anti-air tower is the efficient answer to a formation of fliers', () => {
  /* Fliers arrive in flights, so the honest comparison is damage per gold
     against a group, not against one target: flak's burst covers the group,
     an arc spire chains through it, and everything else hits one of them.
     `dpsOf` already folds arc's chain multiplier in, so only splash is added
     here — otherwise arc would be counted twice. */
  const FLIGHT = 4;
  const perGold = key => {
    const t = M.TOWERS[key];
    const crowd = t.splash ? 1 + (FLIGHT - 1) * 0.6 : 1;
    return M.dpsOf(key, 1, 0) * crowd / t.cost;
  };
  const rivals = Object.entries(M.TOWERS)
    .filter(([key, t]) => key !== 'flak' && (t.targets === 'both' || t.targets === 'air'));
  assert.ok(rivals.length, 'nothing to compare flak against');
  for (const [key] of rivals) {
    assert.ok(perGold('flak') > perGold(key),
      `flak is worse gold-for-gold than ${key} against air ` +
      `(${perGold('flak').toFixed(2)} vs ${perGold(key).toFixed(2)})`);
  }
  assert.ok(M.TOWERS.flak.range >= M.TOWERS.gun.range, 'flak should out-range the basic gun');
});

test('splash never crosses the ground/air line', () => {
  // A mortar bursts on the ground and a flak shell bursts in the air; the
  // flag that decides which is which has to be set on exactly one of them.
  assert.equal(!!M.TOWERS.cannon.splashAir, false);
  assert.equal(!!M.TOWERS.flak.splashAir, true);
});

test('every flier is introduced before the wave that leans on air', () => {
  const flying = Object.keys(M.ENEMIES).filter(k => M.ENEMIES[k].flying);
  assert.ok(flying.length >= 2, 'one flier is a gimmick, not a mechanic');
  for (const type of flying) {
    const first = M.WAVES.findIndex(w => w.groups.some(g => g.type === type));
    assert.ok(first > 0, `${type} must not appear in the opening wave`);
    const debut = M.WAVES[first].groups.find(g => g.type === type).count;
    assert.ok(debut <= 5, `${type} debuts ${debut} at once in wave ${first + 1}`);
  }
});

test('the tanker is the heaviest thing short of a boss', () => {
  const ranked = Object.entries(M.ENEMIES)
    .filter(([k]) => k !== 'boss')
    .sort((a, b) => b[1].hp - a[1].hp);
  assert.equal(ranked[0][0], 'brute');
  assert.ok(M.ENEMIES.brute.hp < M.ENEMIES.boss.hp / 4,
    'the tanker must still read as a step below the boss');
});

test('the boss changes shape twice before it dies', () => {
  const boss = M.ENEMIES.boss;
  assert.ok(Array.isArray(boss.phases) && boss.phases.length >= 2);
  let previous = 1;
  for (const p of boss.phases) {
    assert.ok(p.at < previous, 'phase thresholds must descend');
    assert.ok(p.at > 0, 'a phase at zero health would never fire');
    previous = p.at;
    assert.ok(p.name, 'each phase needs a name to announce');
  }
  // Shedding plating has to be a real trade: faster but less protected.
  const speeds = boss.phases.map(p => p.speed);
  const armour = boss.phases.map(p => p.armor);
  assert.ok(speeds.every((s, i) => i === 0 || s > speeds[i - 1]), 'each phase must be faster');
  assert.ok(armour.every((a, i) => i === 0 || a < armour[i - 1]), 'each phase must shed armour');
  assert.ok(armour[0] < boss.armor, 'the first phase must shed some of the opening armour');
});

test('boss escorts are counted into the wave the player must clear', () => {
  const escorts = M.ENEMIES.boss.phases.flatMap(p => p.escorts || []);
  assert.ok(escorts.length > 0, 'a boss that calls for no help has no phases worth naming');
  for (const type of escorts) assert.ok(M.ENEMIES[type], `unknown escort type ${type}`);
  assert.ok(escorts.some(t => M.ENEMIES[t].flying),
    'at least one phase should force the player to still have anti-air up');
});

test('the run still clears with air, tankers and a phased boss in it', () => {
  const { state, rows } = run({ skill: SKILLS.optimal });
  assert.ok(state.hp > 0, `optimal play lost the base (${state.hp} hp)`);
  for (const r of rows) assert.ok(r.seconds < 75, `wave ${r.wave} takes ${r.seconds}s`);
});
