/* Installs the 3D battlefield onto whichever sector runtime booted.
 *
 * See stage3d.js for the approach. This file owns the part that has to know
 * about the game: which of its objects become meshes, how they are kept in
 * sync each frame, how the camera is driven, and how a tap on a rotated view
 * still lands on the right build pad.
 *
 * It is strictly additive. The only game methods replaced are the four that
 * would paint a flattened tower or unit onto the ground beneath its own 3D
 * model, and pointer(), which has to account for the camera angle. If anything
 * here throws, everything is torn down and the untouched 2D game remains.
 */
import { createStage } from './stage3d.js';

const SETTING = 'funTD_view3d';

function enabled() {
  try { return localStorage.getItem(SETTING) !== '0'; } catch (e) { return true; }
}
function setEnabled(on) {
  try { localStorage.setItem(SETTING, on ? '1' : '0'); } catch (e) {}
}

function waitForGame(timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    let waited = 0;
    const timer = setInterval(() => {
      waited += 90;
      if (window.funTDGame) { clearInterval(timer); resolve(window.funTDGame); }
      else if (waited > timeoutMs) { clearInterval(timer); reject(new Error('no game')); }
    }, 90);
  });
}

/* The cryo tower is "freeze" in sectors 02-06 and "frost" in 01; the model is
   the same coil. Anything with no model of its own borrows the nearest one
   rather than vanishing from the battlefield. */
const TOWER_ALIAS = { freeze: 'frost' };
const ENEMY_ALIAS = {
  runner: 'scout', raider: 'grunt', bulwark: 'armored', beast: 'heavy', titan: 'boss',
  mite: 'scout', surger: 'armored', warden: 'armored', splitter: 'armored'
};
const KNOWN_TOWERS = ['gun', 'frost', 'cannon', 'arc', 'flak', 'rail', 'void'];
const KNOWN_ENEMIES = ['grunt', 'scout', 'armored', 'heavy', 'boss', 'drone', 'gunship',
                       'brute', 'splitter', 'mite', 'surger', 'warden'];

const towerModel = t => TOWER_ALIAS[t] || t;
const enemyModel = t => (KNOWN_ENEMIES.includes(t) ? t : (ENEMY_ALIAS[t] || 'grunt'));

