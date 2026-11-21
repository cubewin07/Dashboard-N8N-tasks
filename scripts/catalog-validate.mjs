// Validates src/content/catalog/*.json (face-atlas.json, colors.json, and slot files).
// Usage:
//   node scripts/catalog-validate.mjs          # schema & cross-reference validation
//   node scripts/catalog-validate.mjs --files  # also verify GLB, thumb, and atlas files exist under public/assets
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const CONTENT_DIR = process.env.CONTENT_DIR
  ? resolve(process.env.CONTENT_DIR)
  : join(ROOT, 'src', 'content')
const CATALOG_DIR = join(CONTENT_DIR, 'catalog')
const ASSETS_DIR = join(ROOT, 'public', 'assets')
const checkFiles = process.argv.includes('--files')

const VALID_SLOTS = new Set([
  'hair', 'eyes', 'brows', 'mouth', 'facial_hair',
  'top', 'bottom', 'fullbody', 'outer', 'shoes',
  'head', 'glasses', 'ears', 'neck', 'wrist', 'bag',
])
const VALID_BASES = new Set(['female', 'male'])
const VALID_ATTACH_BONES = new Set(['Head', 'Neck', 'Spine2', 'LeftHand', 'RightHand', 'LeftForeArm'])
const VALID_TINT_REGIONS = new Set(['primary', 'secondary', 'accent'])
const VALID_BODY_KEYS = new Set(['height', 'build', 'muscle', 'chest', 'hips', 'shoulders'])

const errors = []
const fail = (where, msg) => errors.push(`  - [${where}] ${msg}`)

function readJson(filePath, label) {
  if (!existsSync(filePath)) {
    fail(label, 'file does not exist')
    return null
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8'))
  } catch (err) {
    fail(label, `invalid JSON: ${err.message}`)
    return null
  }
}

const nonEmptyStr = (v) => typeof v === 'string' && v.trim().length > 0

// 1. Load palette3d.json
const palette = readJson(join(CONTENT_DIR, 'palette3d.json'), 'palette3d.json')
const paletteKeys = new Set()
if (palette && Array.isArray(palette.swatches)) {
  for (const sw of palette.swatches) {
    if (nonEmptyStr(sw?.key)) paletteKeys.add(sw.key)
  }
} else {
  fail('palette3d.json', 'missing swatches array')
}

// 2. Validate face-atlas.json
const faceAtlas = readJson(join(CATALOG_DIR, 'face-atlas.json'), 'catalog/face-atlas.json')
const faceCells = new Map()
if (faceAtlas && typeof faceAtlas === 'object') {
  const grid = faceAtlas.grid
  if (typeof faceAtlas.size !== 'number' || faceAtlas.size <= 0) {
    fail('catalog/face-atlas.json', 'size must be a positive number')
  }
  if (typeof grid !== 'number' || !Number.isInteger(grid) || grid <= 0) {
    fail('catalog/face-atlas.json', 'grid must be a positive integer')
  }
  const isCell = (c) =>
    Array.isArray(c) &&
    c.length === 2 &&
    Number.isInteger(c[0]) &&
    Number.isInteger(c[1]) &&
    c[0] >= 0 &&
    c[1] >= 0 &&
    (typeof grid !== 'number' || (c[0] < grid && c[1] < grid))

  if (!faceAtlas.defaults || typeof faceAtlas.defaults !== 'object') {
    fail('catalog/face-atlas.json', 'missing defaults object')
  } else {
    for (const k of ['eyes', 'brows', 'mouth']) {
      if (!isCell(faceAtlas.defaults[k])) {
        fail('catalog/face-atlas.json', `defaults.${k} must be a valid [col, row] cell`)
      }
    }
  }
  if (!faceAtlas.eyeStates || typeof faceAtlas.eyeStates !== 'object') {
    fail('catalog/face-atlas.json', 'missing eyeStates object')
  } else {
    for (const k of ['open', 'half', 'closed', 'happy']) {
      if (!Number.isInteger(faceAtlas.eyeStates[k]) || faceAtlas.eyeStates[k] < 0) {
        fail('catalog/face-atlas.json', `eyeStates.${k} must be a non-negative integer`)
      }
    }
  }
  if (!faceAtlas.cells || typeof faceAtlas.cells !== 'object') {
    fail('catalog/face-atlas.json', 'missing cells object')
  } else {
    for (const [id, cell] of Object.entries(faceAtlas.cells)) {
      if (!isCell(cell)) {
        fail('catalog/face-atlas.json', `cells.${id} must be a valid [col, row] cell`)
      } else {
        faceCells.set(id, cell)
      }
    }
  }
}

