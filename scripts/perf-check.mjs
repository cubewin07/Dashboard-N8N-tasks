// Performance check for the 3D office (P04-T15, P07b-T14, docs/plan/performance.md).
//
//   npm run perf:check            software GL thresholds (CI)
//   npm run perf:check -- --real  real GPU thresholds (run on Mac)
//   npm run perf:check -- --url http://localhost:5173/Dashboard-N8N-tasks/
//
// Without --url it builds the app with VITE_DEBUG=1 and serves it itself.
// Writes perf-report.json and exits 1 when a threshold is missed.
import { spawn, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const rootDir = path.resolve(import.meta.dirname, '..')
const args = process.argv.slice(2)
const real = args.includes('--real')
const urlAt = args.indexOf('--url')
const givenUrl = urlAt >= 0 ? args[urlAt + 1] : null
const secondsAt = args.indexOf('--seconds')
const SAMPLE_SECONDS = secondsAt >= 0 ? Math.max(1, Number(args[secondsAt + 1]) || 20) : 20
// 4175 belongs to check-sim-removable.mjs; keep them apart.
const PORT = 4176
const WANTED_PEOPLE = 80
const SCENARIO_KEY = 'crowded'

const budgets = {
  overview: {
    fpsMin: real ? 55 : 10,
    callsMax: 600,
    trianglesMax: 1_500_000,
    tickMsMax: real ? 2 : 4,
    tickMsPeakMax: real ? 8 : 20,
  },
  floor: {
    fpsMin: real ? 55 : 10,
    callsMax: 350,
    trianglesMax: 900_000,
    tickMsMax: real ? 2 : 4,
    tickMsPeakMax: real ? 8 : 20,
  },
  follow: {
    fpsMin: real ? 55 : 10,
    callsMax: 600,
    trianglesMax: 1_500_000,
    tickMsMax: real ? 2 : 4,
    tickMsPeakMax: real ? 8 : 20,
  },
}

const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx'
let preview = null

async function waitForServer(url) {
  for (let i = 0; i < 120; i += 1) {
    try {
      const res = await fetch(url)
      if (res.ok) return
    } catch {
      // not up yet
    }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error(`Server did not start at ${url}`)
}

async function startServer() {
  if (givenUrl) return givenUrl
  const env = { ...process.env, VITE_DEBUG: '1' }
  delete env.VITE_E2E
  const build = spawnSync(npx, ['vite', 'build'], { cwd: rootDir, env, stdio: 'inherit' })
  if (build.status !== 0) throw new Error('Build failed')
  preview = spawn(npx, ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: rootDir,
    env,
    stdio: 'ignore',
    detached: true, // own process group, so the vite child dies with it
  })
  const url = `http://localhost:${PORT}/Dashboard-N8N-tasks/`
  await waitForServer(url)
  return url
}

async function triggerCrowdedScenario(page) {
  const scenarioButton = page.locator(`[data-sim-scenario="${SCENARIO_KEY}"]`).first()
  if (!(await scenarioButton.isVisible().catch(() => false))) {
    const toggle = page.locator('[data-sim-panel-toggle][aria-expanded="false"]').first()
    if (await toggle.isVisible().catch(() => false)) {
      await toggle.click()
      await scenarioButton.waitFor({ state: 'visible', timeout: 5_000 }).catch(() => {})
    }
  }
  if (await scenarioButton.isVisible().catch(() => false)) {
    await scenarioButton.click()
  } else {
    await page.evaluate((key) => {
      window.__office_debug?.sim?.runScenario?.(key)
    }, SCENARIO_KEY)
  }
}

async function measurePreset(page, seconds) {
  return page.evaluate(
    (secs) =>
      new Promise((resolve) => {
        const debug = window.__office_debug
        const frames = []
        let calls = 0
        let triangles = 0
        let tickMax = 0
        let tickSum = 0
        let mixersSum = 0
        let n = 0
        const started = performance.now()
        let last = started
        const step = (t) => {
          frames.push(t - last)
          last = t
          calls = Math.max(calls, debug.drawCalls)
          triangles = Math.max(triangles, debug.triangles)
          const tick = debug.director.tickMs()
          tickSum += tick
          tickMax = Math.max(tickMax, tick)
          mixersSum += debug.characters?.mixersPerSec ?? 0
          n += 1
          if (t - started < secs * 1000) requestAnimationFrame(step)
          else {
            const total = frames.reduce((a, b) => a + b, 0)
            const sorted = [...frames].sort((a, b) => a - b)
            const chars = debug.characters
            resolve({
              fps: (frames.length / total) * 1000,
              frameMsP95: sorted[Math.floor(sorted.length * 0.95)],
              drawCalls: calls,
              triangles,
              tickMsAvg: tickSum / n,
              tickMsMax: tickMax,
              people: debug.director.people().length,
              stats: debug.director.stats(),
              characters: chars
                ? {
                    assembled: chars.assembled,
                    total: chars.total,
                    queued: chars.queued,
                    failed: chars.failed,
                    cacheSize: chars.cacheSize,
                    mixersPerSec: Math.round((mixersSum / n) * 10) / 10,
                    avgAssemblyMs: chars.avgAssemblyMs,
                  }
                : null,
            })
          }
        }
        requestAnimationFrame(step)
      }),
    seconds,
  )
}

function checkPresetBudget(name, sample, budget, failures, warnings) {
  if (sample.fps < budget.fpsMin) {
    const message = `[${name}] fps ${sample.fps.toFixed(1)} < ${budget.fpsMin}`
    if (real) failures.push(message)
    else warnings.push(message)
  }
  if (sample.drawCalls > budget.callsMax) {
    failures.push(`[${name}] draw calls ${sample.drawCalls} > ${budget.callsMax}`)
  }
  if (sample.triangles > budget.trianglesMax) {
    failures.push(`[${name}] triangles ${sample.triangles} > ${budget.trianglesMax}`)
  }
  if (sample.tickMsAvg > budget.tickMsMax) {
    failures.push(`[${name}] director tick ${sample.tickMsAvg.toFixed(2)} ms > ${budget.tickMsMax} ms`)
  }
  if (sample.tickMsMax > budget.tickMsPeakMax) {
    failures.push(`[${name}] director tick peak ${sample.tickMsMax.toFixed(2)} ms > ${budget.tickMsPeakMax} ms`)
  }
  if (sample.people < WANTED_PEOPLE) {
    failures.push(`[${name}] only ${sample.people} people in the building (wanted ${WANTED_PEOPLE})`)
  }
  if (sample.stats?.teleports > 0) {
    failures.push(`[${name}] ${sample.stats.teleports} teleports`)
  }
  if (sample.characters && sample.characters.failed > 0) {
    failures.push(`[${name}] ${sample.characters.failed} failed character assemblies`)
  }
}

let exitCode = 0
let browser = null
try {
  const baseUrl = await startServer()
  browser = await chromium.launch({
    args: real
      ? ['--ignore-gpu-blocklist', '--enable-gpu', '--use-angle=metal']
      : ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  })
  const viewport = { width: 1440, height: 900 }
  const page = await browser.newPage({ viewport })
  await page.goto(`${baseUrl}#/login`)
  await page.locator('#login-email').fill('boss@example.com')
  await page.locator('#login-password').fill('123456')
  await page.locator('button[type="submit"]').click()
  await page.waitForSelector('[data-office-canvas][data-ready="true"]', { timeout: 120_000 })
  await page.waitForSelector('[data-office-canvas][data-assets="ready"]', { timeout: 120_000 })

  await page.locator('[data-sim-speed="30"]').first().click()
  await triggerCrowdedScenario(page)

  // Wait until 80 people are active and assembled in the building.
  const readCounts = () =>
    page.evaluate(() => {
      const dbg = window.__office_debug
      return {
        people: dbg?.director?.people().length ?? 0,
        assembled: dbg?.characters?.assembled ?? 0,
        queued: dbg?.characters?.queued ?? 0,
        failed: dbg?.characters?.failed ?? 0,
      }
    })
  const deadline = Date.now() + 90_000
  let counts = await readCounts()
  let lastTrigger = Date.now()
  while (
    (counts.people < WANTED_PEOPLE || counts.queued > 0 || counts.assembled < counts.people) &&
    Date.now() < deadline
  ) {
    await page.waitForTimeout(1000)
    counts = await readCounts()
    if (counts.people < WANTED_PEOPLE && Date.now() - lastTrigger > 8000) {
      await triggerCrowdedScenario(page)
      lastTrigger = Date.now()
    }
  }

  // 1. Overview preset
  const overviewBtn = page.locator('[data-camera-mode="overview"]').first()
  if (await overviewBtn.isVisible().catch(() => false)) {
    await overviewBtn.click()
    await page.waitForTimeout(500)
  }
  const overview = await measurePreset(page, SAMPLE_SECONDS)

  // 2. Floor focus preset (floor:cs per performance.md §1)
  const csFloor = page.locator('[data-floor-picker-item="cs"]').first()
  if (await csFloor.isVisible().catch(() => false)) {
    await csFloor.click()
    await page.waitForTimeout(800)
  }
  const floor = await measurePreset(page, SAMPLE_SECONDS)

  // 3. Follow preset (emp_linh or first person per performance.md §1)
  await page.evaluate(() => {
    const dbg = window.__office_debug
    const list = dbg?.director?.people() ?? []
    const preferred = list.find((p) => p.id === 'emp_linh')?.id ?? list[0]?.id ?? null
    if (preferred) dbg?.camera?.follow?.(preferred)
  })
  await page.waitForTimeout(800)
  const follow = await measurePreset(page, SAMPLE_SECONDS)

  const failures = []
  const warnings = []
  checkPresetBudget('overview', overview, budgets.overview, failures, warnings)
  checkPresetBudget('floor', floor, budgets.floor, failures, warnings)
  checkPresetBudget('follow', follow, budgets.follow, failures, warnings)

  const report = {
    mode: real ? 'real' : 'software',
    viewport,
    secondsPerPreset: SAMPLE_SECONDS,
    wantedPeople: WANTED_PEOPLE,
    scenario: SCENARIO_KEY,
    budgets,
    ...overview,
    presets: { overview, floor, follow },
    warnings,
    failures,
  }
  fs.writeFileSync(path.join(rootDir, 'perf-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  for (const w of warnings) console.warn(`perf:check warning: ${w}`)
  if (failures.length > 0) {
    console.error(`perf:check failed: ${failures.join('; ')}`)
    exitCode = 1
  }
} catch (error) {
  console.error(error)
  exitCode = 1
} finally {
  await browser?.close()
  if (preview?.pid) {
    try {
      process.kill(-preview.pid)
    } catch {
      // already gone
    }
  }
}
process.exit(exitCode)
