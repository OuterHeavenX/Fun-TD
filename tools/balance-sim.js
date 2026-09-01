/* Headless balance simulator for Sector 01.
 *
 * It lifts the data block straight out of src/runtime.js (between the
 * FUN-TD-DATA sentinels) and re-implements the same combat maths, so the curve
 * it reports is the curve the game ships.  A scripted player builds and
 * upgrades between waves using a plain greedy policy, which stands in for a
 * competent-but-not-optimal human.
 *
 *   node tools/balance-sim.js            # summary table
 *   node tools/balance-sim.js --json     # machine readable
 *   node tools/balance-sim.js --verbose  # per-wave build log
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUNTIME = path.join(HERE, '..', 'src', 'runtime.js');

export function loadModel(source = fs.readFileSync(RUNTIME, 'utf8')) {
  const start = source.indexOf('/*--FUN-TD-DATA-START--*/');
  const end = source.indexOf('/*--FUN-TD-DATA-END--*/');
  if (start < 0 || end < 0) throw new Error('runtime.js is missing its data sentinels');
  const block = source.slice(start, end);
  const context = { META: {} };
  vm.createContext(context);
  vm.runInContext(
    block + '\n;globalThis.__model={MAP,BAL,TOWERS,ENEMIES,WAVES,waveHpScale,waveRewardScale,' +
    'countWave,enemyStats,damageAfterArmor,towerStats,upgradeCost,investedAt,dpsOf,canTarget,' +
    'waveIntel,waveEffectiveHp,waveSpawnSeconds,pathLength};',
    context
  );
  return context.__model;
}

const TICK = 1 / 60;
let M = loadModel();

/* ----------------------------------------------------------------- geometry */

// Sample the route so we can ask "how much of the path does this pad cover?".
function samplePath(step = 6) {
  const pts = [];
  for (let i = 1; i < M.MAP.path.length; i++) {
    const [ax, ay] = M.MAP.path[i - 1], [bx, by] = M.MAP.path[i];
    const d = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t < d; t += step) pts.push([ax + (bx - ax) * t / d, ay + (by - ay) * t / d]);
  }
  return pts;
}
let SAMPLES = samplePath();

function coverage(pad, range, samples = SAMPLES) {
  let n = 0;
  for (const [x, y] of samples) if (Math.hypot(x - pad.x, y - pad.y) <= range) n++;
  return n / samples.length;
}

/* Fliers ignore the road, so a pad's usefulness against air has nothing to do
   with path coverage: it is how much of the spawn-to-core corridor it sees. */
function sampleAir(step = 6, lanes = 7) {
  const pts = [];
  const [sx, sy] = M.MAP.path[0];
  const dx = M.MAP.base.x - sx, dy = M.MAP.base.y - sy;
  const len = Math.hypot(dx, dy) || 1;
  for (let l = 0; l < lanes; l++) {
    const off = (l / (lanes - 1) * 2 - 1) * 70;
    const ax = sx + -dy / len * off, ay = sy + dx / len * off;
    const bx = M.MAP.base.x, by = M.MAP.base.y;
    const d = Math.hypot(bx - ax, by - ay);
    for (let t = 0; t < d; t += step) pts.push([ax + (bx - ax) * t / d, ay + (by - ay) * t / d]);
  }
  return pts;
}
let AIR_SAMPLES = [];

/* How much of the next few waves arrives by air, weighted by health. A tower
   that can only shoot one layer is worth exactly what that layer brings. */
function airShare(waveIndex) {
  let air = 0, total = 0;
  for (let i = waveIndex; i < Math.min(M.WAVES.length, waveIndex + 3); i++) {
    for (const grp of M.WAVES[i].groups) {
      const hp = M.enemyStats(grp.type, i).hp * grp.count;
      total += hp;
      if (M.ENEMIES[grp.type].flying) air += hp;
    }
  }
  return total ? air / total : 0;
}

/* -------------------------------------------------------------- combat sim */

