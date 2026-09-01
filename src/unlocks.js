/* Which tower families the account has earned.
 *
 * The rules themselves live in the data block of src/runtime.js, so the
 * balance simulator gates its scripted player exactly the way a real account
 * is gated. This file is only the bridge between those rules and saved state:
 * it reads progress out of localStorage and answers questions about it.
 *
 * Everything degrades. With no saved state, or with runtime.js not yet loaded
 * (the home screen runs before any sector does), it reports the four starting
 * families as unlocked and nothing else, which is exactly a fresh account.
 */
(() => {
const SECTORS = [1, 2, 3, 4, 5, 6];
const STARTERS = ['gun', 'frost', 'cannon', 'arc'];

/* The rules as runtime.js states them, with a copy kept here for the screens
   that load before any sector runtime does. They are asserted equal by the
   test suite, so the copy cannot drift unnoticed. */
const FALLBACK_RULES = {
  gun:    { from: 'start' },
  frost:  { from: 'start' },
  cannon: { from: 'start' },
  arc:    { from: 'start' },
  flak:   { from: 'wave',   wave: 5,   note: 'Survive wave 5 in any sector' },
  rail:   { from: 'sector', sector: 2, note: 'Clear Sector 02 · Frostline Pass' },
  void:   { from: 'sector', sector: 4, note: 'Clear Sector 04 · Black Tide Harbor' }
};

const num = key => { try { return +localStorage.getItem(key) || 0; } catch (e) { return 0; } };
const flag = key => { try { return localStorage.getItem(key) === '1'; } catch (e) { return false; } };

const model = () => window.FUN_TD_SECTOR_MODEL || window.FUN_TD_MODEL || null;
const rules = () => (model() && model().UNLOCKS) || FALLBACK_RULES;

/* Everything the rules can ask about, gathered once per query so a build menu
   listing seven towers does not read localStorage twenty-one times. */
function progress() {
  return {
    bestWave: Math.max(0, ...SECTORS.map(n => num(`funTD_sector${n}BestWave`))),
    cleared: new Set(SECTORS.filter(n => flag(`funTD_sector${n}Clear`)))
  };
}

function unlocked(type, p = progress()) {
  const m = model();
  if (m && typeof m.isUnlocked === 'function') return m.isUnlocked(type, p);
  const rule = rules()[type];
  if (!rule || rule.from === 'start') return true;
  if (rule.from === 'wave') return p.bestWave >= rule.wave;
  if (rule.from === 'sector') return p.cleared.has(rule.sector);
  return false;
}

/* What the player has to do to earn this one, phrased for a locked card.
   A family available from the start has no requirement to state. */
function requirement(type) {
  const rule = rules()[type];
  if (!rule || rule.from === 'start') return '';
  return rule.note || 'Keep playing the campaign';
}

function all() {
  const m = model();
  const keys = (m && m.TOWER_ORDER) || Object.keys(rules());
  const p = progress();
  return keys.map(type => ({ type, unlocked: unlocked(type, p), requirement: requirement(type) }));
}

window.FUN_TD_UNLOCKS = {
  progress,
  isUnlocked: unlocked,
  requirement,
  all,
  starters: () => STARTERS.slice(),
  unlockedCount: () => all().filter(t => t.unlocked).length,
  totalCount: () => all().length,
  // Named so a screen can say "RAIL LANCE unlocked" rather than "rail".
  nextLocked: () => all().find(t => !t.unlocked) || null
};
})();
