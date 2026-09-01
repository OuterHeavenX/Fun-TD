/* The shared air module for sectors 02-06.
 *
 * src/air.js is a browser script with no exports, so it is loaded here the way
 * the browser loads it — into a stubbed window in this realm — and the pieces
 * it publishes are asserted directly. The wave-swap rules get the most
 * attention because that is where the one real balance regression came from:
 * counting a boss's flat health into the air budget and then taking the whole
 * bill out of the ground units stripped sector 02's last wave down to a flock.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = fs.readFileSync(path.join(HERE, '..', 'src', 'air.js'), 'utf8');

/* Load air.js as sector 01 so its install loop never starts — the exported
   helpers are published regardless, which is what these tests exercise. */
function loadAir() {
  const win = { FUN_TD_SECTOR: 1 };
  new Function('window', 'location', 'URLSearchParams', 'setInterval', 'console', SRC)(
    win,
    { search: '' },
    URLSearchParams,
    () => 0,
    console
  );
  return win.FUN_TD_AIR;
}

const AIR = loadAir();

test('the module publishes its rule for the sector edits to call back into', () => {
  assert.equal(typeof AIR.can, 'function');
  assert.equal(typeof AIR.splashHits, 'function');
  assert.equal(typeof AIR.fly, 'function');
});

test('a tower with no declared layer stays ground-only', () => {
  // Every one of these sectors predates air, so silence has to mean "the old
  // behaviour" — a tower that quietly gained air would be a silent buff.
  assert.equal(AIR.can({}, { flying: false }), true);
  assert.equal(AIR.can({}, { flying: true }), false);
  assert.equal(AIR.can({ targets: 'air' }, { flying: true }), true);
  assert.equal(AIR.can({ targets: 'air' }, { flying: false }), false);
  assert.equal(AIR.can({ targets: 'both' }, { flying: true }), true);
});

test('splash never crosses the layer it burst on', () => {
  assert.equal(AIR.splashHits({ splashAir: true }, { flying: true }), true);
  assert.equal(AIR.splashHits({ splashAir: true }, { flying: false }), false);
  assert.equal(AIR.splashHits({}, { flying: false }), true);
  assert.equal(AIR.splashHits({}, { flying: true }), false);
  // A projectile that lost the flag on the way is treated as a ground burst,
  // which is what the sectors did before there was any air at all.
  assert.equal(AIR.splashHits(undefined, { flying: false }), true);
});

test('a flier reaches the core and reports progress along its own flight', () => {
  const MAP = { base: { x: 100, y: 100 }, path: [[500, 500], [300, 400], [100, 100]] };
  const e = { x: 500, y: 500, speed: 100, slow: 0, slowTime: 0, flying: true,
              flightLength: Math.hypot(400, 400), segment: 0 };
  let steps = 0, arrived = false;
  while (steps++ < 1000 && !(arrived = AIR.fly(e, MAP, 0.05)));
  assert.ok(arrived, 'the flier never reached the core');
  assert.equal(e.x, 100);
  assert.equal(e.y, 100);
  // Halfway along, its reported segment must sit inside the path's range, or
  // the sectors' "furthest along" targeting would never pick it.
  const mid = { x: 300, y: 300, speed: 100, slow: 0, slowTime: 0, flying: true,
                flightLength: Math.hypot(400, 400), segment: 0 };
  AIR.fly(mid, MAP, 0.05);
  assert.ok(mid.segment > 0 && mid.segment <= MAP.path.length - 1,
    `segment ${mid.segment} is outside the path's range`);
});

test('a slowed flier travels less far', () => {
  const MAP = { base: { x: 0, y: 0 }, path: [[400, 0], [0, 0]] };
  const make = slow => ({ x: 400, y: 0, speed: 100, slow, slowTime: 5, flying: true,
                          flightLength: 400, segment: 0 });
  const fast = make(0), chilled = make(0.5);
  AIR.fly(fast, MAP, 0.1);
  AIR.fly(chilled, MAP, 0.1);
  assert.ok(chilled.x > fast.x, 'the slow did not reduce the distance flown');
});

test('the air share is a fraction of a wave, not a multiple of it', () => {
  assert.ok(AIR.AIR_SHARE > 0 && AIR.AIR_SHARE < 0.5,
    `an air share of ${AIR.AIR_SHARE} would rewrite the wave rather than adjust it`);
});
