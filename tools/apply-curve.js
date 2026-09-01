/* Rewrites sectors 02-06 onto the difficulty curve tools/curve-fit.js solved.
 *
 * Three edits per sector, all mechanical:
 *   1. a per-wave health multiplier, set when a wave starts and applied as each
 *      enemy is constructed (the boss is exempt and pinned to a flat value);
 *   2. spawn counts scaled by a factor that ramps in across the campaign, so
 *      early waves keep their shape and only the late crowds are thinned;
 *   3. the boss's own health, sized to roughly a fifth of its final wave.
 *
 *   node tools/apply-curve.js --check     # report only
 *   node tools/apply-curve.js --write     # edit the sector files
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'src');
const WRITE = process.argv.includes('--write');

const HP_LINEAR = 0.06;
const HP_QUADRATIC = 0.042;

// Solved by tools/curve-fit.js against each sector's pads and route length.
const FIT = {
  // Boss health is the fitted fifth-of-the-final-wave figure, then cut by a
  // third: measured against a maxed line, the fitted value made wave 20 twice
  // as long as any other wave, because these sectors' towers have no armour
  // pierce to bring against a single large health pool.
  2: { file: 'sector2.js', table: 'ENEMIES', factor: 0.325, bossHp: 6400 },
  3: { file: 'sector3.js', table: 'ENEMIES', factor: 0.355, bossHp: 7900 },
  4: { file: 'sector4.js', table: 'ENEMIES', factor: 0.24, bossHp: 7800 },
  5: { file: 'sector5.js', table: 'E', factor: 0.31, bossHp: 10000 },
  6: { file: 'sector6.js', table: 'E', factor: 0.29, bossHp: 10600 }
};

/* Rewrite every g('type', count, ...) call in the wave table, tracking which
   wave each belongs to so the count factor can ramp across the campaign. */
function rewriteWaves(src, wavesVar, factor) {
  const decl = new RegExp(`const ${wavesVar}=\\[`);
  const m = decl.exec(src);
  if (!m) throw new Error(`no ${wavesVar} table`);
  const start = m.index + m[0].length - 1;

  let depth = 0, end = -1;
  for (let i = start; i < src.length; i++) {
    if (src[i] === '[') depth++;
    else if (src[i] === ']') { depth--; if (depth === 0) { end = i + 1; break; } }
  }
  if (end < 0) throw new Error('unterminated wave table');

  const body = src.slice(start, end);
  // Wave index advances each time we close a first-level sub-array.
  let wave = 0, level = 0, out = '', changed = 0;
  // Top-level sub-arrays, i.e. waves: one more than the separators between them.
  const total = (body.match(/\],\[/g) || []).length + 1;

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === '[') { level++; out += ch; continue; }
    if (ch === ']') { level--; out += ch; if (level === 1) wave++; continue; }
    if (level >= 2 && body.startsWith('g(', i)) {
      const close = body.indexOf(')', i);
      const call = body.slice(i, close + 1);
      const parts = call.slice(2, -1).split(',');
      const type = parts[0].replace(/'/g, '').trim();
      const count = Number(parts[1]);
      if (type !== 'boss' && Number.isFinite(count)) {
        const ramp = 1 - (1 - factor) * (wave / (total - 1));
        parts[1] = String(Math.max(4, Math.round(count * ramp)));
        changed++;
      }
      out += 'g(' + parts.join(',') + ')';
      i = close;
      continue;
    }
    out += ch;
  }
  return { src: src.slice(0, start) + out + src.slice(end), changed, waves: total };
}

const report = [];
for (const [sector, fit] of Object.entries(FIT)) {
  const file = path.join(SRC, fit.file);
  let src = fs.readFileSync(file, 'utf8');
  const notes = [];

  // 1. The wave health curve, and the multiplier the Enemy constructor reads.
  if (!src.includes('let WAVE_HP')) {
    src = src.replace(/^const g=\(type/m,
      '/* Difficulty rides on per-enemy health rather than crowd size; see\n' +
      '   tools/curve-fit.js. WAVE_HP is set when a wave starts. */\n' +
      `const waveHpScale=i=>1+i*${HP_LINEAR}+i*i*${HP_QUADRATIC};\n` +
      'let WAVE_HP=1;\n' +
      'const g=(type');
    notes.push('curve added');
  }

  // 2. Scale each enemy as it is built. Every sector shares this exact shape.
  const ctor = `Object.assign(this,${fit.table}[type]);this.type=type;this.maxHp=this.hp;`;
  if (src.includes(ctor)) {
    src = src.replace(ctor,
      `Object.assign(this,${fit.table}[type]);this.type=type;` +
      'this.hp=Math.round(this.hp*(this.noScale?1:WAVE_HP));this.maxHp=this.hp;');
    notes.push('enemy scaling');
  } else if (!src.includes('this.noScale?1:WAVE_HP')) {
    notes.push('CONSTRUCTOR NOT MATCHED');
  }

  // 3. Set the multiplier at the top of each wave.
  const head = "startWave(){if(this.phase!=='build')return;this.phase='wave';";
  if (src.includes(head) && !src.includes('WAVE_HP=waveHpScale')) {
    src = src.replace(head, head + 'WAVE_HP=waveHpScale(this.waveIndex);');
    notes.push('wave hook');
  }

  // 4. Pin the boss and exempt it from the curve.
  const bossRe = new RegExp(`(boss:\\{)hp:(\\d+)`);
  const bm = bossRe.exec(src);
  if (bm && !src.includes('noScale:true')) {
    src = src.replace(bossRe, `$1noScale:true,hp:${fit.bossHp}`);
    notes.push(`boss ${bm[2]} -> ${fit.bossHp}`);
  }

  // 5. Thin the late crowds.
  const wavesVar = fit.table === 'E' ? 'W' : 'WAVES';
  let counts = 0;
  if (!src.includes('/* counts fitted */')) {
    const r = rewriteWaves(src, wavesVar, fit.factor);
    src = r.src.replace(`const ${wavesVar}=[`, `/* counts fitted */\nconst ${wavesVar}=[`);
    counts = r.changed;
    notes.push(`${r.changed} groups over ${r.waves} waves`);
  }

  report.push({ sector: +sector, file: fit.file, notes: notes.join(', ') });
  if (WRITE) fs.writeFileSync(file, src);
}

console.table(report);
console.log(WRITE ? 'written' : 'dry run — pass --write to apply');
