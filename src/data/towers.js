export const TOWERS={
  gun:{name:'GUN TOWER',cost:100,damage:18,rate:4.5,range:155,projectileSpeed:720,color:'#56c5ff',accent:'#1b78cf'},
  cannon:{name:'CANNON',cost:200,damage:55,rate:.9,range:190,projectileSpeed:330,splash:55,color:'#ffb24b',accent:'#df6f22'},
  freeze:{name:'FREEZE',cost:150,damage:8,rate:1.8,range:160,projectileSpeed:560,slow:.30,color:'#8cf5ff',accent:'#2ca7d9'}
};
export const upgradeCost=(type,level)=>Math.round([0,1,2,4][level]*TOWERS[type].cost);
export const towerStats=(type,level)=>{const b=TOWERS[type],n=level-1;return{...b,damage:b.damage*(1+n*.55),rate:b.rate*(1+n*.16),range:b.range*(1+n*.07),splash:b.splash?b.splash+n*8:0,slow:b.slow?Math.min(.55,b.slow+n*.07):0};};
