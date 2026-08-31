(()=>{
'use strict';
const BUILD='0.14.0';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const ready=()=>window.funTDGame&&window.funTDGame.canvas&&window.funTDGame.ctx;
function install(){
  const game=window.funTDGame;
  if(!game||game.__v014Installed)return;
  game.__v014Installed=true;
  game.__build=BUILD;

  const speedBtn=document.getElementById('speed');
  if(speedBtn){
    speedBtn.onclick=()=>{
      game.speed=game.speed===1?2:game.speed===2?3:1;
      speedBtn.textContent=game.speed+'×';
      if(game.toast)game.toast(game.speed===3?'MAX SPEED':'SPEED '+game.speed+'×',900);
    };
  }

  const oldUpgrade=game.upgrade?.bind(game);
  if(oldUpgrade){
    game.upgrade=pad=>{
      const before=pad?.tower?.level||0;
      oldUpgrade(pad);
      const tower=pad?.tower;
      if(tower&&tower.level>before){
        tower.__evolvePulse=1;
        tower.__evolveLevel=tower.level;
        game.banner={text:`${tower.type.toUpperCase()} EVOLVED · LV ${tower.level}`,life:.9,color:'#ffe66d'};
        if(game.toast)game.toast(`TOWER EVOLUTION · LEVEL ${tower.level}`,1200);
      }
    };
  }

  const oldBuild=game.build?.bind(game);
  if(oldBuild){
    game.build=(pad,type)=>{
      const before=game.towers?.length||0;
      oldBuild(pad,type);
      if((game.towers?.length||0)>before&&pad?.tower){
        pad.tower.__evolvePulse=.75;
        pad.tower.__evolveLevel=1;
      }
    };
  }

  const oldSpawn=game.spawn?.bind(game);
  if(oldSpawn){
    game.spawn=type=>{
      const before=game.enemies?.length||0;
      oldSpawn(type);
      const enemy=game.enemies?.[game.enemies.length-1];
      if(!enemy||(game.enemies?.length||0)<=before||type==='boss')return;
      const wave=(game.waveIndex||0)+1;
      const eliteChance=wave>=4?Math.min(.16,.035+wave*.004):0;
      if(Math.random()<eliteChance){
        enemy.elite=true;
        enemy.maxHp=Math.round(enemy.maxHp*2.15);
        enemy.hp=enemy.maxHp;
        enemy.reward=Math.max(enemy.reward+5,Math.round(enemy.reward*2.4));
        enemy.size*=1.18;
        enemy.speed*=.92;
        enemy.color='#d9ff59';
        if(game.floaters)game.floaters.push({x:enemy.x,y:enemy.y-24,text:'ELITE',life:1.25,color:'#eaff69'});
      }
    };
  }

  const oldKill=game.kill?.bind(game);
  if(oldKill){
    game.kill=enemy=>{
      if(!enemy?.active)return;
      const wasElite=!!enemy.elite;
      const x=enemy.x,y=enemy.y;
      oldKill(enemy);
      if(wasElite){
        if(game.burst)game.burst(x,y,'#eaff69',22);
        if(game.ring)game.ring(x,y,'#eaff69',.55,14,74);
        game.banner={text:'ELITE DESTROYED',life:.65,color:'#efff8a'};
      }
    };
  }

  const oldStartWave=game.startWave?.bind(game);
  if(oldStartWave){
    game.startWave=()=>{
      const wave=(game.waveIndex||0)+1;
      oldStartWave();
      if(game.phase==='wave'){
        if(wave%5===0){
          game.banner={text:`WAVE ${wave} · HEAVY ASSAULT`,life:1.35,color:'#ffcb63'};
          if(game.toast)game.toast('WARNING · HEAVY ASSAULT',1500);
        }else{
          game.banner={text:`WAVE ${wave} INCOMING`,life:1.05,color:'#ffffff'};
        }
      }
    };
  }

  const oldLeak=game.leak?.bind(game);
  if(oldLeak){
    game.leak=enemy=>{
      oldLeak(enemy);
      if(game.baseHp>0&&game.baseHp<=35&&game.toast)game.toast('BASE CRITICAL!',900);
    };
  }

  const oldRenderHud=game.renderHud?.bind(game);
  if(oldRenderHud){
    game.renderHud=()=>{
      oldRenderHud();
      const hp=document.getElementById('hp');
      const sub=document.getElementById('subhud');
      const critical=(game.baseHp||0)<=35;
      if(hp)hp.classList.toggle('critical',critical);
      if(sub)sub.classList.toggle('base-critical',critical);
    };
    game.renderHud();
  }

  const oldLoop=game.loop?.bind(game);
  if(oldLoop){
    game.loop=t=>{
      if(Array.isArray(game.towers))for(const tower of game.towers){
        if(tower.__evolvePulse>0)tower.__evolvePulse=Math.max(0,tower.__evolvePulse-.035*(game.speed||1));
      }
      return oldLoop(t);
    };
  }

  const badge=document.getElementById('versionBadge');
  if(badge)badge.textContent='v'+BUILD+'-alpha';
  const introVersion=document.querySelector('.intro-version');
  if(introVersion)introVersion.textContent='v'+BUILD+'-alpha';
}

let tries=0;
const timer=setInterval(()=>{
  tries++;
  if(ready()){clearInterval(timer);install();}
  else if(tries>240)clearInterval(timer);
},25);
})();