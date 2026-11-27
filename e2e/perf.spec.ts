import fs from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'

// P11-T01: the local performance run (performance.md §4). Not in CI: frame rate under
// SwiftShader means nothing. On the Mac:
//
//   PERF=1 npx playwright test e2e/perf.spec.ts --project=desktop
//
// Reference scene (performance.md §1): the `crowded` scenario at 30×, then 20 s to settle
// and 10 s of `__office_debug.stats()` samples per camera preset. Writes perf-report.json.
const RUN = process.env.PERF === '1'
const SETTLE_MS = Number(process.env.PERF_SETTLE_S ?? 20) * 1000
const SAMPLE_S = Number(process.env.PERF_SAMPLE_S ?? 10)

interface Stats {
  fps: number
  frameMsP95: number
  drawCalls: number
  triangles: number
  geometries: number
  textures: number
  programs: number
  jsHeapMB: number | null
}

interface Debug {
  stats?: () => Stats | null
  sim?: { runScenario: (key: string) => void; setSpeed: (speed: number) => void }
  camera?: { follow: (id: string | null) => void }
  director?: { people: () => { id: string }[] }
  characters?: { assembled: number }
}

test.use({
  launchOptions: {
    // The real GPU (Metal through ANGLE), not SwiftShader.
    args: ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal', '--enable-unsafe-webgpu'],
  },
})

/**
 * A minimal React DevTools hook: React (DOM and the R3F reconciler) reports every commit
 * to it, so commits per second can be counted per renderer (performance.md §2).
 */
interface Fiber {
  type: unknown & { displayName?: string; name?: string }
  alternate: Fiber | null
  child: Fiber | null
  sibling: Fiber | null
  memoizedProps: unknown
  memoizedState: unknown
}

function installCommitCounter() {
  const counts: Record<string, number> = {}
  const names = new Map<number, string>()
  let nextId = 1
  ;(window as unknown as { __commits: Record<string, number> }).__commits = counts
  ;(window as unknown as { __REACT_DEVTOOLS_GLOBAL_HOOK__: unknown }).__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    supportsFiber: true,
    renderers: new Map(),
    inject(renderer: { rendererPackageName?: string }) {
      const id = nextId++
      names.set(id, renderer.rendererPackageName ?? `renderer-${id}`)
      return id
    },
    onCommitFiberRoot(id: number, root: { current: Fiber }) {
      const name = names.get(id) ?? 'unknown'
      counts[name] = (counts[name] ?? 0) + 1
      // Which components started a re-render in this commit. Names only (readable with an
      // unminified build); used to find who re-renders while idle.
      const who = ((window as unknown as { __who: Record<string, number> }).__who ??= {})
      const stack: Fiber[] = [root.current]
      while (stack.length) {
        const f = stack.pop()!
        // Same props but new state: this component started the render itself (its own
        // state or a store subscription), not because a parent re-rendered.
        if (
          typeof f.type === 'function' &&
          f.alternate &&
          f.memoizedProps === f.alternate.memoizedProps &&
          f.memoizedState !== f.alternate.memoizedState
        ) {
          const key = `${name}:${f.type.displayName ?? f.type.name ?? '?'}`
          who[key] = (who[key] ?? 0) + 1
        }
        if (f.child) stack.push(f.child)
        if (f.sibling) stack.push(f.sibling)
      }
    },
    onCommitFiberUnmount() {},
    onPostCommitFiberRoot() {},
    checkDCE() {},
  }
}

async function commitsPerSecond(page: Page, seconds: number) {
  const read = () =>
    page.evaluate(() => ({ ...(window as unknown as { __commits: Record<string, number> }).__commits }))
  const before = await read()
  await page.waitForTimeout(seconds * 1000)
  const after = await read()
  const out: Record<string, number> = {}
  for (const key of Object.keys(after)) {
    out[key] = Math.round((((after[key] ?? 0) - (before[key] ?? 0)) / seconds) * 10) / 10
  }
  return out
}

