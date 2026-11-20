// Garment layering matrix (P08a-T10): inner garments must not poke through the layer worn over them.
// Runs art/blender/test_layering.py headless; reads the raw fitted GLBs in art/.cache/raw/wardrobe.
// Usage:
//   node scripts/layering-test.mjs [--only id1,id2] [--threshold-mm 5]
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { BLENDER, ROOT } from './lib/assets.mjs'

const script = join(ROOT, 'art', 'blender', 'test_layering.py')
const args = process.argv.slice(2)
const cmd = ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script]
if (args.length > 0) cmd.push('--', ...args)

const res = spawnSync(BLENDER, cmd, { stdio: 'inherit' })
if (res.error) {
  console.error(res.error.message)
  process.exit(1)
}
process.exit(res.status ?? 1)
