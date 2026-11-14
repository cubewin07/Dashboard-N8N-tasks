// Renders 256x256 WebP wardrobe thumbnails into public/assets/thumbs/ via headless Blender.
// Usage:
//   node scripts/thumbs-render.mjs [--allow-missing] [--only id1,id2] [--test path.glb]
import { execFileSync, spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { BLENDER, ROOT } from './lib/assets.mjs'

const version = execFileSync(BLENDER, ['--version'], { encoding: 'utf8' }).match(/Blender (\d+)\.(\d+)/)
if (!version || Number(version[1]) * 100 + Number(version[2]) < 402) {
  console.error(`Blender >= 4.2 is required (found ${version?.[0] ?? 'none'}). Set BLENDER_BIN.`)
  process.exit(1)
}

const script = join(ROOT, 'art', 'blender', 'render_thumbs.py')
const args = process.argv.slice(2)
const cmd = ['-b', '--factory-startup', '--python-exit-code', '1', '-P', script]
if (args.length > 0) cmd.push('--', ...args)

const res = spawnSync(BLENDER, cmd, { stdio: 'inherit' })
if (res.error) {
  console.error(res.error.message)
  process.exit(1)
}
process.exit(res.status ?? 1)
