/**
 * P05 §3.5 pile arrival accounting: the 3D pile shows the domain count minus
 * the papers still in a courier's hand (`Director.inTransit`). The 2D queue
 * shows the domain count at once (D5).
 */
export function pileVisualCount(domainCount: number, inTransit: number): number {
  return Math.max(0, domainCount - Math.max(0, inTransit))
}

/** Sheets actually drawn for a count (the label keeps counting past the cap). */
export function pileSheets(count: number, maxSheets: number): number {
  return Math.max(0, Math.min(count, maxSheets))
}
