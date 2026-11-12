// Performance check for the 3D office (P04-T15, phase-04-people.md §3.9).
//
//   npm run perf:check            software GL thresholds (CI)
//   npm run perf:check -- --real  real GPU thresholds (R15, run on the Mac)
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
const PORT = 4175
const SAMPLE_SECONDS = 20
const WANTED_PEOPLE = 60

const thresholds = real
  ? { fpsMin: 55, callsMax: 250, tickMsMax: 2 }
  : { fpsMin: 10, callsMax: 250, tickMsMax: 4 }

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
  })
  const url = `http://localhost:${PORT}/Dashboard-N8N-tasks/`
  await waitForServer(url)
  return url
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
  await page.waitForSelector('[data-office-canvas][data-assets="ready"]', { timeout: 120_000 })

  await page.locator('[data-sim-speed="30"]').first().click()
  await page.locator('[data-sim-scenario="hire_temps"]').first().click()
  // Hires walk in over a while; top up until the building is as full as R15 asks.
  const count = () => page.evaluate(() => window.__office_debug?.director?.people().length ?? 0)
  const deadline = Date.now() + 90_000
  let lastCount = await count()
  let lastClick = Date.now()
  while (lastCount < WANTED_PEOPLE && Date.now() < deadline) {
    await page.waitForTimeout(1000)
    const now = await count()
    if (now === lastCount && Date.now() - lastClick > 8000) {
      await page.locator('[data-sim-scenario="hire_temps"]').first().click()
      lastClick = Date.now()
    }
    lastCount = now
  }

  const sample = await page.evaluate(
    (seconds) =>
      new Promise((resolve) => {
        const debug = window.__office_debug
        const frames = []
        let calls = 0
        let triangles = 0
        let tickMax = 0
        let tickSum = 0
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
          n += 1
          if (t - started < seconds * 1000) requestAnimationFrame(step)
          else {
            const total = frames.reduce((a, b) => a + b, 0)
            const sorted = [...frames].sort((a, b) => a - b)
            resolve({
              fps: (frames.length / total) * 1000,
              frameMsP95: sorted[Math.floor(sorted.length * 0.95)],
              drawCalls: calls,
              triangles,
              tickMsAvg: tickSum / n,
              tickMsMax: tickMax,
              people: debug.director.people().length,
              stats: debug.director.stats(),
            })
          }
        }
        requestAnimationFrame(step)
      }),
    SAMPLE_SECONDS,
  )

  const failures = []
  // Software GL frame rate depends on the CI machine far more than on the
  // scene (≈ 9–10 fps on an M-series Mac): recorded and warned about there,
  // required only on a real GPU.
  const warnings = []
  if (sample.fps < thresholds.fpsMin) {
    const message = `fps ${sample.fps.toFixed(1)} < ${thresholds.fpsMin}`
    if (real) failures.push(message)
    else warnings.push(message)
  }
  if (sample.drawCalls > thresholds.callsMax)
    failures.push(`draw calls ${sample.drawCalls} > ${thresholds.callsMax}`)
  if (sample.tickMsAvg > thresholds.tickMsMax)
    failures.push(`director tick ${sample.tickMsAvg.toFixed(2)} ms > ${thresholds.tickMsMax} ms`)
  if (sample.stats?.teleports > 0) failures.push(`${sample.stats.teleports} teleports`)

  const report = {
    mode: real ? 'real' : 'software',
    viewport,
    seconds: SAMPLE_SECONDS,
    wantedPeople: WANTED_PEOPLE,
    thresholds,
    ...sample,
    warnings,
    failures,
  }
  fs.writeFileSync(path.join(rootDir, 'perf-report.json'), `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))
  if (sample.people < WANTED_PEOPLE) {
    console.warn(`Note: only ${sample.people} people were in the building (wanted ${WANTED_PEOPLE}).`)
  }
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
  preview?.kill()
}
process.exit(exitCode)