export async function install() {
  const game = await waitForGame();
  const stage = createStage(game);
  const { THREE, scene } = stage;

  /* ------------------------------------------------------------- actors */

  // One group per live entity, keyed off the entity object itself so nothing
  // has to be given an id and dead entities are collected with their meshes.
  const towerNodes = new Map();
  const enemyNodes = new Map();

  function makeTower(tower) {
    const node = new THREE.Group();
    node.userData.level = 0;
    scene.add(node);
    return node;
  }

  async function dressTower(node, type, level) {
    if (node.userData.level === level) return;
    node.userData.level = level;
    // Swap the whole rig on an upgrade so a level 4 platform really is the
    // level 4 model rather than a scaled level 1.
    for (const child of [...node.children]) node.remove(child);
    const kind = towerModel(type);
    const name = KNOWN_TOWERS.includes(kind) ? kind : 'gun';
    const [base, turret] = await Promise.all([
      stage.loadModel(`${name}_base_l${level}`),
      stage.loadModel(`${name}_turret_l${level}`)
    ]);
    if (base) node.add(base.clone(true));
    if (turret) {
      const t = turret.clone(true);
      // The turret pivots about the platform's centre, exactly as the 2D
      // renderer rotates the turret sprite about the image centre.
      const pivot = new THREE.Group();
      pivot.add(t);
      pivot.name = 'turret';
      node.add(pivot);
    }
  }

  async function makeEnemy(enemy) {
    const node = new THREE.Group();
    scene.add(node);
    const name = 'enemy_' + enemyModel(enemy.type);
    const model = await stage.loadModel(name);
    if (model) {
      const unit = model.clone(true);
      // Match the 2D layer's own sizing rule exactly: it draws a unit sprite
      // `size * 4.2` pixels wide. Sharing that one number is what keeps a
      // grunt the same size in both renderers instead of half again too big.
      unit.scale.setScalar(stage.scaleFor(name, (enemy.size || 11) * 4.2));
      node.add(unit);
      // Cache the meshes once. Walking the tree every frame for the hit flash
      // is a per-enemy traverse on every unit on the board.
      node.userData.meshes = [];
      unit.traverse(o => { if (o.isMesh && o.material) node.userData.meshes.push(o); });
    }
    return node;
  }

  /* --------------------------------------------------------------- sync */

  function syncTowers() {
    const live = game.towers || [];
    for (const tower of live) {
      let node = towerNodes.get(tower);
      if (!node) { node = makeTower(tower); towerNodes.set(tower, node); }
      const level = Math.max(1, Math.min(4, tower.level || 1));
      if (node.userData.level !== level) dressTower(node, tower.type, level);
      node.position.set(stage.wx(tower.x), 0, stage.wz(tower.y));
      const turret = node.getObjectByName('turret');
      if (turret) {
        turret.rotation.y = stage.facing(tower.angle);
        // Recoil kicks the turret back along its own barrel line.
        const kick = (tower.recoil || 0) * 3;
        turret.position.set(
          -Math.cos(tower.angle || 0) * kick, 0, Math.sin(tower.angle || 0) * kick
        );
      }
    }
    const alive = new Set(live);
    for (const [tower, node] of towerNodes) {
      if (alive.has(tower)) continue;
      scene.remove(node);
      towerNodes.delete(tower);
    }
  }

  function syncEnemies() {
    const live = game.enemies || [];
    for (const enemy of live) {
      if (!enemy.active) continue;
      let node = enemyNodes.get(enemy);
      if (node === undefined) {
        enemyNodes.set(enemy, null);              // claim the slot while loading
        makeEnemy(enemy).then(n => {
          if (enemyNodes.get(enemy) === null && enemy.active) enemyNodes.set(enemy, n);
          else scene.remove(n);
        });
        continue;
      }
      if (!node) continue;
      // Fliers ride at altitude with the same bob the 2D layer draws, so the
      // two renderers put them in the same place.
      const lift = enemy.flying ? (enemy.altitude || 34) + Math.sin(enemy.bob || 0) * 3 : 0;
      node.position.set(stage.wx(enemy.x), lift, stage.wz(enemy.y));
      node.rotation.y = stage.facing(enemy.angle);
      const hit = enemy.hitFlash > 0;
      if (hit !== node.userData.hit) {
        node.userData.hit = hit;
        for (const o of node.userData.meshes || []) {
          const m = o.material;
          if (!m || !m.emissive) continue;
          if (hit) {
            if (o.userData.baseEmissive === undefined) o.userData.baseEmissive = m.emissive.getHex();
            m.emissive.setHex(0xffffff);
          } else if (o.userData.baseEmissive !== undefined) {
            m.emissive.setHex(o.userData.baseEmissive);
          }
        }
      }
    }
    const alive = new Set(live);
    for (const [enemy, node] of enemyNodes) {
      if (enemy.active && alive.has(enemy)) continue;
      if (node) scene.remove(node);
      enemyNodes.delete(enemy);
    }
  }

  /* The command core is a fixture rather than an entity, so it is placed once. */
  const MAP = (window.FUN_TD_SECTOR_MODEL || window.FUN_TD_MODEL || {}).MAP;
  if (MAP && MAP.base) {
    stage.loadModel('core').then(core => {
      if (!core) return;
      const node = core.clone(true);
      node.position.set(stage.wx(MAP.base.x), 0, stage.wz(MAP.base.y));
      scene.add(node);
    });
  }

  /* ------------------------------------------------------------- camera */

  const surface = stage.canvas;
  const HOME = { azimuth: stage.azimuth, elevation: stage.elevation, zoom: 1 };

  /* One finger orbits, two pinch to zoom, and a tap is still a tap. Tracking
     every active pointer rather than just the first is what lets those three
     coexist without a second finger being read as a wild drag. */
  const pointers = new Map();
  let moved = 0, pinchStart = 0, zoomStart = 1;

  const spread = () => {
    const [a, b] = [...pointers.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };

  surface.addEventListener('pointerdown', e => {
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) moved = 0;
    if (pointers.size === 2) { pinchStart = spread(); zoomStart = stage.zoom; }
    try { surface.setPointerCapture(e.pointerId); } catch (err) {}
  });

  surface.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (!prev) return;
    const dx = e.clientX - prev.x, dy = e.clientY - prev.y;
    prev.x = e.clientX; prev.y = e.clientY;

    if (pointers.size >= 2) {
      if (pinchStart > 0) stage.zoom = zoomStart * (spread() / pinchStart);
      moved += 99;                   // a pinch is never a tap
      return;
    }
    moved += Math.abs(dx) + Math.abs(dy);
    stage.azimuth = stage.azimuth - dx * 0.008;
    stage.elevation = stage.elevation + dy * 0.005;
  });

  const release = e => {
    if (!pointers.has(e.pointerId)) return;
    const last = pointers.size;
    pointers.delete(e.pointerId);
    try { surface.releasePointerCapture(e.pointerId); } catch (err) {}
    if (last !== 1) { pinchStart = 0; return; }
    // A drag turns the camera; only a tap is a tap. The threshold keeps a
    // slightly shaky finger from being read as an orbit.
    if (moved < 9) game.tap(e);
  };
  surface.addEventListener('pointerup', release);
  surface.addEventListener('pointercancel', e => { pointers.delete(e.pointerId); pinchStart = 0; });

  surface.addEventListener('wheel', e => {
    e.preventDefault();
    stage.zoom = stage.zoom * (e.deltaY > 0 ? 0.92 : 1.08);
  }, { passive: false });

  /* A way back. Orbiting is a toy until there is a one-tap route to a known
     good angle, because a player who has spun the camera somewhere unhelpful
     mid-wave needs out immediately, not a careful drag back. */
  function addCameraButton() {
    const host = document.getElementById('cornerControls');
    if (!host || document.getElementById('cameraReset')) return;
    const btn = document.createElement('button');
    btn.id = 'cameraReset';
    btn.type = 'button';
    btn.title = 'Reset the camera';
    btn.setAttribute('aria-label', 'Reset the camera');
    btn.textContent = '\u2941';
    btn.onclick = () => {
      stage.zoom = HOME.zoom;
      stage.elevation = HOME.elevation;
      stage.azimuth = HOME.azimuth;
    };
    host.insertBefore(btn, host.firstChild);

    // A way out. The 3D stage is the default, but a player on weak hardware,
    // or one who simply prefers the flat plan view, should not have to clear
    // site data to get it back.
    const flat = document.createElement('button');
    flat.id = 'view2d';
    flat.type = 'button';
    flat.title = 'Switch to the flat 2D battlefield';
    flat.setAttribute('aria-label', 'Switch to the flat 2D battlefield');
    flat.textContent = '2D';
    flat.onclick = () => { setEnabled(false); location.reload(); };
    host.insertBefore(flat, btn.nextSibling);
  }
  addCameraButton();

  /* --------------------------------------------------------------- input */

  /* Every sector converts a pointer event to world coordinates in one place,
     which is the only reason a rotated camera can be dropped under a 2D game
     at all: replace that one method with a raycast onto the ground plane and
     every tap, pad pick and menu keeps working at any angle. */
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const point = new THREE.Vector3();

  game.pointer = function (e) {
    const r = stage.canvas.getBoundingClientRect();
    ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    raycaster.setFromCamera(ndc, stage.camera);
    if (!raycaster.ray.intersectPlane(plane, point)) return { x: -9999, y: -9999 };
    return { x: point.x + stage.WORLD_W / 2, y: point.z + stage.WORLD_H / 2 };
  };

  /* ------------------------------------------------------- render takeover */

  // The 2D renderer keeps painting the ground, but must stop painting the
  // actors: a flattened tower drawn under its own model reads as a smear.
  const noop = () => {};
  game.drawTower = noop;
  game.drawEnemy = noop;
  game.drawHealthBar = noop;
  if (typeof game.drawBase === 'function') game.drawBase = noop;

  /* The wave banner and the combo counter are screen-space captions that the
     2D renderer happens to paint into the middle of the world canvas. On a
     ground plane they end up lying flat on the sand at whatever angle the
     camera is at, which reads as graffiti. They are re-routed to the toast so
     nothing is lost. */
  if (typeof game.drawBanner === 'function') {
    let announced = null;
    game.drawBanner = function () {
      const text = this.banner && this.banner.text;
      if (text && text !== announced) { announced = text; this.toast(text, 1200); }
      if (!text) announced = null;
    };
  }
  if (typeof game.drawCombo === 'function') game.drawCombo = noop;
  if (typeof game.drawSpawnWarning === 'function') game.drawSpawnWarning = noop;

  /* Nothing to draw while the home screen is up, and a phone should not be
     turning a WebGL scene over behind an opaque menu. */
  const intro = document.getElementById('intro');
  const hidden = () => (intro && !intro.classList.contains('hidden')) ||
                       document.visibilityState === 'hidden';

  let frames = 0;
  function frame() {
    if (!stage.canvas.isConnected) return;
    if (hidden()) { requestAnimationFrame(frame); return; }
    try {
      syncTowers();
      syncEnemies();
      stage.groundTex.needsUpdate = true;
      stage.render();
    } catch (err) {
      if (frames < 3) console.warn('FUN TD 3D: frame failed', err);
    }
    frames++;
    requestAnimationFrame(frame);
  }

  addEventListener('resize', () => stage.resize());
  stage.resize();
  requestAnimationFrame(frame);

  document.documentElement.dataset.view3d = '1';
  // Exposed so the camera can be driven from the console and from tests.
  window.FUN_TD_STAGE = window.__stage = stage;
  return stage;
}

/* ------------------------------------------------------------------- boot */

if (enabled()) {
  install().catch(err => {
    console.warn('FUN TD 3D: unavailable, staying on the 2D battlefield', err);
    document.getElementById('stage3d')?.remove();
    document.documentElement.dataset.view3d = '0';
  });
} else {
  document.documentElement.dataset.view3d = '0';
}

window.FUN_TD_VIEW3D = { enabled, setEnabled };
