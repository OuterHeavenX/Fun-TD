export class HUD{
 constructor(game){this.game=game;this.gold=document.querySelector('#gold');this.wave=document.querySelector('#wave');this.hp=document.querySelector('#hp');this.fill=document.querySelector('#progressFill');this.progress=document.querySelector('#progressText');this.start=document.querySelector('#startWave');this.menu=document.querySelector('#towerMenu');this.toastEl=document.querySelector('#toast')}
 render(){const g=this.game,total=g.waveTotal||0,defeated=g.waveDefeated||0;this.gold.textContent=Math.floor(g.gold);this.wave.textContent=Math.min(20,g.waveIndex+1);this.hp.textContent=g.baseHp;this.progress.textContent=`${defeated} / ${total}`;this.fill.style.width=(total?Math.min(100,defeated/total*100):0)+'%';this.start.textContent=`START WAVE ${Math.min(20,g.waveIndex+1)}`;this.start.classList.toggle('hidden',g.phase!=='build')}
 toast(msg,time=1800){clearTimeout(this.timer);this.toastEl.textContent=msg;this.toastEl.classList.add('show');this.timer=setTimeout(()=>this.toastEl.classList.remove('show'),time)}
 closeMenu(){this.menu.classList.add('hidden');this.menu.innerHTML=''}
}
