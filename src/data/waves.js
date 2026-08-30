const g=(type,count,interval=.22,delay=0,group=6,gap=.7,elite=false)=>({type,count,interval,delay,group,gap,elite});
export const WAVES=[
[g('raider',12,.45)],[g('runner',22,.25)],[g('raider',18,.32),g('runner',16,.19,3)],
[g('runner',30,.2)],[g('raider',24,.27),g('runner',22,.18,2)],[g('beast',1,1),g('runner',32,.15,1)],
[g('bulwark',12,.42),g('raider',30,.16)],[g('bulwark',18,.32),g('runner',42,.1)],[g('splitter',22,.25),g('raider',30,.14)],
[g('beast',2,3,0,1,2,true),g('bulwark',15,.24),g('runner',40,.1)],
[g('disruptor',8,.7),g('raider',45,.12)],[g('splitter',30,.16),g('runner',55,.08)],[g('bulwark',24,.2),g('disruptor',12,.4),g('raider',35,.11)],[g('beast',3,2),g('splitter',28,.14),g('runner',65,.07)],
[g('disruptor',18,.3),g('splitter',45,.1)],[g('bulwark',35,.13),g('runner',90,.055)],[g('beast',4,1.5),g('disruptor',20,.22),g('splitter',45,.08)],
[g('runner',130,.04,0,15,.25),g('raider',80,.055)],[g('bulwark',50,.09),g('splitter',65,.055),g('disruptor',18,.18)],
[g('boss',1,1,1,1),g('beast',6,2,4),g('bulwark',50,.11,2),g('runner',100,.045,5)]
].map((groups,i)=>({groups,reward:35+i*7,startDelay:i%5===4?4:2}));
