import { execSync, spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { chromium } from '@playwright/test'

const projectRoot = path.resolve(import.meta.dirname, '..')
const outDir = path.resolve(projectRoot, 'dist-nosim')
const baseUrl = 'http://localhost:4175/Dashboard-N8N-tasks/'

async function waitForServer(url, timeoutMs = 20000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(url)
      if (res.ok || res.status === 200 || res.status === 304) {
        return
      }
    } catch {
      // server starting up
    }
    await new Promise((r) => setTimeout(r, 200))
  }
  throw new Error(`Preview server at ${url} did not respond within ${timeoutMs}ms`)
}

async function main() {
  let previewProcess = null
  let browser = null

  try {
    // 1. Build with static feed and sim stub
    console.log('1. Building with VITE_FEED=static, VITE_SIM_STUB=1, VITE_E2E=1...')
    execSync('npx vite build --outDir dist-nosim', {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        VITE_FEED: 'static',
        VITE_SIM_STUB: '1',
        VITE_E2E: '1',
      },
    })

    // 2. Read all .js files in dist-nosim/assets/ and assert absence of forbidden tokens
    console.log('2. Checking dist-nosim/assets/*.js for leaked sim tokens...')
    const assetsDir = path.join(outDir, 'assets')
    if (!fs.existsSync(assetsDir)) {
      throw new Error(`Assets directory not found at ${assetsDir}`)
    }

    const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
    if (jsFiles.length === 0) {
      throw new Error(`No .js files found in ${assetsDir}`)
    }

    const forbiddenTokens = ['angry_refund', 'data-sim-control-panel']
    for (const file of jsFiles) {
      const content = fs.readFileSync(path.join(assetsDir, file), 'utf8')
      for (const token of forbiddenTokens) {
        if (content.includes(token)) {
          throw new Error(
            `Simulator leakage: ${file} contains forbidden token "${token}"`,
          )
        }
      }
    }
    console.log(
      `OK: All ${jsFiles.length} JS assets are free of simulator tokens.`,
    )

    // 3. Spawn preview server and run Playwright verification
    console.log('3. Spawning vite preview on port 4175...')
    previewProcess = spawn(
      'npx',
      [
        'vite',
        'preview',
        '--outDir',
        'dist-nosim',
        '--port',
        '4175',
        '--strictPort',
      ],
      {
        cwd: projectRoot,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
      },
    )

    previewProcess.stderr?.on('data', (d) => {
      const msg = d.toString()
      if (msg.includes('error') || msg.includes('Error')) {
        console.error(`[preview server error] ${msg}`)
      }
    })

    await waitForServer(baseUrl, 20000)
    console.log('Preview server is responding.')

    console.log('Launching Playwright Chromium...')
    browser = await chromium.launch({
      headless: true,
      args: [
        '--use-gl=swiftshader',
        '--enable-unsafe-swiftshader',
        '--ignore-gpu-blocklist',
      ],
    })

    const page = await browser.newPage()

    console.log('Logging in at #/login...')
    await page.goto(`${baseUrl}#/login`)
    await page.locator('#login-email').fill('boss@example.com')
    await page.locator('#login-password').fill('123456')
    await page.locator('button[type="submit"]').click()

    console.log(
      'Verifying #/ renders [data-office-canvas] and [data-sim-control-panel] has count 0...',
    )
    await page.waitForURL(/#\/$/)
    await page
      .locator('[data-office-canvas]')
      .waitFor({ state: 'visible', timeout: 15000 })

    const simPanelCount = await page.locator('[data-sim-control-panel]').count()
    if (simPanelCount !== 0) {
      throw new Error(
        `Expected [data-sim-control-panel] count to be 0, got ${simPanelCount}`,
      )
    }
    console.log(
      'OK: #/ rendered [data-office-canvas] and [data-sim-control-panel] count is 0.',
    )

    console.log('Navigating to #/org...')
    await page.goto(`${baseUrl}#/org`)
    await page
      .locator('[data-org-list]')
      .waitFor({ state: 'visible', timeout: 15000 })

    const employeeCount = await page.locator('[data-employee-id]').count()
    if (employeeCount !== 28) {
      throw new Error(
        `Expected [data-employee-id] count to be 28, got ${employeeCount}`,
      )
    }
    console.log('OK: #/org rendered [data-org-list] with 28 employees.')

    console.log('Simulator removability check PASSED.')
  } finally {
    if (browser) {
      try {
        await browser.close()
      } catch {}
    }
    if (previewProcess) {
      try {
        if (previewProcess.pid && process.platform !== 'win32') {
          process.kill(-previewProcess.pid, 'SIGTERM')
        } else {
          previewProcess.kill('SIGTERM')
        }
      } catch {}
    }
    if (fs.existsSync(outDir)) {
      try {
        fs.rmSync(outDir, { recursive: true, force: true })
      } catch (err) {
        console.warn('Warning: failed to clean up dist-nosim:', err)
      }
    }
  }
}

main().catch((err) => {
  console.error('Simulator removability check FAILED:', err)
  process.exit(1)
})
