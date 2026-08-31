(()=>{
const overlay=document.getElementById('campaignMapOverlay'),open=document.getElementById('campaignMapButton'),close=document.getElementById('campaignMapClose'),command=document.getElementById('campaignMapCommand');
if(!overlay||!open)return;
function migrateLegacy(n){const cleared=localStorage.getItem(`funTD_sector${n}Clear`)==='1';if(!cleared)return;const sk=`funTD_sector${n}Stars`,wk=`funTD_sector${n}BestWave`;if((+localStorage.getItem(sk)||0)===0)localStorage.setItem(sk,'1');if((+localStorage.getItem(wk)||0)<20)localStorage.setItem(wk,'20')}
migrateLegacy(1);migrateLegacy(2);
const current=(new URLSearchParams(location.search).get('sector')==='2')?2:1;
const clear1=()=>localStorage.getItem('funTD_sector1Clear')==='1';
const stars=n=>+localStorage.getItem(`funTD_sector${n}Stars`)||0;
const starHtml=n=>[1,2,3].map(i=>`<span class="${i<=stars(n)?'':'off'}">★</span>`).join('');
function render(){
  const unlocked2=clear1();
  const n1=overlay.querySelector('[data-map-sector="1"]'),n2=overlay.querySelector('[data-map-sector="2"]'),n3=overlay.querySelector('[data-map-sector="3"]');
  [n1,n2].forEach(n=>n?.classList.remove('current'));
  if(n1){n1.querySelector('.node-stars').innerHTML=starHtml(1);if(current===1)n1.classList.add('current')}
  if(n2){n2.classList.toggle('locked',!unlocked2);n2.querySelector('.node-stars').innerHTML=unlocked2?starHtml(2):'<span class="off lock-copy">LOCKED</span>';if(current===2)n2.classList.add('current')}
  if(n3)n3.querySelector('.node-stars').innerHTML='<span class="off lock-copy">COMING SOON</span>';
  const route=overlay.querySelector('.route-to-frost');if(route){route.classList.toggle('route-locked',!unlocked2);route.classList.toggle('route-complete',unlocked2)}
  const pulse=overlay.querySelector('.current-marker');if(pulse){pulse.className=`current-marker current-${current}`;pulse.innerHTML='<span>YOU ARE HERE</span>'}
  const legend=overlay.querySelector('.map-current-copy');if(legend)legend.textContent=current===2?'CURRENT: Frostline Pass':'CURRENT: Dustwall Defense';
}
function show(){render();overlay.classList.add('show')}
function hide(){overlay.classList.remove('show')}
open.addEventListener('click',show);close?.addEventListener('click',hide);overlay.addEventListener('pointerdown',e=>{if(e.target===overlay)hide()});
overlay.querySelector('[data-map-sector="1"]')?.addEventListener('click',()=>location.href=location.pathname);
overlay.querySelector('[data-map-sector="2"]')?.addEventListener('click',()=>{if(clear1())location.href=location.pathname+'?sector=2'});
command?.addEventListener('click',()=>{hide();document.getElementById('campaignButton')?.click()});
})();