/** One sample per second; returns the medians of fps/p95 and the max of the counters. */
async function sample(page: Page, seconds: number) {
  const rows: Stats[] = []
  for (let i = 0; i < seconds; i += 1) {
    await page.waitForTimeout(1000)
    const s = await page.evaluate(() =>
      (window as unknown as { __office_debug?: Debug }).__office_debug?.stats?.(),
    )
    if (s) rows.push(s)
  }
  const median = (xs: number[]) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] ?? 0
  const max = (xs: number[]) => Math.max(0, ...xs)
  return {
    samples: rows.length,
    fps: median(rows.map((r) => r.fps)),
    frameMsP95: median(rows.map((r) => r.frameMsP95)),
    drawCalls: max(rows.map((r) => r.drawCalls)),
    triangles: max(rows.map((r) => r.triangles)),
    geometries: max(rows.map((r) => r.geometries)),
    textures: max(rows.map((r) => r.textures)),
    programs: max(rows.map((r) => r.programs)),
    jsHeapMB: max(rows.map((r) => r.jsHeapMB ?? 0)) || null,
  }
}

test.describe('P11 performance run (local only)', () => {
  test.skip(!RUN, 'set PERF=1 to run on a machine with a real GPU')
  test.setTimeout(240_000)

  test('reference scene: overview, floor focus and follow', async ({ page }, info) => {
    test.skip(info.project.name !== 'desktop', 'desktop budgets only')
    await page.addInitScript(installCommitCounter)
    await page.goto('./#/login')
    await page.locator('#login-email').fill('boss@demo.local')
    await page.locator('#login-password').fill('123456')
    await page.locator('button[type="submit"]').click()
    await expect(page).toHaveURL(/#\/(\?.*)?$/)
    await page.goto('./#/?cam=overview&perf=1')
    const office = page.locator('[data-office-canvas]')
    await expect(office).toHaveAttribute('data-ready', 'true', { timeout: 60_000 })
    await expect(office).toHaveAttribute('data-assets', 'ready', { timeout: 60_000 })
    await expect(page.locator('[data-perf-overlay]')).toBeVisible()

    const gpu = await page.evaluate(() => {
      const gl = document.createElement('canvas').getContext('webgl2')
      const info = gl?.getExtension('WEBGL_debug_renderer_info')
      return info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : 'unknown'
    })

    await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug?: Debug }).__office_debug
      dbg?.sim?.setSpeed(30)
      dbg?.sim?.runScenario('crowded')
    })
    await page.waitForTimeout(SETTLE_MS)
    const people = await page.evaluate(
      () => (window as unknown as { __office_debug?: Debug }).__office_debug?.director?.people().length ?? 0,
    )

    const overview = await sample(page, SAMPLE_S)
    // Idle-watching: nothing clicked, the sim running at 30×.
    const reactCommitsPerSec = await commitsPerSecond(page, 5)

    await page.locator('[data-floor-picker-item="cs"]').first().click()
    await page.waitForTimeout(1000)
    const floor = await sample(page, SAMPLE_S)

    await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug?: Debug }).__office_debug
      const list = dbg?.director?.people() ?? []
      const id = list.find((p) => p.id === 'emp_linh')?.id ?? list[0]?.id ?? null
      dbg?.camera?.follow(id)
    })
    await page.waitForTimeout(1000)
    const follow = await sample(page, SAMPLE_S)

    // Idle-watching at normal speed (performance.md §2 budget: ≤ 5 commits/s, none from
    // the canvas tree).
    await page.evaluate(() => {
      const dbg = (window as unknown as { __office_debug?: Debug }).__office_debug
      dbg?.camera?.follow(null)
      dbg?.sim?.setSpeed(1)
    })
    await page.locator('[data-camera-mode="overview"]').first().click()
    await page.waitForTimeout(2000)
    await page.evaluate(() => {
      ;(window as unknown as { __who: Record<string, number> }).__who = {}
    })
    const reactCommitsPerSecIdle = await commitsPerSecond(page, 10)
    const whoRendered = await page.evaluate(() =>
      Object.entries((window as unknown as { __who: Record<string, number> }).__who ?? {})
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15),
    )

    const report = {
      source: 'e2e/perf.spec.ts',
      at: new Date().toISOString(),
      gpu,
      viewport: page.viewportSize(),
      people,
      reactCommitsPerSec,
      reactCommitsPerSecIdle,
      whoRendered,
      presets: { overview, floor, follow },
    }
    fs.writeFileSync(path.resolve('perf-report.json'), `${JSON.stringify(report, null, 2)}\n`)
    console.log(JSON.stringify(report, null, 2))
    expect(overview.samples).toBeGreaterThan(0)
  })
})
