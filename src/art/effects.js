/* Shared combat effects.
 *
 * Every sector runtime happens to expose the same four combat moments — fire,
 * hit, kill and leak — so this decorates those rather than asking each sector
 * to emit effects itself. It draws on top of the sector's own rendering by
 * wrapping draw(), and never replaces anything: if a hook is missing the rest
 * still work, and the game plays identically with this file removed.
 *
 * Budgeted deliberately. A late wave already puts 150+ units on screen, and
 * effects that make the fight prettier but the threat unreadable are a net
 * loss, so emission scales down as the crowd grows and the pool is hard-capped.
 */
(() => {
const MAX = 420;            // hard ceiling on live effects
const BUSY = 70;            // crowd size past which emission thins out

/* Full-screen tints and camera shake are the two effects most likely to make
   someone feel unwell, so honour the system setting for reduced motion. */
const CALM = typeof matchMedia === 'function'
  && matchMedia('(prefers-reduced-motion: reduce)').matches;

const TAU = Math.PI * 2;
const rand = (a, b) => a + Math.random() * (b - a);

/* One flat pool of tagged records rather than a class per effect: allocation
   churn is what costs frames here, not the branch in render(). */
const pool = [];
let live = 0;

function take() {
  if (live >= MAX) return null;
  let e = pool.find(p => !p.on);
  if (!e) { e = {}; pool.push(e); }
  e.on = true;
  live++;
  return e;
}

function spark(x, y, angle, spread, speed, color, life, size) {
  const e = take();
  if (!e) return;
  const a = angle + rand(-spread, spread);
  const v = speed * rand(0.55, 1);
  Object.assign(e, {
    kind: 'spark', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v,
    life, max: life, color, size, drag: 0.90
  });
}

function ring(x, y, r0, r1, color, life, width) {
  const e = take();
  if (!e) return;
  Object.assign(e, { kind: 'ring', x, y, r0, r1, color, life, max: life, width });
}

function flash(x, y, r, color, life) {
  const e = take();
  if (!e) return;
  Object.assign(e, { kind: 'flash', x, y, r, color, life, max: life });
}

function streak(x, y, angle, len, color, life, width) {
  const e = take();
  if (!e) return;
  Object.assign(e, { kind: 'streak', x, y, angle, len, color, life, max: life, width });
}

/* ------------------------------------------------------------------ update */

let shake = 0;
let flashScreen = 0;
let flashColor = '#ff5a44';

function step(dt) {
  if (CALM) { shake = 0; flashScreen = 0; }
  shake = Math.max(0, shake - dt * 26);
  flashScreen = Math.max(0, flashScreen - dt * 3.4);
  for (const e of pool) {
    if (!e.on) continue;
    e.life -= dt;
    if (e.life <= 0) { e.on = false; live--; continue; }
    if (e.kind === 'spark') {
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.vx *= e.drag; e.vy *= e.drag;
    }
  }
}

function render(c) {
  c.save();
  c.globalCompositeOperation = 'lighter';
  for (const e of pool) {
    if (!e.on) continue;
    const t = Math.max(0, e.life / e.max);
    c.globalAlpha = t;
    if (e.kind === 'spark') {
      c.fillStyle = e.color;
      const s = e.size * (0.4 + t * 0.6);
      c.fillRect(e.x - s / 2, e.y - s / 2, s, s);
    } else if (e.kind === 'ring') {
      const p = 1 - t;
      c.strokeStyle = e.color;
      c.lineWidth = e.width * t;
      c.beginPath();
      c.arc(e.x, e.y, e.r0 + (e.r1 - e.r0) * p, 0, TAU);
      c.stroke();
    } else if (e.kind === 'flash') {
      const g = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * (1.15 - t * 0.15));
      g.addColorStop(0, e.color);
      g.addColorStop(1, 'transparent');
      c.fillStyle = g;
      c.beginPath(); c.arc(e.x, e.y, e.r * (1.15 - t * 0.15), 0, TAU); c.fill();
    } else if (e.kind === 'streak') {
      c.strokeStyle = e.color;
      c.lineWidth = e.width * t;
      c.lineCap = 'round';
      c.beginPath();
      c.moveTo(e.x, e.y);
      c.lineTo(e.x + Math.cos(e.angle) * e.len * t, e.y + Math.sin(e.angle) * e.len * t);
      c.stroke();
    }
  }
  c.restore();

  if (flashScreen > 0 && !CALM) {
    c.save();
    c.globalAlpha = Math.min(0.20, flashScreen * 0.20);
    c.fillStyle = flashColor;
    c.fillRect(0, 0, 720, 1120);
    c.restore();
  }
}

/* ------------------------------------------------------------------- events */

const TINT = {
  gun: '#ffe9a8', cannon: '#ffb35c', freeze: '#bff4ff', frost: '#bff4ff', arc: '#dcb0ff',
  flak: '#ffe08a', rail: '#cfefff', void: '#ff9ada'
};

// How far down the barrel line the muzzle sits, and how big the flash is.
const MUZZLE = {
  cannon: { reach: 40, size: 'big' },
  flak:   { reach: 34, size: 'big' },
  rail:   { reach: 52, size: 'lance' },
  void:   { reach: 0,  size: 'field' }
};

function onFire(tower) {
  const a = tower.angle || 0;
  const colour = TINT[tower.type] || '#ffe9a8';
  const muzzle = MUZZLE[tower.type] || { reach: 28, size: 'small' };
  const x = tower.x + Math.cos(a) * muzzle.reach;
  const y = tower.y + Math.sin(a) * muzzle.reach;

  // A void spire has no barrel, so a muzzle flash would be a lie: it pulses.
  if (muzzle.size === 'field') {
    flash(tower.x, tower.y, 16, colour, 0.09);
    for (let i = 0; i < 5; i++)
      spark(tower.x, tower.y, rand(0, TAU), 0.9, rand(60, 150), colour, rand(0.12, 0.26), rand(1.6, 3));
    return;
  }

  // A radial bloom at the muzzle reads as a halo around the whole tower. A short
  // streak down the barrel line plus a tight core reads as a shot.
  const big = muzzle.size === 'big';
  const lance = muzzle.size === 'lance';
  streak(x, y, a, lance ? 60 : big ? 34 : 22, colour, lance ? 0.10 : 0.07, lance ? 7 : big ? 9 : 5);
  streak(x, y, a, lance ? 40 : big ? 20 : 13, '#ffffff', 0.05, lance ? 3 : big ? 4 : 2.4);
  flash(x, y, big ? 11 : lance ? 9 : 7, colour, 0.05);
  const n = big ? 7 : lance ? 5 : 3;
  for (let i = 0; i < n; i++) spark(x, y, a, 0.34, rand(140, 300), colour, rand(0.09, 0.2), rand(1.6, 3));
  if (big) shake = Math.max(shake, 2.2);
  if (lance) shake = Math.max(shake, 3.4);
}

function onHit(x, y, kind, splash) {
  const colour = TINT[kind] || '#ffe9a8';
  if (splash) {
    ring(x, y, 8, splash, '#ffc06a', 0.30, 7);
    flash(x, y, splash * 0.7, '#ff9b3d', 0.16);
    for (let i = 0; i < 14; i++)
      spark(x, y, rand(0, TAU), 0.5, rand(120, 340), i % 3 ? '#ffb35c' : '#fff0c0', rand(0.18, 0.42), rand(2, 4));
    shake = Math.max(shake, 5);
    return;
  }
  flash(x, y, 11, colour, 0.10);
  for (let i = 0; i < 4; i++)
    spark(x, y, rand(0, TAU), 0.6, rand(80, 200), colour, rand(0.10, 0.24), rand(1.4, 2.6));
}

function onKill(e) {
  const size = e.size || 11;
  const boss = e.type === 'boss';
  const heavy = boss || ['heavy', 'warden', 'armored', 'brute', 'gunship'].includes(e.type);
  const colour = e.color || '#8bf05a';
  flash(e.x, e.y, size * (boss ? 4 : 1.9), colour, boss ? 0.5 : 0.16);
  ring(e.x, e.y, size * 0.6, size * (boss ? 7 : heavy ? 3.4 : 2.4), colour, boss ? 0.75 : 0.3, boss ? 10 : 4);
  const n = boss ? 60 : heavy ? 16 : 8;
  for (let i = 0; i < n; i++)
    spark(e.x, e.y, rand(0, TAU), 0.6, rand(90, boss ? 460 : 260), i % 4 ? colour : '#ffffff',
      rand(0.2, boss ? 0.9 : 0.45), rand(1.8, boss ? 5 : 3.4));
  if (boss) {
    shake = Math.max(shake, 16);
    flashScreen = 0.7;
    flashColor = '#ffe9a8';
    for (let i = 0; i < 5; i++) ring(e.x, e.y, size, size * (4 + i * 2), '#fff2c4', 0.5 + i * 0.12, 6);
  } else if (heavy) {
    shake = Math.max(shake, 3);
  }
}

function onLeak(baseX, baseY, damage) {
  shake = Math.max(shake, Math.min(12, 4 + (damage || 1) * 0.8));
  flashScreen = Math.max(flashScreen, Math.min(0.8, 0.3 + (damage || 1) * 0.05));
  flashColor = '#ff5a44';
  ring(baseX, baseY, 60, 150, '#ff6b5a', 0.45, 9);
  for (let i = 0; i < 18; i++)
    spark(baseX, baseY, rand(0, TAU), 0.8, rand(120, 320), i % 3 ? '#ff8f7a' : '#ffd0c4', rand(0.2, 0.5), rand(2, 4));
}

/* ------------------------------------------------------------------ install */

function install(game, ctxKey) {
  const ctx = () => game[ctxKey];
  const crowded = () => (game.enemies || []).length > BUSY;

  const wrap = (name, before) => {
    const original = game[name];
    if (typeof original !== 'function') return false;
    game[name] = function (...args) {
      try { before.apply(this, args); } catch (e) { /* effects never break combat */ }
      return original.apply(this, args);
    };
    return true;
  };

  wrap('fire', function (tower) { if (tower && !crowded()) onFire(tower); });

  wrap('hit', function (p) {
    if (!p) return;
    const kind = p.type || (p.s && p.s.type);
    const splash = p.splash || (p.s && p.s.splash) || 0;
    // Splash is the readable one, so it survives a crowded screen.
    if (splash || !crowded()) onHit(p.x, p.y, kind, splash);
  });

  wrap('kill', function (e) {
    if (!e) return;
    if (e.type === 'boss' || !crowded() || Math.random() < 0.4) onKill(e);
  });

  wrap('leak', function (e) {
    const base = (window.FUN_TD_SECTOR_MODEL && window.FUN_TD_SECTOR_MODEL.MAP
      && window.FUN_TD_SECTOR_MODEL.MAP.base)
      || (window.FUN_TD_MODEL && window.FUN_TD_MODEL.MAP && window.FUN_TD_MODEL.MAP.base)
      || { x: 360, y: 560 };
    onLeak(base.x, base.y, e && e.damage);
  });

  // Sector 01 shakes the battlefield itself; feed it rather than shaking twice.
  const ownsShake = typeof game.shake === 'number';

  const originalDraw = game.draw ? game.draw.bind(game) : null;
  const originalRender = !originalDraw && game.render ? game.render.bind(game) : null;
  const base = originalDraw || originalRender;
  if (!base) return;

  let last = performance.now();
  const wrapped = function () {
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!game.paused) step(dt);

    const c = ctx();
    if (ownsShake) {
      game.shake = Math.max(game.shake || 0, shake);
      base();
      render(c);
      return;
    }
    c.save();
    if (shake > 0.3) c.translate(rand(-shake, shake), rand(-shake, shake));
    base();
    render(c);
    c.restore();
  };
  if (originalDraw) game.draw = wrapped; else game.render = wrapped;
}

window.FUN_TD_FX = {
  install, spark, ring, flash, streak, render, step,
  get live() { return live; },
  get shake() { return shake; },
  set shake(v) { shake = Math.max(shake, v); }
};

/* Find whichever property holds the 2D context. The sectors disagree — some
   call it ctx, some x — and probing beats keeping yet another per-sector table
   in step. */
function contextKey(game) {
  for (const key of Object.keys(game)) {
    const v = game[key];
    if (v && typeof v === 'object' && typeof v.fillRect === 'function' && v.canvas) return key;
  }
  return null;
}

let waited = 0;
const timer = setInterval(() => {
  waited += 90;
  const game = window.funTDGame;
  if (!game) {
    if (waited > 9000) clearInterval(timer);
    return;
  }
  clearInterval(timer);
  const key = contextKey(game);
  if (!key) { console.warn('FUN TD fx: no 2D context found, effects disabled'); return; }
  try { install(game, key); } catch (err) { console.warn('FUN TD fx: install failed', err); }
}, 90);
})();
