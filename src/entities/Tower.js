import{TOWERS,towerStats,upgradeCost}from'../data/towers.js';
export class Tower{
 constructor(type,x,y){this.type=type;this.x=x;this.y=y;this.level=1;this.cooldown=0;this.angle=-Math.PI/2}
 get stats(){return towerStats(this.type,this.level)}
 get upgradeCost(){return this.level<4?upgradeCost(this.type,this.level):0}
 update(dt){this.cooldown-=dt}
 canFire(){return this.cooldown<=0}
 fired(){this.cooldown=1/this.stats.rate}
 get label(){return TOWERS[this.type].name}
}
