export const ECONOMY={startGold:560,sellRate:.72,waveBase:35,flawlessBonus:35};
export const LEVEL_MULTIPLIERS=[1,1.6,2.2,3.2,4.8];
export const upgradeCost=(base,level)=>Math.round(base*LEVEL_MULTIPLIERS[level]);
export const refundFor=(invested)=>Math.floor(invested*ECONOMY.sellRate);
export const damageAfterArmor=(damage,armor,pierce=0)=>Math.max(1,damage*(1-Math.max(0,armor-pierce)));
export const SETTINGS={worldW:720,worldH:1120,fixedStep:1/60,maxParticles:520,targetKills:150};
