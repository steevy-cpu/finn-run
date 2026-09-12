
import { EventEmitter } from 'events';
import { LOW_POWER } from './perf';
export default class Sizes extends EventEmitter{
  width: number = 0;
  height: number = 0;
  aspect: any;
  pixelRatio: any;
  frustrum: any;

  constructor() {
    super();
    this.measure();
    this.frustrum = 5;

    window.addEventListener("resize", () => {
      this.measure();
      super.emit("resize");
    })
  }

  // The game renders into the .experience pane (left half in split-screen),
  // so size from the container rather than the window.
  measure() {
    const pane = document.querySelector(".experience") as HTMLElement | null;
    this.width = pane?.clientWidth || window.innerWidth;
    this.height = pane?.clientHeight || window.innerHeight;
    this.aspect = this.width / this.height;
    this.pixelRatio = LOW_POWER ? 1 : Math.min(window.devicePixelRatio, 2);
  }
}