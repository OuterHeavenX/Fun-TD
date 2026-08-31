export const ECONOMY={startGold:700,sellRate:.8,waveBase:45,flawlessBonus:60};
export const LEVEL_MULTIPLIERS=[1,1.3,1.7,2.2,2.9];
export const upgradeCost=(base,level)=>Math.round(base*LEVEL_MULTIPLIERS[level]);
export const refundFor=(invested)=>Math.floor(invested*ECONOMY.sellRate);
export const damageAfterArmor=(damage,armor,pierce=0)=>Math.max(1,damage*(1-Math.max(0,armor-pierce)));
export const SETTINGS={worldW:720,worldH:1120,fixedStep:1/60,maxParticles:520,targetKills:150};
