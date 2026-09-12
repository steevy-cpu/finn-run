
import { EventEmitter } from 'events';

// Longest frame we simulate in one step. A stall (tab switch, GC pause,
// model load) would otherwise produce a giant delta and let the player
// teleport through obstacles.
const MAX_DELTA_MS = 50;

export default class Time extends EventEmitter {
  public start;
  public current;
  public elapsed;
  public delta;
  constructor() {
    super();
    this.start = performance.now();
    this.current = this.start;
    this.elapsed = 0;
    this.delta = 16;
    this.update();
  }

  public update() {
    const currentTime = performance.now();
    this.delta = Math.min(currentTime - this.current, MAX_DELTA_MS);
    this.current = currentTime;
    this.elapsed = this.current - this.start;
    super.emit("update");
    window.requestAnimationFrame(() => {
      this.update();
    })
  }
}