if (checkFiles) {
  const atlasImg = join(ASSETS_DIR, 'textures', 'face_atlas.png')
  if (!existsSync(atlasImg)) fail('public/assets/textures/face_atlas.png', 'file missing (--files)')
}

// 3. Validate colors.json
const colors = readJson(join(CATALOG_DIR, 'colors.json'), 'catalog/colors.json')
if (colors && typeof colors === 'object') {
  for (const group of ['skin', 'hair', 'eyes', 'fabric', 'lip']) {
    const list = colors[group]
    if (!Array.isArray(list) || list.length === 0) {
      fail('catalog/colors.json', `${group} must be a non-empty array`)
      continue
    }
    const seen = new Set()
    list.forEach((entry, idx) => {
      const at = `catalog/colors.json:${group}[${idx}]`
      if (!entry || typeof entry !== 'object') {
        fail(at, 'entry must be an object')
        return
      }
      if (!nonEmptyStr(entry.key)) {
        fail(at, 'key must be a non-empty string')
      } else {
        if (seen.has(entry.key)) fail(at, `duplicate colour key "${entry.key}" in ${group}`)
        seen.add(entry.key)
        if (!paletteKeys.has(entry.key)) {
          fail(at, `swatch key "${entry.key}" does not exist in palette3d.json`)
        }
      }
      if (!nonEmptyStr(entry.label?.vi) || !nonEmptyStr(entry.label?.en)) {
        fail(at, 'label.vi and label.en must be non-empty strings')
      }
    })
  }
}

// 4. Validate slot catalogue files
const seenIds = new Set()
let totalItems = 0
let slotFileCount = 0

