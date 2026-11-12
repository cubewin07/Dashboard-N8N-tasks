import { describe, expect, it } from 'vitest'
import { orderModelLoads, reprioritise, type ModelUse } from '../loadQueue'

const use = (model: string, floorKey: string, floorIndex: number): ModelUse => ({
  model,
  floorKey,
  floorIndex,
})

// Given top floor first on purpose: the order must come from floorIndex.
const USES: ModelUse[] = [
  use('desk_boss', 'boss', 2),
  use('plant', 'boss', 2),
  use('desk', 'marketing', 1),
  use('chair', 'marketing', 1),
  use('plant', 'marketing', 1),
  use('sofa', 'lobby', 0),
  use('chair', 'lobby', 0),
]
const KIT = ['wall', 'stairs']

describe('orderModelLoads (P06b-T12)', () => {
  it('loads the kit, then the floors bottom to top when nothing is focused', () => {
    expect(orderModelLoads({ kit: KIT, uses: USES, focusedFloorKey: null })).toEqual([
      'wall',
      'stairs',
      'sofa',
      'chair',
      'desk',
      'plant',
      'desk_boss',
    ])
  })

  it('loads the focused floor right after the kit', () => {
    expect(orderModelLoads({ kit: KIT, uses: USES, focusedFloorKey: 'boss' })).toEqual([
      'wall',
      'stairs',
      'desk_boss',
      'plant',
      'sofa',
      'chair',
      'desk',
    ])
    expect(
      orderModelLoads({ kit: KIT, uses: USES, focusedFloorKey: 'marketing' }).slice(2, 5),
    ).toEqual(['desk', 'chair', 'plant'])
  })

  it('keeps each name once, at its earliest place', () => {
    const order = orderModelLoads({
      kit: ['wall', 'wall', 'chair'],
      uses: USES,
      focusedFloorKey: 'marketing',
      rest: ['tree', 'desk', 'tree'],
    })
    expect(new Set(order).size).toBe(order.length)
    expect(order).toEqual(['wall', 'chair', 'desk', 'plant', 'sofa', 'desk_boss', 'tree'])
  })

  it('puts the rest last and ignores an unknown focus', () => {
    const order = orderModelLoads({
      kit: KIT,
      uses: USES,
      focusedFloorKey: 'nowhere',
      rest: ['tree'],
    })
    expect(order).toEqual(['wall', 'stairs', 'sofa', 'chair', 'desk', 'plant', 'desk_boss', 'tree'])
  })

  it('is stable: the same input gives the same order and the input is untouched', () => {
    const before = JSON.stringify(USES)
    const a = orderModelLoads({ kit: KIT, uses: USES, focusedFloorKey: 'boss' })
    const b = orderModelLoads({ kit: KIT, uses: USES, focusedFloorKey: 'boss' })
    expect(a).toEqual(b)
    expect(JSON.stringify(USES)).toBe(before)
  })
})

describe('reprioritise', () => {
  it('moves waiting names into the new order and keeps unknown ones behind', () => {
    expect(reprioritise(['a', 'x', 'b', 'y', 'c'], ['c', 'b', 'a'])).toEqual([
      'c',
      'b',
      'a',
      'x',
      'y',
    ])
  })

  it('leaves the queue alone when the order mentions none of it', () => {
    expect(reprioritise(['a', 'b'], ['z'])).toEqual(['a', 'b'])
  })
})
