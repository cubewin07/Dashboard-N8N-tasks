// Records one replay log per P05 demo scenario (P05-T15) into e2e/fixtures/.
// Run: node e2e/fixtures/record-scenarios.mjs
// Same bundle format as scripts/record-golden.mjs (ReplayLogBundle), so the
// files load with `#/office?feed=replay&log=…` once served, and in tests.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

const rootDir = path.resolve(import.meta.dirname, '../..')
const outDir = path.join(rootDir, 'e2e/fixtures')

/** key, seed, sim minutes to run after the scenario button. */
const RECORDINGS = [
  { key: 'busy_day', seed: 501, minutes: 5 },
  { key: 'long_queue', seed: 502, minutes: 5 },
  { key: 'lunch', seed: 503, minutes: 5 },
]

const server = await createServer({
  root: rootDir,
  configFile: false,
  cacheDir: path.join(os.tmpdir(), 'ai-office-vite-record-scenarios'),
  resolve: { alias: { '@': path.join(rootDir, 'src') } },
  logLevel: 'silent',
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
})

try {
  const { makeSeedConfig } = await server.ssrLoadModule('/src/domain/__fixtures__/builders.ts')
  const { applyAll, initialState } = await server.ssrLoadModule('/src/domain/reducer.ts')
  const { createSimFeed } = await server.ssrLoadModule('/src/adapters/sim/SimFeed.ts')
  const { DEFAULT_SIM_START_ISO } = await server.ssrLoadModule('/src/adapters/sim/clock.ts')
  const { hashOfficeState } = await server.ssrLoadModule('/src/adapters/replay/ReplayFeed.ts')

  for (const rec of RECORDINGS) {
    const config = makeSeedConfig()
    const feed = createSimFeed({
      seed: rec.seed,
      speed: 30,
      autoStartTimer: false,
      bindGlobalControls: false,
    })
    const events = []
    await feed.start(config)
    feed.subscribe((batch) => events.push(...batch))
    feed.runScenario(rec.key)
    const simDurationMs = rec.minutes * 60_000
    feed.stepSimMs(simDurationMs)

    const replayed = applyAll(initialState(config, DEFAULT_SIM_START_ISO), events)
    const stateHash = hashOfficeState(replayed)
    const head = {
      seed: rec.seed,
      scenario: rec.key,
      simDurationMs,
      startIso: DEFAULT_SIM_START_ISO,
      endIso: feed.now(),
      stateHash,
    }
    const headJson = JSON.stringify(head).slice(0, -1)
    const body = events.map((e) => JSON.stringify(e)).join(',\n')
    const file = path.join(outDir, `scenario-${rec.key}.json`)
    fs.writeFileSync(file, `${headJson},"events":[\n${body}\n]}\n`, 'utf8')
    console.log(`OK: ${path.relative(rootDir, file)} (${events.length} events, hash ${stateHash})`)
  }
} finally {
  await server.close()
}
