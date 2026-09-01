/* FUN TD — Sector 01 · Dustwall Defense.
 *
 * Loaded as a plain script (loader.js injects the source text), so this file
 * deliberately uses no imports and exposes the running game as window.funTDGame
 * for the art and flow layers that decorate it.
 *
 * The block between the DATA sentinels below is pure data plus pure functions.
 * tools/balance-sim.js and tests/dustwall-balance.test.js evaluate exactly that
 * slice in a sandbox, so the numbers the simulator reports are the numbers the
 * game ships with — there is no second copy to drift.
 */
(() => {
const META = window.FUN_TD_META || {};

/*--FUN-TD-DATA-START--*/
const MAP = {
  worldW: 720,
  worldH: 1120,
  base: { x: 112, y: 600, r: 82 },
  path: [[710, 145], [520, 145], [520, 315], [650, 315], [650, 500], [430, 500],
         [430, 690], [620, 690], [620, 930], [330, 930], [330, 780], [210, 780],
         [210, 630], [150, 630]],
  pads: [
    { x: 390, y: 120 }, { x: 430, y: 235 }, { x: 610, y: 230 }, { x: 330, y: 395 },
    { x: 475, y: 400 }, { x: 558, y: 596 }, { x: 335, y: 585 }, { x: 420, y: 790 },
    { x: 520, y: 805 }, { x: 232, y: 880 }, { x: 486, y: 1026 }, { x: 115, y: 745 }
  ]
};

// Balance knobs live in one object so the simulator can report against them.
const BAL = {
  startGold: 480,
  baseHp: 100,
  sellRate: 0.72,
  // Multiplier on base cost to reach the next level, indexed by current level.
  upgradeMul: [0, 1.3, 2.6, 5.0],
  maxLevel: 4,
  damagePerLevel: 0.70,
  ratePerLevel: 0.14,
  rangePerLevel: 0.07,
  splashPerLevel: 9,
  slowPerLevel: 0.05,
  // Enemy health climbs with the wave so early units stay relevant without the
  // spawn counts exploding into unreadable crowds.  The curve is quadratic
  // because the player's gold — and therefore their damage — compounds: a
  // linear ramp gets out-scaled by wave 8 and the back half plays itself.
  hpScaleLinear: 0.06,
  hpScaleQuadratic: 0.030,
  rewardScalePerWave: 0.03,
  comboWindow: 1.45,
  comboCap: 120,
  maxSlow: 0.62
};

const TOWERS = {
  gun: {
    name: 'GUN TOWER', short: 'GUN', cost: 110, damage: 16, rate: 5.0, range: 160,
    pierce: 0.15, projectile: 900, targets: 'both', color: '#5fd0ff', accent: '#1b6fb8',
    role: 'Rapid single-target fire. Hits air. Cheap, and the backbone of every line.'
  },
  frost: {
    name: 'FROST COIL', short: 'FROST', cost: 170, damage: 12, rate: 2.0, range: 165,
    pierce: 0, projectile: 860, slow: 0.34, slowTime: 2.0, targets: 'both',
    color: '#8ef0ff', accent: '#1f8fbf',
    role: 'Chills whatever it hits, ground or air. Low damage, but it buys time.'
  },
  cannon: {
    name: 'SIEGE MORTAR', short: 'MORTAR', cost: 240, damage: 78, rate: 0.80, range: 205,
    pierce: 0.55, projectile: 430, splash: 64, targets: 'ground',
    color: '#ffab45', accent: '#c9611b',
    role: 'Lobs shells at a predicted spot. Splash and armour-shred — but it cannot reach air.'
  },
  arc: {
    name: 'ARC SPIRE', short: 'ARC', cost: 300, damage: 38, rate: 1.5, range: 180,
    pierce: 0.30, chains: 3, chainRange: 95, chainFalloff: 0.72, targets: 'both',
    color: '#c08dff', accent: '#6a2fc0',
    role: 'Lightning jumps between packed enemies, ground or air. Worthless against a lone target.'
  },
  flak: {
    name: 'FLAK BATTERY', short: 'FLAK', cost: 200, damage: 44, rate: 2.4, range: 215,
    pierce: 0.20, projectile: 1000, splash: 46, splashAir: true, targets: 'air',
    color: '#ffd66b', accent: '#b8860b',
    role: 'Air only. Bursting shells that shred a formation of fliers — and cannot touch the ground.'
  },
  rail: {
    name: 'RAIL LANCE', short: 'RAIL', cost: 420, damage: 260, rate: 0.42, range: 320,
    pierce: 1.0, projectile: 1600, beam: 44, targets: 'both',
    color: '#bfe9ff', accent: '#4a7f9c',
    role: 'Fires across half the map and punches through armour and everything behind it. Slow, and it hates crowds.'
  },
  void: {
    name: 'VOID SPIRE', short: 'VOID', cost: 520, damage: 22, rate: 4.0, range: 170,
    // A field tower's output is "damage x how many are standing in it". Three
    // is the conservative figure every value calculation here assumes; a real
    // crowd is worth more and an empty lane is worth nothing.
    pierce: 0.45, aura: true, auraTargets: 3, slow: 0.30, slowTime: 0.6, targets: 'both',
    color: '#ff5cc0', accent: '#8a1a5e',
    role: 'Drags everything nearby into a collapsing field. No barrel, no aiming — it just grinds down whatever comes close.'
  }
};

/* Which towers a player has earned.
 *
 * The first four are the game; the rest are the reward for playing it. Keeping
 * the rule here rather than in the UI means the balance simulator gates its
 * scripted player exactly the way a real account is gated, so the curve it
 * reports is the curve a first-time player meets. */
const UNLOCKS = {
  gun:    { from: 'start' },
  frost:  { from: 'start' },
  cannon: { from: 'start' },
  arc:    { from: 'start' },
  // Air arrives in wave 6, so flak lands in the build phase right before it.
  flak:   { from: 'wave',   wave: 5,   note: 'Survive wave 5 in any sector' },
  rail:   { from: 'sector', sector: 2, note: 'Clear Sector 02 · Frostline Pass' },
  void:   { from: 'sector', sector: 4, note: 'Clear Sector 04 · Black Tide Harbor' }
};

// The order the build menu and the number hotkeys use.
const TOWER_ORDER = ['gun', 'frost', 'cannon', 'arc', 'flak', 'rail', 'void'];

/* `progress` is { bestWave, cleared:Set } — whatever the caller knows. A fresh
   account passes nothing and gets exactly the four starting families. */
const isUnlocked = (type, progress = {}) => {
  const rule = UNLOCKS[type];
  if (!rule || rule.from === 'start') return true;
  if (rule.from === 'wave') return (progress.bestWave || 0) >= rule.wave;
  if (rule.from === 'sector') return !!(progress.cleared && progress.cleared.has(rule.sector));
  return false;
};

/* Which enemies a tower may shoot at. Three of the four ground families can
   engage air, so a player who never builds flak is inconvenienced rather than
   hard-locked; flak is simply far more efficient at it. */
const canTarget = (stats, enemy) => {
  const t = stats.targets || 'ground';
  return enemy.flying ? (t === 'air' || t === 'both') : (t === 'ground' || t === 'both');
};

const ENEMIES = {
  grunt:   { name: 'GRUNT',      hp: 46,   speed: 65, armor: 0,    reward: 5,   damage: 1,  size: 11, color: '#3fd45f' },
  scout:   { name: 'SCOUT',      hp: 32,   speed: 112, armor: 0,   reward: 6,   damage: 1,  size: 9,  color: '#8bf05a' },
  armored: { name: 'ARMOURED',   hp: 130,  speed: 48, armor: 0.42, reward: 11,  damage: 2,  size: 13, color: '#2aa05a' },
  heavy:   { name: 'HEAVY',      hp: 430,  speed: 33, armor: 0.22, reward: 23,  damage: 5,  size: 18, color: '#1c7a45' },
  // Fliers ignore the road entirely: they cross the map in a straight line, so
  // a defence packed around a far corner of the route never sees them.
  drone:   { name: 'DRONE',      hp: 44,   speed: 96, armor: 0,    reward: 8,   damage: 2,  size: 10, color: '#4fe0cf',
             flying: true, altitude: 34 },
  gunship: { name: 'GUNSHIP',    hp: 430,  speed: 42, armor: 0.18, reward: 30,  damage: 6,  size: 17, color: '#2fb9b0',
             flying: true, altitude: 44 },
  // The tanker: no armour to pierce, just a wall of health that has to be
  // ground down while everything else in the wave walks past it.
  brute:   { name: 'BRUTE',      hp: 1000, speed: 26, armor: 0.30, reward: 55,  damage: 9,  size: 22, color: '#175f38' },
  // The boss is not one long health bar: it sheds plating and calls in help at
  // fixed thresholds, so the fight changes shape twice before it ends.
  boss:    { name: 'SAND TITAN', hp: 12000, speed: 25, armor: 0.38, reward: 450, damage: 30, size: 32,
             color: '#0f5c35', noScale: true,
             phases: [
               { at: 0.66, name: 'PLATING SHED',  speed: 1.30, armor: 0.26, size: 1.0,
                 escorts: ['armored', 'armored', 'armored'] },
               { at: 0.33, name: 'CORE EXPOSED',  speed: 1.65, armor: 0.14, size: 0.92,
                 escorts: ['gunship', 'drone', 'drone', 'drone'] }
             ] }
};

const g = (type, count, interval = 0.42, gap = 0) => ({ type, count, interval, gap });

const WAVES = [
  [g('grunt', 10, 0.70)],
  [g('grunt', 14, 0.62)],
  [g('grunt', 12, 0.58), g('scout', 4, 0.50, 1.4)],
  [g('grunt', 16, 0.54), g('scout', 6, 0.46, 1.2)],
  [g('grunt', 14, 0.52), g('armored', 3, 0.80, 1.6)],
  // Air debuts small and alone, so the lesson lands before it costs anything.
  [g('grunt', 18, 0.48), g('drone', 5, 0.66, 1.6)],
  [g('grunt', 16, 0.48), g('armored', 5, 0.72, 1.4)],
  [g('grunt', 20, 0.44), g('scout', 10, 0.40, 1.0), g('armored', 4, 0.70, 1.0)],
  [g('grunt', 18, 0.44), g('heavy', 2, 1.10, 1.8), g('drone', 4, 0.62, 1.2)],
  [g('grunt', 22, 0.42), g('armored', 8, 0.62, 1.0)],
  [g('grunt', 26, 0.38), g('scout', 18, 0.34, 1.0), g('drone', 12, 0.48, 1.0)],
  [g('grunt', 24, 0.40), g('heavy', 3, 1.00, 1.4)],
  // The first tanker arrives with an escort that punishes tunnel vision.
  [g('grunt', 22, 0.38), g('brute', 1, 1.20, 1.6), g('scout', 12, 0.34, 0.9), g('armored', 3, 0.58, 0.9)],
  [g('grunt', 26, 0.36), g('armored', 10, 0.56, 1.0), g('heavy', 3, 0.95, 1.0)],
  [g('grunt', 24, 0.36), g('drone', 14, 0.40, 0.9), g('gunship', 2, 1.15, 1.4), g('heavy', 3, 0.92, 1.0)],
  [g('grunt', 26, 0.34), g('scout', 12, 0.32, 0.9), g('armored', 7, 0.52, 0.9), g('brute', 1, 1.10, 1.0)],
  [g('grunt', 24, 0.34), g('armored', 7, 0.54, 0.9), g('heavy', 5, 0.85, 0.9), g('gunship', 1, 1.10, 1.0)],
  [g('grunt', 24, 0.32), g('scout', 12, 0.30, 0.8), g('drone', 16, 0.38, 0.8), g('brute', 1, 1.05, 1.0), g('armored', 6, 0.50, 0.9)],
  [g('grunt', 24, 0.30), g('scout', 14, 0.30, 0.8), g('armored', 11, 0.48, 0.8), g('heavy', 4, 0.80, 0.8),
   g('gunship', 2, 1.00, 1.0)],
  [g('boss', 1, 1.0), g('grunt', 20, 0.34, 2.0), g('armored', 8, 0.52, 1.0), g('brute', 1, 1.05, 1.0),
   g('gunship', 2, 1.05, 1.0)]
].map((groups, i) => ({
  groups,
  bonus: 55 + i * 9,
  flawless: 35 + i * 5
}));

// --- pure derivations -------------------------------------------------------

const waveHpScale = i => 1 + i * BAL.hpScaleLinear + i * i * BAL.hpScaleQuadratic;
const waveRewardScale = i => 1 + i * BAL.rewardScalePerWave;
const countWave = i => (WAVES[i] ? WAVES[i].groups.reduce((n, x) => n + x.count, 0) : 0);

const enemyStats = (type, waveIndex) => {
  const b = ENEMIES[type];
  return {
    ...b,
    type,
    hp: Math.round(b.hp * (b.noScale ? 1 : waveHpScale(waveIndex))),
    speed: b.speed * (META.enemySpeed || 1),
    reward: Math.max(1, Math.round(b.reward * waveRewardScale(waveIndex)))
  };
};

// Armour is flat damage reduction; a tower's pierce cancels part of it, which
// is the whole reason to mix mortars into a wall of gun towers.
const damageAfterArmor = (damage, armor, pierce = 0) =>
  damage * (1 - Math.max(0, (armor || 0) - (pierce || 0)));

const towerStats = (type, level) => {
  const b = TOWERS[type], n = level - 1;
  // Persistent War Room research is applied here rather than by patching the
  // source text, so rebalancing this file can never silently disable it.
  const research = {
    gun:    1 + (META.gunLevel || 0) * 0.05 + (META.gun2 || 0) * 0.06,
    cannon: 1 + (META.cannonLevel || 0) * 0.06 + (META.cannon2 || 0) * 0.05,
    frost:  1 + (META.freeze2 || 0) * 0.06,
    arc:    1 + (META.arcLevel || 0) * 0.07 + (META.arc2 || 0) * 0.08,
    flak:   1 + (META.flakLevel || 0) * 0.06,
    rail:   1 + (META.railLevel || 0) * 0.07,
    void:   1 + (META.voidLevel || 0) * 0.07
  }[type] || 1;
  const rangeBonus = {
    gun: META.gunLevel >= 3 ? 1.08 : 1,
    frost: META.freezeLevel >= 3 ? 1.10 : 1,
    void: 1 + (META.voidLevel || 0) * 0.05,
    cannon: 1, arc: 1, flak: 1, rail: 1
  }[type] || 1;
  return {
    ...b,
    level,
    damage: b.damage * (1 + n * BAL.damagePerLevel) * research,
    rate: b.rate * (1 + n * BAL.ratePerLevel) * (type === 'gun' && META.gunLevel >= 3 ? 1.12 : 1),
    range: b.range * (1 + n * BAL.rangePerLevel) * rangeBonus,
    splash: b.splash
      ? (b.splash + n * BAL.splashPerLevel + (META.cannonLevel || 0) * 4) *
        (type === 'flak' ? 1 + (META.flakLevel || 0) * 0.07 : 1)
      : 0,
    beam: b.beam ? b.beam * (1 + n * 0.08) * (1 + (META.railLevel || 0) * 0.06) : 0,
    slow: b.slow
      ? Math.min(BAL.maxSlow, b.slow + n * BAL.slowPerLevel + (META.freezeLevel || 0) * 0.04)
      : 0,
    slowTime: b.slowTime ? b.slowTime + (META.freezeDuration || 0) : 0,
    chains: b.chains ? b.chains + (level >= 3 ? 1 : 0) + (META.arcLevel >= 3 ? 1 : 0) : 0,
    chainRange: b.chainRange ? b.chainRange * (1 + n * 0.06) : 0
  };
};

const upgradeCost = (type, level) =>
  level < BAL.maxLevel ? Math.round(BAL.upgradeMul[level] * TOWERS[type].cost) : 0;

const investedAt = (type, level) => {
  let total = TOWERS[type].cost;
  for (let l = 1; l < level; l++) total += upgradeCost(type, l);
  return total;
};

const dpsOf = (type, level, armor = 0) => {
  const s = towerStats(type, level);
  const perHit = damageAfterArmor(s.damage, armor, s.pierce);
  const chainMul = s.chains ? 1 + s.chains * (TOWERS[type].chainFalloff || 0.7) : 1;
  const auraMul = s.aura ? (s.auraTargets || 3) : 1;
  return perHit * s.rate * chainMul * auraMul;
};

const startGold = () => Math.max(100, BAL.startGold + (META.startGold || 0));
const startBaseHp = () => Math.max(40, BAL.baseHp + (META.baseHp || 0));
const sellRate = () => META.sellRate || BAL.sellRate;

// What the intel panel shows before a wave starts.
const waveIntel = i => {
  if (!WAVES[i]) return [];
  const seen = new Map();
  for (const grp of WAVES[i].groups) seen.set(grp.type, (seen.get(grp.type) || 0) + grp.count);
  return [...seen].map(([type, count]) => ({ type, count, name: ENEMIES[type].name }));
};

const waveEffectiveHp = i => WAVES[i].groups.reduce((sum, grp) => {
  const e = enemyStats(grp.type, i);
  return sum + grp.count * e.hp / (1 - e.armor);
}, 0);

const waveSpawnSeconds = i => {
  let t = 0.8;
  for (const grp of WAVES[i].groups) t += (grp.gap || 0) + grp.count * grp.interval + 0.55;
  return t;
};

let _pathLength = 0;
const pathLength = () => {
  if (_pathLength) return _pathLength;
  let d = 0;
  for (let i = 1; i < MAP.path.length; i++)
    d += Math.hypot(MAP.path[i][0] - MAP.path[i - 1][0], MAP.path[i][1] - MAP.path[i - 1][1]);
  return (_pathLength = d);
};
/*--FUN-TD-DATA-END--*/

const TARGET_MODES = [
  { id: 'first',  label: 'FIRST',    hint: 'closest to the base' },
  { id: 'last',   label: 'LAST',     hint: 'furthest from the base' },
  { id: 'strong', label: 'STRONGEST', hint: 'most remaining health' },
  { id: 'weak',   label: 'WEAKEST',  hint: 'least remaining health' },
  { id: 'close',  label: 'CLOSEST',  hint: 'nearest to this tower' }
];

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const money = n => Math.floor(n).toLocaleString('en-US');

const rr = (c, x, y, w, h, r) => {
  r = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + r, y);
  c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r);
  c.lineTo(x + w, y + h - r); c.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r);
  c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y);
  c.closePath();
};

