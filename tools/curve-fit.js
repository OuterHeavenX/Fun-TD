/* Solves each later sector's wave-count factor and boss health.
 *
 * Sectors 02-06 got their difficulty almost entirely from crowd size — up to
 * 162 units in a single wave, with individual units barely tougher at wave 20
 * than at wave 1. Sector 01 was rebuilt the other way round, and this works out
 * what the others need to match that shape without becoming unfair.
 *
 * The target for each sector is derived from its own capacity — how many build
 * pads it has and how much route its towers get to shoot along — measured
 * against Sector 01, which is already tuned and verified. A gentle campaign-long
 * multiplier on top keeps later sectors harder than earlier ones.
 *
 *   node tools/curve-fit.js
 */
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const FILES = { 1: 'runtime.js', 2: 'sector2.js', 3: 'sector3.js', 4: 'sector4.js', 5: 'sector5.js', 6: 'sector6.js' };

// Matches the curve Sector 01 ships with.
export const HP_LINEAR = 0.06;
export const HP_QUADRATIC = +(process.env.FUN_TD_QUAD || 0.030);
export const scaleAt = i => 1 + i * HP_LINEAR + i * i * HP_QUADRATIC;

// Later sectors should sit progressively above Sector 01's difficulty-per-capacity.
const CAMPAIGN_STEP = { 2: 1.10, 3: 1.15, 4: 1.20, 5: 1.25, 6: 1.30 };

