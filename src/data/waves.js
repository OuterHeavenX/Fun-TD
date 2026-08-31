const g=(type,count,interval=.75,delay=0,group=5,gap=1.25,elite=false)=>({type,count,interval,delay,group,gap,elite});
export const WAVES=[
[g('raider',5,1.0)],
[g('runner',7,.9)],
[g('raider',6,.9),g('runner',4,.8,5)],
[g('runner',10,.75)],
[g('raider',7,.8),g('runner',5,.72,4)],
[g('raider',8,.75),g('runner',6,.68,5)],
[g('bulwark',2,1.4),g('raider',7,.72,4)],
[g('bulwark',3,1.3),g('runner',8,.62,5)],
[g('splitter',4,1.0),g('raider',8,.68,4)],
[g('beast',1,3,0,1,2,true),g('bulwark',3,1.2,4),g('runner',10,.58,5)],
[g('disruptor',3,1.2),g('raider',11,.6,4)],
[g('splitter',7,.82),g('runner',13,.52,5)],
[g('bulwark',5,.95),g('disruptor',4,1.1,4),g('raider',10,.58,5)],
[g('beast',1,2.8),g('splitter',8,.72,5),g('runner',15,.48,5)],
[g('disruptor',5,.9),g('splitter',10,.62,5)],
[g('bulwark',8,.8),g('runner',18,.42,6)],
[g('beast',2,2.6),g('disruptor',6,.82,4),g('splitter',11,.56,5)],
[g('runner',24,.38,0,6,1.1),g('raider',14,.48,5)],
[g('bulwark',10,.68),g('splitter',15,.46,5),g('disruptor',7,.76,5)],
[g('boss',1,1,3,1),g('beast',2,3,7),g('bulwark',10,.68,6),g('runner',20,.38,8,5,1)]
].map((groups,i)=>({groups,reward:75+i*12,startDelay:i%5===4?10:8}));