/* ------------------------------------------------------------------ audio */
/* Every sound is synthesised on the fly; the repo ships no audio files. */
const Sound = {
  ctx: null,
  master: null,
  enabled: true,
  lastAt: Object.create(null),

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.32;
      this.master.connect(this.ctx.destination);
    } catch (e) { this.ctx = null; }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  },

  noiseBuffer() {
    if (this._noise) return this._noise;
    const len = this.ctx.sampleRate * 0.5;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this._noise = buf;
    return buf;
  },

  tone({ freq = 440, to = null, type = 'square', dur = 0.12, gain = 0.5, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), t0 + dur);
    amp.gain.setValueAtTime(0.0001, t0);
    amp.gain.exponentialRampToValueAtTime(gain, t0 + Math.min(0.012, dur * 0.2));
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(amp).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  },

  noise({ dur = 0.2, gain = 0.4, from = 1800, to = 200, q = 1, delay = 0 }) {
    const t0 = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = q;
    filter.frequency.setValueAtTime(from, t0);
    filter.frequency.exponentialRampToValueAtTime(Math.max(40, to), t0 + dur);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(gain, t0);
    amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(filter).connect(amp).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.02);
  },

  // Rapid-fire towers would otherwise stack dozens of voices per second.
  play(name, minGap = 0) {
    if (!this.enabled || !this.ctx) return;
    const now = performance.now();
    if (minGap && now - (this.lastAt[name] || 0) < minGap) return;
    this.lastAt[name] = now;
    this.resume();
    try { (this.voices[name] || (() => {})).call(this); } catch (e) { /* never break the loop for audio */ }
  },

  voices: {
    shot() { this.tone({ freq: 880, to: 320, type: 'square', dur: 0.05, gain: 0.16 }); this.noise({ dur: 0.05, gain: 0.10, from: 5200, to: 900 }); },
    mortar() { this.tone({ freq: 150, to: 60, type: 'sawtooth', dur: 0.16, gain: 0.30 }); this.noise({ dur: 0.14, gain: 0.22, from: 900, to: 120 }); },
    boom() { this.noise({ dur: 0.42, gain: 0.42, from: 1400, to: 60, q: 3 }); this.tone({ freq: 110, to: 34, type: 'sine', dur: 0.34, gain: 0.30 }); },
    chill() { this.tone({ freq: 520, to: 1500, type: 'sine', dur: 0.16, gain: 0.16 }); this.noise({ dur: 0.16, gain: 0.08, from: 3000, to: 5200 }); },
    zap() { this.tone({ freq: 1400, to: 180, type: 'sawtooth', dur: 0.14, gain: 0.20 }); this.noise({ dur: 0.10, gain: 0.14, from: 6000, to: 1400 }); },
    pop() { this.tone({ freq: 660, to: 240, type: 'triangle', dur: 0.07, gain: 0.14 }); },
    build() { [523, 784].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.13, gain: 0.24, delay: i * 0.07 })); },
    upgrade() { [659, 880, 1175].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.15, gain: 0.24, delay: i * 0.06 })); },
    sell() { [660, 440].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.12, gain: 0.20, delay: i * 0.07 })); },
    deny() { this.tone({ freq: 190, to: 120, type: 'square', dur: 0.14, gain: 0.18 }); },
    ui() { this.tone({ freq: 1100, to: 900, type: 'triangle', dur: 0.04, gain: 0.10 }); },
    leak() { this.tone({ freq: 200, to: 70, type: 'sawtooth', dur: 0.42, gain: 0.34 }); this.noise({ dur: 0.34, gain: 0.20, from: 700, to: 80 }); },
    wave() { [220, 277, 330].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.55, gain: 0.14, delay: i * 0.015 })); },
    clear() { [523, 659, 784].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.22, gain: 0.20, delay: i * 0.09 })); },
    victory() { [523, 659, 784, 1046, 1318].forEach((f, i) => this.tone({ freq: f, type: 'triangle', dur: 0.45, gain: 0.24, delay: i * 0.13 })); },
    defeat() { [392, 330, 262, 196].forEach((f, i) => this.tone({ freq: f, type: 'sawtooth', dur: 0.5, gain: 0.22, delay: i * 0.17 })); }
  }
};

