export const TOWERS={
 bolt:{name:'Bolt Bastion',role:'Rapid single target',cost:90,color:'#5cc8ff',range:172,damage:20,rate:4.8,projectile:760,branches:['Armor Piercing','Rapid Volley']},
 mortar:{name:'Blast Mortar',role:'Area bombardment',cost:120,color:'#ff9d49',range:225,damage:70,rate:.9,projectile:270,branches:['Incendiary','Cluster Bombs']},
 frost:{name:'Frost Relay',role:'Slow and control',cost:105,color:'#8ff6ff',range:160,damage:11,rate:2.0,projectile:560,branches:['Deep Freeze','Wide Field']},
 arc:{name:'Arc Spire',role:'Chain lightning',cost:135,color:'#d78bff',range:165,damage:27,rate:1.3,projectile:0,branches:['Forked Current','Overcharge']}
};
export const towerStats=(type,level,branch=null)=>{const b=TOWERS[type],m=1+(level-1)*.6;let s={...b,damage:b.damage*m,range:b.range*(1+(level-1)*.07),rate:b.rate*(1+(level-1)*.15),chains:type==='arc'?2+level:1,radius:type==='mortar'?56+level*10:0,slow:type==='frost'?.28+level*.07:0,pierce:0};if(branch===0){if(type==='bolt')s.pierce=.6;if(type==='frost')s.slow+=.2;if(type==='arc')s.chains+=3;if(type==='mortar')s.burn=true}else if(branch===1){if(type==='bolt')s.rate*=1.6;if(type==='frost')s.range*=1.3;if(type==='arc')s.damage*=1.5;if(type==='mortar')s.cluster=true}return s};
