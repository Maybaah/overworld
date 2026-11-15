const KEEP = 300;

export class FrameStats {
  private readonly stamps: number[] = [];
  private readonly deltas: number[] = [];

  push(now: number, dt: number): void {
    this.stamps.push(now);
    this.deltas.push(dt);
    if (this.stamps.length > KEEP) {
      this.stamps.shift();
      this.deltas.shift();
    }
  }

  fps(now: number): number {
    let count = 0;
    for (let i = this.stamps.length - 1; i >= 0 && this.stamps[i]! > now - 1000; i--) count++;
    return count;
  }

  frameTimes(): number[] {
    return this.deltas.slice();
  }
}
