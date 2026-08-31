/* FUN TD sprite pack — shared across every sector.
 *
 * Loads the Blender-rendered set in assets/sprites once and exposes drawing
 * helpers plus two installers, because the campaign's runtimes were written at
 * different times and do not agree on their draw signatures:
 *
 *   sectors 1-3   drawTower(ctx, tower)   "classic"
 *   sectors 4, 6  drawTower(tower)        "compact", context on this.x / this.ctx
 *
 * Nothing here is required for the game to run. If the manifest or any image
 * fails to load, install() is never called and each sector keeps its own
 * procedural drawing.
 */
(() => {
const SPRITE_DIR = 'assets/sprites/';

// Blender units → battlefield pixels.
const TOWER_SCALE = 46;
const CORE_SCALE = 60;
const PROP_SCALE = 34;

// The later sectors call the cryo tower "freeze"; the art is the same coil.
const TOWER_ALIAS = { freeze: 'frost' };
// Anything without its own model borrows the closest one rather than vanishing.
const ENEMY_ALIAS = { runner: 'scout', raider: 'grunt', bulwark: 'armored', beast: 'heavy', titan: 'boss' };

const sprites = Object.create(null);

/* Per-sector terrain palettes. Only the ground changes between sectors — the
   towers and enemies are the same hardware fighting in a different climate. */
const THEMES = {
  1: { name: 'dust',  sky: ['#e0a765', '#c98144', '#9d5c33'], band: ['#5c3419', '#ffdaa0'],
       grain: ['#ffd9a0', '#6b3d1d'], road: ['#241f1a', '#4d443a', '#8b7f6c', '#cdb389'], vignette: '#2a12007a' },
  2: { name: 'frost', sky: ['#dff1ff', '#a9c9e2', '#6d90ad'], band: ['#4a6d8c', '#ffffff'],
       grain: ['#ffffff', '#5a7d99'], road: ['#1d262e', '#3f4c58', '#77879a', '#c8dcea'], vignette: '#0d223a7a' },
  3: { name: 'ash',   sky: ['#5a3a34', '#412624', '#241416'], band: ['#12080a', '#ff8b4e'],
       grain: ['#ffb066', '#1a0e0d'], road: ['#170d0c', '#3a2825', '#6a4f47', '#a67a64'], vignette: '#1a05007a' },
  4: { name: 'tide',  sky: ['#2a5f74', '#1a4356', '#0c2634'], band: ['#06202c', '#7fe6ff'],
       grain: ['#9fe8ff', '#0a2633'], road: ['#0b1a22', '#26414f', '#4d7183', '#8fb6c6'], vignette: '#02141e7a' },
  5: { name: 'night', sky: ['#2b2350', '#1c1636', '#0c0a1c'], band: ['#080618', '#b39aff'],
       grain: ['#c9b6ff', '#100c26'], road: ['#100e1e', '#2a2542', '#4f4770', '#877ba8'], vignette: '#05031280' },
  6: { name: 'null',  sky: ['#2a1440', '#1a0d2c', '#080414'], band: ['#050210', '#d07dff'],
       grain: ['#e2a6ff', '#150a24'], road: ['#0d0718', '#261440', '#472a6b', '#7a55a8'], vignette: '#0a001a85' }
};

/* ------------------------------------------------------------------ loading */

function load() {
  return fetch(SPRITE_DIR + 'manifest.json', { cache: 'force-cache' })
    .then(r => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
    .then(manifest => Promise.all(Object.entries(manifest.parts).map(([name, part]) =>
      new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          sprites[name] = { img, units: part.size / part.pixelsPerUnit };
          resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = SPRITE_DIR + part.file;
      })
    )))
    .then(results => results.some(Boolean));
}

/* Draw a sprite centred on (x, y), scaled to span `width` battlefield pixels. */
function blit(c, name, x, y, width, rotation = 0, alpha = 1) {
  const s = sprites[name];
  if (!s) return false;
  const h = width * (s.img.height / s.img.width);
  c.save();
  c.translate(x, y);
  if (rotation) c.rotate(rotation);
  if (alpha !== 1) c.globalAlpha = alpha;
  c.drawImage(s.img, -width / 2, -h / 2, width, h);
  c.restore();
  return true;
}

const has = name => !!sprites[name];
const widthOf = (name, scale) => (sprites[name] ? sprites[name].units * scale : 0);
const towerArt = type => TOWER_ALIAS[type] || type;
const enemyArt = type => 'enemy_' + (has('enemy_' + type) ? type : (ENEMY_ALIAS[type] || 'grunt'));
const levelOf = t => Math.max(1, Math.min(4, t.level || 1));

/* ------------------------------------------------------------------ terrain */

function paintTerrain(c, theme) {
  const sky = c.createLinearGradient(0, 0, 120, 1120);
  sky.addColorStop(0, theme.sky[0]);
  sky.addColorStop(0.42, theme.sky[1]);
  sky.addColorStop(1, theme.sky[2]);
  c.fillStyle = sky;
  c.fillRect(0, 0, 720, 1120);

  // Broad, low-contrast sweeps so the ground never reads as flat colour.
  c.save();
  c.globalAlpha = 0.16;
  for (let i = 0; i < 7; i++) {
    const y = 60 + i * 165;
    const grad = c.createLinearGradient(0, y - 70, 0, y + 70);
    grad.addColorStop(0, '#00000000');
    grad.addColorStop(0.5, i % 2 ? theme.band[0] : theme.band[1]);
    grad.addColorStop(1, '#00000000');
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(0, y);
    for (let x = 0; x <= 720; x += 60) c.lineTo(x, y + Math.sin((x + i * 130) / 150) * 26);
    c.lineTo(720, y + 120); c.lineTo(0, y + 120);
    c.closePath();
    c.fill();
  }
  c.restore();

  c.save();
  for (let i = 0; i < 900; i++) {
    const x = (i * 137.51 + 43) % 720, y = (i * 251.13 + 79) % 1120;
    c.globalAlpha = 0.05 + (i % 5) * 0.02;
    c.fillStyle = i % 3 ? theme.grain[0] : theme.grain[1];
    c.fillRect(x, y, 1 + (i % 3), 1 + (i % 2));
  }
  c.restore();
}

function paintRoute(c, path, theme) {
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const stroke = (width, style, dash) => {
    c.strokeStyle = style;
    c.lineWidth = width;
    c.setLineDash(dash || []);
    c.beginPath();
    path.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.stroke();
  };
  c.shadowColor = '#0009';
  c.shadowBlur = 18;
  c.shadowOffsetY = 12;
  stroke(84, theme.road[0]);
  c.shadowColor = 'transparent';
  stroke(74, theme.road[1]);
  stroke(62, theme.road[2]);
  stroke(48, theme.road[3]);
  c.globalAlpha = 0.30;
  stroke(9, theme.road[1]);
  c.globalAlpha = 1;
  stroke(3, theme.road[1], [16, 14]);
  c.setLineDash([]);
  c.restore();

  for (let i = 1; i < path.length - 1; i++) {
    const [x, y] = path[i];
    c.fillStyle = '#f0a62d';
    c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#7a4a06'; c.lineWidth = 1.5; c.stroke();
  }
}

function paintProps(c, props) {
  for (const [name, x, y, scale] of props || []) {
    const w = widthOf(name, PROP_SCALE * (scale || 1));
    if (w) blit(c, name, x, y, w);
  }
}

function paintVignette(c, theme) {
  const v = c.createRadialGradient(360, 560, 260, 360, 560, 720);
  v.addColorStop(0, '#00000000');
  v.addColorStop(1, theme.vignette);
  c.fillStyle = v;
  c.fillRect(0, 0, 720, 1120);
}

/* Terrain, route, scenery and vignette never change, so they are painted once
   into an offscreen canvas and blitted each frame. */
function buildWorld(path, theme, props) {
  const off = document.createElement('canvas');
  off.width = 720;
  off.height = 1120;
  const c = off.getContext('2d');
  paintTerrain(c, theme);
  paintProps(c, props);
  paintRoute(c, path, theme);
  paintVignette(c, theme);
  return off;
}

/* ------------------------------------------------------------------ pieces */

function drawCoreAt(c, x, y, ratio, time) {
  const hurt = ratio < 0.35;
  c.save();
  c.translate(x, y);
  c.strokeStyle = '#0c1a26';
  c.lineWidth = 9;
  c.beginPath(); c.arc(0, 0, 96, 0, Math.PI * 2); c.stroke();
  // The shield ring doubles as the base-health readout.
  c.strokeStyle = hurt ? '#ff6b5a' : ratio < 0.6 ? '#ffc93c' : '#5fe0a0';
  c.lineWidth = 7;
  c.lineCap = 'round';
  c.beginPath();
  c.arc(0, 0, 96, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, ratio));
  c.stroke();
  c.restore();

  blit(c, 'core', x, y, widthOf('core', CORE_SCALE) || 190);

  if (hurt) {
    c.save();
    c.globalAlpha = 0.45 + 0.12 * Math.sin(time * 3);
    c.fillStyle = '#2f2a26';
    for (let i = 0; i < 3; i++) {
      const t = time * 0.7 + i * 2.1;
      c.beginPath();
      c.arc(x - 30 + i * 26 + Math.sin(t) * 8, y - 70 - (t % 3) * 22, 12 + (t % 3) * 7, 0, Math.PI * 2);
      c.fill();
    }
    c.restore();
  }
}

