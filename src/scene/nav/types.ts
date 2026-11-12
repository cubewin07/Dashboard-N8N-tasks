/**
 * Shared navigation types (P04). Everything here is floor-local metres:
 * x in [0..w] west→east, z in [0..d] with z = 0 at the open (camera) front.
 * A cell is `cell` metres square; cell (col,row) covers
 * [col*cell, (col+1)*cell) × [row*cell, (row+1)*cell).
 */
export interface Vec2 {
  x: number
  z: number
}

export type Cell = readonly [col: number, row: number]

export interface NavGrid {
  readonly floorKey: string
  /** Columns (x) and rows (z). */
  readonly w: number
  readonly h: number
  /** Cell size in metres (0.5). */
  readonly cell: number
  /** 1 = blocked. Index = row * w + col. */
  readonly blocked: Uint8Array
  /** Out-of-bounds counts as blocked. */
  isBlocked(col: number, row: number): boolean
  toCell(p: Vec2): Cell
  /** Centre of the cell. */
  toWorld(col: number, row: number): Vec2
}
