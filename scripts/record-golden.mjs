import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

const rootDir = path.resolve(import.meta.dirname, '..')
const outPath = path.join(
  rootDir,
  'src/domain/__fixtures__/golden/day-seed-1.json',
)

const server = await createServer({
  root: rootDir,
  configFile: false,
  cacheDir: path.join(os.tmpdir(), 'ai-office-vite-record-golden'),
  resolve: {
    alias: {
      '@': path.join(rootDir, 'src'),
    },
  },
  logLevel: 'silent',
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
})

try {
  const { makeSeedConfig } = await server.ssrLoadModule(
    '/src/domain/__fixtures__/builders.ts',
  )
  const { applyAll, initialState } = await server.ssrLoadModule(
    '/src/domain/reducer.ts',
  )
  const { createSimFeed } = await server.ssrLoadModule(
    '/src/adapters/sim/SimFeed.ts',
  )
  const { DEFAULT_SIM_START_ISO } = await server.ssrLoadModule(
    '/src/adapters/sim/clock.ts',
  )
  const { hashOfficeState } = await server.ssrLoadModule(
    '/src/adapters/replay/ReplayFeed.ts',
  )

  const config = makeSeedConfig()
  const feed = createSimFeed({
    seed: 1,
    speed: 30,
    autoStartTimer: false,
    bindGlobalControls: false,
  })

  const events = []
  await feed.start(config)
  feed.subscribe((batch) => {
    events.push(...batch)
  })

  // One sim workday: 9.5 hours (08:00 -> 17:30 ICT) = 34,200,000 sim-ms
  const simDurationMs = 9.5 * 3_600_000
  feed.stepSimMs(simDurationMs)

  const replayedState = applyAll(
    initialState(config, DEFAULT_SIM_START_ISO),
    events,
  )
  const stateHash = hashOfficeState(replayedState)

  const bundle = {
    seed: 1,
    simDurationMs,
    startIso: DEFAULT_SIM_START_ISO,
    endIso: feed.now(),
    stateHash,
    events,
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true })
  // One event per line keeps diffs reviewable and the file ~10x smaller.
  const { events: evs, ...head } = bundle
  const headJson = JSON.stringify(head).slice(0, -1)
  const body = evs.map((e) => JSON.stringify(e)).join(',\n')
  fs.writeFileSync(
    outPath,
    `${headJson},"events":[\n${body}\n]}\n`,
    'utf8',
  )
  console.log(
    `OK: Recorded golden log to src/domain/__fixtures__/golden/day-seed-1.json (${events.length} events, hash ${stateHash}).`,
  )
} finally {
  await server.close()
}
