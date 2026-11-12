/**
 * Measures how fast a feed clock runs (feed seconds per real second) from
 * samples of "feed time now". Feed clocks move in steps, so the rate is taken
 * between the moments the clock changed, and a clock that stops changing is
 * paused. Used when the feed cannot tell its own rate.
 */
export class ClockRateEstimator {
  private points: Array<{ real: number; feedMs: number }> = []
  private lastFeedMs: number | null = null
  private rate = 1
  private paused = false

  /** `realSeconds` is any monotonic real-time clock. Returns the current rate (0 = paused). */
  sample(feedMs: number, realSeconds: number): number {
    if (this.lastFeedMs === null || feedMs < this.lastFeedMs) {
      // First sample, or the feed restarted its history.
      this.points = [{ real: realSeconds, feedMs }]
      this.lastFeedMs = feedMs
      this.paused = false
      return this.rate
    }

    if (feedMs !== this.lastFeedMs) {
      this.lastFeedMs = feedMs
      if (this.paused) {
        // Resume at the rate known before the pause until two fresh steps exist.
        this.paused = false
        this.points = []
      }
      this.points.push({ real: realSeconds, feedMs })
      while (this.points.length > 2 && realSeconds - this.points[1]!.real >= WINDOW_SECONDS) {
        this.points.shift()
      }
      const first = this.points[0]!
      const span = realSeconds - first.real
      if (this.points.length >= 2 && span > 1e-3) {
        this.rate = (feedMs - first.feedMs) / 1000 / span
      }
      return this.rate
    }

    const n = this.points.length
    const last = this.points[n - 1]!
    const interval = n >= 2 ? last.real - this.points[n - 2]!.real : 0
    if (realSeconds - last.real > Math.max(MIN_PAUSE_SECONDS, interval * 3)) {
      this.paused = true
    }
    return this.paused ? 0 : this.rate
  }
}

const WINDOW_SECONDS = 1.5
const MIN_PAUSE_SECONDS = 1.5
