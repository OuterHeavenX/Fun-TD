/* Balance guard rails for Sector 01.
 *
 * These assert the *shape* of the curve rather than exact numbers, so ordinary
 * tuning stays cheap while a change that flattens the difficulty ramp, breaks
 * the economy, or makes a wave unreadably long fails loudly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadModel, run, SKILLS } from '../tools/balance-sim.js';

const M = loadModel();

test('the data block exposes the full model', () => {
  assert.equal(M.WAVES.length, 20);
  assert.ok(M.MAP.pads.length >= 10);
  assert.deepEqual(Object.keys(M.TOWERS), ['gun', 'frost', 'cannon', 'arc', 'flak', 'rail', 'void']);
  assert.ok(Object.keys(M.ENEMIES).includes('boss'));
  // Every tower declares which layer it can shoot, and at least one of each
  // side of that line exists — otherwise fliers are either free or trivial.
  const targets = Object.values(M.TOWERS).map(t => t.targets);
  assert.ok(targets.every(Boolean), 'every tower must declare a targets layer');
  assert.ok(targets.includes('air'), 'there must be a dedicated anti-air tower');
  assert.ok(targets.includes('ground'), 'there must be a tower air can fly past');
  assert.ok(Object.values(M.ENEMIES).some(e => e.flying), 'there must be a flying enemy');
});

test('no build pad sits on the route', () => {
  const near = (pad) => {
    let best = Infinity;
    for (let i = 1; i < M.MAP.path.length; i++) {
      const [ax, ay] = M.MAP.path[i - 1], [bx, by] = M.MAP.path[i];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy;
      const t = Math.max(0, Math.min(1, ((pad.x - ax) * dx + (pad.y - ay) * dy) / len2));
      best = Math.min(best, Math.hypot(pad.x - (ax + dx * t), pad.y - (ay + dy * t)));
    }
    return best;
  };
  // Half the road width plus the pad's own footprint.
  for (const pad of M.MAP.pads) assert.ok(near(pad) > 80, `pad ${pad.x},${pad.y} overlaps the road`);
});

test('build pads do not overlap each other', () => {
  for (let i = 0; i < M.MAP.pads.length; i++)
    for (let j = i + 1; j < M.MAP.pads.length; j++) {
      const a = M.MAP.pads[i], b = M.MAP.pads[j];
      assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 80, `pads ${i} and ${j} overlap`);
    }
});

test('difficulty ramps monotonically in the large', () => {
  const hp = M.WAVES.map((_, i) => M.waveEffectiveHp(i));
  assert.ok(hp[19] / hp[0] > 50, 'wave 20 should be at least 50x wave 1');
  // Allow local dips (a wave may trade health for speed) but not a stalled curve.
  for (let i = 5; i < 20; i++) {
    assert.ok(hp[i] > hp[i - 5], `wave ${i + 1} is not harder than wave ${i - 4}`);
  }
});

test('every wave stays readable in size and length', () => {
  for (let i = 0; i < 20; i++) {
    assert.ok(M.countWave(i) <= 60, `wave ${i + 1} spawns too many units to read`);
    const spawn = M.waveSpawnSeconds(i);
    assert.ok(spawn > 5 && spawn < 45, `wave ${i + 1} spawn window is ${spawn.toFixed(1)}s`);
  }
});

test('upgrade prices and refunds are deterministic', () => {
  assert.equal(M.upgradeCost('gun', 1), Math.round(M.BAL.upgradeMul[1] * M.TOWERS.gun.cost));
  assert.equal(M.upgradeCost('gun', M.BAL.maxLevel), 0);
  // Investing must always cost more than selling returns.
  for (const type of Object.keys(M.TOWERS))
    for (let level = 1; level <= M.BAL.maxLevel; level++)
      assert.ok(M.investedAt(type, level) * M.BAL.sellRate < M.investedAt(type, level));
});

test('armour is reduced by pierce and never inverts', () => {
  assert.equal(M.damageAfterArmor(100, 0.4), 60);
  assert.equal(M.damageAfterArmor(100, 0.4, 0.2), 80);
  assert.equal(M.damageAfterArmor(100, 0.2, 0.9), 100, 'excess pierce must not amplify damage');
});

test('each tower family holds a distinct role', () => {
  const dps = t => M.dpsOf(t, 1, 0);
  // The cheapest tower carries early damage per gold.
  assert.ok(dps('gun') / M.TOWERS.gun.cost > dps('cannon') / M.TOWERS.cannon.cost);
  // The mortar exists to beat armour, so it must out-damage the gun through it.
  assert.ok(M.dpsOf('cannon', 1, 0.42) > M.dpsOf('gun', 1, 0.42));
  // Frost trades damage for control.
  assert.ok(dps('frost') < dps('gun'));
  assert.ok(M.TOWERS.frost.slow > 0.2);
  // Arc only pays off against packs.
  assert.ok(M.TOWERS.arc.chains >= 3);
  assert.ok(dps('arc') > dps('gun'), 'arc should beat gun once chaining is counted');
});

test('upgrading a tower always improves it', () => {
  for (const type of Object.keys(M.TOWERS))
    for (let level = 1; level < M.BAL.maxLevel; level++) {
      const a = M.towerStats(type, level), b = M.towerStats(type, level + 1);
      assert.ok(b.damage > a.damage && b.rate > a.rate && b.range > a.range,
        `${type} L${level + 1} is not strictly better`);
    }
});

test('a competent player clears the sector', () => {
  const { rows, state } = run({ skill: SKILLS.average });
  assert.equal(rows.length, 20, 'the average player should reach wave 20');
  assert.ok(state.hp > 0, 'the average player should survive');
});

test('play quality separates the skill tiers', () => {
  const hp = skill => Math.max(0, run({ skill }).state.hp);
  const optimal = hp(SKILLS.optimal);
  const weak = hp(SKILLS.weak);
  assert.ok(optimal >= weak, 'better play must not score worse');
  assert.ok(weak < optimal || weak < M.BAL.baseHp,
    'poor play should cost the player health somewhere in the run');
});

test('no wave grinds on long after it stops spawning', () => {
  const { rows } = run({ skill: SKILLS.optimal });
  for (const r of rows) {
    assert.ok(r.seconds < 75, `wave ${r.wave} takes ${r.seconds}s for an optimal player`);
  }
});

test('the economy stays tight through the first half', () => {
  const { rows } = run({ skill: SKILLS.optimal });
  for (const r of rows.slice(0, 12)) {
    assert.ok(r.goldOut < 1200, `wave ${r.wave} leaves ${r.goldOut} gold idle`);
  }
});
