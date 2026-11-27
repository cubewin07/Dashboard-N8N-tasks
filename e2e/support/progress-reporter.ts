// Prints where the E2E run is: a line when each test starts and ends, and a heartbeat while
// a slow one is still running (the 3D tests can be silent for a minute or more).
import type { FullConfig, FullResult, Reporter, Suite, TestCase, TestResult } from '@playwright/test/reporter'

const HEARTBEAT_MS = 15_000

function clock(ms: number): string {
  const s = Math.round(ms / 1000)
  return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, '0')}s`
}

export default class ProgressReporter implements Reporter {
  private total = 0
  private done = 0
  private failed = 0
  private startedAt = Date.now()
  private readonly running = new Map<string, { label: string; since: number }>()
  private timer: ReturnType<typeof setInterval> | undefined

  printsToStdio(): boolean {
    return true
  }

  onBegin(config: FullConfig, suite: Suite): void {
    this.total = suite.allTests().length
    this.startedAt = Date.now()
    this.print(`Running ${this.total} E2E tests with ${config.workers} worker(s)`)
    this.timer = setInterval(() => this.heartbeat(), HEARTBEAT_MS)
  }

  onTestBegin(test: TestCase, result: TestResult): void {
    const label = this.label(test, result)
    this.running.set(test.id, { label, since: Date.now() })
    this.print(`start  ${label}`)
  }

  onTestEnd(test: TestCase, result: TestResult): void {
    this.running.delete(test.id)
    // A failed attempt that will be retried is not final: count the test once.
    const willRetry = result.status !== 'passed' && result.status !== 'skipped' && result.retry < test.retries
    if (!willRetry) {
      this.done += 1
      if (test.outcome() === 'unexpected') this.failed += 1
    }
    const word = { passed: 'pass ', failed: 'FAIL ', timedOut: 'FAIL ', skipped: 'skip ', interrupted: 'stop ' }[
      result.status
    ]
    this.print(`${word}  ${this.label(test, result)} (${(result.duration / 1000).toFixed(1)}s)`)
    const error = result.error?.message?.split('\n')[0]
    if (error && result.status !== 'skipped') this.print(`       ${error}`)
  }

  onEnd(result: FullResult): void {
    clearInterval(this.timer)
    this.print(`Finished: ${result.status}, ${this.done}/${this.total} done, ${this.failed} failed`)
  }

  private heartbeat(): void {
    for (const { label, since } of this.running.values()) {
      this.print(`  ...  still running after ${clock(Date.now() - since)}: ${label}`)
    }
  }

  private label(test: TestCase, result: TestResult): string {
    // titlePath: ['', project, file, describe…, title]
    const [, project, file, ...titles] = test.titlePath()
    const retry = result.retry > 0 ? ` (retry ${result.retry})` : ''
    return `[${project}] ${file} › ${titles.at(-1)}${retry}`
  }

  private print(line: string): void {
    process.stdout.write(`[${clock(Date.now() - this.startedAt)} ${this.done}/${this.total}] ${line}\n`)
  }
}
