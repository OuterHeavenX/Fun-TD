export class TowerManager{constructor(pads=[]){this.pads=pads}all(){return this.pads.map(p=>p.tower).filter(Boolean)}}
