import{ENEMIES}from'../data/enemies.js';
export class Enemy{
 constructor(type,path){this.reset(type,path)}
 reset(type,path){const d=ENEMIES[type];Object.assign(this,d);this.type=type;this.maxHp=d.hp;this.hp=d.hp;this.path=path;this.segment=0;this.x=path[0][0];this.y=path[0][1];this.slow=0;this.slowTime=0;this.active=true;this.angle=0;return this}
 update(dt){if(!this.active)return false;if(this.slowTime>0)this.slowTime-=dt;else this.slow=0;let travel=this.speed*(1-this.slow)*dt;while(travel>0&&this.segment<this.path.length-1){const a=this.path[this.segment],b=this.path[this.segment+1],dx=b[0]-this.x,dy=b[1]-this.y,d=Math.hypot(dx,dy);this.angle=Math.atan2(dy,dx);if(travel>=d){this.x=b[0];this.y=b[1];this.segment++;travel-=d}else{this.x+=dx/d*travel;this.y+=dy/d*travel;travel=0}}return this.segment>=this.path.length-1}
}
