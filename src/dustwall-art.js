/* Dustwall art pack — Sector 01.
 *
 * Replaces the runtime's procedural fallback drawing with the Blender-rendered
 * sprite set in assets/sprites (see tools/blender/build_sprites.py).  Towers are
 * a static base plus a turret rotated about the image centre, which is why the
 * two halves are rendered separately with a shared camera.
 *
 * Everything degrades: if the manifest or any image fails to load, the runtime
 * keeps its own procedural drawing and the game still plays.
 */
(() => {
if ((window.FUN_TD_SECTOR || 1) !== 1 || window.FUN_TD_ENDLESS) return;

const SPRITE_DIR = 'assets/sprites/';
// Blender units → battlefield pixels, chosen per family so a tower deck lands
// at roughly the old pad footprint and the core keeps its 82px radius.
const TOWER_SCALE = 46;
const CORE_SCALE = 60;
const PROP_SCALE = 34;

const sprites = Object.create(null);
let ready = false;

function loadSprites() {
  return fetch(SPRITE_DIR + 'manifest.json', { cache: 'force-cache' })
    .then(r => { if (!r.ok) throw new Error('manifest ' + r.status); return r.json(); })
    .then(manifest => Promise.all(Object.entries(manifest.parts).map(([name, part]) =>
      new Promise(resolve => {
        const img = new Image();
        img.onload = () => {
          sprites[name] = { img, ppu: part.pixelsPerUnit, units: part.size / part.pixelsPerUnit };
          resolve(true);
        };
        img.onerror = () => resolve(false);
        img.src = SPRITE_DIR + part.file;
      })
    )))
    .then(results => { ready = results.some(Boolean); return ready; });
}

/* Draw a sprite centred on (x, y), scaled so it spans `width` battlefield px. */
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

const spriteWidth = (name, scale) => (sprites[name] ? sprites[name].units * scale : 0);

/* ------------------------------------------------------------------ world */

const PATH = [[710, 145], [520, 145], [520, 315], [650, 315], [650, 500], [430, 500],
              [430, 690], [620, 690], [620, 930], [330, 930], [330, 780], [210, 780],
              [210, 630], [150, 630]];
const BASE = { x: 112, y: 600 };

// Scenery is authored once here rather than scattered through the draw call.
const PROPS = [
  ['prop_rock', 62, 432, 1.15], ['prop_rock', 288, 336, 0.75], ['prop_rock', 352, 722, 0.7],
  ['prop_rock', 668, 612, 0.85], ['prop_rock', 96, 922, 0.8], ['prop_rock', 176, 196, 0.9],
  ['prop_rock', 604, 1062, 0.95], ['prop_rock', 300, 1024, 0.7],
  ['prop_crate', 82, 458, 0.85], ['prop_crate', 308, 470, 0.95], ['prop_crate', 676, 722, 0.85],
  ['prop_crate', 190, 358, 0.75], ['prop_crate', 118, 336, 0.7],
  ['prop_barrel', 60, 496, 0.8], ['prop_barrel', 344, 452, 0.75], ['prop_barrel', 700, 690, 0.8],
  ['prop_barrel', 262, 1058, 0.75],
  ['prop_sandbags', 268, 616, 0.9], ['prop_sandbags', 548, 962, 0.9], ['prop_sandbags', 168, 706, 0.8]
];

function paintTerrain(c) {
  const sky = c.createLinearGradient(0, 0, 120, 1120);
  sky.addColorStop(0, '#e0a765');
  sky.addColorStop(0.42, '#c98144');
  sky.addColorStop(1, '#9d5c33');
  c.fillStyle = sky;
  c.fillRect(0, 0, 720, 1120);

  // Dune bands: broad, low-contrast sweeps that keep the sand from reading flat.
  c.save();
  c.globalAlpha = 0.16;
  for (let i = 0; i < 7; i++) {
    const y = 60 + i * 165;
    const grad = c.createLinearGradient(0, y - 70, 0, y + 70);
    grad.addColorStop(0, '#00000000');
    grad.addColorStop(0.5, i % 2 ? '#5c3419' : '#ffdaa0');
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

  // Grain.
  c.save();
  for (let i = 0; i < 900; i++) {
    const x = (i * 137.51 + 43) % 720, y = (i * 251.13 + 79) % 1120;
    c.globalAlpha = 0.05 + (i % 5) * 0.02;
    c.fillStyle = i % 3 ? '#ffd9a0' : '#6b3d1d';
    c.fillRect(x, y, 1 + (i % 3), 1 + (i % 2));
  }
  c.restore();
}

function paintRoute(c) {
  c.save();
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const stroke = (width, style, dash) => {
    c.strokeStyle = style;
    c.lineWidth = width;
    if (dash) c.setLineDash(dash); else c.setLineDash([]);
    c.beginPath();
    PATH.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.stroke();
  };
  c.shadowColor = '#0009';
  c.shadowBlur = 18;
  c.shadowOffsetY = 12;
  stroke(84, '#241f1a');
  c.shadowColor = 'transparent';
  stroke(74, '#4d443a');
  stroke(62, '#8b7f6c');
  stroke(48, '#cdb389');
  // Wheel ruts, then the dashed centre line.
  c.globalAlpha = 0.30;
  stroke(9, '#6d5b41');
  c.globalAlpha = 1;
  stroke(3, '#5a5147', [16, 14]);
  c.setLineDash([]);
  c.restore();

  // Corner markers so every turn is legible at a glance.
  for (let i = 1; i < PATH.length - 1; i++) {
    const [x, y] = PATH[i];
    c.fillStyle = '#f0a62d';
    c.beginPath(); c.arc(x, y, 4.5, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#7a4a06'; c.lineWidth = 1.5; c.stroke();
  }
}

function paintProps(c) {
  for (const [name, x, y, scale] of PROPS) {
    const w = spriteWidth(name, PROP_SCALE * scale);
    if (w) blit(c, name, x, y, w);
  }
}

function paintVignette(c) {
  const v = c.createRadialGradient(360, 560, 260, 360, 560, 720);
  v.addColorStop(0, '#00000000');
  v.addColorStop(1, '#2a12007a');
  c.fillStyle = v;
  c.fillRect(0, 0, 720, 1120);
}

/* The terrain, route, scenery and vignette never change, so they are painted
   once into an offscreen canvas and blitted each frame. */
let worldCache = null;
function buildWorldCache() {
  const off = document.createElement('canvas');
  off.width = 720;
  off.height = 1120;
  const c = off.getContext('2d');
  paintTerrain(c);
  paintProps(c);
  paintRoute(c);
  paintVignette(c);
  worldCache = off;
}

/* ------------------------------------------------------------------ install */

function install(game) {
  buildWorldCache();

  game.drawWorld = function (c) {
    c.drawImage(worldCache, 0, 0);
    this.drawBase(c);
  };

  game.drawBase = function (c) {
    const hp = this.baseHp / this.maxBaseHp;
    const w = spriteWidth('core', CORE_SCALE) || 190;
    const hurt = hp < 0.35;

    // Shield ring doubles as the health readout.
    c.save();
    c.translate(BASE.x, BASE.y);
    c.strokeStyle = '#0c1a26';
    c.lineWidth = 9;
    c.beginPath(); c.arc(0, 0, 96, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = hurt ? '#ff6b5a' : hp < 0.6 ? '#ffc93c' : '#5fe0a0';
    c.lineWidth = 7;
    c.lineCap = 'round';
    c.beginPath();
    c.arc(0, 0, 96, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, hp));
    c.stroke();
    c.restore();

    blit(c, 'core', BASE.x, BASE.y, w);

    if (hurt) {
      // Damage smoke, drawn over the sprite rather than baked into it.
      c.save();
      c.globalAlpha = 0.45 + 0.12 * Math.sin(this.time * 3);
      c.fillStyle = '#2f2a26';
      for (let i = 0; i < 3; i++) {
        const t = this.time * 0.7 + i * 2.1;
        c.beginPath();
        c.arc(BASE.x - 30 + i * 26 + Math.sin(t) * 8, BASE.y - 70 - (t % 3) * 22, 12 + (t % 3) * 7, 0, Math.PI * 2);
        c.fill();
      }
      c.restore();
    }
  };

  game.drawPad = function (c, p) {
    const cheapest = Math.min(...Object.values(window.FUN_TD_MODEL.TOWERS).map(t => t.cost));
    const afford = this.gold >= cheapest;
    const hover = this.selectedPad === p;
    const pulse = 0.5 + 0.5 * Math.sin(this.time * 2.6 + p.id);
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

    if (hover) {
      c.strokeStyle = '#ffe16a';
      c.lineWidth = 3;
      c.setLineDash([7, 6]);
      c.lineDashOffset = -this.time * 26;
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
  };

  game.drawTower = function (c, t) {
    const baseName = `${t.type}_base_l${t.level}`;
    const turretName = `${t.type}_turret_l${t.level}`;
    const w = spriteWidth(baseName, TOWER_SCALE);
    if (!w) return Object.getPrototypeOf(this).drawTower.call(this, c, t);

    if (t.pulse > 0) {
      c.save();
      c.globalAlpha = Math.min(1, t.pulse * 1.5);
      c.strokeStyle = '#fff6a8';
      c.lineWidth = 5;
      c.beginPath();
      c.arc(t.x, t.y, 44 + (1 - t.pulse) * 22, 0, Math.PI * 2);
      c.stroke();
      c.restore();
    }

    blit(c, baseName, t.x, t.y, w);
    // Recoil pushes the turret back along its own barrel axis.
    const kick = t.recoil * (t.type === 'cannon' ? 7 : 3.5);
    blit(c, turretName,
      t.x - Math.cos(t.angle) * kick,
      t.y - Math.sin(t.angle) * kick,
      spriteWidth(turretName, TOWER_SCALE), t.angle);
  };

  game.drawEnemy = function (c, e) {
    const ox = Math.cos(e.angle + Math.PI / 2) * e.lane;
    const oy = Math.sin(e.angle + Math.PI / 2) * e.lane;
    const x = e.x + ox, y = e.y + oy;
    const name = 'enemy_' + e.type;
    const w = e.size * 4.2;

    // Contact shadow keeps units sitting on the road instead of floating.
    c.save();
    c.globalAlpha = 0.30;
    c.fillStyle = '#000';
    c.beginPath();
    c.ellipse(x + 3, y + 5, e.size * 1.15, e.size * 0.68, 0, 0, Math.PI * 2);
    c.fill();
    c.restore();

    if (!blit(c, name, x, y, w, e.angle)) {
      Object.getPrototypeOf(this).drawEnemy.call(this, c, e);
      return;
    }

    if (e.hitFlash > 0) {
      c.save();
      c.globalAlpha = Math.min(0.75, e.hitFlash * 8);
      c.globalCompositeOperation = 'lighter';
      c.fillStyle = '#fff';
      c.beginPath(); c.arc(x, y, e.size * 1.1, 0, Math.PI * 2); c.fill();
      c.restore();
    }
    if (e.slow > 0) {
      c.save();
      c.globalAlpha = 0.42;
      c.strokeStyle = '#9df8ff';
      c.lineWidth = 3;
      c.beginPath(); c.arc(x, y, e.size + 6, 0, Math.PI * 2); c.stroke();
      c.fillStyle = '#9df8ff33';
      c.fill();
      c.restore();
    }
    this.drawHealthBar(c, e, x, y);
  };

  game.drawProjectile = function (c, p) {
    if (p.type === 'gun') {
      c.save();
      c.strokeStyle = '#ffe9a8';
      c.lineWidth = 3.5;
      c.lineCap = 'round';
      c.beginPath(); c.moveTo(p.px, p.py); c.lineTo(p.x, p.y); c.stroke();
      c.strokeStyle = '#fff';
      c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(p.px, p.py); c.lineTo(p.x, p.y); c.stroke();
      c.restore();
    } else if (p.type === 'cannon') {
      c.save();
      c.shadowColor = '#ff9f3f';
      c.shadowBlur = 14;
      c.translate(p.x, p.y);
      c.rotate(p.spin);
      c.fillStyle = '#2c2c2e';
      c.strokeStyle = '#ff9f3f';
      c.lineWidth = 3;
      c.beginPath(); c.arc(0, 0, 8, 0, Math.PI * 2); c.fill(); c.stroke();
      c.fillStyle = '#ffd08a';
      c.fillRect(-2, -9, 4, 4);
      c.restore();
    } else {
      c.save();
      c.shadowColor = '#9bf6ff';
      c.shadowBlur = 16;
      c.translate(p.x, p.y);
      c.rotate(p.spin * 0.6);
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
  };
}

/* The runtime may not have booted yet; poll briefly rather than racing it. */
let waited = 0;
const timer = setInterval(() => {
  const game = window.funTDGame;
  waited += 90;
  if (!game) {
    if (waited > 8000) clearInterval(timer);
    return;
  }
  clearInterval(timer);
  loadSprites()
    .then(ok => {
      if (ok) install(game);
      else console.warn('Dustwall art: sprite set unavailable, using procedural fallback');
    })
    .catch(err => console.warn('Dustwall art: sprite load failed, using procedural fallback', err));
}, 90);
})();
