import { describe, expect, it } from 'vitest'
import { makeSeedConfig } from '@/domain/__fixtures__/builders'
import { buildBuildingLayout } from '@/scene/layout'
import { CAT_DWELL_MINUTES, CAT_WALK_MINUTES, catAt, catHomes, catLoop } from '../catModel'

describe('cat (P05-T12)', () => {
  const layout = buildBuildingLayout(makeSeedConfig())
  const homes = catHomes(layout)

  it('lives on the lobby by day and the games & rest floor at night', () => {
    expect(layout.floors[homes.day!.floorIndex]!.kind).toBe('lobby_cafe')
    expect(layout.floors[homes.night!.floorIndex]!.kind).toBe('games_rest')
    expect(homes.day!.spots.length).toBeGreaterThan(1)
    expect(homes.night!.spots.length).toBeGreaterThan(0)
  })

  it('follows a seeded loop: dwells, then walks in a straight line', () => {
    const home = homes.day!
    const loop = catLoop(home, 'seed')
    expect(catLoop(home, 'seed')).toEqual(loop)
    const seg = CAT_DWELL_MINUTES + CAT_WALK_MINUTES
    const sit = catAt(home, loop, seg * 3 + 1)
    expect(sit.walking).toBe(false)
    expect([sit.x, sit.z]).toEqual([loop[3 % loop.length]!.x, loop[3 % loop.length]!.z])
    const mid = catAt(home, loop, seg * 3 + CAT_DWELL_MINUTES + CAT_WALK_MINUTES / 2)
    expect(mid.walking).toBe(true)
    const a = loop[3 % loop.length]!
    const b = loop[4 % loop.length]!
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2)
    expect(mid.z).toBeCloseTo((a.z + b.z) / 2)
    expect(mid.floorIndex).toBe(home.floorIndex)
  })
})
