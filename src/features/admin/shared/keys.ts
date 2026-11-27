// Keys and ids for new config entities. Keys match ^[a-z][a-z0-9_]*$ and never change (§3.3 rule 4).

/** "Kho vận 2" → "kho_van_2". Vietnamese marks are dropped; đ → d. */
export function slugKey(text: string): string {
  const base = text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
  const key = /^[a-z]/.test(base) ? base : `x_${base}`
  return key === 'x_' ? 'x' : key
}

/** `base`, or `base_2`, `base_3`… — the first one not in `taken`. */
export function uniqueKey(base: string, taken: Iterable<string>): string {
  const used = new Set(taken)
  if (!used.has(base)) return base
  for (let i = 2; ; i += 1) {
    const candidate = `${base}_${i}`
    if (!used.has(candidate)) return candidate
  }
}

export const KEY_PATTERN = /^[a-z][a-z0-9_]*$/
