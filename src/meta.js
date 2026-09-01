/* War Room research and challenge modifiers, applied at runtime.
 *
 * These used to be applied by loader.js rewriting each sector's source text
 * with regular expressions that matched literal values — `damage:18,` and the
 * like. That works only while every sector happens to spell its numbers the
 * same way, and fails silently the moment one does not: Sector 04 already had
 * an older generation of this logic baked into its tower table, so its
 * `damage:18*(...)` never matched `damage:18,` and every tier-2 research node
 * (gun2, cannon2, freeze2, arc2) was quietly doing nothing there.
 *
 * Applying it by tower key instead means a sector can change its balance
 * without silently losing the player's research.
 */
(() => {
const META = () => window.FUN_TD_META || {};
const lvl = key => Math.max(0, +(META()[key] || 0));

/* Mutates a sector's tower and enemy tables in place. Safe to call once per
   sector; calling it twice would compound, so each sector calls it exactly
   once, immediately after declaring its tables. */
function applyMeta(TOWERS, ENEMIES) {
  const M = META();
  const t = TOWERS || {};

  const gun = t.gun;
  if (gun) {
    gun.damage *= (1 + lvl('gunLevel') * 0.05) * (1 + lvl('gun2') * 0.06);
    gun.rate *= (1 + lvl('gunLevel') * 0.04) * (lvl('gunLevel') >= 3 ? 1.12 : 1);
    gun.range *= lvl('gunLevel') >= 3 ? 1.08 : 1;
  }

  const cannon = t.cannon;
  if (cannon) {
    cannon.damage *= (1 + lvl('cannonLevel') * 0.06) * (1 + lvl('cannon2') * 0.05);
    if (cannon.splash) {
      cannon.splash *= (1 + lvl('cannonLevel') * 0.08)
        * (lvl('cannonLevel') >= 3 ? 1.2 : 1) * (1 + lvl('cannon2') * 0.1);
    }
  }

  // The cryo tower is called "freeze" in sectors 02-06 and "frost" in 01.
  const frost = t.freeze || t.frost;
  if (frost) {
    frost.damage *= 1 + lvl('freeze2') * 0.06;
    frost.range *= lvl('freezeLevel') >= 3 ? 1.1 : 1;
    if (frost.slow) {
      frost.slow = Math.min(0.62, frost.slow + lvl('freezeLevel') * 0.05 + lvl('freeze2') * 0.03);
    }
  }

  const arc = t.arc;
  if (arc) {
    arc.damage *= (1 + lvl('arcLevel') * 0.07) * (1 + lvl('arc2') * 0.08);
    if (arc.chains) arc.chains += (lvl('arcLevel') >= 3 ? 1 : 0) + (lvl('arc2') >= 3 ? 1 : 0);
    if (arc.chainRange) arc.chainRange *= (1 + lvl('arcLevel') * 0.07) * (1 + lvl('arc2') * 0.08);
  }

  const flak = t.flak;
  if (flak) {
    flak.damage *= 1 + lvl('flakLevel') * 0.06;
    if (flak.splash) flak.splash *= 1 + lvl('flakLevel') * 0.07;
  }

  const rail = t.rail;
  if (rail) {
    rail.damage *= 1 + lvl('railLevel') * 0.07;
    if (rail.beam) rail.beam *= 1 + lvl('railLevel') * 0.06;
  }

  // `void` is a reserved word, so the research key is `voidt` throughout.
  const voidSpire = t.void;
  if (voidSpire) {
    voidSpire.damage *= 1 + lvl('voidLevel') * 0.07;
    voidSpire.range *= 1 + lvl('voidLevel') * 0.05;
  }

  // Challenge modifiers speed the swarm up; research never slows it down.
  const speed = M.enemySpeed || 1;
  if (speed !== 1) for (const e of Object.values(ENEMIES || {})) if (e.speed) e.speed *= speed;

  return TOWERS;
}

window.FUN_TD_APPLY_META = applyMeta;

/* Scalar helpers, so a sector reads its own starting numbers rather than
   having them rewritten underneath it. */
window.FUN_TD_META_UTIL = {
  startGold: base => Math.max(100, base + (META().startGold || 0)),
  baseHp: base => Math.max(40, base + (META().baseHp || 0)),
  sellRate: () => META().sellRate || 0.7,
  comboWindow: base => base + (META().comboBonus || 0),
  slowTime: base => base + (META().freezeDuration || 0),
  flawlessBonus: () => META().flawlessBonus || 0
};
})();
