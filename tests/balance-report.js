import { WAVES } from '../src/data/waves.js';
import { ENEMIES } from '../src/data/enemies.js';

const report = WAVES.map((wave, index) => {
  let enemies = 0;
  let effectiveHp = 0;
  let killGold = 0;
  let breachDamage = 0;
  let spawnSeconds = wave.startDelay;
  for (const group of wave.groups) {
    const enemy = ENEMIES[group.type];
    const elite = group.elite ? 1.8 : 1;
    enemies += group.count;
    effectiveHp += group.count * enemy.hp * elite / (1 - enemy.armor);
    killGold += group.count * Math.round(enemy.reward * (group.elite ? 2 : 1));
    breachDamage += group.count * enemy.damage;
    spawnSeconds = Math.max(spawnSeconds, wave.startDelay + (group.delay || 0) + group.count * group.interval);
  }
  return {
    wave: index + 1,
    enemies,
    effectiveHp: Math.round(effectiveHp),
    killGold,
    completionGold: wave.reward,
    breachDamage,
    spawnSeconds: Number(spawnSeconds.toFixed(1)),
    pressure: Math.round(effectiveHp / Math.max(1, spawnSeconds))
  };
});

console.table(report);
console.log(JSON.stringify(report));