if (!existsSync(CATALOG_DIR)) {
  fail('src/content/catalog', 'directory does not exist')
} else {
  const files = readdirSync(CATALOG_DIR)
    .filter((f) => f.endsWith('.json') && f !== 'colors.json' && f !== 'face-atlas.json')
    .sort()

  for (const file of files) {
    slotFileCount++
    const fileSlot = basename(file, '.json')
    const relFile = `catalog/${file}`
    if (!VALID_SLOTS.has(fileSlot)) {
      fail(relFile, `filename slot "${fileSlot}" is not a valid WardrobeSlot`)
    }
    const doc = readJson(join(CATALOG_DIR, file), relFile)
    if (!doc || !Array.isArray(doc.items)) {
      fail(relFile, 'root must be an object with an items array')
      continue
    }

    doc.items.forEach((item, idx) => {
      totalItems++
      const at = `${relFile}:items[${idx}]`
      if (!item || typeof item !== 'object') {
        fail(at, 'item must be an object')
        return
      }

      // id
      if (!nonEmptyStr(item.id)) {
        fail(at, 'id must be a non-empty string')
      } else {
        if (seenIds.has(item.id)) fail(at, `duplicate item id "${item.id}"`)
        seenIds.add(item.id)
      }

      // slot
      if (!VALID_SLOTS.has(item.slot)) {
        fail(at, `invalid slot "${item.slot}"`)
      } else if (item.slot !== fileSlot) {
        fail(at, `item.slot "${item.slot}" does not match file slot "${fileSlot}"`)
      }

      // label
      if (!nonEmptyStr(item.label?.vi) || !nonEmptyStr(item.label?.en)) {
        fail(at, 'label.vi and label.en must be non-empty strings')
      }

      // bases
      const baseSet = new Set()
      if (!Array.isArray(item.bases) || item.bases.length === 0) {
        fail(at, 'bases must be a non-empty array')
      } else {
        for (const b of item.bases) {
          if (!VALID_BASES.has(b)) fail(at, `invalid base "${b}" in bases`)
          else if (baseSet.has(b)) fail(at, `duplicate base "${b}" in bases`)
          else baseSet.add(b)
        }
      }

      // model / faceTile consistency
      const isFaceSlot = item.slot === 'eyes' || item.slot === 'brows' || item.slot === 'mouth'
      if (item.model === null) {
        if (!item.faceTile || item.faceTile.atlas !== 'face' || !Array.isArray(item.faceTile.cell) || item.faceTile.cell.length !== 2) {
          fail(at, 'model is null so faceTile { atlas: "face", cell: [col, row] } is required')
        } else {
          const expected = faceCells.get(item.id)
          if (!expected) {
            fail(at, `faceTile id "${item.id}" not found in face-atlas.json cells`)
          } else if (expected[0] !== item.faceTile.cell[0] || expected[1] !== item.faceTile.cell[1]) {
            fail(at, `faceTile cell [${item.faceTile.cell}] differs from face-atlas.json [${expected}]`)
          }
        }
      } else if (item.model && typeof item.model === 'object' && !Array.isArray(item.model)) {
        if (isFaceSlot) {
          fail(at, `face slot "${item.slot}" must have model: null`)
        }
        if (item.faceTile !== undefined) {
          fail(at, 'non-null model item should not define faceTile')
        }
        for (const b of baseSet) {
          if (!nonEmptyStr(item.model[b])) {
            fail(at, `bases includes "${b}" but model.${b} is missing/empty`)
          }
        }
        for (const [k, p] of Object.entries(item.model)) {
          if (!baseSet.has(k)) {
            fail(at, `model.${k} is present but "${k}" is not in bases`)
          }
          if (!nonEmptyStr(p) || !p.endsWith('.glb')) {
            fail(at, `model.${k} must be a .glb path`)
          } else if (checkFiles && !existsSync(join(ASSETS_DIR, p))) {
            fail(at, `model file missing (--files): public/assets/${p}`)
          }
        }
      } else {
        fail(at, 'model must be null or an object mapping base -> .glb path')
      }

      // thumb
      if (!nonEmptyStr(item.thumb)) {
        fail(at, 'thumb must be a non-empty string')
      } else if (checkFiles && !existsSync(join(ASSETS_DIR, item.thumb))) {
        fail(at, `thumb file missing (--files): public/assets/${item.thumb}`)
      }

      // attach
      if (item.attach !== 'skinned') {
        if (!item.attach || typeof item.attach !== 'object' || !VALID_ATTACH_BONES.has(item.attach.bone)) {
          fail(at, 'attach must be "skinned" or { bone: <valid attach bone> }')
        }
      }

      // tint
      if (item.tint !== null) {
        if (!item.tint || typeof item.tint !== 'object') {
          fail(at, 'tint must be null or { regions, defaults }')
        } else {
          if (!Array.isArray(item.tint.regions) || item.tint.regions.length === 0) {
            fail(at, 'tint.regions must be a non-empty array')
          } else {
            const rSet = new Set()
            for (const r of item.tint.regions) {
              if (!VALID_TINT_REGIONS.has(r)) fail(at, `invalid tint region "${r}"`)
              rSet.add(r)
              const defKey = item.tint.defaults?.[r]
              if (!nonEmptyStr(defKey)) {
                fail(at, `tint.defaults.${r} is missing`)
              } else if (!paletteKeys.has(defKey)) {
                fail(at, `tint.defaults.${r} ("${defKey}") does not exist in palette3d.json`)
              }
            }
            if (item.tint.defaults && typeof item.tint.defaults === 'object') {
              for (const k of Object.keys(item.tint.defaults)) {
                if (!rSet.has(k)) fail(at, `tint.defaults.${k} has no matching entry in tint.regions`)
              }
            }
          }
        }
      }

      // hides
      if (!Array.isArray(item.hides)) {
        fail(at, 'hides must be an array')
      } else {
        for (const h of item.hides) {
          if (!VALID_SLOTS.has(h)) fail(at, `invalid slot "${h}" in hides`)
        }
      }

      // optional requires
      if (item.requires !== undefined) {
        if (!Array.isArray(item.requires)) {
          fail(at, 'requires must be an array when present')
        } else {
          for (const req of item.requires) {
            if (!VALID_SLOTS.has(req)) fail(at, `invalid slot "${req}" in requires`)
          }
        }
      }

      // optional bodyLimits
      if (item.bodyLimits !== undefined) {
        if (!item.bodyLimits || typeof item.bodyLimits !== 'object' || Array.isArray(item.bodyLimits)) {
          fail(at, 'bodyLimits must be an object when present')
        } else {
          for (const [bk, range] of Object.entries(item.bodyLimits)) {
            if (!VALID_BODY_KEYS.has(bk)) fail(at, `invalid bodyLimits key "${bk}"`)
            if (
              !Array.isArray(range) ||
              range.length !== 2 ||
              typeof range[0] !== 'number' ||
              typeof range[1] !== 'number' ||
              range[0] < 0 ||
              range[1] > 1 ||
              range[0] > range[1]
            ) {
              fail(at, `bodyLimits.${bk} must be [min, max] within 0..1`)
            }
          }
        }
      }

      // tags
      if (!Array.isArray(item.tags) || item.tags.some((t) => !nonEmptyStr(t))) {
        fail(at, 'tags must be an array of non-empty strings')
      }

      // credit (credits.json is a flat list by file path, so require a non-empty credit string here)
      if (!nonEmptyStr(item.credit)) {
        fail(at, 'credit must be a non-empty string')
      }
    })
  }
}

if (errors.length > 0) {
  console.error(`catalog:validate FAILED (${errors.length} error(s)):`)
  for (const e of errors) console.error(e)
  process.exit(1)
}

console.log(
  `OK: Validated ${totalItems} catalog items across ${slotFileCount} slot files + colors.json + face-atlas.json${checkFiles ? ' (--files)' : ''}.`,
)
