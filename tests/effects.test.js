/* Guards for the shared combat effects layer.
 *
 * The layer decorates each sector's fire/hit/kill/leak and wraps draw(). Its
 * whole contract is that it is additive: the game must behave identically with
 * it removed, and it must never be able to break combat.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = fs.readFileSync(path.join(ROOT, 'src/art/effects.js'), 'utf8');

/* Run effects.js against a stub window. The module self-installs on a timer, so
   the timer is stubbed out and install() is driven directly instead. */
function loadFx({ reducedMotion = false } = {}) {
  const win = {
    matchMedia: () => ({ matches: reducedMotion }),
    setInterval: () => 0,
    clearInterval: () => {},
    performance: { now: () => 0 }
  };
  new Function('window', 'matchMedia', 'setInterval', 'clearInterval', 'performance', SRC)(
    win, win.matchMedia, win.setInterval, win.clearInterval, win.performance);
  return win.FUN_TD_FX;
}

function stubContext() {
  const calls = [];
  const noop = name => (...a) => calls.push(name);
  return {
    calls,
    canvas: {}, save: noop('save'), restore: noop('restore'), beginPath: noop('beginPath'),
    arc: noop('arc'), fill: noop('fill'), stroke: noop('stroke'), moveTo: noop('moveTo'),
    lineTo: noop('lineTo'), fillRect: noop('fillRect'),
    createRadialGradient: () => ({ addColorStop() {} })
  };
}

function stubGame(ctx) {
  const log = [];
  return {
    ctx, enemies: [], paused: false,
    fire(t) { log.push('fire'); return 'fire'; },
    hit(p) { log.push('hit'); return 'hit'; },
    kill(e) { log.push('kill'); return 'kill'; },
    leak(e) { log.push('leak'); return 'leak'; },
    draw() { log.push('draw'); },
    log
  };
}

test('installing keeps every original combat method working', () => {
  const FX = loadFx();
  const game = stubGame(stubContext());
  FX.install(game, 'ctx');
  assert.equal(game.fire({ x: 1, y: 2, type: 'gun', angle: 0 }), 'fire');
  assert.equal(game.hit({ x: 1, y: 2, type: 'gun' }), 'hit');
  assert.equal(game.kill({ x: 1, y: 2, type: 'grunt', size: 10 }), 'kill');
  assert.equal(game.leak({ damage: 3 }), 'leak');
  assert.deepEqual(game.log, ['fire', 'hit', 'kill', 'leak']);
});

test('a broken effect can never break combat', () => {
  const FX = loadFx();
  const game = stubGame(stubContext());
  FX.install(game, 'ctx');
  // Malformed payloads of the kind a sector variant might pass.
  assert.equal(game.fire(null), 'fire');
  assert.equal(game.hit(undefined), 'hit');
  assert.equal(game.kill(null), 'kill');
  assert.equal(game.leak(null), 'leak');
});

test('the effect pool is hard-capped', () => {
  const FX = loadFx();
  for (let i = 0; i < 5000; i++) FX.spark(0, 0, 0, 1, 100, '#fff', 1, 2);
  assert.ok(FX.live <= 420, `pool grew to ${FX.live}`);
});

test('effects expire and return to the pool', () => {
  const FX = loadFx();
  for (let i = 0; i < 50; i++) FX.spark(0, 0, 0, 1, 100, '#fff', 0.2, 2);
  assert.ok(FX.live > 0);
  FX.step(1);
  assert.equal(FX.live, 0, 'expired effects must free their slots');
});

test('reduced motion suppresses shake and full-screen tint', () => {
  const calm = loadFx({ reducedMotion: true });
  calm.shake = 20;
  calm.step(0.016);
  assert.equal(calm.shake, 0, 'shake must be suppressed');

  const normal = loadFx({ reducedMotion: false });
  normal.shake = 20;
  normal.step(0.016);
  assert.ok(normal.shake > 0, 'shake should survive a frame when motion is allowed');
});

test('draw is wrapped without losing the sector\'s own rendering', () => {
  const FX = loadFx();
  const ctx = stubContext();
  const game = stubGame(ctx);
  FX.install(game, 'ctx');
  game.draw();
  assert.ok(game.log.includes('draw'), 'the sector must still draw itself');
});

test('a sector that shakes its own battlefield is fed rather than shaken twice', () => {
  const FX = loadFx();
  const game = stubGame(stubContext());
  game.shake = 0;                 // sector 01 owns a shake field
  FX.install(game, 'ctx');
  FX.shake = 9;
  game.draw();
  assert.ok(game.shake >= 9, 'the sector shake should receive the effect shake');
});
