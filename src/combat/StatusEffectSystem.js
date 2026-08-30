export const updateStatus=(e,dt)=>{e.flash=Math.max(0,e.flash-dt);e.shield=Math.max(0,e.shield-dt);e.slowTime=Math.max(0,e.slowTime-dt);if(e.burnTime>0){e.burnTime-=dt;e.hp-=e.burn*dt}};
