/* Air combat, tankers and phased bosses for sectors 02-06.
 *
 * Sector 01's runtime carries all of this natively. The rest of the campaign
 * is five separate, older runtimes with five different internal shapes, so
 * rather than reimplementing the mechanic five times this file installs one
 * copy of it onto whichever game booted.
 *
 * Three of the four pieces need no changes to a sector's source at all:
 *
 *   - New unit and tower stats are written into the tables the loader exposes,
 *     derived from that sector's own numbers so a sector keeps its own scale.
 *   - A flier's movement is installed per instance: assigning `update` on the
 *     object shadows the prototype method the sector defined, so the sector
 *     calls it as usual and gets straight-line flight instead of the road.
 *   - Boss phases are checked once per frame from a wrapper around the game's
 *     update, rather than from the damage path — those sectors apply damage
 *     inline in a dozen places, and a frame's delay is imperceptible.
 *
 * Only the ground/air targeting rule needs the sectors' own source touched,
 * because acquisition is written inline inside their update loops. Those edits
 * call straight back into `can()` below, so the rule itself lives here.
 *
 * Every wave that gains air gives up an equal amount of ground health to pay
 * for it, so the campaign's tuned wave curve is not moved by the new roster.
 */
(() => {
const AIR_SHARE = 0.22;   // of a chosen wave's health, converted to fliers

/* --------------------------------------------------------------- the rule */

/* Which enemies a tower may shoot at. A tower with no declared layer is
   ground-only: every one of these sectors predates air, so silence has to
   mean "the old behaviour", never "both". */
function can(stats, enemy) {
  const t = (stats && stats.targets) || 'ground';
  return enemy && enemy.flying ? (t === 'air' || t === 'both') : (t === 'ground' || t === 'both');
}

/* Splash bursts on one layer only: a mortar shell on the ground, a flak shell
   in the air. Neither reaches the other just because it landed nearby. */
const splashHits = (projectile, enemy) => !!enemy.flying === !!(projectile && projectile.splashAir);

/* -------------------------------------------------------------- movement */

function launch(enemy, MAP) {
  if (!enemy.flying || !MAP || !MAP.base) return;
  // Spread the flight across a band so a formation does not stack into one
  // pixel, then fly straight at the core.
  const span = (Math.random() * 2 - 1) * 70;
  const dx = MAP.base.x - enemy.x, dy = MAP.base.y - enemy.y;
  const d = Math.hypot(dx, dy) || 1;
  enemy.x += -dy / d * span;
  enemy.y += dx / d * span;
  enemy.flightLength = Math.hypot(MAP.base.x - enemy.x, MAP.base.y - enemy.y);
  enemy.angle = Math.atan2(MAP.base.y - enemy.y, MAP.base.x - enemy.x);
  enemy.bob = Math.random() * Math.PI * 2;
  enemy.lane = 0;
}

/* Returns true on reaching the core, which is what every one of these
   runtimes takes as "this one leaked". */
function fly(enemy, MAP, dt) {
  if (enemy.slowTime > 0) enemy.slowTime -= dt; else enemy.slow = 0;
  if (enemy.shieldTime > 0) enemy.shieldTime -= dt;
  enemy.bob = (enemy.bob || 0) + dt * 5.5;
  const travel = enemy.speed * (1 - (enemy.slow || 0)) * dt;
  const dx = MAP.base.x - enemy.x, dy = MAP.base.y - enemy.y;
  const d = Math.hypot(dx, dy);
  if (d <= travel || d < 6) { enemy.x = MAP.base.x; enemy.y = MAP.base.y; return true; }
  enemy.angle = Math.atan2(dy, dx);
  enemy.x += dx / d * travel;
  enemy.y += dy / d * travel;
  // These runtimes rank targets by path segment, so a flier reports a segment
  // proportional to how far along its own flight it is. Without this a flier
  // would always look like the furthest-back target and never be shot first.
  const flown = 1 - d / (enemy.flightLength || d);
  const segments = Math.max(1, (MAP.path && MAP.path.length - 1) || 1);
  const progress = flown * segments;
  if ('segment' in enemy) enemy.segment = progress;
  if ('seg' in enemy) enemy.seg = progress;
  return false;
}

/* ----------------------------------------------------------- the roster */

/* Derived from the sector's own units so each sector keeps its own scale: a
   drone is a faster, slightly tougher scout, a gunship is an airborne heavy,
   and a brute is the heaviest thing short of that sector's boss. */
function newUnits(ENEMIES) {
  const scout = ENEMIES.scout || ENEMIES.grunt;
  const heavy = ENEMIES.heavy || ENEMIES.armored || ENEMIES.grunt;
  if (!scout || !heavy) return {};
  const round = n => Math.max(1, Math.round(n));
  return {
    drone: {
      name: 'DRONE', hp: round(scout.hp * 1.2), speed: round(scout.speed * 1.28),
      armor: 0, reward: round((scout.reward || 5) * 1.4), damage: scout.damage || 1,
      size: 10, color: '#4fe0cf', flying: true, altitude: 34
    },
    gunship: {
      name: 'GUNSHIP', hp: round(heavy.hp * 1.15), speed: round(heavy.speed * 1.5),
      armor: heavy.armor ? heavy.armor * 0.8 : 0, reward: round((heavy.reward || 20) * 1.5),
      damage: heavy.damage || 5, size: 17, color: '#2fb9b0', flying: true, altitude: 44
    },
    brute: {
      name: 'BRUTE', hp: round(heavy.hp * 2.6), speed: round(heavy.speed * 0.9),
      armor: Math.min(0.4, (heavy.armor || 0.2) * 1.3), reward: round((heavy.reward || 20) * 2.6),
      damage: (heavy.damage || 5) * 1.8, size: 22, color: '#175f38'
    }
  };
}

/* The anti-air battery, priced and scaled off the sector's own gun tower so it
   sits inside that sector's economy rather than sector 01's. */
function newTowers(TOWERS) {
  const gun = TOWERS.gun;
  if (!gun) return {};
  return {
    flak: {
      name: 'FLAK BATTERY', short: 'FLAK',
      cost: Math.round((gun.cost || 100) * 1.8),
      damage: (gun.damage || 15) * 2.6,
      rate: (gun.rate || 4) * 0.5,
      range: Math.round((gun.range || 150) * 1.32),
      pierce: 0.2, splash: 46, splashAir: true, targets: 'air',
      // The campaign's runtimes disagree on the key: sectors 02-04 read
      // projectileSpeed, sector 01 reads projectile. Carry both.
      projectile: 1000, projectileSpeed: 1000,
      color: '#ffd66b', accent: '#b8860b',
      role: 'Air only. Bursting shells that shred a formation of fliers.'
    }
  };
}

/* Every pre-existing tower keeps doing exactly what it did: it can shoot the
   ground. Anything that could plausibly elevate also reaches air, so a player
   who has not built flak is inconvenienced rather than hard-locked. */
const DUAL_LAYER = ['gun', 'freeze', 'frost', 'arc', 'tesla', 'laser'];

function declareLayers(TOWERS) {
  for (const [key, t] of Object.entries(TOWERS)) {
    if (t.targets) continue;
    t.targets = DUAL_LAYER.includes(key) ? 'both' : 'ground';
  }
}

/* ------------------------------------------------------------ wave swaps */

const hpOf = (ENEMIES, type) => (ENEMIES[type] && ENEMIES[type].hp) || 1;

/* Convert part of a wave's health from ground to air, in place.
 *
 * Adding fliers on top of an existing wave would make every sector harder by
 * however much air was added; taking the payment out of the wave's own biggest
 * ground group keeps the tuned curve where it was. */
function airRaid(wave, ENEMIES, flier, waveIndex) {
  const groups = wave.groups || wave;
  if (!Array.isArray(groups) || !groups.length) return false;
  if (groups.some(g => ENEMIES[g.type] && ENEMIES[g.type].flying)) return false;

  const total = groups.reduce((n, g) => n + hpOf(ENEMIES, g.type) * g.count, 0);
  let budget = total * AIR_SHARE;

  // Pay from the largest group first, and never empty one out — a wave should
  // still look like itself afterwards.
  const byWeight = [...groups].sort((a, b) =>
    hpOf(ENEMIES, b.type) * b.count - hpOf(ENEMIES, a.type) * a.count);
  let paid = 0;
  for (const g of byWeight) {
    if (budget <= 0) break;
    const unit = hpOf(ENEMIES, g.type);
    const affordable = Math.min(Math.floor(budget / unit), Math.max(0, g.count - 1));
    if (affordable <= 0) continue;
    g.count -= affordable;
    paid += affordable * unit;
    budget -= affordable * unit;
  }
  if (paid <= 0) return false;

  const count = Math.max(1, Math.round(paid / hpOf(ENEMIES, flier)));
  const template = groups[groups.length - 1];
  groups.push({
    type: flier,
    count,
    interval: flier === 'gunship' ? 1.1 : 0.44,
    gap: template && template.gap !== undefined ? 1.0 : undefined
  });
  return true;
}

/* Swap one late-wave group for the tanker, again paying for it out of the
   wave's own health rather than adding to it. */
function addTanker(wave, ENEMIES) {
  const groups = wave.groups || wave;
  if (!Array.isArray(groups) || !groups.length) return false;
  if (groups.some(g => g.type === 'brute')) return false;
  const unit = hpOf(ENEMIES, 'brute');
  const biggest = groups.reduce((best, g) =>
    hpOf(ENEMIES, g.type) * g.count > hpOf(ENEMIES, best.type) * best.count ? g : best, groups[0]);
  const spend = Math.min(unit, hpOf(ENEMIES, biggest.type) * (biggest.count - 1));
  if (spend < unit * 0.8) return false;
  biggest.count -= Math.round(spend / hpOf(ENEMIES, biggest.type));
  groups.push({ type: 'brute', count: 1, interval: 1.2, gap: 1.2 });
  return true;
}

/* -------------------------------------------------------------- the boss */

/* Two thresholds, each a real trade: faster, but with less armour. The second
   calls in air, so anti-air has to still be standing at the end of the fight. */
function bossPhases(ENEMIES) {
  const boss = ENEMIES.boss;
  if (!boss || boss.phases) return;
  const armour = boss.armor || 0.3;
  boss.armor = armour;
  boss.phases = [
    { at: 0.66, name: 'PLATING SHED', speed: 1.3, armor: armour * 0.7,
      escorts: ENEMIES.armored ? ['armored', 'armored', 'armored'] : ['grunt', 'grunt', 'grunt'] },
    { at: 0.33, name: 'CORE EXPOSED', speed: 1.65, armor: armour * 0.38,
      escorts: ['gunship', 'drone', 'drone', 'drone'] }
  ];
}

/* ------------------------------------------------------------- installer */

function install(game, model) {
  const MAP = model.MAP, ENEMIES = model.ENEMIES;
  const seen = new WeakSet();

  const escort = (type, parent) => {
    const Enemy = model.Enemy;
    if (!Enemy || !ENEMIES[type]) return;
    let e;
    try { e = new Enemy(type); } catch (err) { return; }
    e.x = parent.x; e.y = parent.y;
    if (e.flying) launch(e, MAP);
    else {
      if ('segment' in parent) e.segment = parent.segment;
      if ('seg' in parent) e.seg = parent.seg;
      e.angle = parent.angle;
    }
    game.enemies.push(e);
    if (typeof game.waveTotal === 'number') game.waveTotal++;
    return e;
  };

  const adopt = e => {
    if (seen.has(e)) return;
    seen.add(e);
    if (!e.flying) { e.bossPhase = 0; e.baseSpeed = e.speed; return; }
    launch(e, MAP);
    // Shadowing the prototype's update on the instance is what makes flight
    // work without editing five different runtimes' movement code.
    e.update = dt => fly(e, MAP, dt);
    e.bossPhase = 0;
    e.baseSpeed = e.speed;
  };

  const checkPhase = e => {
    if (!e.phases) return;
    const pct = e.hp / e.maxHp;
    while (e.bossPhase < e.phases.length && pct <= e.phases[e.bossPhase].at) {
      const p = e.phases[e.bossPhase++];
      e.speed = (e.baseSpeed || e.speed) * (p.speed || 1);
      if (p.armor !== undefined) e.armor = p.armor;
      for (const type of p.escorts || []) escort(type, e);
      if (typeof game.toast === 'function') game.toast(`${e.name || 'BOSS'}: ${p.name}`);
      if (typeof game.burst === 'function') game.burst(e.x, e.y, '#ffb24b', 30);
      if (typeof game.shake === 'number') game.shake = Math.max(game.shake, 12);
    }
  };

  const original = game.update;
  if (typeof original !== 'function') return false;
  game.update = function (dt) {
    for (const e of this.enemies) if (e.active) adopt(e);
    original.call(this, dt);
    for (const e of this.enemies) if (e.active) checkPhase(e);
  };
  return true;
}

/* ------------------------------------------------------------------ boot */

/* Read the sector from the URL rather than from window.FUN_TD_SECTOR: this
   file is deferred, and a deferred script that happens to run before the
   loader would otherwise see sector 1 and quietly do nothing. */
const params = new URLSearchParams(location.search);
const sector = window.FUN_TD_SECTOR || +params.get('sector') || 1;
const endless = window.FUN_TD_ENDLESS || params.get('endless') === '1';

window.FUN_TD_AIR = { can, splashHits, launch, fly, AIR_SHARE };

// Sector 01 does all of this natively, and Endless reuses its own runtime.
if (sector !== 1 && !endless) {
  let waited = 0;
  const timer = setInterval(() => {
    waited += 90;
    const game = window.funTDGame;
    const model = window.FUN_TD_SECTOR_MODEL;
    if (!game || !model || !model.ENEMIES || !model.TOWERS) {
      if (waited > 9000) {
        clearInterval(timer);
        console.warn('FUN TD air: sector', sector, 'exposed no model; keeping its own roster');
      }
      return;
    }
    clearInterval(timer);
    try {
      const ENEMIES = model.ENEMIES, TOWERS = model.TOWERS, WAVES = model.WAVES;
      declareLayers(TOWERS);
      Object.assign(TOWERS, newTowers(TOWERS));
      Object.assign(ENEMIES, newUnits(ENEMIES));
      if (Array.isArray(WAVES) && ENEMIES.drone) {
        // Drones from a third of the way in, gunships from two thirds, the
        // tanker alongside them — the same shape of introduction sector 01
        // uses, expressed as fractions so it fits any campaign length.
        const n = WAVES.length;
        for (let i = 0; i < n; i++) {
          const at = i / n;
          if (at >= 0.28 && i % 3 === 1) airRaid(WAVES[i], ENEMIES, 'drone', i);
          else if (at >= 0.62 && i % 3 === 2) airRaid(WAVES[i], ENEMIES, 'gunship', i);
          if (at >= 0.58 && i % 4 === 3) addTanker(WAVES[i], ENEMIES);
        }
      }
      bossPhases(ENEMIES);
      if (typeof window.FUN_TD_APPLY_META === 'function') {
        // The new tower has research of its own; apply it the same way the
        // sector applied research to the families it shipped with.
        window.FUN_TD_APPLY_META({ flak: TOWERS.flak }, {});
      }
      install(game, model);
    } catch (err) {
      console.warn('FUN TD air: install failed, sector keeps its own roster', err);
    }
  }, 90);
}
})();
