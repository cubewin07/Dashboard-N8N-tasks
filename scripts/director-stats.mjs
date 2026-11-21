// Replays the golden day through the director at 30× and 120× for five idle
// seeds and prints the tuning table (P04-T14). Usage: npm run director:stats
import os from 'node:os'
import path from 'node:path'
import { createServer } from 'vite'

const rootDir = path.resolve(import.meta.dirname, '..')

const server = await createServer({
  root: rootDir,
  configFile: false,
  cacheDir: path.join(os.tmpdir(), 'ai-office-vite-director-stats'),
  resolve: { alias: { '@': path.join(rootDir, 'src') } },
  logLevel: 'silent',
  server: { middlewareMode: true, ws: false },
  appType: 'custom',
})

let failed = false
try {
  const { runDirector } = await server.ssrLoadModule(
    '/src/scene/director/__tests__/harness.ts',
  )
  const { TUNING } = await server.ssrLoadModule('/src/scene/director/tuning.ts')

  const rows = []
  for (const speed of [30, 120]) {
    for (const seed of ['1', '2', '3', '4', '5']) {
      let ticks = 0
      let backlogSum = 0
      let worstSum = 0
      let backlogPeak = 0
      const started = performance.now()
      const run = runDirector({
        speed,
        seed,
        onTick: (director) => {
          const s = director.stats()
          ticks += 1
          backlogSum += s.backlogTotal / Math.max(1, s.people)
          worstSum += s.backlogMax
          if (s.backlogMax > backlogPeak) backlogPeak = s.backlogMax
        },
      })
      const ms = performance.now() - started
      const s = run.director.stats()
      const trips = s.delivered + s.collapsed
      rows.push({
        speed: `${speed}×`,
        seed,
        delivered: s.delivered,
        'collapsed %': trips > 0 ? Number(((s.collapsed / trips) * 100).toFixed(1)) : 0,
        // Errands waiting per person, and for the busiest single person, averaged over the day.
        'avg backlog': Number((backlogSum / Math.max(1, ticks)).toFixed(2)),
        'avg worst': Number((worstSum / Math.max(1, ticks)).toFixed(2)),
        'peak backlog': backlogPeak,
        elevator: s.elevatorTrips,
        stairs: s.stairsTrips,
        teleports: s.teleports,
        warnings: run.warnings.length,
        'tick µs': Number(((ms / Math.max(1, ticks)) * 1000).toFixed(0)),
      })
      if (s.teleports > 0 || backlogPeak > TUNING.catchUp.maxBacklog) failed = true
    }
  }
  console.table(rows)
  const at30 = rows.filter((r) => r.speed === '30×')
  const avg = (key) => at30.reduce((sum, r) => sum + r[key], 0) / at30.length
  console.log(
    `30× targets: avg backlog ${avg('avg backlog').toFixed(2)} (< 1.5), collapsed ${avg('collapsed %').toFixed(1)} % (< 5 %)`,
  )
  if (avg('avg backlog') >= 1.5 || avg('collapsed %') >= 5) failed = true
} finally {
  await server.close()
}
process.exit(failed ? 1 : 0)
