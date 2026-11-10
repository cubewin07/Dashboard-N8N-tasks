// Runs the Blender generators headless: art/blender/gen_<family>.py -> art/.cache/raw/<category>/*.glb
//   node scripts/art-build.mjs [all | <family> ...] [--only name,name]
import { execFileSync, spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { BLENDER, RAW_DIR, ROOT } from './lib/assets.mjs'

const args = process.argv.slice(2)
const onlyIdx = args.indexOf('--only')
const only = onlyIdx >= 0 ? args.splice(onlyIdx, 2)[1] : null
const dir = join(ROOT, 'art', 'blender')
const all = readdirSync(dir).filter((f) => /^gen_.*\.py$/.test(f) && f !== 'gen_palette.py').map((f) => f.slice(4, -3)).sort()
const families = args.length === 0 || args.includes('all') ? all : args

const version = execFileSync(BLENDER, ['--version'], { encoding: 'utf8' }).match(/Blender (\d+)\.(\d+)/)
if (!version || Number(version[1]) * 100 + Number(version[2]) < 402) {
  console.error(`Blender >= 4.2 is required (found ${version?.[0] ?? 'none'}). Set BLENDER_BIN.`)
  process.exit(1)
}
execFileSync('python3', [join(dir, 'gen_palette.py')], { stdio: 'inherit' })

let failed = false
for (const family of families) {
  if (!all.includes(family)) {
    console.error(`unknown family: ${family} (have: ${all.join(', ')})`)
    process.exit(1)
  }
  const cmd = ['-b', '--factory-startup', '--python-exit-code', '1', '-P', join(dir, `gen_${family}.py`), '--', '--out', RAW_DIR]
  if (only) cmd.push('--only', only)
  const res = spawnSync(BLENDER, cmd, { encoding: 'utf8' })
  const lines = (res.stdout + res.stderr).split('\n')
  const built = lines.filter((l) => l.startsWith('BUILT'))
  console.log(`[${family}] ${built.length} model(s)`)
  for (const l of built) console.log('  ' + l.slice(6))
  if (res.status !== 0) {
    failed = true
    console.error(lines.filter((l) => /Error|Traceback|File "|^\s+\^|unknown palette/.test(l)).join('\n'))
  }
}
process.exit(failed ? 1 : 0)
