export class PerformanceMonitor{constructor(){this.frames=0;this.fps=0;this.time=0}update(dt){this.frames++;this.time+=dt;if(this.time>=1){this.fps=this.frames/this.time;this.frames=0;this.time=0}}}
