import type { Cell, NavGrid } from './types'

const SQRT2 = Math.SQRT2

// Scratch buffers reused across calls (grown when a bigger grid shows up).
let capacity = 0
let gScore = new Float64Array(0)
let fScore = new Float64Array(0)
let hScore = new Float64Array(0)
let parent = new Int32Array(0)
/** Generation stamps: `seen[i] === generation` means g/f/parent are valid for this search. */
let seen = new Uint32Array(0)
let closed = new Uint32Array(0)
/** Position of a node in the heap, or -1. Valid only when `seen` matches. */
let heapPos = new Int32Array(0)
let heap = new Int32Array(0)
let heapSize = 0
let generation = 0

function ensureCapacity(n: number): void {
  if (n <= capacity) {
    return
  }
  capacity = n
  gScore = new Float64Array(n)
  fScore = new Float64Array(n)
  hScore = new Float64Array(n)
  parent = new Int32Array(n)
  seen = new Uint32Array(n)
  closed = new Uint32Array(n)
  heapPos = new Int32Array(n)
  heap = new Int32Array(n)
  generation = 0
}

/** Heap order: lower f, then higher g (closer to the goal), then lower cell index. */
function before(a: number, b: number): boolean {
  const fa = fScore[a]!
  const fb = fScore[b]!
  if (fa !== fb) {
    return fa < fb
  }
  const ga = gScore[a]!
  const gb = gScore[b]!
  if (ga !== gb) {
    return ga > gb
  }
  return a < b
}

function siftUp(pos: number): void {
  const node = heap[pos]!
  while (pos > 0) {
    const up = (pos - 1) >> 1
    const other = heap[up]!
    if (!before(node, other)) {
      break
    }
    heap[pos] = other
    heapPos[other] = pos
    pos = up
  }
  heap[pos] = node
  heapPos[node] = pos
}

function siftDown(pos: number): void {
  const node = heap[pos]!
  const half = heapSize >> 1
  while (pos < half) {
    let child = 2 * pos + 1
    const right = child + 1
    if (right < heapSize && before(heap[right]!, heap[child]!)) {
      child = right
    }
    const other = heap[child]!
    if (!before(other, node)) {
      break
    }
    heap[pos] = other
    heapPos[other] = pos
    pos = child
  }
  heap[pos] = node
  heapPos[node] = pos
}

function popMin(): number {
  const top = heap[0]!
  heapSize -= 1
  if (heapSize > 0) {
    heap[0] = heap[heapSize]!
    siftDown(0)
  }
  heapPos[top] = -1
  return top
}

// Neighbour order is fixed (part of the deterministic tie-breaking).
const DCOL = [1, -1, 0, 0, 1, 1, -1, -1]
const DROW = [0, 0, 1, -1, 1, -1, 1, -1]

/**
 * Shortest 8-neighbour path between two cells (both included), or `null` when
 * there is none or either end is blocked. Straight steps cost 1, diagonal
 * steps √2; a diagonal step is allowed only when both cells it squeezes
 * between are free (no corner cutting). Same input → same path.
 */
export function findPath(grid: NavGrid, from: Cell, to: Cell): Cell[] | null {
  const w = grid.w
  const h = grid.h
  const blocked = grid.blocked
  const fromCol = from[0]
  const fromRow = from[1]
  const toCol = to[0]
  const toRow = to[1]
  if (grid.isBlocked(fromCol, fromRow) || grid.isBlocked(toCol, toRow)) {
    return null
  }
  const start = fromRow * w + fromCol
  const goal = toRow * w + toCol
  if (start === goal) {
    return [[fromCol, fromRow]]
  }

  ensureCapacity(w * h)
  generation += 1
  if (generation >= 0xffffffff) {
    seen.fill(0)
    closed.fill(0)
    generation = 1
  }
  const gen = generation
  heapSize = 0

  const dx0 = Math.abs(fromCol - toCol)
  const dz0 = Math.abs(fromRow - toRow)
  gScore[start] = 0
  fScore[start] = Math.max(dx0, dz0) + (SQRT2 - 1) * Math.min(dx0, dz0)
  parent[start] = -1
  seen[start] = gen
  heap[0] = start
  heapPos[start] = 0
  heapSize = 1

  let found = false
  while (heapSize > 0) {
    const current = popMin()
    if (current === goal) {
      found = true
      break
    }
    closed[current] = gen
    const col = current % w
    const row = (current - col) / w
    const g = gScore[current]!

    for (let n = 0; n < 8; n += 1) {
      const dc = DCOL[n]!
      const dr = DROW[n]!
      const nc = col + dc
      const nr = row + dr
      if (nc < 0 || nr < 0 || nc >= w || nr >= h) {
        continue
      }
      const next = nr * w + nc
      if (blocked[next] === 1 || closed[next] === gen) {
        continue
      }
      const diagonal = n >= 4
      if (diagonal && (blocked[row * w + nc] === 1 || blocked[nr * w + col] === 1)) {
        continue
      }
      const tentative = g + (diagonal ? SQRT2 : 1)
      if (seen[next] === gen) {
        if (tentative >= gScore[next]!) {
          continue
        }
        gScore[next] = tentative
        fScore[next] = tentative + hScore[next]!
        parent[next] = current
        // key decreased: move towards the root
        siftUp(heapPos[next]!)
      } else {
        const dx = Math.abs(nc - toCol)
        const dz = Math.abs(nr - toRow)
        const heuristic = Math.max(dx, dz) + (SQRT2 - 1) * Math.min(dx, dz)
        seen[next] = gen
        gScore[next] = tentative
        fScore[next] = tentative + heuristic
        hScore[next] = heuristic
        parent[next] = current
        heap[heapSize] = next
        heapPos[next] = heapSize
        heapSize += 1
        siftUp(heapSize - 1)
      }
    }
  }

  if (!found) {
    return null
  }

  const path: Cell[] = []
  let node = goal
  while (node !== -1) {
    const col = node % w
    path.push([col, (node - col) / w])
    node = parent[node]!
  }
  path.reverse()
  return path
}
