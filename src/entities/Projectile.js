export class Projectile{
 constructor(x,y,target,stats,type){this.x=x;this.y=y;this.target=target;this.speed=stats.projectileSpeed;this.damage=stats.damage;this.splash=stats.splash||0;this.slow=stats.slow||0;this.type=type;this.color=stats.color;this.active=true}
 update(dt){if(!this.active||!this.target?.active)return this.active=false;const dx=this.target.x-this.x,dy=this.target.y-this.y,d=Math.hypot(dx,dy),step=this.speed*dt;if(d<=step+7){this.x=this.target.x;this.y=this.target.y;return true}this.x+=dx/d*step;this.y+=dy/d*step;return false}
}
