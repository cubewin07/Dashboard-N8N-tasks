import palette3d from '@/content/palette3d.json'

/**
 * Palette-texture cells (assets.md §1.2): every swatch is one square cell of
 * `palette.png`, so recolouring a part means moving its UVs to another cell.
 * Pure; the texture is 16 × 16 cells.
 */
const GRID = 16

const cells = new Map<string, { col: number; row: number }>(
  palette3d.swatches.map((s) => [s.key, { col: s.col, row: s.row }]),
)

export function paletteCell(key: string): { col: number; row: number } | null {
  return cells.get(key) ?? null
}

/** Department accent swatch for a floor colour key, if the palette has one. */
export function deptAccentSwatch(colorSwatch: string): string | null {
  const key = `dept_${colorSwatch}`
  return cells.has(key) ? key : null
}

/**
 * Moves every UV that samples cell `from` into cell `to`, in place. Returns
 * how many UVs moved.
 */
export function remapCellUvs(uv: { count: number; getX(i: number): number; getY(i: number): number; setXY(i: number, x: number, y: number): unknown }, from: string, to: string): number {
  const a = cells.get(from)
  const b = cells.get(to)
  if (!a || !b) return 0
  const du = (b.col - a.col) / GRID
  const dv = (b.row - a.row) / GRID
  let moved = 0
  for (let i = 0; i < uv.count; i += 1) {
    const u = uv.getX(i)
    const v = uv.getY(i)
    if (Math.floor(u * GRID) === a.col && Math.floor(v * GRID) === a.row) {
      uv.setXY(i, u + du, v + dv)
      moved += 1
    }
  }
  return moved
}
