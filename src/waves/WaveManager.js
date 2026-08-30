export class WaveManager{constructor(waves){this.waves=waves;this.index=-1}next(){return this.waves[++this.index]||null}get complete(){return this.index>=this.waves.length}}
