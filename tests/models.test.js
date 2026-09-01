/* The 3D battlefield's assets and its vendored dependencies.
 *
 * The stage itself needs a GPU and a browser, so it is verified by the probes
 * recorded in the README. What can be checked here is everything the stage
 * depends on being present and self-consistent — which is where the real bugs
 * were: a model the game asks for and the manifest does not have, and a
 * vendored three.js module still importing from the bare specifier 'three',
 * which resolves to nothing in a browser and takes the whole 3D layer down.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadModel } from '../tools/balance-sim.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODELS = path.join(ROOT, 'assets', 'models');
const VENDOR = path.join(ROOT, 'vendor', 'three');
const M = loadModel();

const manifest = JSON.parse(fs.readFileSync(path.join(MODELS, 'models.json'), 'utf8')).models;

test('every tower has a base and a turret model at every level', () => {
  for (const type of Object.keys(M.TOWERS)) {
    for (let level = 1; level <= M.BAL.maxLevel; level++) {
      for (const part of ['base', 'turret']) {
        const name = `${type}_${part}_l${level}`;
        assert.ok(manifest[name], `no manifest entry for ${name}`);
        assert.ok(fs.existsSync(path.join(MODELS, name + '.glb')), `no file for ${name}`);
      }
    }
  }
});

test('every enemy has a model of its own', () => {
  for (const type of Object.keys(M.ENEMIES)) {
    const name = 'enemy_' + type;
    assert.ok(manifest[name], `no model for enemy ${type}`);
    assert.ok(fs.existsSync(path.join(MODELS, name + '.glb')), `no file for ${name}`);
  }
});

test('the command core has a model', () => {
  assert.ok(manifest.core);
  assert.ok(fs.existsSync(path.join(MODELS, 'core.glb')));
});

test('every model records the camera span it was framed in', () => {
  // The stage divides an on-screen width by this to size a model. A missing or
  // zero value would put a unit at the wrong scale or collapse it to a point.
  for (const [name, part] of Object.entries(manifest)) {
    assert.ok(typeof part.ortho === 'number' && part.ortho > 0,
      `${name} has no usable ortho framing`);
    assert.ok(part.ortho < 10, `${name} has an implausible ortho of ${part.ortho}`);
  }
});

test('models are small enough to ship', () => {
  let total = 0;
  for (const name of Object.keys(manifest)) {
    const bytes = fs.statSync(path.join(MODELS, name + '.glb')).size;
    total += bytes;
    assert.ok(bytes < 700 * 1024, `${name}.glb is ${Math.round(bytes / 1024)}KB`);
  }
  assert.ok(total < 24 * 1024 * 1024,
    `the model set is ${Math.round(total / 1024 / 1024)}MB`);
});

test('the vendored three.js modules resolve without a bundler', () => {
  // Each of these imported from the bare specifier 'three' as published, which
  // a browser cannot resolve: the first run of the 3D stage died on exactly
  // that, twice, once per file.
  for (const file of fs.readdirSync(VENDOR)) {
    if (!file.endsWith('.js')) continue;
    const src = fs.readFileSync(path.join(VENDOR, file), 'utf8');
    assert.ok(!/from\s+['"]three['"]/.test(src),
      `${file} still imports from the bare specifier 'three'`);
    for (const m of src.matchAll(/from\s+['"](\.[^'"]+)['"]/g)) {
      assert.ok(fs.existsSync(path.join(VENDOR, m[1])),
        `${file} imports ${m[1]}, which is not vendored`);
    }
  }
});

test('three.js is vendored with its licence', () => {
  assert.ok(fs.existsSync(path.join(VENDOR, 'LICENSE')));
  assert.ok(fs.existsSync(path.join(VENDOR, 'three.module.min.js')));
});

test('the 3D stage is loaded as a module and can be turned off', () => {
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  assert.match(html, /<script type="module" src="src\/art\/stage3d-install\.js/,
    'the stage must load as a module, or its imports never run');
  const install = fs.readFileSync(path.join(ROOT, 'src', 'art', 'stage3d-install.js'), 'utf8');
  assert.match(install, /funTD_view3d/, 'there must be a stored preference to fall back to 2D');
  const loader = fs.readFileSync(path.join(ROOT, 'src', 'loader.js'), 'utf8');
  assert.match(loader, /funTD_view3d/,
    'the way back to 3D has to live outside the 3D layer that was switched off');
});
