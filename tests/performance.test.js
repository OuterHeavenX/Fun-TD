import test from 'node:test';
import assert from 'node:assert/strict';
import { SpatialGrid } from '../src/combat/SpatialGrid.js';
import { selectTarget } from '../src/combat/TargetingSystem.js';
import { GameLoop } from '../src/core/GameLoop.js';

test('spatial grid indexes and queries a 250-enemy swarm', () => {
  const enemies = Array.from({ length: 250 }, (_, i) => ({
    active: true,
    hp: 10 + i,
    distance: i,
    x: (i * 37) % 720,
    y: (i * 83) % 1120
  }));
  const grid = new SpatialGrid(96);
  grid.rebuild(enemies);
  const nearby = grid.query(360, 560, 180);
  assert.ok(nearby.length > 0);
  assert.ok(nearby.length < enemies.length / 2);
  const target = selectTarget({ x: 360, y: 560, range: 180 }, nearby, 'first');
  assert.ok(target);
});

test('game loop start remains single across ten restart attempts', () => {
  let requests = 0;
  global.requestAnimationFrame = () => ++requests;
  global.cancelAnimationFrame = () => {};
  const loop = new GameLoop(() => {}, () => {});
  for (let i = 0; i < 10; i++) loop.start();
  assert.equal(requests, 1);
  loop.stop();
});
