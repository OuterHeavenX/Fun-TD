import test from 'node:test';
import assert from 'node:assert/strict';
import { ENEMIES } from '../src/data/enemies.js';
import { TOWERS } from '../src/data/towers.js';

test('direct projectiles decisively outrun early runners', () => {
  assert.ok(TOWERS.bolt.projectile >= ENEMIES.runner.speed * 10);
  assert.ok(TOWERS.frost.projectile >= ENEMIES.runner.speed * 8);
  const worstCaseBoltIntercept = TOWERS.bolt.range / (TOWERS.bolt.projectile - ENEMIES.runner.speed);
  assert.ok(worstCaseBoltIntercept < 0.25);
});

test('battlefield movement stays readable at normal speed', () => {
  assert.ok(ENEMIES.runner.speed <= 46);
  assert.ok(ENEMIES.raider.speed <= 36);
  assert.ok(ENEMIES.bulwark.speed <= 24);
  assert.ok(ENEMIES.boss.speed <= 11);
});