export function extract(file) {
  const s = fs.readFileSync(path.join(SRC, file), 'utf8');
  const a = s.indexOf('/*--FUN-TD-DATA-START--*/'), b = s.indexOf('/*--FUN-TD-DATA-END--*/');
  const body = a >= 0 && b > a ? s.slice(a, b)
    : (() => { const i = s.search(/\nclass\s/); return (i > 0 ? s.slice(0, i) : s).replace(/^\(\(\)\s*=>\s*\{/, ''); })();
  const ctx = { META: {}, window: { FUN_TD_META: {}, FUN_TD_APPLY_META: () => {} } };
  vm.createContext(ctx);
  vm.runInContext(body + ';globalThis.__o={' +
    'MAP:typeof MAP!=="undefined"?MAP:null,' +
    'TOWERS:typeof TOWERS!=="undefined"?TOWERS:(typeof T!=="undefined"?T:null),' +
    'ENEMIES:typeof ENEMIES!=="undefined"?ENEMIES:(typeof E!=="undefined"?E:null),' +
    'WAVES:typeof WAVES!=="undefined"?WAVES:(typeof W!=="undefined"?W:null),' +
    'BAL:typeof BAL!=="undefined"?BAL:null,' +
    'hpScale:typeof waveHpScale==="function"?waveHpScale:null};', ctx);
  return ctx.__o;
}

const groupsOf = w => w.groups || w;

/* Thin the late crowds, not the early ones. A flat multiplier that lands wave 20
   at a readable size also strips wave 1 down to four or five units, which is a
   worse opening than the sectors already had. The reduction ramps in instead, so
   the first waves keep their original shape and only the back half is trimmed. */
const factorAt = (i, n, f) => 1 - (1 - f) * (i / (n - 1));
const routeLength = map => {
  let d = 0;
  for (let i = 1; i < map.path.length; i++)
    d += Math.hypot(map.path[i][0] - map.path[i - 1][0], map.path[i][1] - map.path[i - 1][1]);
  return d;
};

/* Effective health of a wave once counts are scaled by `f`, per-enemy health by
   the wave curve, and the boss is pinned to a flat value. */
function waveHp(model, i, f, bossHp) {
  let total = 0;
  for (const g of groupsOf(model.WAVES[i])) {
    const e = model.ENEMIES[g.type];
    if (!e) continue;
    const boss = g.type === 'boss';
    const count = boss ? g.count
      : Math.max(4, Math.round(g.count * factorAt(i, model.WAVES.length, f)));
    const hp = boss ? bossHp : e.hp * scaleAt(i);
    total += count * hp / (1 - (e.armor || 0));
  }
  return total;
}

/* Only run the fit when invoked directly — tests import extract() from here. */
if (import.meta.url === `file://${process.argv[1]}`) {
  const ref = extract(FILES[1]);
  const refCapacity = ref.MAP.pads.length * routeLength(ref.MAP);
  /* The reference must use Sector 01's *own* curve, not whatever curve is being
     tried for the others — otherwise sweeping the parameter moves the target it
     is being measured against, and every candidate looks equally good.

     It must also be its *raw* health, not its armour-adjusted health. Sector 01 is
     the only sector with armour, and the only one whose towers pierce it; the
     others have neither. Comparing its effective figure against their raw one asks
     them to field far more actual health than Sector 01 does while their towers
     pierce nothing — which is exactly what made their late waves grind. */
  const refFinal = (() => {
    const last = ref.WAVES.length - 1;
    const b = ref.BAL;
    const refScale = 1 + last * b.hpScaleLinear + last * last * b.hpScaleQuadratic;
    let total = 0;
    for (const g of groupsOf(ref.WAVES[last])) {
      const e = ref.ENEMIES[g.type];
      total += g.count * (e.noScale ? e.hp : e.hp * refScale);
    }
    return total;
  })();

  const rows = [];
  for (const sector of [2, 3, 4, 5, 6]) {
    const m = extract(FILES[sector]);
    // Fitting on top of an already-fitted file compounds silently and produces a
    // factor that looks reasonable but is measured against the wrong baseline.
    if (fs.readFileSync(path.join(SRC, FILES[sector]), 'utf8').includes('/* counts fitted */'))
      throw new Error(`sector ${sector} already carries a fitted curve; revert it before re-fitting`);
    const capacity = m.MAP.pads.length * routeLength(m.MAP);
    const target = refFinal * (capacity / refCapacity) * CAMPAIGN_STEP[sector];

    // The boss should be roughly a fifth of the final wave, as it is in Sector 01.
    const bossArmor = (m.ENEMIES.boss && m.ENEMIES.boss.armor) || 0;
    const bossHp = Math.round(target * 0.20 * (1 - bossArmor) / 100) * 100;

    // Search the count factor that lands the final wave on target.
    let best = null;
    for (let f = 0.20; f <= 1.0; f += 0.005) {
      const hp = waveHp(m, m.WAVES.length - 1, f, bossHp);
      const miss = Math.abs(hp - target);
      if (!best || miss < best.miss) best = { f: +f.toFixed(3), hp: Math.round(hp), miss };
    }

    const counts = m.WAVES.map((w, i) => groupsOf(w).reduce((n, g) => n +
      (g.type === 'boss' ? g.count
        : Math.max(4, Math.round(g.count * factorAt(i, m.WAVES.length, best.f)))), 0));
    const hps = m.WAVES.map((_, i) => waveHp(m, i, best.f, bossHp));

    rows.push({
      sector, pads: m.MAP.pads.length, route: Math.round(routeLength(m.MAP)),
      factor: best.f, bossHp,
      target: Math.round(target), finalHp: best.hp,
      wave1Hp: Math.round(hps[0]),
      hpRamp: +(hps[19] / hps[0]).toFixed(1),
      perEnemyRamp: +((hps[19] / counts[19]) / (hps[0] / counts[0])).toFixed(1),
      peakCount: Math.max(...counts), wave1Count: counts[0]
    });
  }

  console.table(rows);
  console.log(`\nSector 01 reference (its own curve): final wave ${Math.round(refFinal)} effective HP,`,
    `${ref.MAP.pads.length} pads, ${Math.round(routeLength(ref.MAP))}px route`);
  console.log('wave HP curve: 1 +', HP_LINEAR, '* i +', HP_QUADRATIC, '* i^2  (x' + scaleAt(19).toFixed(1) + ' by wave 20)');
}
