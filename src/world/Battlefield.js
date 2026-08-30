export class Battlefield{constructor(map){this.map=map}containsPad(x,y,pads){return pads.find(p=>Math.hypot(x-p.x,y-p.y)<48)}}
