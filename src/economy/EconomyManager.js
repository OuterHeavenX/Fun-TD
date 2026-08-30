export class EconomyManager{constructor(gold=0){this.gold=gold}spend(n){if(n<0||this.gold<n)return false;this.gold-=n;return true}earn(n){if(n>0)this.gold+=n}}
