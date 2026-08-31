export const ECONOMY={startGold:1200,sellRate:.9,waveBase:60,flawlessBonus:100};
export const LEVEL_MULTIPLIERS=[1,1.12,1.3,1.55,1.9];
export const upgradeCost=(base,level)=>Math.round(base*LEVEL_MULTIPLIERS[level]);
export const refundFor=(invested)=>Math.floor(invested*ECONOMY.sellRate);
export const damageAfterArmor=(damage,armor,pierce=0)=>Math.max(1,damage*(1-Math.max(0,armor-pierce)));
export const SETTINGS={worldW:720,worldH:1120,fixedStep:1/60,maxParticles:520,targetKills:150};