function drawPadAt(c, p, afford, selected, time) {
  const pulse = 0.5 + 0.5 * Math.sin(time * 2.6 + (p.id || 0));
  c.save();
  c.translate(p.x, p.y);
  c.shadowColor = '#0008';
  c.shadowBlur = 12;
  c.shadowOffsetY = 7;
  c.fillStyle = '#2b3030';
  c.strokeStyle = afford ? '#7f9aa2' : '#5a6164';
  c.lineWidth = 5;
  c.beginPath();
  for (let i = 0; i < 8; i++) {
    const a = Math.PI / 8 + i * Math.PI / 4, r = 37;
    i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  c.closePath();
  c.fill();
  c.stroke();
  c.shadowColor = 'transparent';

  c.fillStyle = '#102939';
  c.beginPath(); c.arc(0, 0, 25, 0, Math.PI * 2); c.fill();
  c.strokeStyle = afford ? `rgba(89,216,255,${0.55 + pulse * 0.45})` : '#4a5257';
  c.lineWidth = 3;
  c.beginPath(); c.arc(0, 0, 25, 0, Math.PI * 2); c.stroke();

  if (selected) {
    c.strokeStyle = '#ffe16a';
    c.lineWidth = 3;
    c.setLineDash([7, 6]);
    c.lineDashOffset = -time * 26;
    c.beginPath(); c.arc(0, 0, 43, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
  }

  c.fillStyle = afford ? '#9ef2ff' : '#5b6c75';
  c.font = '700 34px system-ui, sans-serif';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText('+', 0, 1);
  c.textBaseline = 'alphabetic';
  c.restore();
}

function drawTowerAt(c, t) {
  const kind = towerArt(t.type), level = levelOf(t);
  const baseName = `${kind}_base_l${level}`;
  const turretName = `${kind}_turret_l${level}`;
  const w = widthOf(baseName, TOWER_SCALE);
  if (!w) return false;

  const pulse = t.pulse || 0;
  if (pulse > 0) {
    c.save();
    c.globalAlpha = Math.min(1, pulse * 1.5);
    c.strokeStyle = '#fff6a8';
    c.lineWidth = 5;
    c.beginPath();
    c.arc(t.x, t.y, 44 + (1 - pulse) * 22, 0, Math.PI * 2);
    c.stroke();
    c.restore();
  }

  blit(c, baseName, t.x, t.y, w);
  const angle = t.angle || 0;
  const kick = (t.recoil || 0) * (t.type === 'cannon' ? 7 : 3.5);
  blit(c, turretName,
    t.x - Math.cos(angle) * kick,
    t.y - Math.sin(angle) * kick,
    widthOf(turretName, TOWER_SCALE), angle);
  return true;
}

function drawEnemyAt(c, e, x, y) {
  const name = enemyArt(e.type);
  const size = e.size || 11;
  const w = size * 4.2;

  c.save();
  c.globalAlpha = 0.30;
  c.fillStyle = '#000';
  c.beginPath();
  c.ellipse(x + 3, y + 5, size * 1.15, size * 0.68, 0, 0, Math.PI * 2);
  c.fill();
  c.restore();

  if (!blit(c, name, x, y, w, e.angle || 0)) return false;

  if (e.hitFlash > 0) {
    c.save();
    c.globalAlpha = Math.min(0.75, e.hitFlash * 8);
    c.globalCompositeOperation = 'lighter';
    c.fillStyle = '#fff';
    c.beginPath(); c.arc(x, y, size * 1.1, 0, Math.PI * 2); c.fill();
    c.restore();
  }
  if (e.slow > 0) {
    c.save();
    c.globalAlpha = 0.42;
    c.strokeStyle = '#9df8ff';
    c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, size + 6, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#9df8ff33';
    c.fill();
    c.restore();
  }
  if (e.shield > 0) {
    c.save();
    c.globalAlpha = 0.5;
    c.strokeStyle = '#c08dff';
    c.lineWidth = 3;
    c.beginPath(); c.arc(x, y, size + 10, 0, Math.PI * 2); c.stroke();
    c.restore();
  }
  return true;
}

function drawHealthBarAt(c, e, x, y) {
  if (e.hp >= e.maxHp) return;
  const size = e.size || 11;
  const w = Math.max(24, size * 2.2);
  c.fillStyle = '#17201c';
  c.fillRect(x - w / 2, y - size - 12, w, 5);
  const pct = Math.max(0, Math.min(1, e.hp / e.maxHp));
  c.fillStyle = pct > 0.5 ? '#58e65f' : pct > 0.25 ? '#ffd43b' : '#ff6b5a';
  c.fillRect(x - w / 2, y - size - 12, w * pct, 5);
}

function drawProjectileAt(c, p) {
  const kind = p.type === 'freeze' ? 'frost' : p.type;
  if (kind === 'gun') {
    c.save();
    c.strokeStyle = '#ffe9a8';
    c.lineWidth = 3.5;
    c.lineCap = 'round';
    c.beginPath(); c.moveTo(p.px ?? p.x, p.py ?? p.y); c.lineTo(p.x, p.y); c.stroke();
    c.strokeStyle = '#fff';
    c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(p.px ?? p.x, p.py ?? p.y); c.lineTo(p.x, p.y); c.stroke();
    c.restore();
  } else if (kind === 'cannon') {
    c.save();
    c.shadowColor = '#ff9f3f';
    c.shadowBlur = 14;
    c.translate(p.x, p.y);
    c.rotate(p.spin || 0);
    c.fillStyle = '#2c2c2e';
    c.strokeStyle = '#ff9f3f';
    c.lineWidth = 3;
    c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#ffd08a';
    c.fillRect(-2, -9, 4, 4);
    c.restore();
  } else if (kind === 'arc') {
    c.save();
    c.shadowColor = '#c08dff';
    c.shadowBlur = 16;
    c.fillStyle = '#e9d0ff';
    c.beginPath(); c.arc(p.x, p.y, 6, 0, Math.PI * 2); c.fill();
    c.restore();
  } else {
    c.save();
    c.shadowColor = '#9bf6ff';
    c.shadowBlur = 16;
    c.translate(p.x, p.y);
    c.rotate((p.spin || 0) * 0.6);
    c.fillStyle = '#dbffff';
    c.strokeStyle = '#5fd6f2';
    c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = i * Math.PI / 3, r = i % 2 ? 3.5 : 7;
      i ? c.lineTo(Math.cos(a) * r, Math.sin(a) * r) : c.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    c.closePath(); c.fill(); c.stroke();
    c.restore();
  }
}

/* --------------------------------------------------------------- installers */

const cheapestCost = towers =>
  Math.min(...Object.values(towers || {}).map(t => t.cost).filter(Number.isFinite));

/* Sectors 1-3: drawX(ctx, thing). */
function installClassic(game, { path, theme, props, towers, base }) {
  const world = buildWorld(path, theme, props);
  const floor = cheapestCost(towers);
  const original = Object.getPrototypeOf(game);

  game.drawWorld = function (c) {
    c.drawImage(world, 0, 0);
    this.drawBase(c);
  };
  game.drawBase = function (c) {
    const max = this.maxBaseHp || 100;
    drawCoreAt(c, base.x, base.y, this.baseHp / max, this.time || 0);
  };
  game.drawPad = function (c, p) {
    drawPadAt(c, p, this.gold >= floor, this.selectedPad === p, this.time || 0);
  };
  game.drawTower = function (c, t) {
    if (!drawTowerAt(c, t)) original.drawTower.call(this, c, t);
  };
  game.drawEnemy = function (c, e) {
    const lane = e.lane || 0;
    const x = e.x + Math.cos((e.angle || 0) + Math.PI / 2) * lane;
    const y = e.y + Math.sin((e.angle || 0) + Math.PI / 2) * lane;
    if (!drawEnemyAt(c, e, x, y)) { original.drawEnemy.call(this, c, e); return; }
    drawHealthBarAt(c, e, x, y);
  };
  game.drawProjectile = function (c, p) { drawProjectileAt(c, p); };
}

/* Sectors 4, 5 and 6: drawX(thing), context held on the instance.
 *
 * These sectors apply their lane jitter differently — some offset both axes,
 * some only the vertical — so the caller supplies it rather than the pack
 * guessing and drawing every unit a few pixels off its hitbox. Pads are only
 * restyled where the sector exposes a drawPad to override. */
const BOTH_AXES = e => [(e.lane || 0) * 0.25, (e.lane || 0) * 0.25];

function installCompact(game, { path, theme, props, towers, base, ctxKey, laneOffset = BOTH_AXES }) {
  const world = buildWorld(path, theme, props);
  const floor = cheapestCost(towers);
  const original = Object.getPrototypeOf(game);
  const ctx = () => game[ctxKey];

  if (typeof game.drawWorld === 'function') {
    game.drawWorld = function () {
      const c = ctx();
      c.drawImage(world, 0, 0);
    };
  }
  if (typeof game.drawBase === 'function' && base) {
    game.drawBase = function () {
      const max = this.maxBaseHp || 100;
      drawCoreAt(ctx(), base.x, base.y, this.baseHp / max, (this.time || performance.now() / 1000));
    };
  }
  // Sectors that expose a drawPad, or check for one before drawing their own,
  // pick this up; the rest simply never call it.
  game.drawPad = function (p) {
    if (p.tower) return;
    drawPadAt(ctx(), p, this.gold >= floor, this.selectedPad === p,
      this.time || performance.now() / 1000);
  };
  game.drawTower = function (t) {
    if (!drawTowerAt(ctx(), t)) original.drawTower.call(this, t);
  };
  game.drawEnemy = function (e) {
    const c = ctx();
    const [dx, dy] = laneOffset(e);
    const x = e.x + dx, y = e.y + dy;
    if (!drawEnemyAt(c, e, x, y)) { original.drawEnemy.call(this, e); return; }
    drawHealthBarAt(c, e, x, y);
  };
}

window.FUN_TD_ART = {
  load, blit, has, widthOf, sprites,
  THEMES, TOWER_SCALE, CORE_SCALE, PROP_SCALE,
  towerArt, enemyArt,
  paintTerrain, paintRoute, paintProps, paintVignette, buildWorld,
  drawCoreAt, drawPadAt, drawTowerAt, drawEnemyAt, drawHealthBarAt, drawProjectileAt,
  installClassic, installCompact, BOTH_AXES,

  /* The runtimes boot asynchronously; poll briefly rather than racing them. */
  whenReady(callback, timeoutMs = 9000) {
    let waited = 0;
    const timer = setInterval(() => {
      waited += 90;
      const game = window.funTDGame;
      if (!game) {
        if (waited > timeoutMs) clearInterval(timer);
        return;
      }
      clearInterval(timer);
      load()
        .then(ok => {
          if (ok) callback(game);
          else console.warn('FUN TD art: sprite set unavailable, using procedural fallback');
        })
        .catch(err => console.warn('FUN TD art: sprite load failed, using procedural fallback', err));
    }, 90);
  }
};
})();
