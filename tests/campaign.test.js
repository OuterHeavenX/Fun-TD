/* Campaign-wide guards.
 *
 * These read every sector's data, so a sector file that drifts out of the shape
 * the audit tool and art pack expect fails here rather than silently losing its
 * art or dropping out of the difficulty report.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');

const SECTORS = { 1: 'src/runtime.js', 2: 'src/sector2.js', 3: 'src/sector3.js',
                  4: 'src/sector4.js', 5: 'src/sector5.js', 6: 'src/sector6.js' };

test('every sector still exposes a readable wave table', async () => {
  const { execFileSync } = await import('node:child_process');
  const out = execFileSync('node', [path.join(ROOT, 'tools/campaign-audit.js')], { encoding: 'utf8' });
  for (const sector of Object.keys(SECTORS)) {
    assert.ok(!/error/i.test(out.split('\n').find(l => l.includes(`│ ${sector} `)) || ''),
      `sector ${sector} could not be read by the audit`);
  }
  assert.ok(!out.includes('no wave table found'));
});

test('the sprite manifest covers every enemy and tower the campaign fields', () => {
  const manifest = JSON.parse(read('assets/sprites/manifest.json'));
  const parts = Object.keys(manifest.parts);
  // The cryo tower goes by two names across the campaign; one model serves both.
  for (const family of ['gun', 'frost', 'cannon', 'arc'])
    for (let level = 1; level <= 4; level++) {
      assert.ok(parts.includes(`${family}_base_l${level}`), `missing ${family}_base_l${level}`);
      assert.ok(parts.includes(`${family}_turret_l${level}`), `missing ${family}_turret_l${level}`);
    }
  for (const enemy of ['grunt', 'scout', 'armored', 'heavy', 'boss', 'splitter', 'mite', 'surger', 'warden'])
    assert.ok(parts.includes('enemy_' + enemy), `missing enemy_${enemy}`);
  assert.ok(parts.includes('core'));
});

test('every manifest entry points at a file that exists and records its scale', () => {
  const manifest = JSON.parse(read('assets/sprites/manifest.json'));
  for (const [name, part] of Object.entries(manifest.parts)) {
    assert.ok(fs.existsSync(path.join(ROOT, 'assets/sprites', part.file)), `${name} file is missing`);
    assert.ok(part.pixelsPerUnit > 0, `${name} has no pixels-per-unit`);
    assert.ok(part.size > 0);
  }
});

test('the loader exposes each sector to the art pack', () => {
  const loader = read('src/loader.js');
  assert.ok(loader.includes('FUN_TD_SECTOR_MODEL'), 'loader must publish the sector model');
  // Sector 01 reads window.FUN_TD_META itself, so it must be exempt from the
  // regex balance patching that the other sectors still rely on.
  assert.ok(loader.includes('if(sector===1&&!endless)return src;'),
    'sector 01 must not be string-patched');
  for (const sector of [2, 3, 4, 5, 6])
    assert.ok(loader.includes(`sector===${sector}`), `loader has no branch for sector ${sector}`);
});

test('the art pack degrades instead of throwing when sprites are unavailable', () => {
  const pack = read('src/art/sprite-pack.js');
  // install() is only ever reached from the success branch of load().
  assert.ok(pack.includes('.then(ok => {'));
  assert.ok(pack.includes('using procedural fallback'));
  // Every draw helper reports failure rather than assuming a sprite is present.
  assert.ok(pack.includes('if (!s) return false;'));
});

test('each sector art adapter matches that sector\'s draw signature', () => {
  const adapter = read('src/sector-art.js');
  for (const [sector, file] of Object.entries(SECTORS)) {
    if (sector === '1' || sector === '5') continue;
    const src = read(file);
    const classic = /drawTower\(c\s*,\s*t\)/.test(src);
    const expected = classic ? 'installClassic' : 'installCompact';
    const branch = adapter.match(new RegExp(`${sector}:\\s*\\{[^}]*\\}`));
    assert.ok(branch, `no adapter entry for sector ${sector}`);
    assert.ok(branch[0].includes(expected),
      `sector ${sector} draws ${classic ? 'classic' : 'compact'} but is wired to the other installer`);
  }
});
