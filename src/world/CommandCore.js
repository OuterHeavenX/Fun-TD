export class CommandCore{constructor(max=100){this.max=max;this.hp=max}damage(n){this.hp=Math.max(0,this.hp-n);return this.hp}}
