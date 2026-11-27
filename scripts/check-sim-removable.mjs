// P11-T09 / R5: build with the simulator aliased to src/adapters/_nosim and prove that
// none of its code or content ends up in the bundle. The browser half of the proof is
// the `no-sim` CI job (smoke + e2e/no-sim.spec.ts against a VITE_FEED=none build).
//
//   node scripts/check-sim-removable.mjs          build into dist-nosim, scan, clean up
//   node scripts/check-sim-removable.mjs --dist   scan an existing dist/ (already built
//                                                 with VITE_FEED=none)
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const projectRoot = path.resolve(import.meta.dirname, '..')
const scanExisting = process.argv.includes('--dist')
const outDir = path.join(projectRoot, scanExisting ? 'dist' : 'dist-nosim')

// Strings that exist only inside src/adapters/sim (scenario keys, the control panel).
const FORBIDDEN = ['angry_refund', 'data-sim-control-panel', 'SimClock', 'runScenario(']

try {
  if (!scanExisting) {
    console.log('Building with VITE_FEED=none (sim aliased to adapters/_nosim)…')
    execSync('npx vite build --outDir dist-nosim', {
      cwd: projectRoot,
      stdio: 'inherit',
      env: { ...process.env, VITE_FEED: 'none', VITE_E2E: '1' },
    })
  }

  const assetsDir = path.join(outDir, 'assets')
  if (!fs.existsSync(assetsDir)) throw new Error(`No assets at ${assetsDir}`)
  const jsFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.js'))
  if (jsFiles.length === 0) throw new Error(`No .js files in ${assetsDir}`)

  const leaks = []
  for (const file of jsFiles) {
    const content = fs.readFileSync(path.join(assetsDir, file), 'utf8')
    for (const token of FORBIDDEN) {
      if (content.includes(token)) leaks.push(`${file} contains "${token}"`)
    }
  }
  if (leaks.length) throw new Error(`Simulator code leaked into the build:\n- ${leaks.join('\n- ')}`)
  console.log(`OK: ${jsFiles.length} JS files, no simulator code.`)
} catch (err) {
  console.error('Simulator removability check FAILED:', err instanceof Error ? err.message : err)
  process.exitCode = 1
} finally {
  if (!scanExisting) fs.rmSync(outDir, { recursive: true, force: true })
}
