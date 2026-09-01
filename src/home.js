/* Home screen behaviour.
 *
 * Fills in the player bar, campaign progress, chest slots and mode tags from
 * saved state, and renders the stage preview by asking the shared sprite pack
 * to paint the selected sector's own terrain into a small canvas — so the
 * diorama is the map you are about to play, not a stock illustration.
 *
 * Everything degrades: with no saved state it shows a fresh account, and if the
 * art pack is unavailable the preview falls back to a plain themed gradient.
 */
(() => {
const $ = id => document.getElementById(id);
const num = key => { try { return +localStorage.getItem(key) || 0; } catch (e) { return 0; } };
const flag = key => { try { return localStorage.getItem(key) === '1'; } catch (e) { return false; } };

const SECTORS = [
  { n: 1, name: 'Dustwall Defense',   copy: 'Four tower families. Twenty waves. One command core.' },
  { n: 2, name: 'Frostline Pass',     copy: 'Hold the frozen pass. Break the swarm. Survive the storm.' },
  { n: 3, name: 'Ashfall Foundry',    copy: 'Hold the foundry. Break the splitters. Survive the heat.' },
  { n: 4, name: 'Black Tide Harbor',  copy: 'Hold the harbour. Chain the swarm. Survive the surge.' },
  { n: 5, name: 'Nightfall Citadel',  copy: 'Break the shield line. Hold the citadel.' },
  { n: 6, name: 'The Null Fortress',  copy: 'Three acts. Five fronts. One final command core.' }
];

const sector = window.FUN_TD_SECTOR || 1;
const info = SECTORS.find(s => s.n === sector) || SECTORS[0];

/* ------------------------------------------------------------- player bar */

function cleared(n) { return flag(`funTD_sector${n}Clear`); }
function stars(n) { return num(`funTD_sector${n}Stars`); }
function bestWave(n) { return num(`funTD_sector${n}BestWave`); }

function fillPlayer() {
  const totalStars = SECTORS.reduce((t, s) => t + stars(s.n), 0);
  const clearedCount = SECTORS.filter(s => cleared(s.n)).length;
  const kills = num('funTD_lifetimeKills');
  const level = Math.max(1, Math.floor(totalStars / 2) + clearedCount + 1);

  const score = kills * 10 + totalStars * 500 + clearedCount * 2500;
  const el = $('homeScore');
  if (el) el.textContent = score.toLocaleString('en-US');
  if ($('homeLevel')) $('homeLevel').textContent = level;
  if ($('homeName')) $('homeName').textContent = 'COMMANDER';

  // Progress towards the next level, expressed as stars within the current tier.
  const into = totalStars % 2;
  if ($('homeXp')) $('homeXp').style.width = (into / 2 * 100) + '%';

  const cores = num('funTD_cores');
  const gold = num('funTD_lifetimeGold');
  if ($('homeCores')) $('homeCores').textContent = cores.toLocaleString('en-US');
  if ($('homeGold')) $('homeGold').textContent =
    gold >= 1e6 ? (gold / 1e6).toFixed(2) + 'M' : gold.toLocaleString('en-US');

  if ($('seasonBar')) $('seasonBar').style.width = (clearedCount / SECTORS.length * 100) + '%';
  if ($('seasonText')) $('seasonText').textContent = `${clearedCount}/${SECTORS.length}`;
  if ($('seasonTier')) $('seasonTier').textContent = Math.max(1, clearedCount);
}

/* ------------------------------------------------------------------ stage */

function fillStage() {
  const best = bestWave(sector);
  if ($('stageWaves')) $('stageWaves').textContent = `${Math.min(20, best)}/20`;
  if ($('stageBar')) $('stageBar').style.width = Math.min(100, best / 20 * 100) + '%';
  if ($('battleDiff')) {
    $('battleDiff').textContent = cleared(sector) ? 'REPLAY' : sector === 1 ? 'SECTOR 01' : 'SECTOR 0' + sector;
  }
  const title = document.querySelector('.stage-title');
  if (title) title.textContent = `${String(sector).padStart(2, '0')}. ${info.name}`;
  const copy = document.querySelector('.stage-copy');
  if (copy) copy.textContent = info.copy;
}

/* The battlefield is 720x1120. Fit that shape into whatever room the slab has
 * rather than stretching it to the element's attribute size, which distorted
 * the map, and set the backing store at device resolution so it stays crisp.
 */
const WORLD_W = 720, WORLD_H = 1120;

function sizeStage(canvas) {
  const slab = canvas.parentElement;
  if (!slab) return 1;
  const box = slab.getBoundingClientRect();
  const pad = getComputedStyle(slab);
  const availW = box.width - parseFloat(pad.paddingLeft) - parseFloat(pad.paddingRight);
  const availH = box.height - parseFloat(pad.paddingTop) - parseFloat(pad.paddingBottom);
  if (!(availW > 0) || !(availH > 0)) return 1;

  let w = availW, h = w * WORLD_H / WORLD_W;
  if (h > availH) { h = availH; w = h * WORLD_W / WORLD_H; }
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));

  // Keep the progress bar the same width as the map it belongs to.
  const bar = document.querySelector('.stage-bar');
  if (bar) bar.style.width = w + 'px';
  return canvas.width / WORLD_W;
}