/* ---------------------------------------------------------------- entities */

class Enemy {
  constructor(type, waveIndex) {
    Object.assign(this, enemyStats(type, waveIndex));
    this.maxHp = this.hp;
    this.segment = 0;
    this.x = MAP.path[0][0];
    this.y = MAP.path[0][1];
    this.travelled = 0;
    this.slow = 0;
    this.slowTime = 0;
    this.active = true;
    this.angle = Math.PI;
    this.hitFlash = 0;
    this.walk = Math.random() * Math.PI * 2;
    this.lane = (Math.random() * 2 - 1) * 11;
    this.phase = 0;
    this.baseSpeed = this.speed;
    this.baseSize = this.size;
    if (this.flying) {
      // Fliers launch from the spawn point but strike straight at the core,
      // spread across a band so a formation does not stack into one pixel.
      const span = (Math.random() * 2 - 1) * 70;
      const dx = MAP.base.x - this.x, dy = MAP.base.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.x += -dy / d * span;
      this.y += dx / d * span;
      this.flightLength = Math.hypot(MAP.base.x - this.x, MAP.base.y - this.y);
      this.angle = Math.atan2(MAP.base.y - this.y, MAP.base.x - this.x);
      this.bob = Math.random() * Math.PI * 2;
      this.lane = 0;
    }
  }

  update(dt) {
    if (this.slowTime > 0) this.slowTime -= dt; else this.slow = 0;
    if (this.hitFlash > 0) this.hitFlash -= dt;
    let travel = this.speed * (1 - this.slow) * dt;
    this.walk += travel * 0.09;

    if (this.flying) return this.fly(travel, dt);

    while (travel > 0 && this.segment < MAP.path.length - 1) {
      const b = MAP.path[this.segment + 1];
      const dx = b[0] - this.x, dy = b[1] - this.y, d = Math.hypot(dx, dy);
      this.angle = Math.atan2(dy, dx);
      if (travel >= d) {
        this.x = b[0]; this.y = b[1]; this.segment++; this.travelled += d; travel -= d;
      } else {
        this.x += dx / d * travel; this.y += dy / d * travel;
        this.travelled += travel; travel = 0;
      }
    }
    return this.segment >= MAP.path.length - 1;
  }

  /* Straight-line flight to the core. `travelled` is reported on the same
     scale as a ground unit's road distance so the target-priority modes
     ('first', 'last') stay meaningful in a mixed wave. */
  fly(travel, dt) {
    this.bob += dt * 5.5;
    const dx = MAP.base.x - this.x, dy = MAP.base.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d <= travel || d < 6) { this.x = MAP.base.x; this.y = MAP.base.y; return true; }
    this.angle = Math.atan2(dy, dx);
    this.x += dx / d * travel;
    this.y += dy / d * travel;
    const flown = Math.max(0, (this.flightLength || d) - d);
    this.travelled = flown / (this.flightLength || d) * pathLength();
    return false;
  }
}

class Tower {
  constructor(type, x, y, cost) {
    this.type = type;
    this.x = x; this.y = y;
    this.level = 1;
    this.cooldown = 0;
    this.angle = -Math.PI / 2;
    this.recoil = 0;
    this.pulse = 0.65;
    this.mode = 'first';
    this.invested = cost;
    this.kills = 0;
    this.damageDealt = 0;
    this.arc = null;      // transient chain-lightning polyline for the renderer
    this.arcLife = 0;
    this.beam = null;     // transient rail-lance line, same idea
    this.beamLife = 0;
  }

  get stats() { return towerStats(this.type, this.level); }

  update(dt) {
    this.cooldown -= dt;
    this.recoil = Math.max(0, this.recoil - dt * 7);
    this.pulse = Math.max(0, this.pulse - dt);
    if (this.arcLife > 0) { this.arcLife -= dt; if (this.arcLife <= 0) this.arc = null; }
    if (this.beamLife > 0) { this.beamLife -= dt; if (this.beamLife <= 0) this.beam = null; }
  }

  canFire() { return this.cooldown <= 0; }
  fired(rate) { this.cooldown = 1 / rate; this.recoil = 1; }
}

class Projectile {
  constructor(x, y, stats, type, target, aimX, aimY, tower) {
    this.x = x; this.y = y;
    this.px = x; this.py = y;
    this.speed = stats.projectile;
    this.damage = stats.damage;
    this.pierce = stats.pierce || 0;
    this.splash = stats.splash || 0;
    this.splashAir = !!stats.splashAir;
    this.slow = stats.slow || 0;
    this.slowTime = stats.slowTime || 0;
    this.type = type;
    this.color = stats.color;
    this.target = target;
    // Credit kills and damage back to the tower that fired.
    this.tower = tower;
    // Mortars commit to a ground point so they can genuinely miss a fast unit;
    // everything else tracks its target.
    this.ballistic = aimX !== undefined;
    this.aimX = aimX; this.aimY = aimY;
    this.spin = 0;
    this.active = true;
  }

