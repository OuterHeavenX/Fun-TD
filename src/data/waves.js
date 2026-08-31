const g=(type,count,interval=.5,delay=0,group=6,gap=1,elite=false)=>({type,count,interval,delay,group,gap,elite});
export const WAVES=[
[g('raider',7,.8)],
[g('runner',10,.65)],
[g('raider',8,.7),g('runner',6,.6,4)],
[g('runner',14,.55)],
[g('raider',10,.62),g('runner',8,.52,3)],
[g('raider',10,.58),g('runner',10,.48,5)],
[g('bulwark',3,1.2),g('raider',9,.58,3)],
[g('bulwark',4,1.1),g('runner',12,.46,4)],
[g('splitter',6,.8),g('raider',10,.52,3)],
[g('beast',1,2.5,0,1,2,true),g('bulwark',4,.95,3),g('runner',14,.42,4)],
[g('disruptor',4,1.0),g('raider',16,.46,4)],
[g('splitter',10,.58),g('runner',18,.36,4)],
[g('bulwark',8,.75),g('disruptor',5,.9,3),g('raider',14,.42,4)],
[g('beast',2,2.2),g('splitter',10,.5,4),g('runner',22,.32,5)],
[g('disruptor',8,.72),g('splitter',14,.45,4)],
[g('bulwark',12,.62),g('runner',28,.28,4)],
[g('beast',3,2),g('disruptor',9,.62,3),g('splitter',16,.4,4)],
[g('runner',36,.24,0,9,.9),g('raider',22,.32,4)],
[g('bulwark',16,.5),g('splitter',24,.32,4),g('disruptor',10,.58,4)],
[g('boss',1,1,2,1),g('beast',3,2.5,6),g('bulwark',18,.48,5),g('runner',32,.24,7,8,.8)]
].map((groups,i)=>({groups,reward:50+i*9,startDelay:i%5===4?8:6}));
