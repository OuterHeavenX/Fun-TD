export const TOWERS={
 bolt:{name:'Bolt Bastion',role:'Rapid single target',cost:110,color:'#5cc8ff',range:154,damage:14,rate:4.1,projectile:760,branches:['Armor Piercing','Rapid Volley']},
 mortar:{name:'Blast Mortar',role:'Area bombardment',cost:150,color:'#ff9d49',range:210,damage:48,rate:.72,projectile:270,branches:['Incendiary','Cluster Bombs']},
 frost:{name:'Frost Relay',role:'Slow and control',cost:135,color:'#8ff6ff',range:142,damage:7,rate:1.7,projectile:560,branches:['Deep Freeze','Wide Field']},
 arc:{name:'Arc Spire',role:'Chain lightning',cost:175,color:'#d78bff',range:150,damage:19,rate:1.05,projectile:0,branches:['Forked Current','Overcharge']}
};
export const towerStats=(type,level,branch=null)=>{const b=TOWERS[type],m=1+(level-1)*.48;let s={...b,damage:b.damage*m,range:b.range*(1+(level-1)*.055),rate:b.rate*(1+(level-1)*.12),chains:type==='arc'?2+level:1,radius:type==='mortar'?48+level*8:0,slow:type==='frost'?.24+level*.06:0,pierce:0};if(branch===0){if(type==='bolt')s.pierce=.5;if(type==='frost')s.slow+=.18;if(type==='arc')s.chains+=3;if(type==='mortar')s.burn=true}else if(branch===1){if(type==='bolt')s.rate*=1.55;if(type==='frost')s.range*=1.28;if(type==='arc')s.damage*=1.45;if(type==='mortar')s.cluster=true}return s};
