/**
 * Converts floor-local (x, z) metres (where x in [0..w] is West->East,
 * z = 0 is the open dollhouse front, and z = d is the back wall) into
 * building-centred world coordinates:
 * - worldX = x - w / 2  (West on left -w/2, East on right +w/2)
 * - worldZ = d / 2 - z  (Back wall at -d/2, Open dollhouse front at +d/2 facing +Z camera)
 */
export function toWorldX(x: number, w = 24): number {
  return x - w / 2
}

export function toWorldZ(z: number, d = 14): number {
  return d / 2 - z
}
