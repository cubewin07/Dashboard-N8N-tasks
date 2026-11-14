import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import faceAtlasJson from '@/content/catalog/face-atlas.json'
import {
  applyFaceCells,
  BLINK_MAX_INTERVAL_S,
  BLINK_MIN_INTERVAL_S,
  createBlinkState,
  createFaceRegions,
  stepBlink,
  type EyeState,
} from '../faceAnim'

function makeUvAndColorAttributes() {
  // 2 body vertices (region 0/2 -> low R) + 4 eye (1,0,0) + 4 brow (0,1,0) + 4 mouth (0,0,1)
  const total = 14
  const uvs = new Float32Array(total * 2)
  const colors = new Float32Array(total * 3)

  // Body vertices at skin_01 cell center (0.5/16, 7.5/16)
  for (let i = 0; i < 2; i += 1) {
    uvs[i * 2] = 0.5 / 16
    uvs[i * 2 + 1] = 7.5 / 16
    colors[i * 3] = 0.01 // not > 0.5
  }

  const writeQuad = (start: number, col: number, row: number, r: number, g: number, b: number) => {
    const u0 = col / 8
    const u1 = (col + 1) / 8
    const v0 = row / 8
    const v1 = (row + 1) / 8
    const coords = [
      [u0, v1],
      [u1, v1],
      [u1, v0],
      [u0, v0],
    ]
    for (let k = 0; k < 4; k += 1) {
      const vi = start + k
      uvs[vi * 2] = coords[k]![0]!
      uvs[vi * 2 + 1] = coords[k]![1]!
      colors[vi * 3] = r
      colors[vi * 3 + 1] = g
      colors[vi * 3 + 2] = b
    }
  }

  writeQuad(2, 0, 0, 1, 0, 0) // eyes (verts 2..5)
  writeQuad(6, 0, 4, 0, 1, 0) // brows (verts 6..9)
  writeQuad(10, 0, 5, 0, 0, 1) // mouth (verts 10..13)

  return {
    uvAttr: new THREE.Float32BufferAttribute(uvs, 2),
    colorAttr: new THREE.Float32BufferAttribute(colors, 3),
  }
}

describe('faceAnim (P07b-T10)', () => {
  it('rewrites ONLY face vertices UVs in-place and preserves non-face UVs', () => {
    const { uvAttr, colorAttr } = makeUvAndColorAttributes()
    const bodyU0 = uvAttr.getX(0)
    const bodyV0 = uvAttr.getY(0)
    const bodyU1 = uvAttr.getX(1)
    const bodyV1 = uvAttr.getY(1)

    const regions = createFaceRegions(uvAttr, colorAttr, {
      startVertex: 2,
      vertexCount: 12,
      eyes: 'eyes_02',
      brows: 'brows_02',
      mouth: 'mouth_03',
    })

    expect(Array.from(regions.eyes.indices)).toEqual([2, 3, 4, 5])
    expect(Array.from(regions.brows.indices)).toEqual([6, 7, 8, 9])
    expect(Array.from(regions.mouth.indices)).toEqual([10, 11, 12, 13])

    const versionBefore = uvAttr.version
    applyFaceCells(uvAttr, regions, {
      eyes: 'eyes_02',
      brows: 'brows_02',
      mouth: 'mouth_03',
      eyeState: 'closed',
    })

    expect(uvAttr.version).toBeGreaterThan(versionBefore)

    // Non-face body vertices must not change
    expect(uvAttr.getX(0)).toBeCloseTo(bodyU0, 6)
    expect(uvAttr.getY(0)).toBeCloseTo(bodyV0, 6)
    expect(uvAttr.getX(1)).toBeCloseTo(bodyU1, 6)
    expect(uvAttr.getY(1)).toBeCloseTo(bodyV1, 6)

    // eyes_02 = [0, 1], closed offset = 2 -> cell [2, 1] on 8x8 grid
    const grid = faceAtlasJson.grid
    expect(uvAttr.getX(2)).toBeCloseTo(2 / grid, 6)
    expect(uvAttr.getX(3)).toBeCloseTo(3 / grid, 6)
    expect(uvAttr.getY(2)).toBeCloseTo(2 / grid, 6)
    expect(uvAttr.getY(4)).toBeCloseTo(1 / grid, 6)

    // brows_02 = [1, 4]
    expect(uvAttr.getX(6)).toBeCloseTo(1 / grid, 6)
    expect(uvAttr.getX(7)).toBeCloseTo(2 / grid, 6)
    expect(uvAttr.getY(6)).toBeCloseTo(5 / grid, 6)

    // mouth_03 = [2, 5]
    expect(uvAttr.getX(10)).toBeCloseTo(2 / grid, 6)
    expect(uvAttr.getX(11)).toBeCloseTo(3 / grid, 6)
    expect(uvAttr.getY(10)).toBeCloseTo(6 / grid, 6)
  })

  it('triggers blinks every 3.0–6.0 s cycling open -> half -> closed -> half -> open', () => {
    const state = createBlinkState('emp-01')
    expect(state.timeLeft).toBeGreaterThanOrEqual(BLINK_MIN_INTERVAL_S)
    expect(state.timeLeft).toBeLessThanOrEqual(BLINK_MAX_INTERVAL_S)

    const dt = 0.02
    let elapsed = 0
    const sequence: EyeState[] = []
    let firstBlinkStart = -1

    // Step 15 seconds with deterministic dt
    while (elapsed < 15) {
      const prev = state.current
      const next = stepBlink(state, dt)
      elapsed += dt
      if (prev === 'open' && next !== 'open' && firstBlinkStart < 0) {
        firstBlinkStart = elapsed
      }
      if (sequence.length === 0 || sequence[sequence.length - 1] !== next) {
        sequence.push(next)
      }
    }

    expect(firstBlinkStart).toBeGreaterThanOrEqual(BLINK_MIN_INTERVAL_S)
    expect(firstBlinkStart).toBeLessThanOrEqual(BLINK_MAX_INTERVAL_S + dt)
    // Verify at least 2 full blink cycles occurred with exact half -> closed -> half -> open progression
    const joined = sequence.join('>')
    expect(joined).toContain('open>half>closed>half>open')
  })

  it('forces closed eyes for sleep clips and happy eyes for celebrate', () => {
    const state = createBlinkState('emp-sleep')
    expect(stepBlink(state, 0.5, { eyesOverride: 'closed' })).toBe('closed')
    expect(stepBlink(state, 4.5, { eyesOverride: 'closed' })).toBe('closed')
    expect(stepBlink(state, 0.1, { eyesOverride: 'happy' })).toBe('happy')
    // Returning to normal resumes open
    expect(stepBlink(state, 0.01)).toBe('open')
  })

  it('is deterministic for the same seed and varies across different seeds', () => {
    const a1 = createBlinkState('alice')
    const a2 = createBlinkState('alice')
    const b = createBlinkState('bob')
    expect(a1.timeLeft).toBe(a2.timeLeft)
    expect(a1.timeLeft).not.toBe(b.timeLeft)
  })
})
