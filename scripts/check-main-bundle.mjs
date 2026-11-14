import fs from 'node:fs'
import path from 'node:path'

const assetsDir = path.resolve(import.meta.dirname, '../dist/assets')
if (!fs.existsSync(assetsDir)) {
  console.error('Error: dist/assets directory not found. Run `npm run build` first.')
  process.exit(1)
}

const mainChunks = fs
  .readdirSync(assetsDir)
  .filter((f) => f.startsWith('index-') && f.endsWith('.js'))

if (mainChunks.length === 0) {
  console.error('Error: No main bundle chunk (dist/assets/index-*.js) found.')
  process.exit(1)
}

const forbidden = ['WebGLRenderer', 'THREE.', 'PerspectiveCamera']
for (const file of mainChunks) {
  const fullPath = path.join(assetsDir, file)
  const content = fs.readFileSync(fullPath, 'utf8')
  for (const token of forbidden) {
    if (content.includes(token)) {
      console.error(`Error: Main bundle chunk ${file} contains forbidden 3D token "${token}".`)
      process.exit(1)
    }
  }
  const sizeKb = (Buffer.byteLength(content, 'utf8') / 1024).toFixed(1)
  console.log(`OK: ${file} (${sizeKb} KB raw) contains no three.js / R3F code.`)
}
