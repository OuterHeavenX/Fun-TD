(()=>{
if((window.FUN_TD_SECTOR||1)!==6)return;
const PADS=[
  [620,205],
  [385,175],
  [125,335],
  [390,340],
  [665,490],
  [500,640],
  [270,610],
  [455,650],
  [265,805],
  [520,800],
  [75,800],
  [245,900]
];
let attempts=0;
function apply(){
  const g=window.funTDGame;
  if(!g||!Array.isArray(g.pads)){
    if(attempts++<240)requestAnimationFrame(apply);
    return;
  }
  g.pads.forEach((pad,i)=>{
    const p=PADS[i];
    if(!p)return;
    pad.x=p[0];pad.y=p[1];
    if(pad.tower){pad.tower.x=p[0];pad.tower.y=p[1];}
  });
  // Sector 6 already has its own animated grid art. The older FX pad halo
  // layer uses legacy coordinates, so suppress it here rather than leaving
  // misleading ghost sockets around the battlefield.
  let fxAttempts=0;
  const hideLegacyFx=()=>{
    const fx=document.getElementById('fxCanvas');
    if(fx){fx.style.display='none';return;}
    if(fxAttempts++<240)requestAnimationFrame(hideLegacyFx);
  };
  hideLegacyFx();
}
apply();
})();