  update(dt) {
    this.px = this.x; this.py = this.y;
    this.spin += dt * 12;
    const tx = this.ballistic ? this.aimX : (this.target && this.target.active ? this.target.x : null);
    const ty = this.ballistic ? this.aimY : (this.target && this.target.active ? this.target.y : null);
    if (tx === null) { this.active = false; return false; }
    const dx = tx - this.x, dy = ty - this.y, d = Math.hypot(dx, dy), step = this.speed * dt;
    if (d <= step + 7) { this.x = tx; this.y = ty; return true; }
    this.x += dx / d * step; this.y += dy / d * step;
    return false;
  }
}

/* -------------------------------------------------------------------- game */

class Game {
  constructor() {
    this.canvas = document.getElementById('game');
    this.ctx = this.canvas.getContext('2d');
    this.canvas.width = MAP.worldW;
    this.canvas.height = MAP.worldH;

    this.el = {
      gold: document.getElementById('gold'),
      wave: document.getElementById('wave'),
      hp: document.getElementById('hp'),
      hpFill: document.getElementById('hpFill'),
      fill: document.getElementById('progressFill'),
      progress: document.getElementById('progressText'),
      start: document.getElementById('startWave'),
      menu: document.getElementById('towerMenu'),
      toast: document.getElementById('toast'),
      intel: document.getElementById('waveIntel'),
      speed: document.getElementById('speed'),
      pause: document.getElementById('pause'),
      sound: document.getElementById('sound')
    };
    this.start = this.el.start;           // kept for the flow/polish layers
    this.menu = this.el.menu;
    this.toastEl = this.el.toast;

    this.reset();
    this.bind();
    this.fit();
    this.last = performance.now();
    this.rafPending = true;
    requestAnimationFrame(t => this.loop(t));
  }

  reset() {
    this.phase = 'intro';
    this.gold = startGold();
    this.baseHp = startBaseHp();
    this.maxBaseHp = this.baseHp;
    this.waveIndex = 0;
    this.waveTotal = countWave(0);
    this.waveDefeated = 0;
    this.spawnQueue = [];
    this.spawnClock = 0;
    this.enemies = [];
    this.towers = [];
    this.projectiles = [];
    this.particles = [];
    this.floaters = [];
    this.speed = 1;
    this.paused = false;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboPeak = 0;
    this.waveLeaks = 0;
    this.banner = null;
    this.selectedPad = null;
    this.previewType = null;     // tower hovered in the build menu, for range preview
    this.spawnWarning = 0;
    this.shake = 0;
    this.time = 0;
    this.totalKills = 0;
    this.totalEarned = 0;
    this.pads = MAP.pads.map((p, i) => ({ ...p, id: i, tower: null }));
    this.renderHud();
  }

  /* ------------------------------------------------------------- plumbing */