class SimEnemy {
  constructor(type, waveIndex) {
    Object.assign(this, M.enemyStats(type, waveIndex));
    this.maxHp = this.hp;
    this.segment = 0;
    this.x = M.MAP.path[0][0];
    this.y = M.MAP.path[0][1];
    this.travelled = 0;
    this.slow = 0;
    this.slowTime = 0;
    this.active = true;
    this.angle = Math.PI;
    this.phase = 0;
    this.baseSpeed = this.speed;
    if (this.flying) {
      // Same launch spread as the runtime, so a flier's exposure to a given
      // tower is simulated at the distance it will really fly.
      const span = (Math.random() * 2 - 1) * 70;
      const dx = M.MAP.base.x - this.x, dy = M.MAP.base.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.x += -dy / d * span;
      this.y += dx / d * span;
      this.flightLength = Math.hypot(M.MAP.base.x - this.x, M.MAP.base.y - this.y);
    }
  }
  step(dt) {
    if (this.slowTime > 0) this.slowTime -= dt; else this.slow = 0;
    let travel = this.speed * (1 - this.slow) * dt;
    if (this.flying) {
      const dx = M.MAP.base.x - this.x, dy = M.MAP.base.y - this.y, d = Math.hypot(dx, dy);
      if (d <= travel || d < 6) return true;
      this.angle = Math.atan2(dy, dx);
      this.x += dx / d * travel;
      this.y += dy / d * travel;
      this.travelled = (this.flightLength - d) / this.flightLength * M.pathLength();
      return false;
    }
    while (travel > 0 && this.segment < M.MAP.path.length - 1) {
      const b = M.MAP.path[this.segment + 1];
      const dx = b[0] - this.x, dy = b[1] - this.y, d = Math.hypot(dx, dy);
      this.angle = Math.atan2(dy, dx);
      if (travel >= d) { this.x = b[0]; this.y = b[1]; this.segment++; this.travelled += d; travel -= d; }
      else { this.x += dx / d * travel; this.y += dy / d * travel; this.travelled += travel; travel = 0; }
    }
    return this.segment >= M.MAP.path.length - 1;
  }
}

function simulateWave(state, waveIndex) {
  const wave = M.WAVES[waveIndex];
  const queue = [];
  let t = 0.8;
  for (const grp of wave.groups) {
    t += grp.gap || 0;
    for (let i = 0; i < grp.count; i++) { queue.push({ time: t, type: grp.type }); t += grp.interval; }
    t += 0.55;
  }

  const enemies = [];
  const shells = [];
  for (const tower of state.towers) tower.cd = 0;

  let clock = 0, leaks = 0, kills = 0, gold = 0, breach = 0;
  const damageTaken = [];

  const hurt = (e, raw, pierce) => {
    if (!e.active) return;
    e.hp -= Math.max(1, M.damageAfterArmor(raw, e.armor, pierce));
    if (e.hp <= 0) {
      e.active = false;
      kills++;
      gold += e.reward;
      return;
    }
    // Phase thresholds change a boss's speed and armour and add escorts, all
    // of which move the wave's length — so the simulator has to run them too.
    if (!e.phases) return;
    const pct = e.hp / e.maxHp;
    while (e.phase < e.phases.length && pct <= e.phases[e.phase].at) {
      const ph = e.phases[e.phase++];
      e.speed = e.baseSpeed * (ph.speed || 1);
      if (ph.armor !== undefined) e.armor = ph.armor;
      for (const type of ph.escorts || []) {
        const esc = new SimEnemy(type, waveIndex);
        if (!esc.flying) { esc.x = e.x; esc.y = e.y; esc.segment = e.segment; esc.travelled = e.travelled; }
        enemies.push(esc);
      }
    }
  };

  // Cap the simulated clock so a wave the player simply cannot kill still ends.
  const limit = t + 240;
  while (clock < limit && (queue.length || enemies.some(e => e.active))) {
    clock += TICK;
    while (queue.length && queue[0].time <= clock) enemies.push(new SimEnemy(queue.shift().type, waveIndex));

    for (const e of enemies) {
      if (!e.active) continue;
      if (e.step(TICK)) { e.active = false; leaks++; breach += e.damage; damageTaken.push(e.damage); }
    }

    for (const tower of state.towers) {
      tower.cd -= TICK;
      if (tower.cd > 0) continue;
      const s = M.towerStats(tower.type, tower.level);
      let target = null, best = -Infinity;
      for (const e of enemies) {
        if (!e.active || !M.canTarget(s, e)) continue;
        if (Math.hypot(e.x - tower.x, e.y - tower.y) > s.range) continue;
        if (e.travelled > best) { best = e.travelled; target = e; }
      }
      if (!target) continue;
      tower.cd = 1 / s.rate;

      if (tower.type === 'arc') {
        const hit = new Set();
        let cur = target, dmg = s.damage;
        for (let i = 0; i <= s.chains && cur; i++) {
          hit.add(cur);
          hurt(cur, dmg, s.pierce);
          dmg *= M.TOWERS.arc.chainFalloff;
          let next = null, bd = s.chainRange;
          for (const e of enemies) {
            if (!e.active || hit.has(e) || !M.canTarget(s, e)) continue;
            const d = Math.hypot(e.x - cur.x, e.y - cur.y);
            if (d < bd) { bd = d; next = e; }
          }
          cur = next;
        }
      } else if (s.splash) {
        const flight = Math.hypot(target.x - tower.x, target.y - tower.y) / s.projectile;
        const lead = target.speed * (1 - target.slow) * flight;
        shells.push({
          x: tower.x, y: tower.y,
          aimX: target.x + Math.cos(target.angle) * lead,
          aimY: target.y + Math.sin(target.angle) * lead,
          speed: s.projectile, damage: s.damage, splash: s.splash, pierce: s.pierce,
          splashAir: !!s.splashAir
        });
      } else {
        // Direct-fire towers are fast enough that treating them as hitscan
        // costs at most a frame of travel and keeps the sim cheap.
        hurt(target, s.damage, s.pierce);
        if (s.slow) { target.slow = Math.max(target.slow, s.slow); target.slowTime = s.slowTime; }
      }
    }

    for (let i = shells.length - 1; i >= 0; i--) {
      const p = shells[i];
      const dx = p.aimX - p.x, dy = p.aimY - p.y, d = Math.hypot(dx, dy), step = p.speed * TICK;
      if (d <= step + 7) {
        for (const e of enemies) {
          if (!e.active || !!e.flying !== !!p.splashAir) continue;
          const dist = Math.hypot(e.x - p.aimX, e.y - p.aimY);
          if (dist <= p.splash) hurt(e, p.damage * (1 - 0.55 * (dist / p.splash)), p.pierce);
        }
        shells.splice(i, 1);
      } else { p.x += dx / d * step; p.y += dy / d * step; }
    }
  }

  const cleared = leaks === 0;
  gold += wave.bonus + (cleared ? wave.flawless : 0);
  return { leaks, kills, gold, breach, seconds: clock, damageTaken };
}

