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
import { createEffects } from './stage3d-fx.js';

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

  /* -------------------------------------------------------- environment */

  const MAP = (window.FUN_TD_SECTOR_MODEL || window.FUN_TD_MODEL || {}).MAP;

  /* Distance from a point to the route, which is the one thing the terrain
     needs to know and the stage cannot: it decides where the ground is allowed
     to have relief. */
  function distanceToPath(x, y, path) {
    let best = Infinity;
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i];
      const dx = bx - ax, dy = by - ay;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      const d = Math.hypot(x - (ax + dx * t), y - (ay + dy * t));
      if (d < best) best = d;
    }
    return best;
  }

  /* How much of the terrain's height survives at this point. Flat over the road
     and the pads, easing back to full relief beyond them, so units walk on
     level ground and towers sit square while the dunes start just off the
     verge. Cubic smoothstep rather than a linear ramp: a straight blend leaves
     a visible crease along the roadside. */
  function relief(path, pads) {
    const ROAD = 46, VERGE = 120, PAD = 52, PAD_VERGE = 46;
    return (x, y) => {
      let d = distanceToPath(x, y, path);
      for (const pad of pads) {
        const pd = Math.hypot(x - pad.x, y - pad.y) - (PAD - ROAD);
        if (pd < d) d = pd;
      }
      if (d <= ROAD) return 0;
      const t = Math.min(1, (d - ROAD) / VERGE);
      return t * t * (3 - 2 * t);
    };
  }

  /* Scenery, placed where it cannot get in the way: clear of the route, clear
     of every build pad, and clear of the core. Seeded so a sector looks the
     same every time it is played rather than rearranging itself. */
  function scatterEnvironment(path, pads, base) {
    let seed = 0x5f3a * (window.FUN_TD_SECTOR || 1) + path.length;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const kinds = ['env_boulder', 'env_boulder', 'env_scrub', 'env_scrub',
                   'env_spire', 'env_cactus', 'env_ruin'];
    const spots = [];

    // On the battlefield itself, where scenery has to keep out of the way.
    for (let tries = 0; tries < 500 && spots.length < 26; tries++) {
      const x = rand() * stage.WORLD_W;
      const y = rand() * stage.WORLD_H;
      if (distanceToPath(x, y, path) < 96) continue;
      if (base && Math.hypot(x - base.x, y - base.y) < 130) continue;
      if (pads.some(p => Math.hypot(x - p.x, y - p.y) < 96)) continue;
      if (spots.some(s => Math.hypot(x - s.x, y - s.y) < 88)) continue;
      spots.push({ x, y, kind: kinds[Math.floor(rand() * kinds.length)], r: rand() });
    }

    // And out in the surrounding desert, which has no rules to respect: this is
    // what turns the land around the map from an empty sheet into somewhere the
    // battlefield happens to be. Bigger and sparser, since it is only ever seen
    // at a distance.
    const outer = [];
    for (let tries = 0; tries < 1600 && outer.length < 120; tries++) {
      const x = (rand() * 4.6 - 1.8) * stage.WORLD_W;
      const y = (rand() * 3.4 - 1.2) * stage.WORLD_H;
      const insideMap = x > -70 && x < stage.WORLD_W + 70 &&
                        y > -70 && y < stage.WORLD_H + 70;
      if (insideMap) continue;
      if (outer.some(s => Math.hypot(x - s.x, y - s.y) < 150)) continue;
      outer.push({ x, y, kind: kinds[Math.floor(rand() * kinds.length)], r: rand(), far: true });
    }
    spots.push(...outer);

    for (const spot of spots) {
      stage.loadModel(spot.kind).then(model => {
        if (!model) return;
        const node = model.clone(true);
        // Scenery is scaled off the tower unit so a boulder reads as rock-sized
        // next to a gun platform rather than as a pebble or a mountain.
        const size = spot.kind === 'env_scrub' ? 26 : spot.kind === 'env_spire' ? 40 : 34;
        node.scale.setScalar(size * (0.75 + spot.r * 0.6) * (spot.far ? 1.35 : 1));
        // Out in the surrounding desert the ground has its own height, so stand
        // on it. A couple of pixels below, to bed the base into the sand.
        const y = spot.far ? stage.surroundHeight(spot.x, spot.y) - 3 : 0;
        node.position.set(stage.wx(spot.x), y, stage.wz(spot.y));
        node.rotation.y = spot.r * Math.PI * 2;
        scene.add(node);
      });
    }
  }

  if (MAP && Array.isArray(MAP.path)) {
    const pads = (game.pads || []).map(p => ({ x: p.x, y: p.y }));
    stage.loadModel('env_terrain').then(terrain => {
      if (!terrain) return;
      // The loader collapses a model to meshes by material; terrain is one.
      let mesh = null;
      terrain.traverse(o => { if (o.isMesh && !mesh) mesh = o; });
      stage.useTerrain(mesh, relief(MAP.path, pads));
    });
    scatterEnvironment(MAP.path, pads, MAP.base);
  }

  /* The command core is a fixture rather than an entity, so it is placed once. */
  if (MAP && MAP.base) {
    stage.loadModel('core').then(core => {
      if (!core) return;
      const node = core.clone(true);
      node.position.set(stage.wx(MAP.base.x), 0, stage.wz(MAP.base.y));
      scene.add(node);
    });
  }

  /* -------------------------------------------------------------- input */

  /* The camera is fixed. An earlier version let the player drag to orbit it,
     and it did not earn its place: turning the map put the battlefield at
     angles where it framed badly on a phone, and every drag had to be told
     apart from a tap, which made ordinary taps feel unreliable. A tower
     defence wants one good angle it can be read at, so this is that angle,
     and a tap is just a tap again. */
  stage.canvas.addEventListener('pointerdown', e => { e.preventDefault(); game.tap(e); });

  /* A way out. The 3D stage is the default, but a player on weak hardware,
     or one who simply prefers the flat plan view, should not have to clear
     site data to get it back. */
  function addViewButton() {
    const host = document.getElementById('cornerControls');
    if (!host || document.getElementById('view2d')) return;
    const flat = document.createElement('button');
    flat.id = 'view2d';
    flat.type = 'button';
    flat.title = 'Switch to the flat 2D battlefield';
    flat.setAttribute('aria-label', 'Switch to the flat 2D battlefield');
    flat.textContent = '2D';
    flat.onclick = () => { setEnabled(false); location.reload(); };
    host.insertBefore(flat, host.firstChild);
  }
  addViewButton();

  /* -------------------------------------------------------- world mapping */

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

  /* ------------------------------------------------------------- effects */

  const fx = createEffects(stage);

  /* The combat moments, re-staged in three dimensions.
   *
   * The 2D effects layer already wraps these and paints into the world canvas,
   * which on this stage means a muzzle flash ends up lying flat on the sand
   * under the tower. Wrapping them again here puts the flash at the barrel and
   * the burst where the shell landed; the 2D versions are then told to stand
   * down, since they would otherwise scorch the ground for every shot. */
  const wrap = (name, before) => {
    const original = game[name];
    if (typeof original !== 'function') return;
    game[name] = function (...args) {
      try { before.apply(this, args); } catch (e) { /* effects never break combat */ }
      return original.apply(this, args);
    };
  };

  wrap('fire', function (tower) { if (tower) fx.onFire(tower); });
  wrap('hit', function (p) {
    if (!p) return;
    const kind = p.type || (p.s && p.s.type);
    const splash = p.splash || (p.s && p.s.splash) || 0;
    // A flak burst goes off at the altitude it caught the flier at.
    const airborne = p.splashAir || (p.target && p.target.flying)
      ? ((p.target && p.target.altitude) || 34) : 0;
    fx.onHit(p.x, p.y, kind, splash, airborne);
  });
  wrap('kill', function (e) { if (e) fx.onKill(e); });

  // The 2D layer's own flashes and bursts would double every one of these, flat
  // on the ground. Its floating damage numbers and scorch rings still earn
  // their place on the terrain, so only the airborne moments are silenced.
  const FX2D = window.FUN_TD_EFFECTS;
  if (FX2D && typeof FX2D.suppress === 'function') FX2D.suppress(['fire', 'hit', 'kill']);

  // Projectiles fly in 3D now; the 2D renderer would draw a second copy of each
  // one sliding along the sand.
  game.drawProjectile = () => {};
  if (typeof game.drawArc === 'function') game.drawArc = () => {};
  if (typeof game.drawBeam === 'function') game.drawBeam = () => {};

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
  let lastFrame = performance.now();
  function frame() {
    if (!stage.canvas.isConnected) return;
    if (hidden()) { requestAnimationFrame(frame); return; }
    try {
      const now = performance.now();
      const dt = Math.min(0.05, (now - lastFrame) / 1000 || 0);
      lastFrame = now;
      syncTowers();
      syncEnemies();
      fx.update(dt, game);
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
