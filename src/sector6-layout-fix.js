(()=>{
if((window.FUN_TD_SECTOR||1)!==6)return;

// Hand-authored Null Fortress sockets. Fewer pads, wider spacing, and every
// position is tied to a real firing lane/choke instead of floating in dead space.
const PADS=[
  [620,205], // entry bend
  [385,175], // upper horizontal
  [110,335], // first interior choke
  [390,335], // long center lane
  [655,505], // right bend
  [480,640], // center-right choke
  [245,610], // center-left choke
  [245,805], // final approach
  [80,650]   // pre-base bend
];

let attempts=0;
function apply(){
  const g=window.funTDGame;
  if(!g||!Array.isArray(g.pads)){
    if(attempts++<240)requestAnimationFrame(apply);
    return;
  }

  // Remove the extra legacy sockets entirely so there are no duplicate touch
  // targets or stacked price cards. Null Fortress intentionally uses 9 pads.
  g.pads=g.pads.slice(0,PADS.length);
  g.pads.forEach((pad,i)=>{
    const p=PADS[i];
    pad.x=p[0];pad.y=p[1];
    if(pad.tower){pad.tower.x=p[0];pad.tower.y=p[1];}
  });

  // Sector 6 has its own animated grid. Hide the old shared pad-halo canvas so
  // it cannot display obsolete ghost sockets at the previous coordinates.
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
