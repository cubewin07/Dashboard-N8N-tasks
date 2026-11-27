/**
 * Rolling frame timer (P11-T01): the last `size` frame durations in a fixed ring, so
 * recording a frame allocates nothing.
 */
export class FrameStats {
  private readonly samples: Float64Array
  private readonly sorted: Float64Array
  private next = 0
  private count = 0

  constructor(size = 240) {
    this.samples = new Float64Array(size)
    this.sorted = new Float64Array(size)
  }

  /** One frame's duration in milliseconds. Non-finite or negative values are ignored. */
  push(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return
    this.samples[this.next] = ms
    this.next = (this.next + 1) % this.samples.length
    this.count = Math.min(this.count + 1, this.samples.length)
  }

  get size(): number {
    return this.count
  }

  /** Mean frames per second over the window (0 before the first frame). */
  fps(): number {
    if (this.count === 0) return 0
    let sum = 0
    for (let i = 0; i < this.count; i += 1) sum += this.samples[i]!
    return sum > 0 ? Math.round((1000 * this.count) / sum) : 0
  }

  /** 95th-percentile frame time in ms (nearest rank). */
  p95(): number {
    if (this.count === 0) return 0
    const view = this.sorted.subarray(0, this.count)
    view.set(this.samples.subarray(0, this.count))
    view.sort()
    const rank = Math.min(this.count - 1, Math.ceil(0.95 * this.count) - 1)
    return Math.round(view[rank]! * 10) / 10
  }

  reset(): void {
    this.next = 0
    this.count = 0
  }
}
