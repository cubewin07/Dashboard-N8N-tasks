// Contact sheets per family (phase-06a §3.6): art/out/contact-sheet-<family>.png, <= 400 KB.
//   node scripts/art-sheets.mjs [family ...]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import sharp from 'sharp'
import { BLENDER, loadTargets, RAW_DIR, ROOT } from './lib/assets.mjs'

const want = process.argv.slice(2)
const targets = loadTargets()
const families = [...new Set(targets.map((t) => t.family))].filter((f) => !want.length || want.includes(f))
const tmp = join(ROOT, 'art', '.cache', 'sheets')
mkdirSync(tmp, { recursive: true })
mkdirSync(join(ROOT, 'art', 'out'), { recursive: true })
for (const family of families) {
  const files = targets.filter((t) => t.family === family)
    .map((t) => join(RAW_DIR, t.out.replace('public/assets/models/', ''))).filter(existsSync)
  if (!files.length) continue
  const raw = join(tmp, `${family}.png`)
  const res = spawnSync(BLENDER, ['-b', '--factory-startup', '--python-exit-code', '1', '-P',
    join(ROOT, 'art', 'blender', 'contact_sheet.py'), '--', '--out', raw, ...files], { encoding: 'utf8' })
  if (res.status !== 0) {
    console.error((res.stdout + res.stderr).split('\n').filter((l) => /Error|Traceback|File "/.test(l)).join('\n'))
    process.exit(1)
  }
  const out = join(ROOT, 'art', 'out', `contact-sheet-${family}.png`)
  for (const [width, colours] of [[1600, 96], [1600, 48], [1400, 48], [1200, 32], [1000, 32]]) {
    await sharp(raw).resize({ width }).png({ palette: true, colours, effort: 10, dither: 0.6 }).toFile(out)
    if (statSync(out).size <= 400 * 1024) break
  }
  console.log(`${family}: ${files.length} model(s) -> art/out/contact-sheet-${family}.png (${(statSync(out).size / 1024).toFixed(0)} KB)`)
}
