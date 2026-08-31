/* Dustwall art pack — Sector 01.
 *
 * Sector 01 is the only map with hand-placed scenery, so it keeps its own file;
 * all the drawing itself lives in src/art/sprite-pack.js and is shared with the
 * rest of the campaign.
 *
 * If the manifest or any image fails to load the pack never installs and the
 * runtime keeps its own procedural drawing, so the game still plays.
 */
(() => {
if ((window.FUN_TD_SECTOR || 1) !== 1 || window.FUN_TD_ENDLESS) return;

const ART = window.FUN_TD_ART;
if (!ART) return;

const PATH = [[710, 145], [520, 145], [520, 315], [650, 315], [650, 500], [430, 500],
              [430, 690], [620, 690], [620, 930], [330, 930], [330, 780], [210, 780],
              [210, 630], [150, 630]];
const BASE = { x: 112, y: 600 };

// Placed by hand: the outpost should look occupied rather than randomly littered.
const PROPS = [
  ['prop_rock', 62, 432, 1.15], ['prop_rock', 288, 336, 0.75], ['prop_rock', 352, 722, 0.7],
  ['prop_rock', 668, 612, 0.85], ['prop_rock', 96, 922, 0.8], ['prop_rock', 176, 196, 0.9],
  ['prop_rock', 604, 1062, 0.95], ['prop_rock', 300, 1024, 0.7],
  ['prop_crate', 82, 458, 0.85], ['prop_crate', 308, 470, 0.95], ['prop_crate', 676, 722, 0.85],
  ['prop_crate', 190, 358, 0.75], ['prop_crate', 118, 336, 0.7],
  ['prop_barrel', 60, 496, 0.8], ['prop_barrel', 344, 452, 0.75], ['prop_barrel', 700, 690, 0.8],
  ['prop_barrel', 262, 1058, 0.75],
  ['prop_sandbags', 268, 616, 0.9], ['prop_sandbags', 548, 962, 0.9], ['prop_sandbags', 168, 706, 0.8]
];

ART.whenReady(game => {
  ART.installClassic(game, {
    path: PATH,
    theme: ART.THEMES[1],
    props: PROPS,
    towers: (window.FUN_TD_MODEL && window.FUN_TD_MODEL.TOWERS) || {},
    base: BASE
  });
});
})();
