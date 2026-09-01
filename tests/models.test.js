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

test('the environment models are present for the 3D stage', () => {
  // These exist only for the 3D stage - the 2D game paints its own ground - so
  // nothing else in the suite would notice them going missing.
  for (const name of ['env_terrain', 'env_boulder', 'env_spire', 'env_scrub',
                      'env_cactus', 'env_ruin']) {
    assert.ok(manifest[name], `no manifest entry for ${name}`);
    assert.ok(fs.existsSync(path.join(MODELS, name + '.glb')), `no file for ${name}`);
  }
});

test('a partial export cannot truncate the model manifest', () => {
  // A --only pass over the environment models once rewrote models.json down to
  // five entries, silently removing every tower and enemy from it. The build
  // script now reloads the manifest before adding to it; this asserts the
  // manifest on disk still describes the whole set rather than a subset.
  const towers = Object.keys(M.TOWERS).length * M.BAL.maxLevel * 2;
  const enemies = Object.keys(M.ENEMIES).length;
  assert.ok(Object.keys(manifest).length >= towers + enemies + 6,
    `models.json lists only ${Object.keys(manifest).length} models`);

  const build = fs.readFileSync(
    path.join(ROOT, 'tools', 'blender', 'build_sprites.py'), 'utf8');
  assert.match(build, /models\.json[\s\S]{0,220}MODELS = json\.load/,
    'a partial build must reload models.json before writing it back');
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

test('the camera is fixed, with no orbit left behind', () => {
  // Removing the orbit means removing its input handling too: a stray pointer
  // handler that still turns the camera would make taps unreliable again,
  // which is the reason it went.
  const install = fs.readFileSync(path.join(ROOT, 'src', 'art', 'stage3d-install.js'), 'utf8');
  for (const gone of ['pinchStart', 'setPointerCapture', 'cameraReset']) {
    assert.ok(!install.includes(gone), `${gone} is still wired up in the stage installer`);
  }
  assert.ok(!/stage\.azimuth\s*=/.test(install), 'something still drives the camera azimuth');
  assert.ok(!/stage\.elevation\s*=/.test(install), 'something still drives the camera elevation');
});

test('the firing effects hand their moments over from the 2D layer', () => {
  // Both layers wrap fire/hit/kill. If the 2D one is not told to stand down it
  // paints a second, flat copy of every flash onto the sand.
  const fx2d = fs.readFileSync(path.join(ROOT, 'src', 'art', 'effects.js'), 'utf8');
  assert.match(fx2d, /FUN_TD_EFFECTS/, '2D effects must expose a way to hand moments over');
  assert.match(fx2d, /suppress/, '2D effects must support suppression');

  const install = fs.readFileSync(path.join(ROOT, 'src', 'art', 'stage3d-install.js'), 'utf8');
  assert.match(install, /suppress\(\['fire', 'hit', 'kill'\]\)/,
    'the 3D stage must suppress exactly the moments it re-stages');

  const fx3d = fs.readFileSync(path.join(ROOT, 'src', 'art', 'stage3d-fx.js'), 'utf8');
  // Every tower family needs its own shot, or they all fire the same yellow ball.
  for (const type of Object.keys(M.TOWERS)) {
    assert.match(fx3d, new RegExp(`\\b${type}:\\s*\\{`),
      `no firing effect defined for the ${type} family`);
  }
  // Pools, not allocations: a per-shot material was a real leak here once.
  assert.ok(!/clone\(\)/.test(fx3d.split('function spark')[1].split('}')[0] || ''),
    'spark() must not clone a material per particle');
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
