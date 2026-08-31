const g=(type,count,interval=.42,gap=0)=>({type,count,interval,gap});
export const WAVES=[
 [g('grunt',8,.68)],[g('grunt',12,.62)],[g('grunt',16,.58)],[g('grunt',22,.54)],[g('grunt',28,.50)],
 [g('grunt',20,.46),g('scout',8,.52,1.2)],[g('grunt',26,.44),g('scout',10,.48,1.1)],[g('grunt',30,.42),g('armored',6,.66,1.1)],[g('grunt',36,.40),g('scout',14,.44,1)],[g('grunt',42,.38),g('armored',8,.60,1)],
 [g('grunt',48,.36),g('scout',16,.40,.9)],[g('grunt',55,.35),g('armored',10,.56,.9)],[g('grunt',60,.34),g('heavy',4,.9,1)],[g('grunt',66,.33),g('scout',20,.38,.8),g('armored',8,.52,.8)],[g('grunt',72,.32),g('heavy',5,.82,.8)],
 [g('grunt',82,.30),g('scout',22,.34,.8)],[g('grunt',90,.29),g('armored',14,.48,.7)],[g('grunt',100,.28),g('heavy',7,.75,.7)],[g('grunt',110,.27),g('scout',28,.32,.7),g('armored',16,.46,.7)],
 [g('boss',1,1),g('grunt',90,.29,1.5),g('heavy',8,.72,.8)]
].map((groups,i)=>({groups,bonus:75+i*10}));
export const waveEnemyCount=index=>WAVES[index]?.groups.reduce((n,g)=>n+g.count,0)||0;