/* ------------------------------------------------------------ scripted player */

/* Three scripted players stand in for three real ones.  Tuning against only the
 * optimal bot is misleading: it never mis-clicks, so it clears almost any curve
 * and reports "too easy" for every setting.  What actually matters is that the
 * spread between these tiers maps onto the campaign's three-star bands. */
export const SKILLS = {
  // Spends everything, always on the highest value-per-gold action.
  optimal: { spendFraction: 1.00, pick: 0, reserve: 40 },
  // Leaves a little gold idle and often takes the second-best option.
  average: { spendFraction: 0.80, pick: 1, reserve: 90 },
  // Hoards gold and buys poorly — the player who has not found the pattern yet.
  weak:    { spendFraction: 0.58, pick: 2, reserve: 150 }
};

/* A tower is only worth the layer it can shoot, and it only covers the routes
   that layer uses; both of those are what stop the greedy bot from filling the
   map with mortars and then being surprised by a wave of gunships. */
const layerCover = (pad, type) =>
  (M.TOWERS[type].targets === 'air' ? pad.cover.air : pad.cover[type]);

function layerWorth(type, waveIndex) {
  const targets = M.TOWERS[type].targets || 'ground';
  if (targets === 'both') return 1;
  const air = airShare(waveIndex);
  // A floor keeps the bot from selling out entirely on one layer: a wave with
  // no air at all still leaves flak worth something for the waves after it.
  return Math.max(0.12, targets === 'air' ? air : 1 - air);
}

