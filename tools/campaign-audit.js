/* Difficulty-curve audit across every sector.
 *
 * The sector runtimes are plain scripts with no exports, and they disagree on
 * their identifier names (TOWERS/ENEMIES/WAVES in the early sectors, T/E/W in
 * the later ones), so this pulls the literals out by evaluating each file's
 * leading declarations in a sandbox and normalising what it finds.
 *
 * It reports the shape of each campaign's ramp — the thing that was wrong with
 * Sector 01 before it was rebuilt, where a grunt still had its wave-1 health in
 * wave 20 and the difficulty came entirely from spawning more bodies.
 *
 *   node tools/campaign-audit.js
 *   node tools/campaign-audit.js --waves 2      # per-wave table for one sector
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.join(HERE, '..', 'src');

const FILES = {
  1: 'runtime.js', 2: 'sector2.js', 3: 'sector3.js',
  4: 'sector4.js', 5: 'sector5.js', 6: 'sector6.js'
};

/* Evaluate just the top-level `const NAME = ...;` declarations of a sector file,
   stopping at the first class definition — everything after that needs a DOM. */
function extract(file) {
  const source = fs.readFileSync(path.join(SRC, file), 'utf8');

  // Sector 01 marks its data block explicitly; the others are read up to their
  // first class definition, since everything past that needs a DOM.
  const start = source.indexOf('/*--FUN-TD-DATA-START--*/');
  const end = source.indexOf('/*--FUN-TD-DATA-END--*/');
  let body;
  if (start >= 0 && end > start) {
    body = source.slice(start, end);
  } else {
    const stop = source.search(/\nclass\s/);
    body = (stop > 0 ? source.slice(0, stop) : source).replace(/^\(\(\)\s*=>\s*\{/, '');
  }

  const context = { META: {}, window: { FUN_TD_META: {} } };
  vm.createContext(context);
  vm.runInContext(
    body + '\n;globalThis.__out = {' +
    'TOWERS: typeof TOWERS !== "undefined" ? TOWERS : (typeof T !== "undefined" ? T : null),' +
    'ENEMIES: typeof ENEMIES !== "undefined" ? ENEMIES : (typeof E !== "undefined" ? E : null),' +
    'WAVES: typeof WAVES !== "undefined" ? WAVES : (typeof W !== "undefined" ? W : null),' +
    'MAP: typeof MAP !== "undefined" ? MAP : null,' +
    'hpScale: typeof waveHpScale === "function" ? waveHpScale : null};',
    context
  );
  return context.__out;
}

/* Effective health = raw health adjusted for armour, which is what a tower
   actually has to chew through. */
function waveHp(model, index) {
  const wave = model.WAVES[index];
  const groups = wave.groups || wave;
  let total = 0;
  for (const grp of groups) {
    const enemy = model.ENEMIES[grp.type];
    if (!enemy) continue;
    // Sector 01 scales health with the wave and exposes the curve itself; the
    // others have no such curve, so their units never get individually tougher.
    const scale = model.hpScale ? model.hpScale(index) : 1;
    const hp = (enemy.noScale ? enemy.hp : enemy.hp * scale) * (grp.elite ? 1.8 : 1);
    total += grp.count * hp / (1 - (enemy.armor || 0));
  }
  return total;
}

const countWave = (model, i) => {
  const groups = model.WAVES[i].groups || model.WAVES[i];
  return groups.reduce((n, g) => n + g.count, 0);
};

const rows = [];
const detail = process.argv.includes('--waves')
  ? +process.argv[process.argv.indexOf('--waves') + 1] : null;

for (const [sector, file] of Object.entries(FILES)) {
  let model;
  try { model = extract(file); }
  catch (err) { rows.push({ sector, error: err.message.slice(0, 60) }); continue; }
  if (!model.WAVES || !model.ENEMIES) { rows.push({ sector, error: 'no wave table found' }); continue; }

  const n = model.WAVES.length;
  const hp = model.WAVES.map((_, i) => waveHp(model, i));
  const counts = model.WAVES.map((_, i) => countWave(model, i));

  // How much of the ramp comes from bigger crowds rather than tougher units?
  const countRamp = counts[n - 1] / counts[0];
  const hpRamp = hp[n - 1] / hp[0];
  const perEnemyRamp = (hp[n - 1] / counts[n - 1]) / (hp[0] / counts[0]);

  rows.push({
    sector: +sector,
    waves: n,
    towers: Object.keys(model.TOWERS || {}).length,
    enemies: Object.keys(model.ENEMIES || {}).length,
    w1Hp: Math.round(hp[0]),
    wNHp: Math.round(hp[n - 1]),
    hpRamp: +hpRamp.toFixed(1),
    countRamp: +countRamp.toFixed(1),
    perEnemyRamp: +perEnemyRamp.toFixed(1),
    peakCount: Math.max(...counts)
  });

  if (detail === +sector) {
    console.log(`\nsector ${sector} per-wave:`);
    console.table(model.WAVES.map((_, i) => ({
      wave: i + 1, enemies: counts[i], effHp: Math.round(hp[i]),
      perEnemy: Math.round(hp[i] / counts[i])
    })));
  }
}

console.table(rows);
console.log('\nhpRamp        wave 1 -> final effective health');
console.log('countRamp     how much of that is simply more bodies');
console.log('perEnemyRamp  how much is tougher individual units (1.0 = none at all)');