/* Paint the sector's real terrain into the slab. */
function paintStage() {
  const canvas = $('stageArt');
  if (!canvas) return;
  const c = canvas.getContext('2d');
  const scale = sizeStage(canvas);
  const ART = window.FUN_TD_ART;
  const theme = (ART && ART.THEMES[sector]) || null;

  if (!ART || !theme) {
    const g = c.createLinearGradient(0, 0, 0, canvas.height);
    g.addColorStop(0, '#2a5f8f');
    g.addColorStop(1, '#0d2a58');
    c.fillStyle = g;
    c.fillRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const model = window.FUN_TD_SECTOR_MODEL || window.FUN_TD_MODEL;
  const path = model && model.MAP && model.MAP.path;
  const world = ART.buildWorld(path || [[700, 120], [120, 120], [120, 560], [600, 560], [600, 1000], [140, 1000]],
    theme, []);
  c.save();
  c.scale(scale, scale);
  c.drawImage(world, 0, 0);
  if (model && model.MAP && model.MAP.base) {
    ART.drawCoreAt(c, model.MAP.base.x, model.MAP.base.y, 1, 0);
  }
  c.restore();
}

/* Rotating the phone changes how much room the slab has. */
function watchResize() {
  let timer = 0;
  addEventListener('resize', () => {
    clearTimeout(timer);
    timer = setTimeout(paintStage, 120);
  });
}

/* ------------------------------------------------------------- side rails */

function railTarget(id) {
  return {
    railSectors: () => $('campaignMapButton'),
    railUpgrades: () => $('warRoomButton'),
    railStats: () => $('campaignButton')
  }[id];
}

/* ------------------------------------------------------------- collection */

/* The tower collection. Unlocks are the reason to keep playing, so they get a
 * screen that shows the whole roster - what you have, what is still out there,
 * and exactly what earns it - rather than only surfacing as a greyed-out card
 * in the build menu once you are already in a fight. */
const TOWER_BLURB = {
  gun:    'Rapid single-target fire. Hits air.',
  frost:  'Chills whatever it hits, ground or air.',
  cannon: 'Splash and armour-shred. Cannot reach air.',
  arc:    'Lightning that jumps between packed enemies.',
  flak:   'Air only. Bursts across a whole flight.',
  rail:   'Fires across half the map, straight through armour.',
  void:   'A collapsing field. No barrel, no aiming.'
};

function collectionSheet() {
  const U = window.FUN_TD_UNLOCKS;
  if (!U) return;
  let el = $('collectionOverlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'collectionOverlay';
    el.innerHTML = '<section class="collection-card"><div class="collection-head">' +
      '<small>COMMAND ARMOURY</small><h2>TOWER COLLECTION</h2>' +
      '<p id="collectionCount"></p></div><div class="collection-grid" id="collectionGrid"></div>' +
      '<div class="collection-foot"><button id="collectionClose">RETURN</button></div></section>';
    document.body.appendChild(el);
    el.addEventListener('pointerdown', e => { if (e.target === el) el.classList.remove('show'); });
    el.querySelector('#collectionClose').onclick = () => el.classList.remove('show');
  }

  const rows = U.all();
  const model = window.FUN_TD_SECTOR_MODEL || window.FUN_TD_MODEL;
  const TOWERS = (model && model.TOWERS) || {};
  $('collectionCount').textContent =
    `${rows.filter(r => r.unlocked).length} of ${rows.length} tower families unlocked`;
  $('collectionGrid').innerHTML = rows.map(r => {
    const t = TOWERS[r.type] || {};
    const name = t.name || r.type.toUpperCase();
    const layer = t.targets === 'air' ? 'AIR ONLY' : t.targets === 'both' ? 'GROUND + AIR' : 'GROUND ONLY';
    return `<div class="collect-card${r.unlocked ? '' : ' locked'}">
      <i style="--c:${t.color || '#6f9ac9'};--a:${t.accent || '#123'}"></i>
      <b>${name}</b>
      <span class="collect-layer">${r.unlocked ? layer : 'LOCKED'}</span>
      <p>${r.unlocked ? (TOWER_BLURB[r.type] || '') : r.requirement}</p>
      ${r.unlocked && t.cost ? `<em>● ${t.cost}</em>` : ''}
    </div>`;
  }).join('');
  el.classList.add('show');
}

function wireRails() {
  const collection = $('railCollection');
  if (collection) collection.onclick = collectionSheet;

  for (const id of ['railSectors', 'railUpgrades', 'railStats']) {
    const btn = $(id);
    const target = railTarget(id);
    if (btn && target) btn.onclick = () => { const t = target(); if (t) t.click(); };
  }

  const endless = $('railEndless');
  if (endless) endless.onclick = () => {
    const u = new URL(location.href);
    u.searchParams.set('endless', '1');
    location.href = u.toString();
  };

  const help = $('railHelp');
  if (help) help.onclick = () => {
    // The in-game help sheet already documents the rules; show it from here too.
    const sheet = $('helpSheet');
    if (sheet) sheet.classList.remove('hidden');
  };

  const U = window.FUN_TD_UNLOCKS;
  const unlocked = U ? U.unlockedCount() : 4;
  const total = U ? U.totalCount() : 4;
  if ($('railCollectionCount')) $('railCollectionCount').textContent = `${unlocked}/${total}`;
  // A tower waiting to be earned is worth pointing at; one already earned is
  // not, so the collection rail only lights up when there is something to chase.
  const next = U && U.nextLocked();
  if (collection) collection.title = next ? `Next tower: ${next.requirement}` : 'Tower collection';
  // Flag the upgrades rail when there is currency waiting to be spent.
  const dot = $('railUpgradesDot');
  if (dot && num('funTD_cores') > 0) dot.classList.add('on');
}

/* -------------------------------------------------------------- furniture */

function fillTags() {
  const host = $('modeTags');
  if (!host) return;
  const tags = [
    { icon: '⚔', on: true, title: 'Campaign' },
    { icon: '❄', on: cleared(2), title: 'Frostline cleared' },
    { icon: '🔥', on: cleared(3), title: 'Ashfall cleared' },
    { icon: '✦', on: cleared(5), title: 'Nightfall cleared' }
  ];
  host.innerHTML = tags.map(t =>
    `<span class="mode-tag${t.on ? ' on' : ''}" title="${t.title}">${t.icon}</span>`).join('');
}

function fillChests() {
  const host = $('chestSlots');
  if (!host) return;
  // One slot per medal earned in this sector, so the row reflects real progress
  // rather than being decorative.
  const earned = stars(sector);
  host.innerHTML = Array.from({ length: 4 }, (_, i) => {
    if (i < earned) return `<div class="chest-slot filled"><b>★</b>MEDAL ${i + 1}</div>`;
    if (i < 3) return '<div class="chest-slot">MEDAL<br>LOCKED</div>';
    return `<div class="chest-slot${cleared(sector) ? ' filled' : ''}">${cleared(sector) ? '<b>✔</b>CLEARED' : 'SECTOR<br>OPEN'}</div>`;
  }).join('');
}

/* finale.js and friends append their buttons straight to the card. On the old
 * title screen they stacked under everything; here they belong in the bottom
 * bar, so adopt them as tabs — relabelled, since a nav tab has room for a word.
 */
const NAV_LABELS = {
  specialOpsButton:   ['\u2739', 'OPS'],
  finalAssaultButton: ['\u2726', 'ASSAULT'],
  endlessButton:      ['\u221e', 'ENDLESS'],
  prestigeButton:     ['\u25c6', 'PRESTIGE']
};

function adoptNavButtons() {
  const host = document.querySelector('#intro section.home');
  const nav = document.querySelector('.home-nav');
  if (!host || !nav) return;
  for (const btn of [...host.children]) {
    if (btn.tagName !== 'BUTTON' || btn.parentElement === nav) continue;
    const label = NAV_LABELS[btn.id];
    if (label) btn.innerHTML = `<span>${label[0]}</span>${label[1]}`;
    nav.appendChild(btn);
  }
}

function watchNav() {
  const host = document.querySelector('#intro section.home');
  if (!host || typeof MutationObserver !== 'function') return;
  new MutationObserver(adoptNavButtons).observe(host, { childList: true });
}

function boot() {
  if (!document.querySelector('#intro section.home')) return;
  fillPlayer();
  fillStage();
  fillTags();
  fillChests();
  wireRails();
  adoptNavButtons();
  watchNav();
  watchResize();
  // The bar always shows where you are: the home screen is Command.
  const command = $('campaignButton');
  if (command) command.classList.add('on');
  // The art pack loads its sprites asynchronously; paint once now for the
  // terrain, and again once the core sprite is available.
  paintStage();
  if (window.FUN_TD_ART) window.FUN_TD_ART.load().then(() => paintStage()).catch(() => {});
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
