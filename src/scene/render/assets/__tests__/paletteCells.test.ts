import { describe, expect, it } from 'vitest'
import { deptAccentSwatch, paletteCell, remapCellUvs } from '../paletteCells'

function uvs(pairs: Array<[number, number]>) {
  const data = pairs.flat()
  return {
    count: pairs.length,
    getX: (i: number) => data[i * 2]!,
    getY: (i: number) => data[i * 2 + 1]!,
    setXY: (i: number, x: number, y: number) => {
      data[i * 2] = x
      data[i * 2 + 1] = y
    },
    data,
  }
}

describe('palette cells (P06b-T07 accent tint)', () => {
  const to = deptAccentSwatch('marketing')

  it('finds department accent swatches and ignores unknown colours', () => {
    expect(to).not.toBeNull()
    expect(deptAccentSwatch('no_such_colour')).toBeNull()
  })

  it('moves only the UVs inside the source cell, keeping their offset in it', () => {
    const a = paletteCell('jade_600')!
    const b = paletteCell(to!)!
    const inside: [number, number] = [(a.col + 0.5) / 16, (a.row + 0.25) / 16]
    const other: [number, number] = [((a.col + 1) % 16 + 0.5) / 16, (a.row + 0.5) / 16]
    const uv = uvs([inside, other])
    expect(remapCellUvs(uv, 'jade_600', to!)).toBe(1)
    expect(uv.data[0]).toBeCloseTo((b.col + 0.5) / 16)
    expect(uv.data[1]).toBeCloseTo((b.row + 0.25) / 16)
    expect(uv.data.slice(2)).toEqual(other)
  })

  it('does nothing for unknown swatches', () => {
    const uv = uvs([[0.01, 0.01]])
    expect(remapCellUvs(uv, 'nope', 'jade_600')).toBe(0)
  })
})