function spend(state, waveIndex, skill = SKILLS.optimal) {
  const log = [];
  const referenceArmor = 0.25;
  const budget = state.gold * skill.spendFraction;
  let spent = 0;

  for (let guard = 0; guard < 40; guard++) {
    const options = [];

    for (const pad of state.pads) {
      if (pad.tower) continue;
      for (const type of Object.keys(M.TOWERS)) {
        const cost = M.TOWERS[type].cost;
        if (cost > state.gold) continue;
        const s = M.towerStats(type, 1);
        // Frost has almost no damage; value it by the time it buys instead.
        const worth = type === 'frost'
          ? M.dpsOf('gun', 1, referenceArmor) * s.slow * 2.2
          : M.dpsOf(type, 1, referenceArmor);
        options.push({ kind: 'build', pad, type, cost,
          value: worth * layerCover(pad, type) * layerWorth(type, waveIndex) / cost });
      }
    }

    for (const tower of state.towers) {
      if (tower.level >= M.BAL.maxLevel) continue;
      const cost = M.upgradeCost(tower.type, tower.level);
      if (cost > state.gold) continue;
      const gain = M.dpsOf(tower.type, tower.level + 1, referenceArmor) - M.dpsOf(tower.type, tower.level, referenceArmor);
      const pad = state.pads.find(p => p.tower === tower);
      options.push({ kind: 'upgrade', tower, cost,
        value: Math.max(1, gain) * layerCover(pad, tower.type) * layerWorth(tower.type, waveIndex) / cost });
    }

    if (!options.length) break;
    options.sort((a, b) => b.value - a.value);
    const pick = options[Math.min(skill.pick, options.length - 1)];
    if (spent + pick.cost > budget) break;
    // Early on, keep a buffer so the first waves are not all-in on one pad.
    if (state.gold - pick.cost < (waveIndex < 3 ? skill.reserve : 0)) break;

    state.gold -= pick.cost;
    spent += pick.cost;
    if (pick.kind === 'build') {
      const tower = { type: pick.type, level: 1, x: pick.pad.x, y: pick.pad.y, invested: pick.cost, cd: 0 };
      pick.pad.tower = tower;
      state.towers.push(tower);
      log.push(`build ${pick.type} @pad${pick.pad.id}`);
    } else {
      pick.tower.level++;
      pick.tower.invested += pick.cost;
      log.push(`upgrade ${pick.tower.type}->L${pick.tower.level}`);
    }
  }
  return log;
}

export function run({ verbose = false, model = null, skill = SKILLS.optimal } = {}) {
  if (model) M = model;
  SAMPLES = samplePath();
  AIR_SAMPLES = sampleAir();
  const state = {
    gold: M.BAL.startGold,
    hp: M.BAL.baseHp,
    towers: [],
    pads: M.MAP.pads.map((p, id) => ({
      ...p, id, tower: null,
      cover: {
        ...Object.fromEntries(Object.keys(M.TOWERS).map(k => [k, coverage(p, M.TOWERS[k].range)])),
        air: coverage(p, M.TOWERS.flak ? M.TOWERS.flak.range : 200, AIR_SAMPLES)
      }
    }))
  };

  const rows = [];
  for (let i = 0; i < M.WAVES.length; i++) {
    const built = spend(state, i, skill);
    const goldBefore = state.gold;
    const towersBefore = state.towers.length;
    const result = simulateWave(state, i);
    state.gold += result.gold;
    state.hp -= result.breach;

    rows.push({
      wave: i + 1,
      enemies: M.countWave(i),
      effHp: Math.round(M.waveEffectiveHp(i)),
      spawnS: +M.waveSpawnSeconds(i).toFixed(1),
      pressure: Math.round(M.waveEffectiveHp(i) / M.waveSpawnSeconds(i)),
      towers: towersBefore,
      goldIn: goldBefore,
      earned: result.gold,
      goldOut: state.gold,
      leaks: result.leaks,
      hp: Math.max(0, state.hp),
      seconds: +result.seconds.toFixed(1)
    });
    if (verbose && built.length) console.log(`wave ${i + 1}: ${built.join(', ')}`);
    if (state.hp <= 0) break;
  }

  return { rows, state };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const json = process.argv.includes('--json');
  const verbose = process.argv.includes('--verbose');
  const { rows, state } = run({ verbose });
  if (json) {
    console.log(JSON.stringify(rows, null, 2));
  } else {
    console.table(rows);
    const survived = rows[rows.length - 1].wave === M.WAVES.length && state.hp > 0;
    const totalLeaks = rows.reduce((n, r) => n + r.leaks, 0);
    console.log(`\nroute length ${Math.round(M.pathLength())}px · ${M.MAP.pads.length} pads`);
    console.log(`scripted player: ${survived ? 'SURVIVED' : 'LOST at wave ' + rows[rows.length - 1].wave}` +
      ` · final base HP ${Math.max(0, state.hp)}/${M.BAL.baseHp}` +
      ` · ${totalLeaks} total leaks · ${state.towers.length} towers · ${state.gold} gold unspent`);
    console.log(`effective HP wave 1 ${rows[0].effHp} → wave ${rows.length} ${rows[rows.length - 1].effHp}` +
      ` (${(rows[rows.length - 1].effHp / rows[0].effHp).toFixed(1)}× ramp)`);
  }
}
