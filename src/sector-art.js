/* Applies the shared sprite pack to sectors 02-06.
 *
 * Sector 01 has its own file because it carries hand-placed scenery; everything
 * here is driven off the route and tower table the loader exposes as
 * window.FUN_TD_SECTOR_MODEL, so a sector needs no per-sector art code.
 *
 * The campaign's runtimes disagree on their draw signatures — sectors 2-3 take
 * (ctx, thing), sectors 4 and 6 take (thing) and hold the context on the
 * instance — so each is pointed at the matching installer. Sector 05 draws
 * everything inline inside draw() with no overridable methods, so it is left
 * on its own art rather than pretending otherwise.
 */
(() => {
const sector = window.FUN_TD_SECTOR || 1;
if (sector === 1 || window.FUN_TD_ENDLESS) return;

const ART = window.FUN_TD_ART;
if (!ART) return;

// Which installer each sector needs, and where it keeps its 2D context.
const SHAPE = {
  2: { install: 'installClassic' },
  3: { install: 'installClassic' },
  4: { install: 'installCompact', ctxKey: 'ctx' },
  // Sector 05 offsets a unit's lane on the vertical axis only.
  5: { install: 'installCompact', ctxKey: 'x', laneOffset: e => [0, e.lane || 0] },
  // Sector 06 now exposes drawWorld too, so it takes the themed terrain.
  6: { install: 'installCompact', ctxKey: 'x' }
};

/* Scenery scattered off the route, seeded per sector so the same layout comes
   back every time without a table of hand-placed coordinates per map. */
function scatter(path, base, theme) {
  // Wooden crates and fuel drums belong at a desert outpost, not adrift in a
  // void fortress, so the further the campaign gets from ground the less of the
  // supply-dump scenery is appropriate.
  const kinds = theme.name === 'null' || theme.name === 'night'
    ? ['prop_rock']
    : theme.name === 'frost'
      ? ['prop_rock', 'prop_rock', 'prop_crate']
      : ['prop_rock', 'prop_crate', 'prop_barrel', 'prop_sandbags'];
  const budget = theme.name === 'null' ? 8 : theme.name === 'night' ? 12 : 18;

  const farFromRoute = (x, y) => {
    let best = Infinity;
    for (let i = 1; i < path.length; i++) {
      const [ax, ay] = path[i - 1], [bx, by] = path[i];
      const dx = bx - ax, dy = by - ay, len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / len2));
      best = Math.min(best, Math.hypot(x - (ax + dx * t), y - (ay + dy * t)));
    }
    return best > 74 && Math.hypot(x - base.x, y - base.y) > 130;
  };

  const props = [];
  let seed = 1337 + sector * 7919;
  const rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let tries = 0; tries < 400 && props.length < budget; tries++) {
    const x = 30 + rand() * 660, y = 60 + rand() * 1010;
    if (!farFromRoute(x, y)) continue;
    if (props.some(p => Math.hypot(p[1] - x, p[2] - y) < 70)) continue;
    // Pick from the seeded stream, not from props.length — a fixed stride over a
    // same-length list lands on one kind every time.
    props.push([kinds[Math.floor(rand() * kinds.length)], Math.round(x), Math.round(y), 0.7 + rand() * 0.5]);
  }
  return props;
}

ART.whenReady(game => {
  const shape = SHAPE[sector];
  const model = window.FUN_TD_SECTOR_MODEL;
  if (!shape) return;
  if (!model || !model.MAP || !Array.isArray(model.MAP.path)) {
    console.warn('FUN TD art: sector', sector, 'exposed no route; keeping its own art');
    return;
  }

  const theme = ART.THEMES[sector] || ART.THEMES[1];
  const path = model.MAP.path;
  const base = model.MAP.base || { x: 112, y: 600 };

  ART[shape.install](game, {
    path,
    theme,
    props: scatter(path, base, theme),
    towers: model.TOWERS || {},
    base,
    ctxKey: shape.ctxKey,
    laneOffset: shape.laneOffset
  });
});
})();