  bind() {
    const play = document.getElementById('play');
    if (play) play.onclick = () => {
      Sound.init();
      Sound.play('ui');
      document.getElementById('intro').classList.add('hidden');
      this.phase = 'build';
      this.toast('BUILD YOUR DEFENCE — tap a pad');
      this.renderHud();
    };

    this.el.start.onclick = () => this.startWave();

    this.el.pause.onclick = () => this.setPaused(!this.paused);

    this.el.speed.onclick = () => {
      this.speed = this.speed >= 3 ? 1 : this.speed + 1;
      this.el.speed.textContent = this.speed + '×';
      this.el.speed.setAttribute('aria-label', `Game speed ${this.speed} times`);
      Sound.play('ui');
    };

    this.el.sound.onclick = () => {
      Sound.init();
      Sound.enabled = !Sound.enabled;
      this.el.sound.textContent = Sound.enabled ? '♪' : '✕';
      this.el.sound.classList.toggle('off', !Sound.enabled);
      this.el.sound.setAttribute('aria-label', Sound.enabled ? 'Mute sound' : 'Unmute sound');
      if (Sound.enabled) Sound.play('ui');
    };

    const help = document.getElementById('helpSheet');
    const helpBtn = document.getElementById('help');
    if (help && helpBtn) {
      const setHelp = open => {
        help.classList.toggle('hidden', !open);
        if (open && this.phase !== 'intro') this.setPaused(true);
        Sound.play('ui');
      };
      helpBtn.onclick = () => setHelp(help.classList.contains('hidden'));
      help.querySelector('.help-close').onclick = () => setHelp(false);
      help.addEventListener('pointerdown', e => { if (e.target === help) setHelp(false); });
      this.toggleHelp = setHelp;
    }

    this.canvas.addEventListener('pointerdown', e => { e.preventDefault(); this.tap(e); });
    addEventListener('resize', () => this.fit());
    addEventListener('keydown', e => this.key(e));
    // Losing the tab mid-wave should not fast-forward the swarm on return.
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.setPaused(true); });
  }

  key(e) {
    if (e.target && /INPUT|TEXTAREA/.test(e.target.tagName)) return;
    const k = e.key.toLowerCase();
    const help = document.getElementById('helpSheet');
    if (k === '?' || (k === '/' && e.shiftKey) || k === 'h') {
      if (this.toggleHelp) this.toggleHelp(help.classList.contains('hidden'));
      return;
    }
    if (k === 'escape') {
      if (help && !help.classList.contains('hidden')) { this.toggleHelp(false); return; }
      this.closeMenu();
      return;
    }
    if (this.phase === 'intro') return;
    if (k === ' ' || k === 'enter') {
      e.preventDefault();
      if (this.phase === 'build') this.startWave(); else this.setPaused(!this.paused);
      return;
    }
    if (k === 'p') { this.setPaused(!this.paused); return; }
    if (k === 'f') { this.el.speed.click(); return; }
    if (k === 'm') { this.el.sound.click(); return; }
    const pad = this.selectedPad;
    if (!pad) return;
    if (!pad.tower && '1234567'.includes(k)) {
      const type = TOWER_ORDER[+k - 1];
      if (type && isUnlocked(type, this.unlockState())) this.build(pad, type);
    }
    else if (pad.tower && k === 'u') this.upgrade(pad);
    else if (pad.tower && k === 's') this.sell(pad);
    else if (pad.tower && k === 't') this.cycleMode(pad);
  }

  setPaused(next) {
    if (this.phase === 'intro' || this.phase === 'won' || this.phase === 'lost') return;
    this.paused = next;
    this.el.pause.textContent = this.paused ? '▶' : 'Ⅱ';
    this.el.pause.setAttribute('aria-label', this.paused ? 'Resume' : 'Pause');
    document.body.classList.toggle('is-paused', this.paused);
    Sound.play('ui');
  }

  fit() {
    const ratio = MAP.worldW / MAP.worldH, w = innerWidth, h = innerHeight;
    this.canvas.style.width = (w / h < ratio ? w : h * ratio) + 'px';
    this.canvas.style.height = (w / h < ratio ? w / ratio : h) + 'px';
  }

  pointer(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * MAP.worldW / r.width,
      y: (e.clientY - r.top) * MAP.worldH / r.height
    };
  }

  tap(e) {
    if (this.phase === 'intro') return;
    const p = this.pointer(e);
    let pad = null, bestDist = 52;
    for (const q of this.pads) {
      const d = Math.hypot(q.x - p.x, q.y - p.y);
      if (d < bestDist) { bestDist = d; pad = q; }
    }
    if (!pad) { this.closeMenu(); return; }
    Sound.init();
    Sound.play('ui');
    this.selectedPad = pad;
    this.previewType = null;
    pad.tower ? this.towerPanel(pad) : this.buildMenu(pad);
  }

  /* ------------------------------------------------------------------ HUD */

  renderHud() {
    const e = this.el;
    e.gold.textContent = money(this.gold);
    e.wave.textContent = Math.min(WAVES.length, this.waveIndex + 1);
    e.hp.textContent = Math.max(0, Math.round(this.baseHp));
    const hpPct = clamp(this.baseHp / this.maxBaseHp * 100, 0, 100);
    if (e.hpFill) {
      e.hpFill.style.width = hpPct + '%';
      e.hpFill.dataset.state = hpPct < 25 ? 'critical' : hpPct < 55 ? 'warn' : 'ok';
    }
    e.progress.textContent = `${this.waveDefeated} / ${this.waveTotal}`;
    e.fill.style.width = (this.waveTotal ? clamp(this.waveDefeated / this.waveTotal * 100, 0, 100) : 0) + '%';
    e.start.textContent = `START WAVE ${Math.min(WAVES.length, this.waveIndex + 1)}`;
    e.start.classList.toggle('hidden', this.phase !== 'build');
    document.body.classList.toggle('phase-build', this.phase === 'build');
    document.body.classList.toggle('phase-wave', this.phase === 'wave');
    this.renderIntel();
  }

  renderIntel() {
    const host = this.el.intel;
    if (!host) return;
    if (this.phase !== 'build' || !WAVES[this.waveIndex]) { host.innerHTML = ''; host.classList.remove('show'); return; }
    const rows = waveIntel(this.waveIndex).map(r =>
      `<span class="intel-unit${ENEMIES[r.type].flying ? ' air' : ''}" data-unit="${r.type}">` +
      `<i style="--c:${ENEMIES[r.type].color}"></i>${ENEMIES[r.type].flying ? '▲ ' : ''}${r.name}<b>×${r.count}</b></span>`
    ).join('');
    const hp = Math.round(waveEffectiveHp(this.waveIndex));
    // An air wave punishes a line with no anti-air far harder than a bigger
    // ground wave would, so it is called out rather than left to be inferred.
    const air = waveIntel(this.waveIndex).some(r => ENEMIES[r.type].flying);
    host.innerHTML =
      `<div class="intel-head">NEXT WAVE ${this.waveIndex + 1}` +
      (air ? ' <b class="intel-air">AIR</b>' : '') +
      ` <em>${hp.toLocaleString('en-US')} effective HP</em></div>` +
      `<div class="intel-units">${rows}</div>`;
    host.classList.add('show');
  }

  toast(msg, time = 1900) {
    clearTimeout(this.toastTimer);
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    this.toastTimer = setTimeout(() => this.toastEl.classList.remove('show'), time);
  }

  closeMenu() {
    this.menu.classList.add('hidden');
    this.menu.innerHTML = '';
    this.selectedPad = null;
    this.previewType = null;
  }

  /* ------------------------------------------------------------ build menu */

  /* What the account has earned, asked once per menu rather than per card. */
  unlockState() {
    const U = window.FUN_TD_UNLOCKS;
    // Progress is account-wide, but a tower earned partway through this run
    // has to be buildable in this run: fold the current wave in.
    const p = U ? U.progress() : { bestWave: 0, cleared: new Set() };
    p.bestWave = Math.max(p.bestWave, this.waveIndex);
    return p;
  }

  buildMenu(pad) {
    const progress = this.unlockState();
    const cards = TOWER_ORDER.map((key, i) => {
      const t = TOWERS[key];
      if (!isUnlocked(key, progress)) {
        const note = (window.FUN_TD_UNLOCKS && window.FUN_TD_UNLOCKS.requirement(key)) ||
          (UNLOCKS[key] && UNLOCKS[key].note) || 'Keep playing the campaign';
        return `<button class="tcard locked" data-locked="${key}" disabled>
          <span class="tcard-key">🔒</span>
          <span class="tcard-art" style="--c:${t.color};--a:${t.accent}"></span>
          <span class="tcard-name">${t.name}</span>
          <span class="tcard-tags"><span class="tag lock">LOCKED</span></span>
          <span class="tcard-role">${note}</span>
          <span class="tcard-cost">● ${t.cost}</span>
        </button>`;
      }
      const afford = this.gold >= t.cost;
      const dps = Math.round(dpsOf(key, 1));
      const tags = [
        `<span class="tag">${dps} DPS</span>`,
        `<span class="tag">RNG ${Math.round(t.range)}</span>`
      ];
      if (t.splash) tags.push('<span class="tag hot">SPLASH</span>');
      if (t.slow) tags.push('<span class="tag cold">SLOW</span>');
      if (t.chains) tags.push('<span class="tag arc">CHAIN</span>');
      if (t.pierce >= 0.3) tags.push('<span class="tag pierce">ARMOUR</span>');
      // The ground/air line decides whether a tower is useful at all in a
      // given wave, so it is the first thing the card says.
      if (t.targets === 'air') tags.unshift('<span class="tag air">AIR ONLY</span>');
      else if (t.targets === 'both') tags.unshift('<span class="tag air">HITS AIR</span>');
      else tags.unshift('<span class="tag ground">GROUND ONLY</span>');
      return `<button class="tcard" data-build="${key}" data-tower="${key}" ${afford ? '' : 'disabled'}>
        <span class="tcard-key">${i + 1}</span>
        <span class="tcard-art" style="--c:${t.color};--a:${t.accent}"></span>
        <span class="tcard-name">${t.name}</span>
        <span class="tcard-tags">${tags.join('')}</span>
        <span class="tcard-role">${t.role}</span>
        <span class="tcard-cost ${afford ? '' : 'short'}">● ${t.cost}</span>
      </button>`;
    }).join('');

    this.menu.classList.remove('hidden');
    this.menu.innerHTML =
      `<div class="panel-head"><b>BUILD PAD ${pad.id + 1}</b><span>${money(this.gold)} available</span>
       <button class="close-x" aria-label="Close">✕</button></div>
       <div class="tcards">${cards}</div>`;

    this.menu.querySelectorAll('[data-build]').forEach(b => {
      const type = b.dataset.build;
      b.onclick = () => this.build(pad, type);
      // Showing the footprint before you spend is the single biggest quality
      // of life win in a pad-based tower defence.
      const preview = () => { this.previewType = type; };
      b.onpointerenter = preview;
      b.onfocus = preview;
      b.onpointerleave = () => { if (this.previewType === type) this.previewType = null; };
      b.onblur = () => { if (this.previewType === type) this.previewType = null; };
    });
    this.menu.querySelector('.close-x').onclick = () => this.closeMenu();
  }

  towerPanel(pad) {
    const t = pad.tower;
    const s = t.stats;
    const cost = upgradeCost(t.type, t.level);
    const refund = Math.floor(t.invested * sellRate());
    const next = t.level < BAL.maxLevel ? towerStats(t.type, t.level + 1) : null;
    const mode = TARGET_MODES.find(m => m.id === t.mode);

    const row = (label, cur, nxt, fmt = Math.round) => {
      const delta = next && nxt !== undefined && fmt(nxt) !== fmt(cur)
        ? `<em>→ ${fmt(nxt)}</em>` : '';
      return `<div class="srow"><span>${label}</span><b>${fmt(cur)}</b>${delta}</div>`;
    };

    let stats = row('DAMAGE', s.damage, next && next.damage)
      + row('FIRE RATE', s.rate, next && next.rate, v => v.toFixed(1) + '/s')
      + row('RANGE', s.range, next && next.range)
      + row('DPS', dpsOf(t.type, t.level), next && dpsOf(t.type, t.level + 1));
    if (s.splash) stats += row('SPLASH', s.splash, next && next.splash);
    if (s.slow) stats += row('SLOW', s.slow, next && next.slow, v => Math.round(v * 100) + '%');
    if (s.chains) stats += row('CHAINS', s.chains, next && next.chains);
    if (s.pierce) stats += row('ARMOUR PIERCE', s.pierce, undefined, v => Math.round(v * 100) + '%');

    const pips = Array.from({ length: BAL.maxLevel }, (_, i) =>
      `<i class="${i < t.level ? 'on' : ''}"></i>`).join('');

    this.menu.classList.remove('hidden');
    this.menu.innerHTML =
      `<div class="panel-head" data-tower="${t.type}">
         <b>${TOWERS[t.type].name}</b><span class="pips">${pips}</span>
         <button class="close-x" aria-label="Close">✕</button>
       </div>
       <div class="stat-table">${stats}</div>
       <div class="srow kills"><span>KILLS</span><b>${t.kills}</b><span>DAMAGE</span><b>${money(t.damageDealt)}</b></div>
       <button class="target-btn" data-mode>TARGET: <b>${mode.label}</b><small>${mode.hint}</small></button>
       <div class="panel-actions">
         ${t.level < BAL.maxLevel
            ? `<button class="upgrade" data-up ${this.gold < cost ? 'disabled' : ''}>UPGRADE<small>● ${cost}</small></button>`
            : '<button class="upgrade" disabled>MAX LEVEL<small>fully upgraded</small></button>'}
         <button class="sell" data-sell>SELL<small>+ ${refund}</small></button>
       </div>`;

    const up = this.menu.querySelector('[data-up]');
    if (up) up.onclick = () => this.upgrade(pad);
    this.menu.querySelector('[data-sell]').onclick = () => this.sell(pad);
    this.menu.querySelector('[data-mode]').onclick = () => this.cycleMode(pad);
    this.menu.querySelector('.close-x').onclick = () => this.closeMenu();
  }

  cycleMode(pad) {
    const t = pad.tower;
    const i = TARGET_MODES.findIndex(m => m.id === t.mode);
    t.mode = TARGET_MODES[(i + 1) % TARGET_MODES.length].id;
    Sound.play('ui');
    this.towerPanel(pad);
  }

  /* ------------------------------------------------------------- economy */

  build(pad, type) {
    if (!type || !TOWERS[type]) return;
    // Every build path funnels through here, so this is the one place the
    // unlock rule has to hold — menu, hotkey, or anything added later.
    if (!isUnlocked(type, this.unlockState())) {
      Sound.play('deny');
      this.toast(`${TOWERS[type].name} IS LOCKED`);
      return;
    }
    const cost = TOWERS[type].cost;
    if (pad.tower) return;
    if (this.gold < cost) { Sound.play('deny'); this.toast('NOT ENOUGH GOLD'); return; }
    this.gold -= cost;
    pad.tower = new Tower(type, pad.x, pad.y, cost);
    this.towers.push(pad.tower);
    this.burst(pad.x, pad.y, TOWERS[type].color, 24);
    this.ring(pad.x, pad.y, TOWERS[type].color, 0.55, 18, 62);
    this.float(pad.x, pad.y - 45, 'ONLINE', '#dff8ff');
    Sound.play('build');
    this.closeMenu();
    this.renderHud();
  }

  upgrade(pad) {
    const t = pad.tower;
    const cost = upgradeCost(t.type, t.level);
    if (!cost) return;
    if (this.gold < cost) { Sound.play('deny'); this.toast('NOT ENOUGH GOLD'); return; }
    this.gold -= cost;
    t.invested += cost;
    t.level++;
    t.pulse = 0.8;
    this.burst(t.x, t.y, '#ffe16a', 30);
    this.ring(t.x, t.y, '#ffe16a', 0.65, 20, 76);
    this.float(t.x, t.y - 52, `LEVEL ${t.level}`, '#ffe46a');
    Sound.play('upgrade');
    this.selectedPad = pad;
    this.towerPanel(pad);
    this.renderHud();
  }

  sell(pad) {
    const t = pad.tower;
    if (!t) return;
    const refund = Math.floor(t.invested * sellRate());
    this.gold += refund;
    this.towers = this.towers.filter(x => x !== t);
    pad.tower = null;
    this.ring(pad.x, pad.y, '#8cffc0', 0.5, 18, 70);
    this.float(pad.x, pad.y - 35, `+${refund}`, '#8cffc0');
    Sound.play('sell');
    this.closeMenu();
    this.renderHud();
  }

  /* ---------------------------------------------------------------- waves */

  startWave() {
    if (this.phase !== 'build') return;
    this.phase = 'wave';
    this.closeMenu();
    this.spawnQueue = [];
    let time = 0.8;
    for (const group of WAVES[this.waveIndex].groups) {
      time += group.gap || 0;
      for (let i = 0; i < group.count; i++) {
        this.spawnQueue.push({ time, type: group.type });
        time += group.interval;
      }
      time += 0.55;
    }
    this.spawnClock = 0;
    this.spawnWarning = 1.8;
    this.waveTotal = countWave(this.waveIndex);
    this.waveDefeated = 0;
    this.waveLeaks = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.comboPeak = 0;
    this.banner = { text: `WAVE ${this.waveIndex + 1} INCOMING`, life: 1.2, color: '#fff' };
    Sound.init();
    Sound.play('wave');
    this.renderHud();
  }

  clearWave() {
    const wave = WAVES[this.waveIndex];
    const flawless = this.waveLeaks === 0;
    const flawlessBonus = flawless ? wave.flawless + (META.flawlessBonus || 0) : 0;
    const comboBonus = Math.min(BAL.comboCap, Math.floor(this.comboPeak / 10) * 6);
    const total = wave.bonus + flawlessBonus + comboBonus;
    this.gold += total;
    this.totalEarned += total;
    this.banner = {
      text: flawless ? `FLAWLESS! +${total} GOLD` : `WAVE CLEAR +${total} GOLD`,
      life: 1.9,
      color: flawless ? '#8cff88' : '#ffe16a'
    };
    Sound.play('clear');
    this.waveIndex++;
    if (this.waveIndex >= WAVES.length) {
      this.phase = 'won';
      this.el.start.classList.add('hidden');
      Sound.play('victory');
      // The flow overlay watches the toast text; keep this string intact.
      this.toast('DUSTWALL SAVED!', 5000);
      this.renderHud();
      return;
    }
    this.phase = 'build';
    this.waveTotal = countWave(this.waveIndex);
    this.waveDefeated = 0;
    this.combo = 0;
    this.comboTimer = 0;
    this.renderHud();
  }

  /* --------------------------------------------------------------- combat */

  pickTarget(tower, stats) {
    let best = null, bestScore = -Infinity;
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (!canTarget(stats, e)) continue;
      const d = Math.hypot(e.x - tower.x, e.y - tower.y);
      if (d > stats.range) continue;
      let score;
      switch (tower.mode) {
        case 'last':   score = -e.travelled; break;
        case 'strong': score = e.hp; break;
        case 'weak':   score = -e.hp; break;
        case 'close':  score = -d; break;
        default:       score = e.travelled; break;   // 'first'
      }
      if (score > bestScore) { bestScore = score; best = e; }
    }
    return best;
  }

  fire(tower, target) {
    const s = tower.stats;
    tower.angle = Math.atan2(target.y - tower.y, target.x - tower.x);
    tower.fired(s.rate);
    const muzzleX = tower.x + Math.cos(tower.angle) * 26;
    const muzzleY = tower.y + Math.sin(tower.angle) * 26;

    if (s.aura) {
      // No projectile and no aiming: a void spire grinds down everything
      // standing in its field, which is why its range is the shortest here.
      this.field(tower, s);
      Sound.play('zap', 80);
      this.ring(tower.x, tower.y, '#ff5cc0', 0.22, s.range * 0.55, s.range);
      return;
    }
    if (s.beam) {
      this.lance(tower, target, s);
      Sound.play('shot', 25);
      return;
    }
    if (tower.type === 'arc') {
      this.chain(tower, target, s);
      Sound.play('zap', 55);
      return;
    }
    if (tower.type === 'cannon') {
      // Lead the target: the shell lands where it will be, not where it is.
      const flight = Math.hypot(target.x - tower.x, target.y - tower.y) / s.projectile;
      const lead = target.speed * (1 - target.slow) * flight;
      const aimX = target.x + Math.cos(target.angle) * lead;
      const aimY = target.y + Math.sin(target.angle) * lead;
      this.projectiles.push(new Projectile(muzzleX, muzzleY, s, tower.type, target, aimX, aimY, tower));
      this.burst(muzzleX, muzzleY, s.color, 8);
      this.shake = Math.max(this.shake, 2.4);
      Sound.play('mortar', 70);
      return;
    }
    this.projectiles.push(new Projectile(muzzleX, muzzleY, s, tower.type, target, undefined, undefined, tower));
    this.burst(muzzleX, muzzleY, s.color, 4);
    Sound.play(tower.type === 'frost' ? 'chill' : 'shot', tower.type === 'frost' ? 90 : 45);
  }

  // Arc towers resolve instantly and draw a polyline through everything they hit.
  chain(tower, first, stats) {
    const points = [[tower.x, tower.y]];
    const hit = new Set();
    let current = first;
    let damage = stats.damage;
    for (let i = 0; i <= stats.chains && current; i++) {
      hit.add(current);
      points.push([current.x, current.y]);
      this.damage(current, damage, stats.pierce, tower);
      damage *= TOWERS.arc.chainFalloff;
      let next = null, bestD = stats.chainRange;
      for (const e of this.enemies) {
        if (!e.active || hit.has(e) || !canTarget(stats, e)) continue;
        const d = Math.hypot(e.x - current.x, e.y - current.y);
        if (d < bestD) { bestD = d; next = e; }
      }
      current = next;
    }
    tower.arc = points;
    tower.arcLife = 0.13;
  }

  /* A rail lance fires a line, not a shot: everything within `beam` pixels of
     the segment from the muzzle to the edge of range takes the hit, so a
     column walking the road is punished and a single scattered flier is not. */
  lance(tower, target, s) {
    const x2 = tower.x + Math.cos(tower.angle) * s.range;
    const y2 = tower.y + Math.sin(tower.angle) * s.range;
    const dx = x2 - tower.x, dy = y2 - tower.y, len2 = dx * dx + dy * dy || 1;
    for (const e of this.enemies) {
      if (!e.active || !canTarget(s, e)) continue;
      const t = clamp(((e.x - tower.x) * dx + (e.y - tower.y) * dy) / len2, 0, 1);
      const d = Math.hypot(e.x - (tower.x + dx * t), e.y - (tower.y + dy * t));
      if (d <= s.beam + e.size) this.damage(e, s.damage, s.pierce, tower);
    }
    tower.beam = { x1: tower.x, y1: tower.y, x2, y2 };
    tower.beamLife = 0.16;
    this.burst(tower.x + Math.cos(tower.angle) * 30, tower.y + Math.sin(tower.angle) * 30, s.color, 10);
  }

  /* The void spire's pulse. It hits both layers by design: the tower has no
     barrel to elevate, so there is nothing for a flier to fly over. */
  field(tower, s) {
    for (const e of this.enemies) {
      if (!e.active) continue;
      if (Math.hypot(e.x - tower.x, e.y - tower.y) > s.range) continue;
      if (s.slow) { e.slow = Math.max(e.slow, s.slow); e.slowTime = Math.max(e.slowTime, s.slowTime); }
      this.damage(e, s.damage, s.pierce, tower);
    }
  }

  damage(enemy, raw, pierce, tower) {
    if (!enemy.active) return;
    const dealt = Math.max(1, damageAfterArmor(raw, enemy.armor, pierce));
    enemy.hp -= dealt;
    enemy.hitFlash = 0.09;
    if (tower) tower.damageDealt += Math.round(Math.min(dealt, enemy.hp + dealt));
    if (enemy.hp <= 0) { this.kill(enemy, tower); return; }
    if (enemy.phases) this.checkPhase(enemy);
  }

  /* A phased enemy re-reads its own stats when its health crosses a threshold.
     Every change is applied off the *base* value rather than compounding, so
     the thresholds stay independent of the order they happen to fire in. */
  checkPhase(e) {
    const pct = e.hp / e.maxHp;
    while (e.phase < e.phases.length && pct <= e.phases[e.phase].at) {
      const p = e.phases[e.phase++];
      e.speed = e.baseSpeed * (p.speed || 1);
      if (p.armor !== undefined) e.armor = p.armor;
      if (p.size) e.size = e.baseSize * p.size;
      for (const type of p.escorts || []) this.escort(type, e);
      this.banner = { text: `${e.name}: ${p.name}`, life: 1.3, color: '#ff8a5a' };
      this.ring(e.x, e.y, '#ff8a5a', 0.55, 14, 120);
      this.burst(e.x, e.y, '#ffb24b', 34);
      this.shake = Math.max(this.shake, 12);
      Sound.play('boom', 40);
    }
  }

  /* Escorts join the fight where their parent is standing, not back at the
     spawn point — otherwise calling for help would be a reward, not a threat. */
  escort(type, parent) {
    const e = new Enemy(type, this.waveIndex);
    e.x = parent.x; e.y = parent.y;
    if (e.flying) {
      e.flightLength = Math.hypot(MAP.base.x - e.x, MAP.base.y - e.y);
      e.angle = Math.atan2(MAP.base.y - e.y, MAP.base.x - e.x);
    } else {
      e.segment = parent.segment;
      e.travelled = parent.travelled;
      e.angle = parent.angle;
    }
    this.enemies.push(e);
    this.waveTotal++;
    return e;
  }

  hit(p) {
    if (p.splash) {
      this.burst(p.x, p.y, '#ffd08a', 22);
      this.ring(p.x, p.y, '#ffb24b', 0.30, 16, p.splash);
      this.shake = Math.max(this.shake, 5);
      Sound.play('boom', 60);
      for (const e of this.enemies) {
        // A mortar shell bursts on the ground and a flak shell bursts in the
        // air; neither reaches the other layer just because it landed nearby.
        if (!e.active || !!e.flying !== !!p.splashAir) continue;
        const d = Math.hypot(e.x - p.x, e.y - p.y);
        if (d > p.splash) continue;
        // Full damage at the centre, 45% at the rim.
        this.damage(e, p.damage * (1 - 0.55 * (d / p.splash)), p.pierce, p.tower);
      }
      return;
    }
    if (p.target && p.target.active) {
      if (p.slow) {
        p.target.slow = Math.max(p.target.slow, p.slow);
        p.target.slowTime = p.slowTime;
      }
      this.damage(p.target, p.damage, p.pierce, p.tower);
    }
    this.burst(p.x, p.y, p.color, 7);
    if (p.type === 'frost') this.ring(p.x, p.y, '#bffcff', 0.24, 8, 32);
  }

  kill(e, tower) {
    if (!e.active) return;
    e.active = false;
    if (tower) tower.kills++;
    this.totalKills++;
    this.combo = this.comboTimer > 0 ? this.combo + 1 : 1;
    this.comboTimer = BAL.comboWindow + (META.comboBonus || 0);
    this.comboPeak = Math.max(this.comboPeak, this.combo);
    const bonus = this.combo >= 10 ? Math.min(6, Math.floor(this.combo / 10)) : 0;
    const reward = e.reward + bonus;
    this.gold += reward;
    this.totalEarned += reward;
    this.waveDefeated++;
    this.float(e.x, e.y, `+${reward}`, bonus ? '#fff06a' : '#ffd43b');
    if ([10, 25, 50, 100].includes(this.combo)) {
      this.banner = { text: `${this.combo}× COMBO!`, life: 0.85, color: '#ffe55c' };
      this.ring(e.x, e.y, '#ffe55c', 0.45, 10, 58);
    }
    this.burst(e.x, e.y, e.color, e.type === 'boss' ? 60 : 10);
    if (e.type === 'boss') { this.shake = 14; Sound.play('boom'); }
    else Sound.play('pop', 45);
  }

  leak(e) {
    e.active = false;
    this.waveLeaks++;
    this.combo = 0;
    this.comboTimer = 0;
    this.baseHp = Math.max(0, this.baseHp - e.damage);
    this.burst(MAP.base.x + 42, MAP.base.y, '#ff6655', 16);
    this.ring(MAP.base.x, MAP.base.y, '#ff6655', 0.45, 60, 100);
    this.float(MAP.base.x, MAP.base.y - 96, `-${e.damage}`, '#ff8f80');
    this.shake = Math.max(this.shake, 6);
    Sound.play('leak', 120);
    if (this.baseHp <= 0) {
      this.phase = 'lost';
      this.el.start.classList.add('hidden');
      Sound.play('defeat');
      // The flow overlay watches the toast text; keep this string intact.
      this.toast('BASE LOST', 4000);
    }
    this.renderHud();
  }

  /* ----------------------------------------------------------------- tick */

  update(dt) {
    this.time += dt;
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 22);
    if (this.paused) return;
    if (this.spawnWarning > 0) this.spawnWarning = Math.max(0, this.spawnWarning - dt);
    if (this.banner) { this.banner.life -= dt; if (this.banner.life <= 0) this.banner = null; }

    const sim = dt * this.speed;

    if (this.comboTimer > 0) {
      this.comboTimer -= sim;
      if (this.comboTimer <= 0) this.combo = 0;
    }
    for (const t of this.towers) t.update(sim);
    for (const q of this.particles) {
      q.life -= sim; q.x += q.vx * sim; q.y += q.vy * sim; q.vx *= 0.96; q.vy *= 0.96;
    }
    this.particles = this.particles.filter(q => q.life > 0);
    for (const f of this.floaters) { f.life -= sim; if (!f.ring) f.y -= 30 * sim; }
    this.floaters = this.floaters.filter(f => f.life > 0);

    if (this.phase !== 'wave') return;

    this.spawnClock += sim;
    while (this.spawnQueue.length && this.spawnQueue[0].time <= this.spawnClock)
      this.enemies.push(new Enemy(this.spawnQueue.shift().type, this.waveIndex));

    for (const e of this.enemies) if (e.active && e.update(sim)) this.leak(e);

    for (const t of this.towers) {
      if (!t.canFire()) continue;
      const s = t.stats;
      const target = this.pickTarget(t, s);
      if (target) this.fire(t, target);
    }

    for (const p of this.projectiles) {
      if (p.active && p.update(sim)) { this.hit(p); p.active = false; }
    }
    this.projectiles = this.projectiles.filter(p => p.active);
    this.enemies = this.enemies.filter(e => e.active);

    if (!this.spawnQueue.length && !this.enemies.length) this.clearWave();
    this.renderHud();
  }

  /* ----------------------------------------------------------------- fx */

  burst(x, y, color, n) {
    for (let i = 0; i < n && this.particles.length < 320; i++) {
      const a = Math.random() * Math.PI * 2, s = 25 + Math.random() * 95;
      this.particles.push({
        x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
        life: 0.22 + Math.random() * 0.36, color, size: 2 + Math.random() * 3
      });
    }
  }

  ring(x, y, color, life = 0.3, r0 = 12, r1 = 45) {
    this.floaters.push({ x, y, text: '', life, maxLife: life, color, ring: true, r0, r1 });
  }

  float(x, y, text, color) {
    this.floaters.push({ x, y, text, life: 1, color });
  }

  /* --------------------------------------------------------------- render */

  loop(t) {
    try {
      const dt = Math.min(0.033, (t - this.last) / 1000 || 0);
      this.last = t;
      this.update(dt);
      this.draw();
    } catch (err) {
      console.error(err);
      this.toast('GAME ERROR — RELOAD', 5000);
    }
    requestAnimationFrame(n => this.loop(n));
  }

  draw() {
    const c = this.ctx;
    c.save();
    if (this.shake > 0.2) {
      c.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
    }
    c.fillStyle = '#c98a50';
    c.fillRect(-20, -20, MAP.worldW + 40, MAP.worldH + 40);
    this.drawWorld(c);

    // Range previews: the built tower you selected, or the one you are shopping for.
    if (this.previewType && this.selectedPad)
      this.drawRange(c, { x: this.selectedPad.x, y: this.selectedPad.y, stats: towerStats(this.previewType, 1) });
    else if (this.selectedPad && this.selectedPad.tower)
      this.drawRange(c, this.selectedPad.tower);

    for (const pad of this.pads) if (!pad.tower) this.drawPad(c, pad);
    // Ground units pass behind the towers and fliers pass over them: the
    // layering is the same information the shadow gap gives, said twice.
    for (const e of this.enemies) if (e.active && !e.flying) this.drawEnemy(c, e);
    for (const t of this.towers) this.drawTower(c, t);
    for (const e of this.enemies) if (e.active && e.flying) this.drawEnemy(c, e);
    for (const t of this.towers) if (t.arc) this.drawArc(c, t);
    for (const t of this.towers) if (t.beam) this.drawBeam(c, t);
    for (const p of this.projectiles) if (p.active) this.drawProjectile(c, p);

    for (const q of this.particles) {
      c.globalAlpha = Math.max(0, q.life * 2.5);
      c.fillStyle = q.color;
      c.fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
    c.globalAlpha = 1;

    for (const f of this.floaters) {
      if (f.ring) {
        const m = f.maxLife || 0.25, p = 1 - Math.max(0, f.life) / m;
        const r = (f.r0 || 18) + p * ((f.r1 || 42) - (f.r0 || 18));
        c.globalAlpha = Math.max(0, f.life / m);
        c.strokeStyle = f.color; c.lineWidth = 4;
        c.beginPath(); c.arc(f.x, f.y, r, 0, Math.PI * 2); c.stroke();
        continue;
      }
      c.globalAlpha = Math.min(1, f.life * 2);
      c.fillStyle = f.color;
      c.font = '800 21px system-ui, sans-serif';
      c.textAlign = 'center';
      c.strokeStyle = '#111'; c.lineWidth = 4;
      c.strokeText(f.text, f.x, f.y);
      c.fillText(f.text, f.x, f.y);
    }
    c.globalAlpha = 1;

    this.drawCombo(c);
    if (this.spawnWarning > 0) this.drawSpawnWarning(c);
    if (this.banner) this.drawBanner(c);
    c.restore();
  }

  drawRange(c, t) {
    const s = t.stats;
    c.save();
    c.globalAlpha = 0.15;
    c.fillStyle = s.color;
    c.beginPath(); c.arc(t.x, t.y, s.range, 0, Math.PI * 2); c.fill();
    c.globalAlpha = 0.8;
    c.strokeStyle = '#d9f8ff'; c.lineWidth = 3;
    c.setLineDash([10, 8]);
    c.lineDashOffset = -this.time * 22;
    c.beginPath(); c.arc(t.x, t.y, s.range, 0, Math.PI * 2); c.stroke();
    c.setLineDash([]);
    c.restore();
  }

  drawArc(c, t) {
    if (!t.arc || t.arc.length < 2) return;
    const a = clamp(t.arcLife / 0.13, 0, 1);
    c.save();
    c.globalAlpha = a;
    c.lineJoin = 'round';
    c.lineCap = 'round';
    for (const [width, color] of [[9, '#6a2fc055'], [5, '#c08dff'], [2, '#ffffff']]) {
      c.strokeStyle = color;
      c.lineWidth = width;
      c.beginPath();
      c.moveTo(t.arc[0][0], t.arc[0][1]);
      for (let i = 1; i < t.arc.length; i++) {
        // Jitter the mid-points so the bolt crackles instead of drawing straight.
        const [x, y] = t.arc[i];
        const [px, py] = t.arc[i - 1];
        c.lineTo((px + x) / 2 + (Math.random() - 0.5) * 14, (py + y) / 2 + (Math.random() - 0.5) * 14);
        c.lineTo(x, y);
      }
      c.stroke();
    }
    c.restore();
  }

  drawSpawnWarning(c) {
    const [x, y] = MAP.path[0], pulse = 0.5 + 0.5 * Math.sin(this.time * 9);
    c.save();
    c.translate(x - 16, y);
    c.globalAlpha = 0.65 + 0.35 * pulse;
    c.fillStyle = '#ff5d4e'; c.strokeStyle = '#7d1712'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(0, -22); c.lineTo(-38, 0); c.lineTo(0, 22); c.closePath();
    c.fill(); c.stroke();
    c.fillStyle = '#fff';
    c.font = '800 13px system-ui, sans-serif';
    c.textAlign = 'right';
    c.fillText('INCOMING', -45, 5);
    c.restore();
  }

  drawCombo(c) {
    if (this.combo < 3 || this.phase !== 'wave') return;
    c.save();
    c.globalAlpha = 0.95;
    c.textAlign = 'center';
    c.font = `800 ${Math.min(36, 21 + this.combo * 0.22)}px system-ui, sans-serif`;
    c.fillStyle = this.combo >= 25 ? '#ffe45e' : '#fff';
    c.strokeStyle = '#142033'; c.lineWidth = 6;
    c.strokeText(`${this.combo}× COMBO`, 360, 150);
    c.fillText(`${this.combo}× COMBO`, 360, 150);
    c.fillStyle = '#182638'; c.fillRect(300, 162, 120, 7);
    c.fillStyle = '#ffe45e';
    c.fillRect(300, 162, 120 * clamp(this.comboTimer / BAL.comboWindow, 0, 1), 7);
    c.restore();
  }

  drawBanner(c) {
    const a = Math.min(1, this.banner.life * 2);
    c.save();
    c.globalAlpha = a;
    c.textAlign = 'center';
    c.font = '800 34px system-ui, sans-serif';
    c.fillStyle = this.banner.color;
    c.strokeStyle = '#101827'; c.lineWidth = 8;
    c.strokeText(this.banner.text, 360, 555);
    c.fillText(this.banner.text, 360, 555);
    c.restore();
  }

  /* --- Procedural fallback art. dustwall-art.js replaces these with the
         Blender-rendered sprite set once it has loaded. ------------------ */

  drawWorld(c) {
    const grad = c.createLinearGradient(0, 0, 720, 1120);
    grad.addColorStop(0, '#d69a5e');
    grad.addColorStop(1, '#bd7642');
    c.fillStyle = grad;
    c.fillRect(0, 0, 720, 1120);
    c.save();
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = '#5b5045'; c.lineWidth = 62;
    c.beginPath();
    MAP.path.forEach((p, i) => i ? c.lineTo(p[0], p[1]) : c.moveTo(p[0], p[1]));
    c.stroke();
    c.strokeStyle = '#c9b896'; c.lineWidth = 40; c.stroke();
    c.restore();
    this.drawBase(c);
  }

  drawBase(c) {
    const { x, y } = MAP.base;
    c.save();
    c.translate(x, y);
    c.fillStyle = '#0b2c50';
    c.strokeStyle = this.baseHp < this.maxBaseHp * 0.3 ? '#ff756b' : '#8ddcff';
    c.lineWidth = 7;
    c.beginPath(); c.arc(0, 0, 86, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = '#e9f3f8';
    rr(c, -58, -48, 116, 96, 18); c.fill();
    c.restore();
  }

  drawPad(c, p) {
    const cheapest = Math.min(...TOWER_ORDER.map(k => TOWERS[k].cost));
    const afford = this.gold >= cheapest;
    c.save();
    c.translate(p.x, p.y);
    c.fillStyle = '#153853';
    c.strokeStyle = afford ? '#7fdcff' : '#4f6572';
    c.lineWidth = 5;
    c.beginPath(); c.arc(0, 0, 31, 0, Math.PI * 2); c.fill(); c.stroke();
    c.fillStyle = afford ? '#9bf0ff' : '#5b6c75';
    c.font = '800 30px system-ui, sans-serif';
    c.textAlign = 'center';
    c.fillText('+', 0, 11);
    c.restore();
  }

  drawTower(c, t) {
    const s = t.stats, r = 27 + t.level * 2;
    c.save();
    c.translate(t.x, t.y);
    c.fillStyle = '#173d59';
    c.strokeStyle = s.accent;
    c.lineWidth = 5;
    c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill(); c.stroke();
    c.rotate(t.angle);
    c.translate(-t.recoil * 4, 0);
    c.fillStyle = s.color;
    c.fillRect(0, -7, 30 + t.level * 4, 14);
    c.restore();
  }

  drawBeam(c, t) {
    const b = t.beam, a = Math.max(0, t.beamLife / 0.16);
    c.save();
    c.globalCompositeOperation = 'lighter';
    for (const [w, col, alpha] of [[16, '#4aa8ff', 0.20], [7, '#bfe9ff', 0.55], [2.5, '#ffffff', 0.9]]) {
      c.globalAlpha = a * alpha;
      c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round';
      c.beginPath(); c.moveTo(b.x1, b.y1); c.lineTo(b.x2, b.y2); c.stroke();
    }
    c.restore();
  }

  drawEnemy(c, e) {
    const ox = Math.cos(e.angle + Math.PI / 2) * e.lane;
    const oy = Math.sin(e.angle + Math.PI / 2) * e.lane;
    const x = e.x + ox, y = e.y + oy;
    c.save();
    c.translate(x, y);
    c.rotate(e.angle);
    c.fillStyle = e.hitFlash > 0 ? '#fff' : e.color;
    c.strokeStyle = '#174328'; c.lineWidth = 2;
    c.beginPath(); c.arc(0, 0, e.size, 0, Math.PI * 2); c.fill(); c.stroke();
    c.restore();
    this.drawHealthBar(c, e, x, y);
  }

  drawHealthBar(c, e, x, y) {
    if (e.hp >= e.maxHp) return;
    const w = Math.max(24, e.size * 2.2);
    c.fillStyle = '#17201c';
    c.fillRect(x - w / 2, y - e.size - 12, w, 5);
    const pct = clamp(e.hp / e.maxHp, 0, 1);
    c.fillStyle = pct > 0.5 ? '#58e65f' : pct > 0.25 ? '#ffd43b' : '#ff6b5a';
    c.fillRect(x - w / 2, y - e.size - 12, w * pct, 5);
  }

  drawProjectile(c, p) {
    if (p.type === 'gun') {
      c.strokeStyle = '#bdefff'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(p.px, p.py); c.lineTo(p.x, p.y); c.stroke();
    } else if (p.type === 'cannon') {
      c.fillStyle = '#ffb24b'; c.strokeStyle = '#7c3b13'; c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, 7, 0, Math.PI * 2); c.fill(); c.stroke();
    } else {
      c.fillStyle = '#bffcff'; c.strokeStyle = '#4cc7e9'; c.lineWidth = 2;
      c.beginPath(); c.arc(p.x, p.y, 5, 0, Math.PI * 2); c.fill(); c.stroke();
    }
  }
}

function boot() {
  try {
    window.funTDGame = new Game();
    // Published for the art layer, the balance simulator and the tests.
    window.FUN_TD_MODEL = {
      MAP, BAL, TOWERS, ENEMIES, WAVES, TOWER_ORDER, TARGET_MODES, UNLOCKS, isUnlocked,
      towerStats, upgradeCost, investedAt, dpsOf, damageAfterArmor, canTarget,
      enemyStats, waveIntel, waveEffectiveHp, waveSpawnSeconds, countWave, pathLength
    };
  } catch (err) {
    console.error(err);
    document.body.innerHTML =
      '<div style="color:white;padding:30px;font:20px system-ui">FUN TD failed to start. Please reload.</div>';
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
})();
